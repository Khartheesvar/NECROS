# NECROS · Scenario 4 · "Ghost Convoy" · Attack Walkthrough

## What you will learn

Every attack so far has sent made-up data. This one is different and sneakier: you
send the robot's **own real data back to it**, just at the wrong time.

The robot here is a delivery vehicle that constantly reports its position on a channel
called odometry (its position and speed). An operator watching the console trusts
whatever position arrives most recently. If you record the robot's real position
reports while it sits at the depot, and then play them back on a loop later, the
operator's console will show the robot still parked at the depot while it has actually
driven away. Nothing is forged; the data is genuine, only stale. This is called a
**replay attack**.

**Your mission (shown on the console):** freeze the operator's view on a lie while the
convoy moves, without forging anything.

---

## Before you start

Bring up the lab and open the console:

```bash
docker compose up -d
```

Open **http://localhost:3000**, click into **Scenario 4 (Ghost Convoy)**. A single
delivery robot drives a loop around a depot and reports its position as it goes.

Open a terminal on the attacker machine and set the DDS domain to 4 (the domain number
always matches the scenario number):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=4
```

> DDS (Data Distribution Service) is the messaging layer the robots use, and it only
> connects programs on the same domain number. If a command shows nothing, confirm
> `echo $ROS_DOMAIN_ID` prints `4`.

---

## Phase 1 · Reconnaissance: find the telemetry channel

List the topics (communication channels) and their message types:

```bash
ros2 topic list -t
```

The channel you want is the odometry channel:

```
/convoy/odom [nav_msgs/msg/Odometry]
```

`odom` is short for odometry. Confirm the robot is actively reporting on it. The
`echo --once` command prints a single message then exits, and `hz` shows how many
messages arrive per second:

```bash
ros2 topic echo /convoy/odom --once      # one real position report
ros2 topic hz /convoy/odom               # about 10 messages per second: live data
```

You now know the robot continuously reports its real position here, and that nothing
checks whether a report is current or stale.

> On the console, the DDS Bus panel marks `/convoy/odom` as "exposed". That is your
> hint that the telemetry channel is the attack surface.

---

## Phase 2 · Capture: record the robot's real position reports

ROS 2 has a built-in recorder called `ros2 bag`. It saves messages from a topic to a
file (a "bag") that you can replay later. Record a few seconds of the robot's real
odometry. For the best effect, record while the robot is near its depot, so your replay
later shows it "parked" there:

```bash
ros2 bag record -o /tmp/convoy_bag /convoy/odom
```

Let it run for about 6 seconds, then press `Ctrl-C`. Check what you captured:

```bash
ros2 bag info /tmp/convoy_bag
```

It reports how many messages were recorded. These are the robot's genuine position
reports, saved exactly as they were sent.

---

## Phase 3 · Replay: freeze the operator's view

Now play the recording back on a loop. Your replayed messages arrive alongside the
robot's live ones, and because the operator's console trusts the most recent message,
your recorded "parked at the depot" position wins. The `--loop` option repeats the
recording forever, and `--rate 2` plays it at twice its original speed so it stays
ahead of the live data:

```bash
ros2 bag play --loop --rate 2 /tmp/convoy_bag
```

**What you will see on the console:**

- The "reported" robot (shown as a faint ghost) freezes at the depot, while the real,
  solid robot keeps driving its route. A red line stretches between the two, showing the
  growing gap between where the robot is reported to be and where it actually is.
- A banner reads that the telemetry is spoofed.
- The status panel shows two publishers on the odometry channel and a growing gap.
- The DDS Bus panel flags the odometry channel as replayed and shows the replay program
  as an intruder.

You can confirm from a second terminal (set `export ROS_DOMAIN_ID=4` there too):

```bash
ros2 topic info /convoy/odom --verbose     # Publisher count: 2 (the robot, plus you)
```

Press `Ctrl-C` in the replay terminal to stop. The replayed data stops, and the
reported position snaps back to the robot's true position.

---

## Why the attack works

1. There is no freshness check. The robot's odometry is just "the latest message on the
   channel". Nothing asks "is this newer than the last one I saw?" or "is this timestamp
   current?", so a replayed old message looks exactly like a live one.
2. There is no sequence check. There is no running count that a receiver verifies, so an
   old message replayed now is accepted as if it just happened.
3. The data is genuine. Because it is the robot's own real data, it passes any
   "is this value reasonable?" check and even a signature check. The only thing wrong
   with it is when it arrives.

This is why replay is its own kind of attack: it turns the robot's own authentic data
against it.

---

## How it is defended (the Defend phase)

Turning on SROS2 (Secure ROS 2) stops an outside attacker from publishing the replay at
all, because the attacker has no certificate to join the secured network. But the deeper
fix is a **freshness check**: the receiver rejects any report whose timestamp is old or
whose sequence number does not keep increasing. A looped replay carries old timestamps
and repeating sequence numbers, so it is dropped. See the Scenario 4 Defend walkthrough.

---

## Quick checklist

- [ ] `ros2 topic list -t` shows `/convoy/odom`.
- [ ] `ros2 topic hz /convoy/odom` confirms the robot is reporting live.
- [ ] `ros2 bag record` captures real messages, confirmed by `ros2 bag info`.
- [ ] `ros2 bag play --loop` freezes the reported position while the real robot drives
      on; the console shows telemetry spoofed and a growing gap.
- [ ] `ros2 topic info /convoy/odom --verbose` shows `Publisher count: 2` during replay.
- [ ] `Ctrl-C` on the replay restores the true reported position.
