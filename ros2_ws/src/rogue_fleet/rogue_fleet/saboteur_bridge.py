#!/usr/bin/env python3
"""
saboteur_bridge — Scenario 6 "Saboteur" bridge: forwards the saboteur
robot's scene state + the live DDS graph to the backend over a TCP JSON feed.
Self-contained (same pattern as the other bridges).

It surfaces the action-cancel sabotage signals: the courier's mission status
(driving / canceled / delivered) and any foreign node on the bus (e.g. a
`ros2 service call` client hitting the action's cancel service to abort deliveries).
"""

import asyncio
import json
import os
import threading

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class SaboteurState:
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


class SaboteurBridgeNode(Node):
    def __init__(self, state: SaboteurState):
        super().__init__('saboteur_bridge')
        self.state = state
        self.create_subscription(String, '/saboteur/state', self.on_scene, 10)
        self.legit = {'/saboteur/saboteur_amr', '/saboteur_bridge'}
        self.ignore = {'/_ros2cli_daemon', '/rviz'}
        self.create_timer(0.5, self.scan_graph)
        self.get_logger().info("Saboteur bridge up — forwarding /saboteur/state")

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
            sensitive = '_action/' in tname or tname.endswith('/cancel_goal')
            topics.append({'name': tname, 'type': ttypes[0] if ttypes else '',
                           'sensitive': sensitive})
        with self.state.lock:
            self.state.graph = {'nodes': sorted(nodes, key=lambda n: n['name']),
                                'topics': sorted(topics, key=lambda t: t['name'])}


async def feed_server(state: SaboteurState, host='0.0.0.0', port=9105):
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
    print(f"[saboteur_bridge] feed on {host}:{port}", flush=True)
    async with server:
        await server.serve_forever()


def main(args=None):
    rclpy.init(args=args)
    state = SaboteurState()
    node = SaboteurBridgeNode(state)
    threading.Thread(target=rclpy.spin, args=(node,), daemon=True).start()
    try:
        asyncio.run(feed_server(state, port=int(os.environ.get('BRIDGE_FEED_PORT', '9105'))))
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
