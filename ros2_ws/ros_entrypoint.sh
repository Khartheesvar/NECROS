#!/usr/bin/env bash
set -e
# Source ROS 2 and our built overlay, then run the given command.
source /opt/ros/jazzy/setup.bash
if [ -f /ros2_ws/install/setup.bash ]; then
  source /ros2_ws/install/setup.bash
fi
exec "$@"
