#!/usr/bin/env bash
# Scenario 3 container boot: start the dedicated takeover fleet (goal-only robots +
# coordinator + bridge) as a managed service, then stay alive so an operator can
# stop/harden/restart it (defend phase). Fully isolated from Scenario 1.
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
takeoverctl start || true

touch /var/log/takeover.log
exec tail -F /var/log/takeover.log
