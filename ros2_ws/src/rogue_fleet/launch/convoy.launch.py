#!/usr/bin/env python3
"""
convoy.launch.py — Scenario 4 "Ghost Convoy": a delivery AMR that publishes
/convoy/odom + the convoy bridge. Open bus by default: /odom carries no replay
protection, so captured telemetry can be replayed to freeze the operator's view.
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # convoy_robot self-namespaces to /convoy in its constructor.
        Node(
            package='rogue_fleet', executable='convoy_robot',
            name='convoy_amr',
            parameters=[{'robot_name': 'convoy1'}],
            output='screen',
        ),
        Node(
            package='rogue_fleet', executable='convoy_bridge',
            name='convoy_bridge', output='screen',
        ),
    ])
