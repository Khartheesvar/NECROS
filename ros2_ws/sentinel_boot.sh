#!/usr/bin/env bash
# Scenario 5 container boot: start the sentinel AMR + sentinel bridge as a managed
# service, then stay alive so an operator can stop/harden/restart it (defend phase).
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
sentinelctl start || true

touch /var/log/sentinel.log
exec tail -F /var/log/sentinel.log
