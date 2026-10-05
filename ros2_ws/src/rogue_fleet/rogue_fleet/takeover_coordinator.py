#!/usr/bin/env python3
"""
coordinator_node — the warehouse fleet coordinator.

Mirrors the real world: individual robots run their own ROS 2 nav, while a
coordinator above them hands out tasks (waypoints) and tracks fleet state from
the telemetry the robots *report*. It trusts odom at face value — so a robot that
lies (or an attacker publishing fake odom) poisons the coordinator's world view.

Topics:
  publish    /<robot>/goal_pose   geometry_msgs/Pose   next waypoint
  subscribe  /<robot>/odom        nav_msgs/Odometry    reported pose (trusted!)
  publish    /fleet/state         std_msgs/String      compact fleet summary (JSON)
"""

import json
import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import Pose, Point
from nav_msgs.msg import Odometry
from std_msgs.msg import String


# A small patrol route each robot cycles through (warehouse aisles).
PATROL_ROUTES = {
    'amr1': [(6.0, 0.0), (6.0, 4.0), (0.0, 4.0), (0.0, 0.0)],
    'amr2': [(-6.0, 0.0), (-6.0, -4.0), (0.0, -4.0), (0.0, 0.0)],
}

# Rack footprints (cx, cy, half_w, half_d) — must match robot_node.RACKS and the
# 3D view. Used to report when a robot has been driven into shelving.
RACKS = [
    (3.0, 1.6, 1.4, 0.28),
    (3.0, 2.4, 1.4, 0.28),
    (-3.0, -1.6, 1.4, 0.28),
    (-3.0, -2.4, 1.4, 0.28),
]


def at_rack(x, y, margin=0.45):
    # Slightly wider than the robot's own collision radius (0.33) so a robot that
    # has emergency-stopped a step short of the footprint still registers as
    # "in contact" for the operator's collision alert.
    for cx, cy, hw, hd in RACKS:
        if abs(x - cx) < hw + margin and abs(y - cy) < hd + margin:
            return True
    return False

# How far (metres) a robot may stray from its assigned route segment before the
# coordinator flags it COMPROMISED. In Scenario 1 a cmd_vel hijack drives the
# robot off-route, which is exactly what this catches — "loss of control".
ROUTE_DEVIATION_LIMIT = 1.0

# A cmd_vel hijack that spins the robot makes the *instantaneous* cross-track
# deviation oscillate — it keeps crossing its own route line, so a plain average
# understates the attack, while the raw value flickers. We instead track an
# ASYMMETRIC envelope that rises instantly to any new peak but decays slowly:
#
#   if instant > env:  env = instant            (attack spikes are captured at once)
#   else:              env *= DEV_DECAY          (decays ~DEV_DECAY per 0.5s tick)
#
# So a single spike above the limit trips the alert and it stays up through the
# oscillations, then bleeds off once the robot is genuinely back on route.
DEV_DECAY = 0.92  # per ~0.5s tick -> slower bleed, rides through spin dips

# Hysteresis: trip at LIMIT, clear only once the envelope bleeds below CLEAR.
ROUTE_DEVIATION_CLEAR = 0.4


def cross_track_distance(px, py, ax, ay, bx, by):
    """Perpendicular distance from point P to the segment A->B (metres)."""
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-9:
        return math.hypot(px - ax, py - ay)
    # Project P onto AB, clamped to the segment.
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    proj_x, proj_y = ax + t * dx, ay + t * dy
    return math.hypot(px - proj_x, py - proj_y)


