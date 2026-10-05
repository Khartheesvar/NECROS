#!/usr/bin/env bash
# Scenario 2 container boot: start the dock AMR + dock bridge as a managed service,
# then stay alive so an operator can stop/harden/restart it (defend phase later).
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
dockctl start || true

touch /var/log/dock.log
exec tail -F /var/log/dock.log
