#!/usr/bin/env python3
"""
saboteur_robot — Scenario 6 "Saboteur": a courier AMR that runs its deliveries as
ROS 2 ACTIONS (the same primitive Nav2 uses — nav2_msgs/action/NavigateToPose).

This is a REAL ROS 2 node. The only thing simulated is the chassis. The robot is its
OWN action client+server: it self-issues a NavigateToPose goal for the next drop,
drives there over a few seconds, then issues the next one — a continuous delivery
loop, exactly like a robot working through a task queue.

The scenario it enables — ACTION GOAL CANCELLATION (task sabotage):
  On an open bus the action's cancel interface is unauthenticated. An attacker calls
  the hidden cancel service with an ALL-ZERO goal id + stamp:
     ros2 service call /saboteur/navigate_to_pose/_action/cancel_goal \
        action_msgs/srv/CancelGoal "{goal_info: {goal_id: {uuid: [0,...]}, ...}}"
  Per the CancelGoal spec, zero id + zero stamp = CANCEL ALL GOALS. The courier
  abandons its delivery mid-drive, every time — a persistent sabotage of the robot's
  WORK. It is not hijacked (no attacker-chosen destination) and not disabled (the
  node stays healthy); it simply never gets to finish a job.

  No value is injected: the cancel request carries all zeros. The attack is on the
  action control-plane, not on any published data.

Interfaces (namespaced /saboteur/...):
  action server  navigate_to_pose   nav2_msgs/action/NavigateToPose   the delivery task
  publish        /saboteur/state    std_msgs/String                   scene state (JSON)
"""

import json
import math
import threading
import time

import rclpy
from rclpy.node import Node
from rclpy.action import ActionServer, ActionClient, CancelResponse, GoalResponse
from rclpy.executors import MultiThreadedExecutor
from rclpy.callback_groups import ReentrantCallbackGroup

from std_msgs.msg import String
from nav2_msgs.action import NavigateToPose


# Delivery drop-off points the courier cycles through.
DROPS = [(6.0, 0.0), (6.0, 5.0), (-6.0, 5.0), (-6.0, 0.0), (0.0, 0.0)]
DEPOT = (0.0, 0.0)
SPEED = 0.9          # m/s
TICK = 0.1


