from setuptools import find_packages, setup
import os
from glob import glob

package_name = 'rogue_fleet'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
        # Ship the SROS2 access-control policy so the defend phase can generate
        # signed security artifacts from it (ros2 security generate_artifacts).
        (os.path.join('share', package_name, 'security'), glob('security/*.xml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Rogue Node Lab',
    maintainer_email='gkhartheesvar@ine.com',
    description='Deliberately insecure ROS 2 AMR fleet for security training.',
    license='Educational Use Only',
    entry_points={
        'console_scripts': [
            # Each simulated AMR: holds a true pose, obeys /cmd_vel, publishes odom.
            'robot = rogue_fleet.robot_node:main',
            # Fleet coordinator: assigns waypoints, tracks reported fleet state.
            'coordinator = rogue_fleet.coordinator_node:main',
            # Bridge: mirrors ROS 2 fleet state onto a JSON/WebSocket feed for the HMI.
            'telemetry_bridge = rogue_fleet.telemetry_bridge:main',
            # Scenario 2: dock AMR with real LIDAR perception (sensor-spoof target).
            'dock_robot = rogue_fleet.dock_robot:main',
            # Scenario 2 bridge: forwards dock scene state to the HMI.
            'dock_bridge = rogue_fleet.dock_bridge:main',
            # Scenario 4: convoy AMR publishing /convoy/odom (capture-replay target).
            'convoy_robot = rogue_fleet.convoy_robot:main',
            # Scenario 4 bridge: forwards convoy scene state + graph to the HMI.
            'convoy_bridge = rogue_fleet.convoy_bridge:main',
            # Scenario 5: sentinel AMR (lifecycle node + e-stop service, DoC target).
            'sentinel_robot = rogue_fleet.sentinel_robot:main',
            # Scenario 5 bridge: forwards sentinel scene state + graph to the HMI.
            'sentinel_bridge = rogue_fleet.sentinel_bridge:main',
            # Scenario 6: courier AMR running deliveries as NavigateToPose actions.
            'saboteur_robot = rogue_fleet.saboteur_robot:main',
            # Scenario 6 bridge: forwards saboteur scene state + graph to the HMI.
            'saboteur_bridge = rogue_fleet.saboteur_bridge:main',
            # Scenario 3: dedicated goal-only robot + coordinator + bridge (isolated
            # from Scenario 1 so each scenario exposes only its intended attack).
            'takeover_robot = rogue_fleet.takeover_robot:main',
            'takeover_coordinator = rogue_fleet.takeover_coordinator:main',
            'takeover_bridge = rogue_fleet.takeover_bridge:main',
        ],
    },
)
