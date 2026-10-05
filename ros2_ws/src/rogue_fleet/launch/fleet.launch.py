#!/usr/bin/env python3
"""
fleet.launch.py — bring up the deliberately-insecure AMR fleet.

Launches:
  * amr1, amr2        : two robot nodes, each in its own namespace
  * fleet_coordinator : assigns patrol waypoints, tracks reported state
  * telemetry_bridge  : exposes ground-truth + reported views to the web HMI

Everything talks over the default DDS with NO SROS2 — the "Open Bus" scenario.
"""

from launch import LaunchDescription
from launch_ros.actions import Node


ROBOTS = [
    {'name': 'amr1', 'x': 0.0,  'y': 0.0,  'yaw': 0.0},
    {'name': 'amr2', 'x': 0.0,  'y': 0.0,  'yaw': 3.14159},
]


def generate_launch_description():
    nodes = []

    for r in ROBOTS:
        nodes.append(Node(
            package='rogue_fleet',
            executable='robot',
            namespace=r['name'],
            name='amr',
            parameters=[{
                'robot_name': r['name'],
                'start_x': r['x'],
                'start_y': r['y'],
                'start_yaw': r['yaw'],
            }],
            output='screen',
        ))

    robot_names = [r['name'] for r in ROBOTS]

    nodes.append(Node(
        package='rogue_fleet',
        executable='coordinator',
        name='fleet_coordinator',
        parameters=[{'robots': robot_names}],
        output='screen',
    ))

    nodes.append(Node(
        package='rogue_fleet',
        executable='telemetry_bridge',
        name='telemetry_bridge',
        parameters=[{'robots': robot_names}],
        output='screen',
    ))

    return LaunchDescription(nodes)
