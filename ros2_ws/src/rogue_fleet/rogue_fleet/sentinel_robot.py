#!/usr/bin/env python3
"""
sentinel_robot — Scenario 5 "Dead Man's Switch": a patrol AMR whose availability is
the target. It is a REAL ROS 2 managed (lifecycle) node that also exposes a
privileged e-stop service. Both are legitimate robot features — and both are
unauthenticated on an open bus, so an attacker can DISABLE the robot two ways:

  1. ros2 lifecycle set /sentinel/sentinel_amr deactivate   -> node leaves ACTIVE
  2. ros2 service call /sentinel/sentinel_amr/estop std_srvs/srv/Trigger -> halt

Neither hijacks the robot or spoofs data — they take away *control/availability*.
This is Denial of Control (MITRE ATT&CK for ICS): the fleet is not commanded, it is
switched off.

Lifecycle states used:
  - ACTIVE:    patrols the route, publishes odom + scene state (running)
  - INACTIVE:  frozen in place, still publishes scene state flagged HALTED
The e-stop service latches a halt even while ACTIVE (emergency stop).

Topics / services (namespaced /sentinel/...):
  publish    odom           nav_msgs/Odometry
  publish    /sentinel/state std_msgs/String   compact JSON scene state for the HMI
  service    ~/estop        std_srvs/Trigger   privileged emergency-stop (DoC target)
"""

import json
import math

import rclpy
from rclpy.lifecycle import LifecycleNode, TransitionCallbackReturn
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Point, Quaternion
from nav_msgs.msg import Odometry
from std_msgs.msg import String
from std_srvs.srv import Trigger


def yaw_to_quaternion(yaw):
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


ROUTE = [(0.0, 0.0), (6.0, 0.0), (6.0, 5.0), (-6.0, 5.0), (-6.0, 0.0), (0.0, 0.0)]
MAX_LINEAR = 0.9
MAX_ANGULAR = 1.4


class SentinelRobot(LifecycleNode):
    def __init__(self):
        super().__init__('sentinel_amr', namespace='/sentinel')
        self.x, self.y, self.yaw, self.v = 0.0, 0.0, 0.0, 0.0
        self.route_idx = 1
        self.active = False       # lifecycle ACTIVE?
        self.estopped = False     # latched emergency stop?
        self._odom_pub = None
        self._state_pub = None
        self._estop_srv = None
        self._timer = None
        # A state publisher exists across all lifecycle states so the HMI always has
        # a feed (lifecycle only gates the *robot's* behavior, not the bridge feed).
        self._state_pub = self.create_publisher(String, '/sentinel/state', 10)
        self.create_timer(0.2, self.publish_state)
        self.get_logger().info(
            "[sentinel] lifecycle node created (UNCONFIGURED). Managed lifecycle + "
            "e-stop service are UNAUTHENTICATED on the open bus (lab default).")

    # ---- lifecycle transitions -------------------------------------------------
    def on_configure(self, state):
        qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT,
                         history=HistoryPolicy.KEEP_LAST, depth=10)
        self._odom_pub = self.create_lifecycle_publisher(Odometry, 'odom', qos)
        # privileged emergency-stop service (no auth on the open bus)
        self._estop_srv = self.create_service(Trigger, '~/estop', self.on_estop)
        self.get_logger().info("[sentinel] configured.")
        return TransitionCallbackReturn.SUCCESS

    def on_activate(self, state):
        self.active = True
        self.estopped = False
        if self._timer is None:
            self._timer = self.create_timer(0.1, self.step)
        self.get_logger().info("[sentinel] ACTIVE — patrolling.")
        return super().on_activate(state)

    def on_deactivate(self, state):
        self.active = False
        self.v = 0.0
        self.get_logger().warn("[sentinel] DEACTIVATED — control removed, robot frozen.")
        return super().on_deactivate(state)

    def on_cleanup(self, state):
        self._teardown()
        return TransitionCallbackReturn.SUCCESS

    def on_shutdown(self, state):
        self._teardown()
        self.get_logger().warn("[sentinel] SHUTDOWN.")
        return TransitionCallbackReturn.SUCCESS

    def _teardown(self):
        if self._timer:
            self._timer.cancel(); self._timer = None
        self.active = False
        self.v = 0.0

    # ---- privileged service ----------------------------------------------------
    def on_estop(self, request, response):
        self.estopped = True
        self.v = 0.0
        self.get_logger().warn("[sentinel] E-STOP latched via service call — halted.")
        response.success = True
        response.message = "emergency stop engaged"
        return response

    # ---- motion (only when ACTIVE and not e-stopped) ---------------------------
    def step(self):
        if not self.active or self.estopped:
            self.v = 0.0
            return
        gx, gy = ROUTE[self.route_idx]
        dx, dy = gx - self.x, gy - self.y
        dist = math.hypot(dx, dy)
        if dist < 0.3:
            self.route_idx = (self.route_idx + 1) % len(ROUTE)
            gx, gy = ROUTE[self.route_idx]
            dx, dy = gx - self.x, gy - self.y
        desired = math.atan2(dy, dx)
        err = math.atan2(math.sin(desired - self.yaw), math.cos(desired - self.yaw))
        w = max(-MAX_ANGULAR, min(MAX_ANGULAR, 2.0 * err))
        v = MAX_LINEAR if abs(err) < 0.6 else 0.25
        self.yaw += w * 0.1
        self.x += v * math.cos(self.yaw) * 0.1
        self.y += v * math.sin(self.yaw) * 0.1
        self.v = v
        if self._odom_pub is not None:
            msg = Odometry()
            msg.header.stamp = self.get_clock().now().to_msg()
            msg.header.frame_id = 'odom'
            msg.pose.pose.position = Point(x=self.x, y=self.y, z=0.0)
            msg.pose.pose.orientation = yaw_to_quaternion(self.yaw)
            msg.twist.twist.linear.x = self.v
            self._odom_pub.publish(msg)

    # ---- scene state for the HMI (published in every lifecycle state) ----------
    def publish_state(self):
        # Determine a human-readable control status.
        if self.estopped:
            status = 'ESTOPPED'
        elif self.active:
            status = 'ACTIVE'
        else:
            status = 'HALTED'   # configured/inactive -> control removed
        controllable = self.active and not self.estopped
        state = {
            'robot': 'sentinel1',
            'lifecycle': 'active' if self.active else 'inactive',
            'estopped': self.estopped,
            'status': status,
            'controllable': controllable,
            'pose': {'x': round(self.x, 2), 'y': round(self.y, 2),
                     'yaw': round(self.yaw, 2), 'v': round(self.v, 2)},
            'route': ROUTE,
        }
        self._state_pub.publish(String(data=json.dumps(state)))


def main(args=None):
    rclpy.init(args=args)
    node = SentinelRobot()
    # Auto-bring-up to ACTIVE so the robot is running by default (operator baseline).
    node.trigger_configure()
    node.trigger_activate()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
