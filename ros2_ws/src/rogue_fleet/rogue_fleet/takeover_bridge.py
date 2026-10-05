#!/usr/bin/env python3
"""
telemetry_bridge — ROS 2  ->  web dashboard bridge.

Subscribes to ground-truth odom from every robot (and the coordinator's reported
fleet view) and serves it as newline-delimited JSON over a plain TCP/WebSocket-ish
feed that the backend (FastAPI) relays to the browser HMI.

Why two views?
  * "ground_truth" = each robot's real odom (what's physically happening).
  * "reported"     = what the coordinator believes (its /fleet/state).
In a clean run they match. During a spoofing attack they diverge — and that gap,
rendered side by side, is the lesson.

This bridge intentionally does only transport. All the security-relevant behavior
lives in the robot/coordinator nodes and the attacker toolkit.
"""

import asyncio
import json
import os
import threading

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from nav_msgs.msg import Odometry
from std_msgs.msg import String


class TelemetryState:
    """Thread-safe-ish shared snapshot (single writer from ROS thread)."""
    def __init__(self):
        self.ground_truth = {}   # robot -> {x,y,yaw,v}
        self.reported = {}       # from /fleet/state
        self.routes = {}         # robot -> list of [x,y] patrol waypoints
        self.graph = {'nodes': [], 'topics': []}  # live DDS graph snapshot
        self.impersonation = False  # rogue-coordinator detected
        self.lock = threading.Lock()

    def snapshot(self):
        with self.lock:
            return {
                'ground_truth': dict(self.ground_truth),
                'reported': dict(self.reported),
                'routes': dict(self.routes),
                'graph': dict(self.graph),
                'impersonation': self.impersonation,
                # Fleet security posture: the bridge runs inside the fleet's own
                # process group, so its security env reflects how the fleet launched.
                'security_enforced': os.environ.get('ROS_SECURITY_ENABLE', 'false') == 'true',
            }


class BridgeNode(Node):
    def __init__(self, state: TelemetryState):
        super().__init__('telemetry_bridge')
        self.state = state
        self.declare_parameter('robots', ['amr1', 'amr2'])
        self.robots = list(self.get_parameter('robots').value)

        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )
        for r in self.robots:
            self.create_subscription(
                Odometry, f'/{r}/odom',
                lambda msg, name=r: self.on_odom(name, msg), qos)
        self.create_subscription(String, '/fleet/state', self.on_fleet, 10)

        # Nodes that legitimately belong to the fleet. Anything else discovered on
        # the bus is foreign — i.e. an attacker's node that joined via open DDS
        # discovery. (The bridge node itself is also "ours".)
        self.legit_nodes = {f'/{r}/amr' for r in self.robots}
        self.legit_nodes |= {'/fleet_coordinator', '/telemetry_bridge'}
        # ROS 2 internal/daemon nodes we don't want to show as attackers.
        self.ignore_nodes = {'/_ros2cli_daemon', '/rviz'}

        # Poll the DDS graph twice a second to surface who is on the bus.
        self.create_timer(0.5, self.scan_graph)
        self.get_logger().info(f"Telemetry bridge subscribed to {self.robots} + /fleet/state")

    def scan_graph(self):
        """Introspect the live ROS 2 graph: list nodes/topics, flag foreign nodes."""
        nodes_out = []
        for name, ns in self.get_node_names_and_namespaces():
            full = (ns.rstrip('/') + '/' + name) if ns != '/' else '/' + name
            if any(full.startswith(ig) for ig in self.ignore_nodes):
                continue
            foreign = full not in self.legit_nodes
            nodes_out.append({'name': full, 'foreign': foreign})

        topics_out = []
        for tname, ttypes in self.get_topic_names_and_types():
            if tname in ('/parameter_events', '/rosout'):
                continue
            # S3's attack surface is the command channel: goal_pose (impersonation).
            sensitive = tname.endswith('/goal_pose')
            topics_out.append({'name': tname,
                               'type': ttypes[0] if ttypes else '',
                               'sensitive': sensitive})

        with self.state.lock:
            self.state.graph = {
                'nodes': sorted(nodes_out, key=lambda n: n['name']),
                'topics': sorted(topics_out, key=lambda t: t['name']),
            }

    def on_odom(self, robot, msg: Odometry):
        import math
        q = msg.pose.pose.orientation
        yaw = math.atan2(2.0 * (q.w * q.z), 1.0 - 2.0 * (q.z * q.z))
        with self.state.lock:
            self.state.ground_truth[robot] = {
                'x': round(msg.pose.pose.position.x, 3),
                'y': round(msg.pose.pose.position.y, 3),
                'yaw': round(yaw, 3),
                'v': round(msg.twist.twist.linear.x, 3),
            }

    def on_fleet(self, msg: String):
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        with self.state.lock:
            self.state.reported = data.get('robots', {})
            if 'routes' in data:
                self.state.routes = data['routes']
            self.state.impersonation = data.get('impersonation', False)


async def feed_server(state: TelemetryState, host='0.0.0.0', port=9100):
    """Push a JSON snapshot ~10x/sec to any connected TCP client (the backend)."""
    async def handle(reader, writer):
        peer = writer.get_extra_info('peername')
        print(f"[bridge] feed client connected: {peer}", flush=True)
        try:
            while True:
                line = json.dumps(state.snapshot()) + "\n"
                writer.write(line.encode())
                await writer.drain()
                await asyncio.sleep(0.1)
        except (ConnectionResetError, BrokenPipeError):
            pass
        finally:
            writer.close()
    server = await asyncio.start_server(handle, host, port)
    print(f"[bridge] telemetry feed on {host}:{port}", flush=True)
    async with server:
        await server.serve_forever()


def main(args=None):
    rclpy.init(args=args)
    state = TelemetryState()
    node = BridgeNode(state)

    # Spin ROS in a background thread; run the asyncio feed server in the main thread.
    spin_thread = threading.Thread(target=rclpy.spin, args=(node,), daemon=True)
    spin_thread.start()

    try:
        port = int(os.environ.get('BRIDGE_FEED_PORT', '9100'))
        asyncio.run(feed_server(state, port=port))
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
