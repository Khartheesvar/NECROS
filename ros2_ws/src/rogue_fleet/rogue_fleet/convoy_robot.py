#!/usr/bin/env python3
"""
convoy_robot — Scenario 4 "Ghost Convoy": a delivery AMR whose operator view is
driven entirely by the telemetry it PUBLISHES on /odom.

This is a REAL ROS 2 node. The only thing simulated is the chassis (a unicycle
motion model). The topics, message types and DDS traffic are exactly what a real
robot exposes.

The scenario it enables — capture-and-replay (telemetry spoofing):
  An attacker records this robot's real /odom while it sits at its depot, then
  replays that recording (`ros2 bag play --loop`) at a high rate. The replayed
  messages are the robot's OWN authentic data — every field is real and plausible
  — but STALE. A consumer that trusts "the latest message on /odom" now sees the
  robot frozen at the depot while, on the floor, the robot continues its fixed route.

  This defeats a plausibility check (the values ARE plausible — they're real) and
  even authentication (the data was validly produced once). Only FRESHNESS /
  SEQUENCE validation catches it. That is the whole teaching point.

Topics (namespaced /convoy/...):
  publish    odom         nav_msgs/Odometry     reported pose (REPLAY TARGET)
  subscribe  odom         nav_msgs/Odometry     own odom, to detect a replay (not an
                                                 attack surface — internal use)
  publish    status       std_msgs/String       human-readable state
  publish    /convoy/state std_msgs/String      compact JSON scene state for the HMI

Security note: there is NO authentication, encryption, OR replay protection here.
By ROS 2 default, /odom carries no enforced freshness — a replayed message is
indistinguishable from a live one to a naive subscriber. That is the Scenario 4
condition.
"""

import json
import math
import time

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Twist, Pose, Point, Quaternion
from nav_msgs.msg import Odometry
from std_msgs.msg import String


def yaw_to_quaternion(yaw: float) -> Quaternion:
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


def quaternion_to_yaw(q: Quaternion) -> float:
    return math.atan2(2.0 * (q.w * q.z), 1.0 - 2.0 * (q.z * q.z))


# A simple delivery loop around the depot floor. The robot starts (and the
# attacker records) at the DEPOT waypoint, then runs the loop.
DEPOT = (0.0, 0.0)
ROUTE = [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (-6.0, 4.0), (-6.0, 0.0), (0.0, 0.0)]

MAX_LINEAR = 0.9
MAX_ANGULAR = 1.4

# How far (m) the odom reported on the bus may lag the robot's true pose before we
# call the telemetry STALE — the signature of a replay/freeze (values are real but
# describe an old position). Generous enough to ignore normal publish jitter.
STALE_DISTANCE = 1.0


