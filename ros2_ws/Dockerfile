# Rogue Node — ROS 2 fleet image (robots + coordinator + telemetry bridge)
# ROS 2 Jazzy Jalisco (LTS, supported to May 2029). Multi-arch (arm64 + amd64).
FROM ros:jazzy-ros-base

SHELL ["/bin/bash", "-c"]

# Minimal extra deps (message packages + colcon are in the base; add what we use).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ros-jazzy-geometry-msgs \
        ros-jazzy-nav-msgs \
        ros-jazzy-sensor-msgs \
        ros-jazzy-nav2-msgs \
        python3-colcon-common-extensions \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /ros2_ws
COPY src/ ./src/

# Build the rogue_fleet package.
RUN source /opt/ros/jazzy/setup.bash && \
    colcon build --symlink-install

# Publish the SROS2 access-control policies at a stable, student-friendly path so the
# defend walkthroughs reference /etc/ros/policies/<scenario>_policy.xml.
RUN mkdir -p /etc/ros/policies && \
    cp /ros2_ws/install/rogue_fleet/share/rogue_fleet/security/*.xml /etc/ros/policies/

# Operator service-control tools (start/stop/status the robot's ROS stack).
COPY fleetctl /usr/local/bin/fleetctl
COPY dockctl /usr/local/bin/dockctl
COPY convoyctl /usr/local/bin/convoyctl
COPY sentinelctl /usr/local/bin/sentinelctl
COPY saboteurctl /usr/local/bin/saboteurctl
COPY takeoverctl /usr/local/bin/takeoverctl
RUN chmod +x /usr/local/bin/fleetctl /usr/local/bin/dockctl /usr/local/bin/convoyctl /usr/local/bin/sentinelctl /usr/local/bin/saboteurctl /usr/local/bin/takeoverctl

# Make ROS 2 + the fleet overlay available in every interactive shell, so a
# `docker compose exec fleet bash` has `ros2` / `fleetctl` ready with no sourcing.
RUN printf '\n# NECROS: source ROS 2 for interactive shells\nsource /opt/ros/jazzy/setup.bash\n[ -f /ros2_ws/install/setup.bash ] && source /ros2_ws/install/setup.bash\n' >> /root/.bashrc

# Entry: source overlay then exec whatever command compose passes.
COPY ros_entrypoint.sh /ros_entrypoint.sh
COPY fleet_boot.sh /fleet_boot.sh
COPY dock_boot.sh /dock_boot.sh
COPY convoy_boot.sh /convoy_boot.sh
COPY sentinel_boot.sh /sentinel_boot.sh
COPY saboteur_boot.sh /saboteur_boot.sh
COPY takeover_boot.sh /takeover_boot.sh
RUN chmod +x /ros_entrypoint.sh /fleet_boot.sh /dock_boot.sh /convoy_boot.sh /sentinel_boot.sh /saboteur_boot.sh /takeover_boot.sh
ENTRYPOINT ["/ros_entrypoint.sh"]
# Boot the fleet as a managed service, then keep the container alive so an
# operator can `fleetctl stop` / harden / `fleetctl start` without killing it.
CMD ["/fleet_boot.sh"]
