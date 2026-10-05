# NECROS · Scenario 1 · "Open Bus" · Attack Walkthrough

## What you will learn

Robots built on ROS 2 (the Robot Operating System, version 2) talk to each other
over a shared messaging layer called **DDS** (Data Distribution Service). By default
that layer has **no security**: no passwords, no encryption, no access control. Any
computer that can reach the network can join in, listen to everything, and send
commands as if it belonged there.

In this scenario you play the attacker. You will:

1. Discover the whole robot fleet without being told anything about it (reconnaissance).
2. Secretly read a robot's live position (eavesdropping).
3. Take over a robot and drive it off course (a hijack).

Everything uses real, standard ROS 2 tools. The same commands would work against a
real unsecured ROS 2 robot.

**Your mission (shown on the console):** seize control of a patrolling robot and
drive it off its route, without being the fleet's legitimate controller.

---

## Before you start

Bring the lab up and open the operator console in a browser:

```bash
docker compose up -d
```

Then open **http://localhost:3000** and click into **Scenario 1 (Open Bus)**. You
will see two robots, `amr1` and `amr2` (AMR means Autonomous Mobile Robot), patrolling
a warehouse floor. Both report **on route**.

Now open a terminal on the attacker machine. This is a separate computer (a Kali
Linux box, a common penetration-testing system) that sits on the same network as the
robots and has the ROS 2 command-line tools installed:

```bash
docker compose exec attacker bash
```

Every scenario runs on its own **DDS domain**, a number that separates one robot
system from another. The rule in this lab is simple: the domain number equals the
scenario number. So for Scenario 1 you set the domain to 1:

```bash
export ROS_DOMAIN_ID=1
```

> If you skip this step, your tools look at a different domain and you will see
> nothing. Any time a command returns empty, check that `echo $ROS_DOMAIN_ID`
> prints `1`.

---

## Phase 1 · Reconnaissance: discover the fleet

You were given no addresses, no list of robots, nothing. Yet you can find the entire
system, because DDS **automatically advertises** every participant to anyone
listening. Ask the network what is out there:

```bash
ros2 node list
```

A "node" is a single running program on a robot (for example, the program that drives
`amr1`). You will see entries like `/amr1/amr`, `/amr2/amr`, and `/fleet_coordinator`.

Now list the communication channels, called **topics**. A topic is a named stream of
messages; robots publish data onto topics and read commands from them. The `-t` option
also prints each topic's message type:

```bash
ros2 topic list -t
```

You will see topics such as:

- `/amr1/cmd_vel`: the robot's velocity-command channel (`cmd_vel` means "command
  velocity"). Whatever is sent here tells the robot how to move.
- `/amr1/odom`: the robot's odometry, meaning its reported position and speed.

Look more closely at the command channel to confirm what kind of message it expects:

```bash
ros2 topic info /amr1/cmd_vel
```

It reports the type `geometry_msgs/msg/Twist`. A **Twist** message describes motion as
two parts: a linear velocity (straight-line speed) and an angular velocity (turning
speed). Remember this; you will build one in Phase 3.

> On the console, the **DDS Bus** panel shows the same topics and tags the attackable
> ones as "exposed". That panel is your hint for where to aim.

**Why this matters:** you proved that an uninvited machine can map the whole robot
system with no credentials. Discovery is open by design, so the entire layout is free
for the taking.

---

## Phase 2 · Eavesdropping: read a robot's live position

In this kind of messaging, a listener (subscriber) is invisible to the senders. You
can read a robot's telemetry and it will never know. "Echo" a topic to print its
messages live:

```bash
ros2 topic echo /amr1/odom
```

You will see the robot's position and velocity updating in real time. Press `Ctrl-C`
to stop.

**Why this matters:** the data is sent in clear text with no encryption. Anyone on the
network can silently track where every robot is.

---

## Phase 3 · Hijack: take over the robot

Nothing stops you from sending to the command channel yourself. If you publish
velocity commands to `/amr1/cmd_vel` faster than the robot's own controller, your
commands win and the robot obeys you.

You already learned (Phase 1) that the channel is `/amr1/cmd_vel` and the message type
is `geometry_msgs/msg/Twist`. Send a stream of movement commands: drive forward while
turning, which forces the robot into an arc away from its patrol route. The `-r 20`
option repeats the message 20 times per second so your command stays in control:

```bash
ros2 topic pub -r 20 /amr1/cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.8}, angular: {z: 0.6}}"
```

Here `linear: {x: 0.8}` means drive forward at 0.8 metres per second, and
`angular: {z: 0.6}` means turn at 0.6 radians per second.

Watch the console: `amr1` leaves its patrol route, its route-deviation value climbs,
and its status flips to **compromised**, while `amr2` keeps running normally.

To stop, press `Ctrl-C`, then send a single zero command so the robot halts instead of
coasting on your last instruction:

```bash
ros2 topic pub --once /amr1/cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.0}, angular: {z: 0.0}}"
```

**Why this matters:** you now control the robot's movement. On a real robot this is
unsafe: it could be driven into people, shelving, or a restricted area.

---

## Why the attack works

ROS 2 hands all its networking to DDS. DDS is *capable* of authentication,
encryption, and access control, but those protections are **turned off by default**.
With security off:

- discovery is open, so anyone can map the system,
- there is no access control, so any participant can read or write any topic,
- there is no encryption, so all traffic is readable on the wire.

## How it is defended (the Defend phase)

The fix is **SROS2** (Secure ROS 2), the security system built on top of DDS. It gives
every legitimate node a certificate (a cryptographic ID), encrypts the traffic, and
enforces a policy of which node may use which topic. With SROS2 enforced, your
uninvited attacker node has no certificate, so it cannot join the secured network, read
`/amr1/odom`, or publish to `/amr1/cmd_vel`. That is covered in the Scenario 1 Defend
walkthrough.

---

## Quick checklist

- [ ] Both robots show "on route" on the console.
- [ ] `ros2 node list` and `ros2 topic list -t` reveal the fleet and its topics.
- [ ] `ros2 topic echo /amr1/odom` prints live positions.
- [ ] Publishing to `/amr1/cmd_vel` visibly drives `amr1` off route (status:
      compromised) while `amr2` stays normal.
