#!/usr/bin/env python3
"""
dock.launch.py — Scenario 2 "Blind Navigator": a dock AMR with real LIDAR
perception + the dock bridge. Open bus by default (sensor topics unauthenticated).
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='rogue_fleet', executable='dock_robot',
            namespace='dock', name='dock_amr',
            parameters=[{'robot_name': 'dock1'}],
            output='screen',
        ),
        Node(
            package='rogue_fleet', executable='dock_bridge',
            name='dock_bridge', output='screen',
        ),
    ])
