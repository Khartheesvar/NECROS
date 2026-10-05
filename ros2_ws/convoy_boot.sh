#!/usr/bin/env bash
# Scenario 4 container boot: start the convoy AMR + convoy bridge as a managed
# service, then stay alive so an operator can stop/harden/restart it (defend phase).
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
convoyctl start || true

touch /var/log/convoy.log
exec tail -F /var/log/convoy.log
