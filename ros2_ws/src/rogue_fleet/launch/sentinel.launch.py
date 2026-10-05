#!/usr/bin/env python3
"""
sentinel.launch.py — Scenario 5 "Dead Man's Switch": a managed (lifecycle) patrol
AMR that also exposes a privileged e-stop service, plus the sentinel bridge. Open bus
by default: lifecycle transitions and the e-stop service are unauthenticated, so an
attacker can disable the robot (Denial of Control).
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # sentinel_robot self-namespaces to /sentinel and auto-brings-up to ACTIVE.
        Node(
            package='rogue_fleet', executable='sentinel_robot',
            name='sentinel_amr', output='screen',
        ),
        Node(
            package='rogue_fleet', executable='sentinel_bridge',
            name='sentinel_bridge', output='screen',
        ),
    ])