class ConvoyRobot(Node):
    def __init__(self):
        super().__init__('convoy_amr', namespace='/convoy')

        self.declare_parameter('robot_name', 'convoy1')
        self.robot_name = self.get_parameter('robot_name').value

        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        # Ground truth — the robot's ACTUAL pose (never leaves this node except via
        # the scene-state feed; the operator/console does not get this directly).
        self.x, self.y, self.yaw = DEPOT[0], DEPOT[1], 0.0
        self.v = 0.0
        self.route_idx = 1  # first goal after the depot
        self.seq = 0        # our own monotonically increasing sequence number

        # cmd_vel nudge (optional attacker influence / manual drive)
        self.cmd_v = 0.0
        self.cmd_w = 0.0
        self.cmd_until = 0.0

        self.odom_pub = self.create_publisher(Odometry, 'odom', qos)
        self.status_pub = self.create_publisher(String, 'status', 10)
        self.state_pub = self.create_publisher(String, '/convoy/state', 10)
        # Scenario 4 teaches ONE attack: replay of the robot's own /odom telemetry.
        # The courier drives its fixed route autonomously and exposes no external
        # cmd_vel or goal_pose command surface, so the only thing an attacker can do
        # here is capture-and-replay /odom (below).

        # We SUBSCRIBE to our own /odom to see what the bus actually carries. Under
        # replay, a foreign publisher floods old odom and this subscription starts
        # reading STALE poses that disagree with our ground truth — that gap is the
        # replay signature we surface to the HMI.
        self.reported = None          # last odom seen on the bus (may be a replay)
        self.reported_stamp = 0.0
        self.create_subscription(Odometry, 'odom', self.on_odom_seen, qos)

        self._odom_pubs = 1           # cached publisher count on /convoy/odom
        self.create_timer(0.5, self._poll_odom_pubs)

        self.dt = 0.1
        self.create_timer(self.dt, self.step)       # motion + publish true odom
        self.create_timer(0.2, self.publish_state)  # scene state for the HMI

        self.goal = ROUTE[self.route_idx]
        self.get_logger().info(
            f"[{self.robot_name}] convoy AMR online — publishes /convoy/odom with "
            f"NO replay protection (lab default). Operator view trusts latest odom.")

    # ---- inputs -----------------------------------------------------------------
    # cmd_vel / goal_pose handlers removed: Scenario 4 exposes no external command
    # surface. cmd_v/cmd_w/cmd_until stay at their no-op defaults so step() simply
    # drives the fixed ROUTE. The /odom self-subscription below is NOT an attack
    # surface — it is how the robot detects a replay (foreign publisher on /odom).

    def on_odom_seen(self, msg: Odometry):
        """Whatever is currently on /odom — our live publish, or a replay."""
        self.reported = (msg.pose.pose.position.x, msg.pose.pose.position.y)
        # the stamp the MESSAGE carries (a replay carries its old recorded stamp)
        self.reported_stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9

    def _poll_odom_pubs(self):
        try:
            self._odom_pubs = self.count_publishers('/convoy/odom')
        except Exception:
            pass

    # ---- simulation -------------------------------------------------------------
    def step(self):
        now = time.time()
        # Drive: a manual/attacker cmd_vel overrides autonomy briefly; else head to goal.
        if now < self.cmd_until:
            v, w = self.cmd_v, self.cmd_w
        else:
            gx, gy = self.goal
            dx, dy = gx - self.x, gy - self.y
            dist = math.hypot(dx, dy)
            if dist < 0.3:
                self.route_idx = (self.route_idx + 1) % len(ROUTE)
                self.goal = ROUTE[self.route_idx]
                gx, gy = self.goal
                dx, dy = gx - self.x, gy - self.y
                dist = math.hypot(dx, dy)
            desired = math.atan2(dy, dx)
            err = math.atan2(math.sin(desired - self.yaw), math.cos(desired - self.yaw))
            w = max(-MAX_ANGULAR, min(MAX_ANGULAR, 2.0 * err))
            v = MAX_LINEAR if abs(err) < 0.6 else 0.25

        # Integrate unicycle model (GROUND TRUTH).
        self.yaw += w * self.dt
        self.x += v * math.cos(self.yaw) * self.dt
        self.y += v * math.sin(self.yaw) * self.dt
        self.v = v
        self.seq += 1

        # Publish our TRUE pose on /odom, stamped NOW with a fresh sequence number.
        msg = Odometry()
        stamp = self.get_clock().now().to_msg()
        msg.header.stamp = stamp
        msg.header.frame_id = 'odom'
        # Smuggle a monotonic sequence number in child_frame_id so a freshness-
        # checking consumer (the defense) has a sequence to validate. A real system
        # would use the header stamp and/or a dedicated sequence field.
        msg.child_frame_id = f'convoy1:{self.seq}'
        msg.pose.pose.position = Point(x=self.x, y=self.y, z=0.0)
        msg.pose.pose.orientation = yaw_to_quaternion(self.yaw)
        msg.twist.twist.linear.x = self.v
        self.odom_pub.publish(msg)

    # ---- scene state for the HMI ------------------------------------------------
    def publish_state(self):
        # The gap between ground truth and the odom currently on the bus. Under
        # replay this grows (bus shows the depot; truth is out on the route).
        rx, ry = self.reported if self.reported else (self.x, self.y)
        gap = math.hypot(self.x - rx, self.y - ry)

        replaying = self._odom_pubs > 1          # a foreign /odom publisher exists
        stale = gap > STALE_DISTANCE             # reported pose lags the truth
        spoofed = replaying and stale            # the replay is actively deceiving

        state = {
            'robot': self.robot_name,
            # GROUND TRUTH — where the robot really is (console draws this as the
            # true robot; it is NOT what a naive operator would see).
            'ground_truth': {'x': round(self.x, 2), 'y': round(self.y, 2),
                             'yaw': round(self.yaw, 2), 'v': round(self.v, 2)},
            # REPORTED — the pose currently on /odom (what the operator trusts).
            'reported': {'x': round(rx, 2), 'y': round(ry, 2)},
            'route': ROUTE,
            'depot': DEPOT,
            'odom_publishers': self._odom_pubs,
            'gap': round(gap, 2),
            'replaying': replaying,
            'spoofed': spoofed,
        }
        self.state_pub.publish(String(data=json.dumps(state)))

        st = 'SPOOFED (telemetry frozen)' if spoofed else (
            'replay publisher present' if replaying else 'nominal')
        self.status_pub.publish(String(data=st))


def main(args=None):
    rclpy.init(args=args)
    node = ConvoyRobot()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