class CoordinatorNode(Node):
    def __init__(self):
        super().__init__('fleet_coordinator')

        self.declare_parameter('robots', ['amr1', 'amr2'])
        self.robots = list(self.get_parameter('robots').value)

        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        self.goal_pubs = {}
        self.route_idx = {}
        self.reported = {}        # robot -> dict(x, y, v, last_seen)
        self.dev_env = {}         # robot -> deviation envelope (fast rise, slow decay)
        self.compromised = {}     # robot -> latched alert state (with hysteresis)

        for r in self.robots:
            self.goal_pubs[r] = self.create_publisher(Pose, f'/{r}/goal_pose', 10)
            self.route_idx[r] = 0
            self.reported[r] = {'x': 0.0, 'y': 0.0, 'v': 0.0, 'seen': False}
            self.dev_env[r] = 0.0
            self.compromised[r] = False
            self.create_subscription(
                Odometry, f'/{r}/odom',
                lambda msg, name=r: self.on_odom(name, msg), qos)

        self.fleet_pub = self.create_publisher(String, '/fleet/state', 10)

        # Impersonation detection: a rogue node issuing goals shows up as (a) an
        # extra publisher on a /<robot>/goal_pose topic besides us, and/or (b) a
        # duplicate 'fleet_coordinator' node name on the graph.
        self.impersonation = False
        self.rogue_goal_pubs = False
        self.create_timer(0.5, self.detect_impersonation)

        self.create_timer(3.0, self.assign_goals)   # push next waypoints
        self.create_timer(0.5, self.publish_fleet)   # fleet summary for the HMI

        self.get_logger().info(
            f"Coordinator up, managing {self.robots}. "
            f"Trusts reported odom at face value (lab default).")

    def detect_impersonation(self):
        """Flag a rogue coordinator: extra publisher on any goal topic, or a second
        node claiming the 'fleet_coordinator' name on the graph."""
        rogue_pub = False
        for r in self.robots:
            try:
                if self.count_publishers(f'/{r}/goal_pose') > 1:
                    rogue_pub = True
                    break
            except Exception:
                pass
        # duplicate coordinator node name is the clearest impersonation tell
        dup_name = False
        try:
            names = [n for (n, ns) in self.get_node_names_and_namespaces()
                     if n == 'fleet_coordinator']
            dup_name = len(names) > 1
        except Exception:
            pass
        self.rogue_goal_pubs = rogue_pub
        self.impersonation = rogue_pub or dup_name

    def on_odom(self, robot, msg: Odometry):
        self.reported[robot] = {
            'x': msg.pose.pose.position.x,
            'y': msg.pose.pose.position.y,
            'v': msg.twist.twist.linear.x,
            'seen': True,
        }

    def assign_goals(self):
        for r in self.robots:
            route = PATROL_ROUTES.get(r)
            if not route:
                continue
            gx, gy = route[self.route_idx[r]]
            # Advance to the next waypoint once the robot reports it's close.
            rep = self.reported[r]
            if rep['seen'] and math.hypot(rep['x'] - gx, rep['y'] - gy) < 0.4:
                self.route_idx[r] = (self.route_idx[r] + 1) % len(route)
                gx, gy = route[self.route_idx[r]]
            pose = Pose(position=Point(x=float(gx), y=float(gy), z=0.0))
            self.goal_pubs[r].publish(pose)

    def publish_fleet(self):
        robots_out = {}
        for r in self.robots:
            rep = self.reported[r]
            route = PATROL_ROUTES.get(r)
            goal = route[self.route_idx[r]] if route else None

            # Route segment the robot is supposed to be on: previous -> current goal.
            deviation = 0.0
            if route and rep['seen']:
                prev = route[(self.route_idx[r] - 1) % len(route)]
                deviation = cross_track_distance(
                    rep['x'], rep['y'], prev[0], prev[1], goal[0], goal[1])

            # Deviation envelope: jump up to any new peak at once, decay slowly.
            # Captures the attack instantly and holds through spin oscillation.
            if deviation > self.dev_env[r]:
                self.dev_env[r] = deviation
            else:
                self.dev_env[r] *= DEV_DECAY
            env = self.dev_env[r]

            # Hysteresis: trip at LIMIT, clear only once the envelope bleeds < CLEAR.
            if env > ROUTE_DEVIATION_LIMIT:
                self.compromised[r] = True
            elif env < ROUTE_DEVIATION_CLEAR:
                self.compromised[r] = False

            prev_wp = route[(self.route_idx[r] - 1) % len(route)] if route else None

            robots_out[r] = {
                'reported_x': round(rep['x'], 2),
                'reported_y': round(rep['y'], 2),
                'reported_v': round(rep['v'], 2),
                'goal': goal,
                'goal_idx': self.route_idx[r],
                'segment': [prev_wp, goal] if route else None,  # active leg prev->goal
                'route_deviation': round(env, 2),          # envelope, shown on HMI
                'instant_deviation': round(deviation, 2),  # raw, for debugging
                'compromised': self.compromised[r],
                'collided': at_rack(rep['x'], rep['y']) if rep['seen'] else False,
            }

        msg = String()
        # Include the static patrol routes so the HMI can draw each intended path.
        msg.data = json.dumps({'robots': robots_out, 'routes': PATROL_ROUTES,
                               'impersonation': self.impersonation})
        self.fleet_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = CoordinatorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
