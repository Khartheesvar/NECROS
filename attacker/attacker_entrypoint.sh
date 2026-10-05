#!/usr/bin/env bash
# NECROS attacker entrypoint.
# Make the ROS 2 (RoboStack) env available and match the fleet's DDS settings so
# the attacker joins the same bus. Interactive shells land with ros_env active.
set -e

export PATH=/opt/conda/bin:$PATH

# Auto-activate ros_env for interactive bash sessions (docker compose exec ... bash).
cat > /etc/profile.d/necros_ros.sh <<'EOF'
export PATH=/opt/conda/bin:$PATH
source /opt/conda/etc/profile.d/conda.sh
conda activate ros_env
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
export RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION:-rmw_fastrtps_cpp}
export PYTHONPATH=$PYTHONPATH:/opt/aztarna
EOF

# Also activate for whatever CMD/exec we run directly.
source /opt/conda/etc/profile.d/conda.sh
conda activate ros_env
export ROS_DOMAIN_ID=${ROS_DOMAIN_ID:-0}
export RMW_IMPLEMENTATION=${RMW_IMPLEMENTATION:-rmw_fastrtps_cpp}

exec "$@"
