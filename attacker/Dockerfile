# NECROS — attacker box.
#
# A real Kali Linux pentest workstation with ROS 2 Jazzy installed via RoboStack
# (conda/mamba). This is "the machine on the same network as the robots": the
# attacker uses genuine tooling (ros2 CLI, Wireshark/tshark with the RTPS/DDS
# dissector, scapy, nmap, ettercap, aztarna, ...) — no custom helper scripts.
#
# ROS 2 lives in a conda env because Kali is Debian-based, not Ubuntu. Activate it
# with:  mamba activate ros_env   (the entrypoint does this for interactive shells).
FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

# --- Kali toolset (headless) + essentials for DDS/ROS 2 recon & MITM ----------
RUN apt-get update && apt-get install -y --no-install-recommends \
        kali-linux-headless \
        wireshark-common \
        tshark \
        tcpdump \
        nmap \
        ettercap-text-only \
        dsniff \
        netcat-traditional \
        iproute2 \
        iputils-ping \
        curl \
        wget \
        git \
        ca-certificates \
        bzip2 \
    && rm -rf /var/lib/apt/lists/*

# --- RoboStack: ROS 2 Jazzy via conda/mamba (works on Debian/Kali) ------------
# Install Miniforge (ships conda + mamba), then create a ros_env with ros-jazzy.
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      arm64|aarch64) MF_ARCH=aarch64 ;; \
      amd64|x86_64)  MF_ARCH=x86_64  ;; \
      *) echo "unsupported arch: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    wget -qO /tmp/miniforge.sh \
      "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${MF_ARCH}.sh"; \
    bash /tmp/miniforge.sh -b -p /opt/conda; \
    rm /tmp/miniforge.sh

ENV PATH=/opt/conda/bin:$PATH

# Create the ROS 2 environment from the RoboStack channel.
RUN /opt/conda/bin/mamba create -n ros_env -y \
        -c conda-forge -c robostack-jazzy \
        ros-jazzy-ros-base \
        ros-jazzy-geometry-msgs \
        ros-jazzy-nav-msgs \
        ros-jazzy-sensor-msgs \
        ros-jazzy-rmw-fastrtps-cpp \
        python=3.11 \
    && /opt/conda/bin/mamba clean -a -y

# scapy (with RTPS/DDS contrib layer) for packet crafting, in the ROS env's python.
RUN /opt/conda/envs/ros_env/bin/pip install --no-cache-dir scapy

# aztarna — Alias Robotics' footprinting/scanner for ROS/SROS robots.
RUN git clone --depth 1 https://github.com/aliasrobotics/aztarna.git /opt/aztarna || true

# Make ROS 2 available in EVERY interactive shell (login or not), so a plain
# `docker compose exec attacker bash` has `ros2` ready — no -l flag needed.
RUN cat >> /root/.bashrc <<'EOF'

# --- NECROS: activate ROS 2 (RoboStack) for interactive shells ---
source /opt/conda/etc/profile.d/conda.sh
conda activate ros_env
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
export RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION:-rmw_fastrtps_cpp}
export PYTHONPATH=$PYTHONPATH:/opt/aztarna
EOF

WORKDIR /attacker
COPY attacker_entrypoint.sh /attacker_entrypoint.sh
RUN chmod +x /attacker_entrypoint.sh
ENTRYPOINT ["/attacker_entrypoint.sh"]
CMD ["sleep", "infinity"]
