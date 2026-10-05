#!/usr/bin/env python3
"""
dock_bridge — Scenario 2 bridge: forwards the dock robot's scene state + the live
DDS graph to the backend over a TCP JSON feed (same pattern as telemetry_bridge).
Kept separate from the fleet bridge so Scenario 2 is self-contained.
"""

import asyncio
import json
import os
import threading

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class DockState:
    def __init__(self):
        self.scene = {}
        self.graph = {'nodes': [], 'topics': []}
        self.lock = threading.Lock()

    def snapshot(self):
        with self.lock:
            return {
                'scene': dict(self.scene),
                'graph': dict(self.graph),
                'security_enforced': os.environ.get('ROS_SECURITY_ENABLE', 'false') == 'true',
            }


class DockBridgeNode(Node):
    def __init__(self, state: DockState):
        super().__init__('dock_bridge')
        self.state = state
        self.create_subscription(String, '/dock/state', self.on_scene, 10)

        self.legit = {'/dock/dock_amr', '/dock_bridge'}
        self.ignore = {'/_ros2cli_daemon', '/rviz'}
        self.create_timer(0.5, self.scan_graph)
        self.get_logger().info("Dock bridge up — forwarding /dock/state")

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
            nodes.append({'name': full, 'foreign': full not in self.legit})
        topics = []
        for tname, ttypes in self.get_topic_names_and_types():
            if tname in ('/parameter_events', '/rosout'):
                continue
            # S2's only attack surface is the sensor topic (spoofable /scan).
            sensitive = tname.endswith('/scan')
            topics.append({'name': tname, 'type': ttypes[0] if ttypes else '',
                           'sensitive': sensitive})
        with self.state.lock:
            self.state.graph = {'nodes': sorted(nodes, key=lambda n: n['name']),
                                'topics': sorted(topics, key=lambda t: t['name'])}


async def feed_server(state: DockState, host='0.0.0.0', port=9101):
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
    print(f"[dock_bridge] feed on {host}:{port}", flush=True)
    async with server:
        await server.serve_forever()


def main(args=None):
    rclpy.init(args=args)
    state = DockState()
    node = DockBridgeNode(state)
    threading.Thread(target=rclpy.spin, args=(node,), daemon=True).start()
    try:
        asyncio.run(feed_server(state))
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
