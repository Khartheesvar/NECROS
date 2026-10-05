#!/usr/bin/env python3
"""
convoy_bridge — Scenario 4 "Ghost Convoy" bridge: forwards the convoy robot's scene
state + the live DDS graph to the backend over a TCP JSON feed (same pattern as
dock_bridge / telemetry_bridge). Kept separate so Scenario 4 is self-contained.

It also flags the replay signature on the graph: a FOREIGN publisher on
/convoy/odom (e.g. `ros2 bag play`) is the attacker re-emitting captured telemetry.
"""

import asyncio
import json
import os
import threading

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from std_msgs.msg import String
from nav_msgs.msg import Odometry


# ---- Layer-2 anti-replay defense (real freshness/sequence validation) -----------
# Toggle the freshness check with the environment, the same way SROS2 is toggled:
#   FRESHNESS_ENABLE=true   -> the consumer validates every /convoy/odom sample and
#                              REJECTS stale (old timestamp) or replayed (sequence not
#                              strictly increasing) ones.
# This is the control SROS2 alone does NOT provide: it stops replay even from an
# authenticated node, because a looped `ros2 bag play` re-emits old stamps and
# repeating sequence numbers.
FRESHNESS_ENABLE = os.environ.get('FRESHNESS_ENABLE', 'false').lower() == 'true'
# A sample whose header.stamp is older than this many seconds behind the node clock
# is considered stale. Generous enough to tolerate normal transport jitter.
STALE_SECONDS = 1.5


def parse_seq(child_frame_id: str):
    """The robot smuggles a monotonic sequence number as 'convoy1:<seq>' in
    child_frame_id (a real system would use a dedicated authenticated field)."""
    try:
        return int(child_frame_id.split(':', 1)[1])
    except (IndexError, ValueError):
        return None


class ConvoyState:
    def __init__(self):
        self.scene = {}
        self.graph = {'nodes': [], 'topics': []}
        self.defense = {
            'freshness_enabled': FRESHNESS_ENABLE,
            'accepted': 0,       # samples that passed the freshness/sequence check
            'rejected': 0,       # stale/replayed samples dropped by the defense
            'last_reject_reason': None,
        }
        # Last pose ACCEPTED by the freshness check — the defended operator view.
        self.accepted_pose = None
        self.lock = threading.Lock()

    def snapshot(self):
        with self.lock:
            scene = dict(self.scene)
            # When the freshness check is active, the operator view is the defended
            # consumer's view: it shows only poses that PASSED validation, so a
            # replay cannot freeze it. Override the robot-reported pose (which has no
            # freshness check of its own) with the last accepted sample, and clear
            # the spoof flag — the replay is being rejected, not believed.
            if FRESHNESS_ENABLE and self.accepted_pose is not None:
                scene = dict(scene)
                scene['reported'] = {'x': round(self.accepted_pose[0], 2),
                                     'y': round(self.accepted_pose[1], 2)}
                gt = scene.get('ground_truth') or {}
                import math as _m
                scene['gap'] = round(_m.hypot(
                    (gt.get('x', self.accepted_pose[0]) - self.accepted_pose[0]),
                    (gt.get('y', self.accepted_pose[1]) - self.accepted_pose[1])), 2)
                scene['spoofed'] = False
                scene['defended'] = True
            return {
                'scene': scene,
                'graph': dict(self.graph),
                'defense': dict(self.defense),
                'security_enforced': os.environ.get('ROS_SECURITY_ENABLE', 'false') == 'true',
            }


class ConvoyBridgeNode(Node):
    def __init__(self, state: ConvoyState):
        super().__init__('convoy_bridge')
        self.state = state
        self.create_subscription(String, '/convoy/state', self.on_scene, 10)

        # Layer-2 defense: consume /convoy/odom ourselves and validate freshness.
        qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT,
                         history=HistoryPolicy.KEEP_LAST, depth=10)
        self.create_subscription(Odometry, '/convoy/odom', self.on_odom, qos)
        self.last_seq = -1
        self.last_stamp = 0.0

        self.legit = {'/convoy/convoy_amr', '/convoy_bridge'}
        self.ignore = {'/_ros2cli_daemon', '/rviz'}
        self.create_timer(0.5, self.scan_graph)
        self.get_logger().info(
            "Convoy bridge up — forwarding /convoy/state; freshness check "
            f"{'ENABLED' if FRESHNESS_ENABLE else 'disabled (open)'}")

    def on_odom(self, msg: Odometry):
        """Validate each telemetry sample: a FRESH, in-SEQUENCE message is accepted;
        a stale timestamp or a non-increasing sequence number means a replay -> drop."""
        seq = parse_seq(msg.child_frame_id)
        stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        now = self.get_clock().now().nanoseconds * 1e-9
        age = now - stamp

        reason = None
        if seq is not None and seq <= self.last_seq:
            reason = f'replayed (seq {seq} <= last {self.last_seq})'
        elif age > STALE_SECONDS:
            reason = f'stale (age {age:.1f}s > {STALE_SECONDS}s)'

        with self.state.lock:
            d = self.state.defense
            if FRESHNESS_ENABLE and reason:
                d['rejected'] += 1
                d['last_reject_reason'] = reason
                return  # DROP the sample — the defense rejects the replay
            # Accept: advance the watermark (only on accepted, fresh samples).
            d['accepted'] += 1
            # Record the accepted pose ON THE STATE (snapshot reads it) under the lock.
            self.state.accepted_pose = (msg.pose.pose.position.x, msg.pose.pose.position.y)
        if seq is not None:
            self.last_seq = max(self.last_seq, seq)
        self.last_stamp = stamp

    def on_scene(self, msg: String):
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        with self.state.lock:
            self.state.scene = data

    def scan_graph(self):
        nodes = []
        for name, ns in self.get_node_names_and_namespaces():
            full = (ns.rstrip('/') + '/' + name) if ns != '/' else '/' + name
            if any(full.startswith(ig) for ig in self.ignore):
                continue
            # A `ros2 bag play` process shows up as a transient player node; any node
            # publishing /convoy/odom that isn't the robot is the replay attacker.
            nodes.append({'name': full, 'foreign': full not in self.legit})
        topics = []
        for tname, ttypes in self.get_topic_names_and_types():
            if tname in ('/parameter_events', '/rosout'):
                continue
            # S4's attack surface is /odom (capture-and-replay of telemetry).
            sensitive = tname.endswith('/odom')
            topics.append({'name': tname, 'type': ttypes[0] if ttypes else '',
                           'sensitive': sensitive})
        with self.state.lock:
            self.state.graph = {'nodes': sorted(nodes, key=lambda n: n['name']),
                                'topics': sorted(topics, key=lambda t: t['name'])}


async def feed_server(state: ConvoyState, host='0.0.0.0', port=9103):
    async def handle(reader, writer):
        try:
            while True:
                writer.write((json.dumps(state.snapshot()) + "\n").encode())
                await writer.drain()
                await asyncio.sleep(0.1)
        except (ConnectionResetError, BrokenPipeError):
            pass
        finally:
            writer.close()
    server = await asyncio.start_server(handle, host, port)
    print(f"[convoy_bridge] feed on {host}:{port}", flush=True)
    async with server:
        await server.serve_forever()


def main(args=None):
    rclpy.init(args=args)
    state = ConvoyState()
    node = ConvoyBridgeNode(state)
    threading.Thread(target=rclpy.spin, args=(node,), daemon=True).start()
    try:
        asyncio.run(feed_server(state, port=int(os.environ.get('BRIDGE_FEED_PORT', '9103'))))
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
