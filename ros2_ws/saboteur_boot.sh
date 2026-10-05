#!/usr/bin/env bash
# Scenario 6 container boot: start the saboteur AMR + saboteur bridge as a managed
# service, then stay alive so an operator can stop/harden/restart it (defend phase).
source /opt/ros/jazzy/setup.bash
[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash

mkdir -p /var/log
saboteurctl start || true

touch /var/log/saboteur.log
exec tail -F /var/log/saboteur.log
