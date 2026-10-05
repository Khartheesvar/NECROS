#!/usr/bin/env python3
"""
takeover.launch.py — Scenario 3 "Rogue Coordinator" fleet (fully isolated from S1).

Launches a DEDICATED goal-following fleet:
  * amr1, amr2        : takeover_robot nodes — obey ONLY goal_pose (no cmd_vel)
  * fleet_coordinator : takeover_coordinator — assigns waypoints, detects impersonation
  * telemetry_bridge  : takeover_bridge — exposes state to the web HMI

Separate from Scenario 1's fleet.launch.py so S3 exposes only its intended attack
(coordinator impersonation on goal_pose) and shares no code or interfaces with S1.
Open bus by default (goal_pose unauthenticated).
"""

from launch import LaunchDescription
from launch_ros.actions import Node


ROBOTS = [
    {'name': 'amr1', 'x': 0.0, 'y': 0.0, 'yaw': 0.0},
    {'name': 'amr2', 'x': 0.0, 'y': 0.0, 'yaw': 3.14159},
]


def generate_launch_description():
    nodes = []

    for r in ROBOTS:
        nodes.append(Node(
            package='rogue_fleet',
            executable='takeover_robot',
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
        executable='takeover_coordinator',
        name='fleet_coordinator',
        parameters=[{'robots': robot_names}],
        output='screen',
    ))

    nodes.append(Node(
        package='rogue_fleet',
        executable='takeover_bridge',
        name='telemetry_bridge',
        parameters=[{'robots': robot_names}],
        output='screen',
    ))

    return LaunchDescription(nodes)
