#!/usr/bin/env python3
"""
dock_robot — Scenario 2 "Blind Navigator" AMR with REAL perception.

Unlike the Scenario 1 robots (which only follow waypoints), this robot has a
genuine sensing+navigation loop so that sensor-spoofing attacks are real:

  publish    scan      sensor_msgs/LaserScan   simulated 2D LIDAR (the sensor)
  subscribe  scan      sensor_msgs/LaserScan   <-- it CONSUMES scan for avoidance
                                                   (the ONE intended attack surface)
  publish    odom      nav_msgs/Odometry       localization output
  publish    status    std_msgs/String

How perception works (and why spoofing bites):
  * The robot computes a TRUE scan from the corridor obstacle layout and
    publishes it on /dock/scan.
  * Its navigation loop does not use its own ground truth to avoid obstacles —
    it SUBSCRIBES to /dock/scan and avoids whatever the scan reports. So if an
    attacker publishes a faster/last-write fake scan (empty = blind, or full of
    phantom returns = ghost), the robot navigates on the lie:
      - blind  -> drives into a real obstacle it can no longer "see"
      - ghost  -> stops/swerves for obstacles that aren't there
  * Localization: the robot integrates motion but fuses a trusted odom_src; an
    attacker spoofing odom_src shifts where the robot believes it is.

This mirrors the documented software-layer LaserScan/odom injection attacks on
ROS 2 / Nav2 (publish to the perception topic at higher rate to override the
real sensor before it reaches the planner).
"""

import json
import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Twist, Pose, Point, Quaternion
from nav_msgs.msg import Odometry
from sensor_msgs.msg import LaserScan
from std_msgs.msg import String


def yaw_to_quaternion(yaw):
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


# --- Loading dock corridor layout (metres) --------------------------------
# The robot drives +x down a corridor bounded by walls, past obstacles (pallets,
# a parked cart). Obstacles are circles (cx, cy, radius).
CORRIDOR_Y = 2.2           # corridor spans y in [-CORRIDOR_Y, +CORRIDOR_Y]
# Every obstacle sits ON / very near the centreline so that a BLINDED robot driving
# straight down the dock hits WHICHEVER one it reaches next — i.e. an attack landed
# at any point crashes the robot promptly (no waiting a full loop). An HONEST robot
# sees each one on its scan and steers around it to the open side, then re-centres.
# They are slightly offset in alternating directions only enough to give the honest
# robot a clear side to pass, while still blocking the straight-line (blind) path.
# Each obstacle is wide and spans from one wall across most of the corridor,
# leaving a passable gap on the OPPOSITE side. A blinded robot (anywhere near the
# centre) hits the wide body; an honest robot sees it and takes the gap. The gap
# side alternates so the honest robot weaves, while any blind pass crashes.
# Format: (cx, cy, radius). cy pushed toward a wall; radius large.
# Each obstacle is a WIDE barrier that fills the corridor except for a narrow gap
# on one side. A blinded robot (which drifts along the centre) cannot fit and
# crashes wherever it meets the barrier; an honest robot sees it and aims for the
# gap. The gap side alternates so the honest robot weaves. Modelled as a cluster of
# circles forming a wall; here one big circle pushed to a wall with a wide radius.
# gap side alternates: barrier centre near +y wall leaves a -y gap, and vice versa.
# Obstacles sit near the centreline so a blinded robot (which — see _autonav —
# actively holds the centreline WHILE under a spoof) hits whichever it reaches
# next, wherever the attack was launched. An honest robot sees each one and makes
# a modest swerve to the open side, then re-centres.
DOCK_OBSTACLES = [
    (4.0, 0.0, 0.7),
    (8.0, 0.0, 0.7),
    (11.5, 0.0, 0.7),
]
START_X, END_X = -2.0, 15.0

# LIDAR config
SCAN_N = 72                # beams
SCAN_MIN, SCAN_MAX = -math.pi / 2, math.pi / 2   # forward 180°
SCAN_RANGE_MAX = 6.0

# Avoidance thresholds
STOP_DIST = 0.8            # closest allowed obstacle before stopping
SLOW_DIST = 1.6


