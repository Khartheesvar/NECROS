#!/usr/bin/env python3
"""
saboteur.launch.py — Scenario 6 "Saboteur": a courier AMR that runs deliveries as
NavigateToPose actions, plus the saboteur bridge. Open bus by default: the action's
cancel interface is unauthenticated, so an attacker can abort deliveries at will.
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # saboteur_robot self-namespaces to /saboteur.
        Node(
            package='rogue_fleet', executable='saboteur_robot',
            name='saboteur_amr', output='screen',
        ),
        Node(
            package='rogue_fleet', executable='saboteur_bridge',
            name='saboteur_bridge', output='screen',
        ),
    ])
