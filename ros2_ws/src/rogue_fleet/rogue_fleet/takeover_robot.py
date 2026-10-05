#!/usr/bin/env python3
"""
takeover_robot — Scenario 3 "Rogue Coordinator" AMR (dedicated, no shared code).

A REAL ROS 2 node (only the chassis is simulated). It is a goal-following robot: its
ONLY command input is `goal_pose`. It deliberately exposes no cmd_vel, so Scenario 3
teaches exactly one attack — coordinator impersonation on goal_pose — and a student
cannot wander into Scenario 1's cmd_vel hijack. Scenario 3 is fully isolated from
Scenario 1 (separate node, coordinator, bridge, launch, policy, and DDS domain).

Topics (per robot, namespaced e.g. /amr1/...):
  subscribe  goal_pose    geometry_msgs/Pose    waypoint (coordinator OR rogue) <-- ATTACK
  publish    odom         nav_msgs/Odometry     true pose + velocity (telemetry)
  publish    status       std_msgs/String       human-readable mission state

Security note: NO authentication by default — any DDS participant can publish
goal_pose, which is the "Open Bus" condition the impersonation attack exploits.
"""

import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Pose, Point, Quaternion
from nav_msgs.msg import Odometry
from std_msgs.msg import String


def yaw_to_quaternion(yaw: float) -> Quaternion:
    """2D heading (yaw) -> quaternion, for a standard Odometry message."""
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


# Warehouse racks as axis-aligned footprints (centre x, y + half-extents), matching
# the 3D view. A robot cannot drive through solid shelving — if a hijack steers it
# into a rack it collides and emergency-stops. Format: (cx, cy, half_w, half_d).
# Racks sit safely inside each robot's patrol loop, clear of the perimeter route
# so a robot only ever touches one when a hijack steers it into the interior.
RACKS = [
    (3.0, 1.6, 1.4, 0.28),
    (3.0, 2.4, 1.4, 0.28),
    (-3.0, -1.6, 1.4, 0.28),
    (-3.0, -2.4, 1.4, 0.28),
]
ROBOT_RADIUS = 0.33  # approximate AMR half-size for collision margin


def hits_rack(x, y):
    """True if a robot centred at (x,y) overlaps any rack footprint."""
    for cx, cy, hw, hd in RACKS:
        if (abs(x - cx) < hw + ROBOT_RADIUS) and (abs(y - cy) < hd + ROBOT_RADIUS):
            return True
    return False