class DockRobot(Node):
    def __init__(self):
        super().__init__('dock_amr')
        self.declare_parameter('robot_name', 'dock1')
        self.robot_name = self.get_parameter('robot_name').value

        self.x, self.y, self.yaw = START_X, 0.0, 0.0
        self.max_v = 0.7
        self.dt = 0.1

        # latest scan the robot will NAVIGATE on (its own, until an attacker
        # overrides it by publishing faster/last to the same topic)
        self.nav_scan = None
        # trusted localization offset from spoofable odom_src
        self.loc_offset = (0.0, 0.0)
        self.collided = False      # set when it hits a real obstacle (blind crash)
        self.collide_start = 0.0   # time the current crash began (for timed recovery)
        self._decep_streak = 0     # consecutive ticks of deception (debounce)

        qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT,
                         history=HistoryPolicy.KEEP_LAST, depth=10)

        self.scan_pub = self.create_publisher(LaserScan, 'scan', qos)
        self.odom_pub = self.create_publisher(Odometry, 'odom', qos)
        self.status_pub = self.create_publisher(String, 'status', 10)
        # compact JSON scene state for the HMI split-view (/dock/state)
        self.state_pub = self.create_publisher(String, '/dock/state', 10)
        # The dock AMR navigates autonomously on its LIDAR — the ONLY input it
        # consumes (and the single intended attack surface for this scenario: a
        # spoofed /scan). It deliberately exposes no cmd_vel teleop or external
        # localization input, so Scenario 2 teaches sensor spoofing and nothing else.
        self.create_subscription(LaserScan, 'scan', self.on_scan, qos)

        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.last_cmd_t = 0.0
        self.cmd_timeout = 0.5

        self._scan_pubs = 1          # cached publisher count on our /scan topic
        self.create_timer(0.1, self.publish_scan)   # 10 Hz sensor
        self.create_timer(self.dt, self.step)
        self.create_timer(1.0, self.publish_status)
        self.create_timer(0.2, self.publish_state)  # 5 Hz scene state for HMI
        self.create_timer(0.5, self._poll_scan_pubs)  # detect a foreign /scan publisher

        self.get_logger().info(
            f"[{self.robot_name}] dock AMR online — navigates on /scan "
            f"(sensor topic is UNAUTHENTICATED; spoofable).")

    # ---- inputs ----
    # cmd_vel / odom_src handlers removed: this scenario intentionally exposes only
    # the /scan sensor surface. cmd_v/cmd_w/loc_offset stay at their no-op defaults so
    # the motion model and scene state are unaffected (the robot drives purely on scan).

    def on_scan(self, msg: LaserScan):
        # Navigate on whatever scan last arrived — attacker override lands here.
        self.nav_scan = list(msg.ranges)

    def _now(self):
        return self.get_clock().now().nanoseconds / 1e9

    def _poll_scan_pubs(self):
        # Count publishers on our own scan topic. >1 means an attacker is also
        # publishing fake scans (the robot's own sensor is the legitimate one).
        # 'scan' resolves against this node's namespace (/dock) -> /dock/scan.
        try:
            self._scan_pubs = self.count_publishers('scan')
        except Exception:
            self._scan_pubs = 1

    def scan_publisher_count(self):
        return self._scan_pubs

    # ---- true sensor model ----
    def _true_ranges(self):
        """Compute the real LIDAR returns from the corridor + obstacles."""
        ranges = []
        for i in range(SCAN_N):
            ang = SCAN_MIN + (SCAN_MAX - SCAN_MIN) * i / (SCAN_N - 1)
            world_ang = self.yaw + ang
            r = SCAN_RANGE_MAX
            # ray-march a short step for obstacles + corridor walls
            step = 0.1
            d = 0.0
            while d < SCAN_RANGE_MAX:
                d += step
                px = self.x + d * math.cos(world_ang)
                py = self.y + d * math.sin(world_ang)
                hit = False
                # corridor walls
                if abs(py) >= CORRIDOR_Y:
                    hit = True
                # obstacles
                for (ox, oy, orad) in DOCK_OBSTACLES:
                    if (px - ox) ** 2 + (py - oy) ** 2 <= orad * orad:
                        hit = True
                        break
                if hit:
                    r = d
                    break
            ranges.append(r)
        return ranges

    def publish_scan(self):
        msg = LaserScan()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = f'{self.robot_name}/laser'
        msg.angle_min = SCAN_MIN
        msg.angle_max = SCAN_MAX
        msg.angle_increment = (SCAN_MAX - SCAN_MIN) / (SCAN_N - 1)
        msg.range_min = 0.05
        msg.range_max = SCAN_RANGE_MAX
        msg.ranges = [float(r) for r in self._true_ranges()]
        self.scan_pub.publish(msg)

    # ---- navigation (drives +x down the dock, avoiding what the SCAN reports) ----
    def step(self):
        now = self._now()

        # If currently crashed, stay COMPLETELY still (down) until recovery decides
        # to reset. No motion, no turning — so it can never thrash out of the dock.
        if self.collided:
            spoof_active = self.scan_publisher_count() > 1
            if not spoof_active and (now - self.collide_start) > 2.0:
                self.x, self.y, self.yaw = START_X, 0.0, 0.0
                self.collided = False
                self.get_logger().info(f"[{self.robot_name}] attack ended — reset to dock entry")
            self.publish_odom(0.0, 0.0)
            return

        teleop = (now - self.last_cmd_t) < self.cmd_timeout and \
                 (abs(self.cmd_v) > 1e-3 or abs(self.cmd_w) > 1e-3)

        if teleop:
            v, w = self.cmd_v, self.cmd_w
        else:
            v, w = self._autonav()

        self.yaw = math.atan2(math.sin(self.yaw + w * self.dt),
                              math.cos(self.yaw + w * self.dt))
        nx = self.x + v * math.cos(self.yaw) * self.dt
        ny = self.y + v * math.sin(self.yaw) * self.dt

        # PHYSICAL collision is based on GROUND TRUTH (reality always wins): if the
        # robot was blinded and drives into a real obstacle, it crashes and (via the
        # guard at the top of step) freezes in place until the attack ends.
        if self._truly_blocked(nx, ny):
            self.collide_start = self._now()
            self.collided = True
            self.get_logger().warn(
                f"[{self.robot_name}] COLLISION — drove into a real obstacle "
                f"(perception was spoofed)")
            self.publish_odom(0.0, 0.0)   # stop on impact
            return
        # free to move
        self.x, self.y = nx, ny
        self.publish_odom(v, w)

    def _autonav(self):
        """Forward down the corridor; steer around obstacles AS REPORTED BY THE
        SCAN. If the scan is spoofed 'all clear', the robot sees no reason to
        steer and drives straight into whatever is really there."""
        if self.x >= END_X or self.x < START_X - 1.0:
            # Reached the dock (or somehow drifted behind the entry) — respawn at
            # the start and run the route again so the scenario loops continuously.
            self.x, self.y, self.yaw = START_X, 0.0, 0.0
            self.collided = False
            return 0.0, 0.0
        scan = self.nav_scan
        n = len(scan) if scan else 0
        if not scan:
            # no scan yet -> creep forward slowly
            return 0.2, -0.3 * self.y

        # Sector minima from the (possibly spoofed) scan. Beams span right->left
        # because angle goes -90°..+90° and +angle is to the robot's left.
        third = max(1, n // 3)
        right = min(scan[:third])
        center = min(scan[third:2 * third])
        left = min(scan[2 * third:])

        # Steering: turn toward the more open side when something is ahead, plus a
        # gentle pull back to the centreline when the path is clear.
        if center < SLOW_DIST:
            turn = 1.0 if left > right else -1.0
            turn *= min(1.0, (SLOW_DIST - center) / SLOW_DIST) * 1.4
            w = turn - 0.15 * self.y
            v = 0.12 if center < STOP_DIST else 0.35
        else:
            # Clear ahead. If this is a genuine SPOOF (a foreign publisher is on
            # /scan), the robot is blinded — hold the centreline firmly so it drives
            # straight into the centred obstacles it can't see, wherever the attack
            # began. If honestly clear, ease back gently so it can still swerve wide
            # around obstacles during normal navigation.
            blinded = self.scan_publisher_count() > 1
            w = (-1.2 if blinded else -0.25) * self.y
            v = self.max_v

        # HEADING GUARD: never let the robot point BACKWARD (past ~100° off +x),
        # which is the only way it could drive out of the dock entrance. Honest
        # avoidance needs sharp turns (up to ~80°), so the guard only engages beyond
        # that. (yaw 0 = +x down the corridor.)
        if self.yaw > 1.75:
            w = min(w, -1.0)
        elif self.yaw < -1.75:
            w = max(w, 1.0)
        return v, max(-1.4, min(1.4, w))

    def _truly_blocked(self, x, y):
        if abs(y) >= CORRIDOR_Y - 0.2:
            return True
        for (ox, oy, orad) in DOCK_OBSTACLES:
            if (x - ox) ** 2 + (y - oy) ** 2 <= (orad + 0.3) ** 2:
                return True
        return False

    def publish_odom(self, v, w):
        msg = Odometry()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'map'
        msg.child_frame_id = f'{self.robot_name}/base_link'
        # believed position = true + any (spoofed) localization offset
        bx = self.x + self.loc_offset[0]
        by = self.y + self.loc_offset[1]
        msg.pose.pose = Pose(position=Point(x=bx, y=by, z=0.0),
                             orientation=yaw_to_quaternion(self.yaw))
        msg.twist.twist.linear.x = v
        msg.twist.twist.angular.z = w
        self.odom_pub.publish(msg)

    def publish_status(self):
        s = String()
        s.data = f"{self.robot_name}|pos={self.x:.2f},{self.y:.2f}|collided={self.collided}"
        self.status_pub.publish(s)

    def publish_state(self):
        """Compact scene state for the HMI split-view: reality vs the robot's belief."""
        # What the robot BELIEVES ahead (from the possibly-spoofed nav scan):
        believed_clear_ahead = True
        if self.nav_scan:
            n = len(self.nav_scan)
            believed_clear_ahead = min(self.nav_scan[n // 3:2 * n // 3]) > SLOW_DIST
        # What is REALLY in the robot's forward path (ground truth).
        real_ahead = None
        for (ox, oy, orad) in DOCK_OBSTACLES:
            dx, dy = ox - self.x, oy - self.y
            fwd = dx * math.cos(self.yaw) + dy * math.sin(self.yaw)
            lat = abs(-dx * math.sin(self.yaw) + dy * math.cos(self.yaw))
            if 0 < fwd < SLOW_DIST + 0.4 and lat < orad + 0.25:
                real_ahead = round(fwd, 2)
                break
        # Deception = the robot still believes the path is clear while a real
        # obstacle is within its reaction zone. During an HONEST approach the
        # robot's own scan flips believed_clear to False as it nears the obstacle,
        # so the mismatch is at most a 1-tick transient while it begins to swerve.
        # Under a BLINDING spoof the mismatch PERSISTS (it never sees the obstacle).
        # Requiring several sustained ticks distinguishes the two cleanly.
        # Gate on an ACTIVE spoof: deception is only real if an attacker is actually
        # publishing to /scan (a foreign publisher besides our own sensor). This
        # guarantees the banner can NEVER flash from an honest-navigation transient
        # or a residual scan after the attack stops.
        spoof_active = self.scan_publisher_count() > 1
        raw_deceived = spoof_active and believed_clear_ahead and real_ahead is not None
        self._decep_streak = (self._decep_streak + 1) if raw_deceived else 0
        deceived = self._decep_streak >= 3   # ~0.6s sustained = genuine spoof

        data = {
            'robot': self.robot_name,
            'true': {'x': round(self.x, 3), 'y': round(self.y, 3), 'yaw': round(self.yaw, 3)},
            'believed': {'x': round(self.x + self.loc_offset[0], 3),
                         'y': round(self.y + self.loc_offset[1], 3)},
            'collided': self.collided,
            'believed_clear_ahead': believed_clear_ahead,
            'real_obstacle_ahead': real_ahead,
            'deceived': deceived,
            'obstacles': [[ox, oy, orad] for (ox, oy, orad) in DOCK_OBSTACLES],
            'corridor_y': CORRIDOR_Y,
            'end_x': END_X,
        }
        m = String(); m.data = json.dumps(data)
        self.state_pub.publish(m)


def main(args=None):
    rclpy.init(args=args)
    node = DockRobot()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
