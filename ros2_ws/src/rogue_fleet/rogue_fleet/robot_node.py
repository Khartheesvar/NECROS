#!/usr/bin/env python3
"""
robot_node — one simulated Autonomous Mobile Robot (AMR).

This is a REAL ROS 2 node. The only thing "simulated" is the chassis: instead of
driving physical wheels, it integrates a simple unicycle motion model. Everything
else — the topics, the message types, the DDS traffic on the wire — is exactly
what a real ROS 2 robot exposes.

Topics (per robot, namespaced e.g. /amr1/...):
  subscribe  cmd_vel      geometry_msgs/Twist   velocity commands  <-- HIJACK TARGET
  publish    odom         nav_msgs/Odometry     true pose + velocity (telemetry)
  publish    status       std_msgs/String       human-readable mission state
  subscribe  goal_pose    geometry_msgs/Pose    next waypoint from the coordinator

Security note (the whole point of the lab):
  There is NO authentication or encryption here. By ROS 2 default, ANY DDS
  participant that can reach this node can both read `odom` and publish to
  `cmd_vel`. That is the "Open Bus" condition we teach in Scenario 1.
"""

import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Twist, Pose, Point, Quaternion
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


class RobotNode(Node):
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
        self.cmd_linear = 0.0
        self.cmd_angular = 0.0
        self.last_cmd_time = 0.0        # when the most recent cmd_vel arrived
        self.goal = None                # (x, y) waypoint from coordinator
        self.mission_state = 'IDLE'
        self.collided = False          # latched while the robot is against a rack

        # Real AMRs run a cmd_vel watchdog (deadman): if commands stop arriving for
        # CMD_TIMEOUT seconds, the velocity command is considered stale and the
        # robot stops obeying it and resumes autonomy. This both models real safety
        # behaviour and means the fleet self-recovers once a hijack's flood stops.
        self.cmd_timeout = 0.5

        # Best-effort, keep-last QoS — this is the common default for teleop/odom
        # topics on real robots, and (deliberately) trivially joinable.
        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        # ---- Interfaces ----
        self.create_subscription(Twist, 'cmd_vel', self.on_cmd_vel, qos)
        self.create_subscription(Pose, 'goal_pose', self.on_goal, 10)
        self.odom_pub = self.create_publisher(Odometry, 'odom', qos)
        self.status_pub = self.create_publisher(String, 'status', 10)

        # ---- Timers ----
        self.dt = 0.1  # 10 Hz physics + telemetry
        self.create_timer(self.dt, self.step)
        self.create_timer(1.0, self.publish_status)

        self.get_logger().info(
            f"[{self.robot_name}] online at ({self.x:.1f},{self.y:.1f}) "
            f"— cmd_vel is UNAUTHENTICATED (lab default)."
        )

    # ---------- Callbacks ----------
    def on_cmd_vel(self, msg: Twist):
        """Accept ANY velocity command. No auth check — this is the hijack surface."""
        self.cmd_linear = max(-self.max_linear, min(self.max_linear, msg.linear.x))
        self.cmd_angular = max(-self.max_angular, min(self.max_angular, msg.angular.z))
        self.last_cmd_time = self.get_clock().now().nanoseconds / 1e9

    def on_goal(self, msg: Pose):
        self.goal = (msg.position.x, msg.position.y)
        self.mission_state = 'EN_ROUTE'

    # ---------- Core loop ----------
    def step(self):
        """
        If a direct cmd_vel is active, obey it (this is how a hijack moves the robot).
        Otherwise, do simple waypoint following toward the coordinator's goal.
        """
        now = self.get_clock().now().nanoseconds / 1e9
        cmd_fresh = (now - self.last_cmd_time) < self.cmd_timeout
        cmd_active = abs(self.cmd_linear) > 1e-3 or abs(self.cmd_angular) > 1e-3

        if cmd_fresh and cmd_active:
            # A recent external velocity command dominates (teleop OR an attacker
            # actively flooding cmd_vel). This is how a hijack drives the robot.
            v, w = self.cmd_linear, self.cmd_angular
        else:
            # No fresh command: watchdog expired. Drop the stale command and resume
            # autonomy so the robot heads back to its route.
            self.cmd_linear = 0.0
            self.cmd_angular = 0.0
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

            # If this is autonomous motion (not an active hijack), escape: steer
            # toward the nearest open direction away from the rack and reverse out,
            # so the robot un-wedges instead of pressing into the shelving forever.
            if not (cmd_fresh and cmd_active):
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
    node = RobotNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
