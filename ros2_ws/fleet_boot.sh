#!/usr/bin/env bash
# Container boot: start the fleet (open bus by default) as a managed service,
# then stay alive so an operator can stop/harden/restart the ROS stack in place.
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
# Start the fleet in the background via the same path fleetctl uses.
fleetctl start || true

# Keep PID 1 alive regardless of fleet stop/start, and surface fleet logs.
touch /var/log/fleet.log
exec tail -F /var/log/fleet.log