class TakeoverRobot(Node):
    def __init__(self):
        super().__init__('amr')  # final name comes from the launch namespace/remap

        # ---- Parameters (set per-robot in the launch file) ----
        self.declare_parameter('robot_name', 'amr1')
        self.declare_parameter('start_x', 0.0)
        self.declare_parameter('start_y', 0.0)
        self.declare_parameter('start_yaw', 0.0)
        self.declare_parameter('max_linear', 0.8)    # m/s  (realistic AMR-ish)
        self.declare_parameter('max_angular', 1.2)   # rad/s

        self.robot_name = self.get_parameter('robot_name').value
        self.x = float(self.get_parameter('start_x').value)
        self.y = float(self.get_parameter('start_y').value)
        self.yaw = float(self.get_parameter('start_yaw').value)
        self.max_linear = float(self.get_parameter('max_linear').value)
        self.max_angular = float(self.get_parameter('max_angular').value)

        # ---- Motion state ----
        self.goal = None                # (x, y) waypoint from goal_pose
        self.mission_state = 'IDLE'
        self.collided = False          # latched while the robot is against a rack

        # Best-effort, keep-last QoS — this is the common default for teleop/odom
        # topics on real robots, and (deliberately) trivially joinable.
        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        # ---- Interfaces ----
        # Scenario 3 teaches ONE attack: coordinator impersonation on goal_pose. The
        # robot obeys ONLY goal_pose (its sole command surface) — there is no cmd_vel
        # here, so a student cannot wander into Scenario 1's cmd_vel hijack. The goal
        # channel is driven legitimately by the coordinator and hijacked by a rogue
        # coordinator (the attack).
        self.create_subscription(Pose, 'goal_pose', self.on_goal, 10)
        self.odom_pub = self.create_publisher(Odometry, 'odom', qos)
        self.status_pub = self.create_publisher(String, 'status', 10)

        # ---- Timers ----
        self.dt = 0.1  # 10 Hz physics + telemetry
        self.create_timer(self.dt, self.step)
        self.create_timer(1.0, self.publish_status)

        self.get_logger().info(
            f"[{self.robot_name}] online at ({self.x:.1f},{self.y:.1f}) "
            f"— goal_pose is UNAUTHENTICATED (lab default)."
        )

    # ---------- Callbacks ----------
    def on_goal(self, msg: Pose):
        # The robot's ONLY command input. Whatever lands here (coordinator or a rogue
        # impersonator) becomes the robot's goal — that is the Scenario 3 attack.
        self.goal = (msg.position.x, msg.position.y)
        self.mission_state = 'EN_ROUTE'

    # ---------- Core loop ----------
    def step(self):
        """Waypoint following toward whatever goal_pose last set — legitimately by the
        coordinator, or maliciously by a rogue impersonator (the Scenario 3 attack)."""
        if self.goal is not None:
            v, w = self._waypoint_control()
        else:
            v, w = 0.0, 0.0

        # Integrate unicycle model into a CANDIDATE pose first.
        self.yaw += w * self.dt
        self.yaw = math.atan2(math.sin(self.yaw), math.cos(self.yaw))  # normalize
        cand_x = self.x + v * math.cos(self.yaw) * self.dt
        cand_y = self.y + v * math.sin(self.yaw) * self.dt

        # Collision: a robot cannot pass through solid racks. If the move would put
        # it inside one, block that translation and emergency-stop. This is the
        # physical consequence of a hijack steering the robot into shelving.
        if hits_rack(cand_x, cand_y):
            if not self.collided:
                self.get_logger().warn(
                    f"[{self.robot_name}] COLLISION with rack — emergency stop")
            self.collided = True
            self.mission_state = 'COLLISION'
            v = 0.0  # blocked; report stopped. (position stays put this tick)

            # Escape: steer toward the nearest open direction away from the rack and
            # reverse out, so the robot un-wedges instead of pressing into shelving.
            self._escape_rack()
        else:
            self.x, self.y = cand_x, cand_y
            if self.collided:
                self.collided = False   # cleared once free of the rack

        self._publish_odom(v, w)

    def _escape_rack(self):
        """Un-wedge from a rack: scan headings for a clear step and move there."""
        step = 0.12
        # Try the current heading's neighbours and straight reverse, pick the first
        # that lands in free space, preferring directions away from the rack.
        candidates = [
            self.yaw + math.pi,            # straight reverse
            self.yaw + 2.2, self.yaw - 2.2,
            self.yaw + 1.6, self.yaw - 1.6,
        ]
        for heading in candidates:
            nx = self.x + step * math.cos(heading)
            ny = self.y + step * math.sin(heading)
            if not hits_rack(nx, ny):
                self.x, self.y = nx, ny
                self.yaw = math.atan2(math.sin(heading), math.cos(heading))
                return
        # Fully boxed in (shouldn't happen): just rotate to look for an exit.
        self.yaw = math.atan2(math.sin(self.yaw + 0.4), math.cos(self.yaw + 0.4))

    def _waypoint_control(self):
        gx, gy = self.goal
        dx, dy = gx - self.x, gy - self.y
        dist = math.hypot(dx, dy)
        if dist < 0.15:
            self.mission_state = 'ARRIVED'
            self.goal = None
            return 0.0, 0.0
        target_yaw = math.atan2(dy, dx)
        yaw_err = math.atan2(math.sin(target_yaw - self.yaw),
                             math.cos(target_yaw - self.yaw))
        w = max(-self.max_angular, min(self.max_angular, 2.0 * yaw_err))
        # Slow down while turning hard; full speed when roughly aligned.
        v = self.max_linear if abs(yaw_err) < 0.3 else 0.15
        return v, w

    def _publish_odom(self, v, w):
        msg = Odometry()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'map'
        msg.child_frame_id = f'{self.robot_name}/base_link'
        msg.pose.pose = Pose(
            position=Point(x=self.x, y=self.y, z=0.0),
            orientation=yaw_to_quaternion(self.yaw),
        )
        msg.twist.twist.linear.x = v
        msg.twist.twist.angular.z = w
        self.odom_pub.publish(msg)

    def publish_status(self):
        s = String()
        s.data = (f"{self.robot_name}|state={self.mission_state}"
                  f"|pos={self.x:.2f},{self.y:.2f}|yaw={self.yaw:.2f}")
        self.status_pub.publish(s)


def main(args=None):
    rclpy.init(args=args)
    node = TakeoverRobot()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