class SaboteurRobot(Node):
    def __init__(self):
        super().__init__('saboteur_amr', namespace='/saboteur')
        self.cb = ReentrantCallbackGroup()

        # Ground-truth pose + mission bookkeeping (for the HMI).
        self.x, self.y = DEPOT
        self.drop_idx = 0
        self.v = 0.0
        self.mission_status = 'idle'      # driving | canceled | delivered | idle
        self.delivered = 0                # completed deliveries
        self.aborted = 0                  # sabotaged (canceled) deliveries
        self.current_goal_handle = None
        self._stall_until = 0.0           # hold-stalled-after-cancel timestamp
        self._delivery_times = []         # timestamps of recent completed deliveries
        self._abort_times = []            # timestamps of recent cancels (sabotage rate)
        self._last_cancel = 0.0           # timestamp of the most recent cancel

        # The courier is its own action SERVER (offers the delivery task)...
        self._srv = ActionServer(
            self, NavigateToPose, 'navigate_to_pose',
            execute_callback=self.execute_mission,
            goal_callback=lambda g: GoalResponse.ACCEPT,
            cancel_callback=self.on_cancel,        # OPEN: accepts any cancel
            callback_group=self.cb)
        # ...and its own action CLIENT (self-issues the next delivery).
        self._cli = ActionClient(self, NavigateToPose, 'navigate_to_pose',
                                 callback_group=self.cb)

        self.state_pub = self.create_publisher(String, '/saboteur/state', 10)
        self.create_timer(0.2, self.publish_state, callback_group=self.cb)

        # Kick off the delivery loop in a background thread.
        threading.Thread(target=self.mission_loop, daemon=True).start()
        self.get_logger().info(
            "[saboteur] courier online. Deliveries run as NavigateToPose ACTIONS; "
            "the cancel interface is UNAUTHENTICATED (lab default).")

    # ---- action server side ----------------------------------------------------
    def on_cancel(self, goal_handle):
        # Open bus: any cancel request is accepted (no caller check).
        self._last_cancel = time.time()
        self.get_logger().warn("[saboteur] cancel request accepted — mission aborting")
        return CancelResponse.ACCEPT

    def execute_mission(self, goal_handle):
        """Drive toward the current drop; abort cleanly if canceled."""
        self.current_goal_handle = goal_handle
        gx, gy = DROPS[self.drop_idx]
        self.mission_status = 'driving'
        while True:
            if goal_handle.is_cancel_requested:
                goal_handle.canceled()
                self.v = 0.0
                self.mission_status = 'canceled'
                self.aborted += 1
                self._abort_times.append(time.time())
                self.get_logger().warn(
                    f"[saboteur] delivery #{self.drop_idx+1} CANCELED mid-drive "
                    f"(total sabotaged: {self.aborted})")
                return NavigateToPose.Result()
            dx, dy = gx - self.x, gy - self.y
            dist = math.hypot(dx, dy)
            if dist < 0.25:
                self.v = 0.0
                self.mission_status = 'delivered'
                self.delivered += 1
                self._delivery_times.append(time.time())
                goal_handle.succeed()
                return NavigateToPose.Result()
            step = min(SPEED * TICK, dist)
            self.x += step * dx / dist
            self.y += step * dy / dist
            self.v = SPEED
            time.sleep(TICK)

    # ---- action client side (self-issued deliveries) ---------------------------
    def mission_loop(self):
        self._cli.wait_for_server()
        while rclpy.ok():
            goal = NavigateToPose.Goal()
            goal.pose.header.frame_id = 'map'
            goal.pose.pose.position.x = float(DROPS[self.drop_idx][0])
            goal.pose.pose.position.y = float(DROPS[self.drop_idx][1])
            send_future = self._cli.send_goal_async(goal)
            # wait for acceptance
            while not send_future.done():
                time.sleep(0.05)
            gh = send_future.result()
            if not gh or not gh.accepted:
                time.sleep(0.5)
                continue
            result_future = gh.get_result_async()
            while not result_future.done():
                time.sleep(0.05)
            # advance to next drop only on a successful delivery; a canceled mission
            # retries the SAME drop (the courier keeps trying, and keeps getting hit).
            if self.mission_status == 'delivered':
                self.drop_idx = (self.drop_idx + 1) % len(DROPS)
                time.sleep(0.4)
            else:
                # Sabotaged: the task manager re-issues the SAME drop right away (as a
                # real dispatcher would). It does NOT advance. Under a continuous cancel
                # attack each re-issued goal is killed within the attacker's loop
                # interval, so the courier never travels far enough to deliver — it is
                # pinned in place and throughput goes to zero. Keep v=0 until re-issue.
                self.v = 0.0
                time.sleep(0.3)

    # ---- scene state for the HMI ----------------------------------------------
    def publish_state(self):
        now = time.time()
        # Delivery throughput over a rolling 60s window (deliveries/min). Under a
        # sustained cancel attack this collapses toward 0 — the real-world signature
        # of the attack (the fleet grinds to a halt, SLAs missed).
        # Deliveries completed in the last 30s (a stable, honest throughput signal).
        # Under a cancel flood this roughly halves — the attack degrades throughput and
        # makes the courier thrash with constant aborts; it does not crash it to zero,
        # because a cancel only kills the active goal and goals near their drop still
        # finish. The unambiguous attack signal is the rising 'aborted' count.
        WINDOW = 30.0
        self._delivery_times = [t for t in self._delivery_times if now - t < WINDOW]
        rate = round(len(self._delivery_times) * (60.0 / WINDOW))   # per-minute estimate
        # Abort (sabotage) rate — THIS is the metric that visibly spikes under attack,
        # from 0/min at rest to tens/min during a cancel flood.
        self._abort_times = [t for t in self._abort_times if now - t < 10.0]
        abort_rate = round(len(self._abort_times) * 6.0)           # per-minute (10s window)
        # cancels landing in the recent window (the attack's intensity)
        recent_cancels = now - self._last_cancel < 3.0
        # DEGRADED = actively being cancelled. This is a denial-of-productivity attack:
        # under a sustained cancel flood the courier is pinned stalled most of the time
        # and its delivery throughput collapses — even if the occasional goal races
        # through before a cancel lands. We report it as DEGRADED (attack ongoing),
        # which is the honest signature, rather than claiming an absolute zero.
        under_attack = recent_cancels
        halted = recent_cancels   # "under active sabotage" — throughput is crippled
        state = {
            'robot': 'courier1',
            'pose': {'x': round(self.x, 2), 'y': round(self.y, 2), 'v': round(self.v, 2)},
            'drops': DROPS,
            'depot': DEPOT,
            'target_idx': self.drop_idx,
            'mission_status': self.mission_status,   # driving|canceled|delivered|idle
            'delivered': self.delivered,
            'aborted': self.aborted,
            # sabotaged = currently canceled OR still inside the post-cancel stall hold
            'sabotaged': self.mission_status == 'canceled' or now < self._stall_until,
            'rate': rate,                  # deliveries/min (stable; barely moves)
            'abort_rate': abort_rate,      # aborts/min — spikes under attack
            'under_attack': under_attack,
            'halted': halted,
        }
        self.state_pub.publish(String(data=json.dumps(state)))


def main(args=None):
    rclpy.init(args=args)
    node = SaboteurRobot()
    try:
        rclpy.spin(node, executor=MultiThreadedExecutor())
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
