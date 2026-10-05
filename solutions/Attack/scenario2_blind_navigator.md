# NECROS · Scenario 2 · "Blind Navigator" · Attack Walkthrough

## What you will learn

In Scenario 1 you drove a robot by force. This scenario is more subtle: you leave the
robot driving itself, but you feed it a false picture of the world so its own
navigation crashes it. The robot is never "hacked", it is simply lied to, and it
believes the lie.

The robot here is a delivery robot that avoids obstacles using a laser scanner, a
sensor that measures the distance to whatever is around it (often called **LIDAR**,
Light Detection and Ranging). It publishes those distances on a topic, and its
navigation reads that topic to decide where it is safe to drive. If you can put fake
distances on that topic, you control what the robot "sees".

**Your mission (shown on the console):** make the robot crash without touching its
motors.

---

## Before you start

Bring up the lab and open the console:

```bash
docker compose up -d
```

Open **http://localhost:3000**, click into **Scenario 2 (Blind Navigator)**. A single
robot, `dock1`, drives up and down a loading dock, steering around obstacles. The
console shows it navigating cleanly.

Open a terminal on the attacker machine and set the DDS domain to 2 (the domain number
always matches the scenario number):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=2
```

> DDS (Data Distribution Service) is the messaging layer ROS 2 robots use. If a
> command shows nothing, confirm `echo $ROS_DOMAIN_ID` prints `2`.

---

## Phase 1 · Reconnaissance: find the sensor and learn its message format

A real attacker does not guess the sensor's settings; they read them off the live
system. First, list the topics and their message types (`-t` shows the type):

```bash
ros2 topic list -t
```

Look for the laser scanner topic:

```
/dock/scan [sensor_msgs/msg/LaserScan]
```

That is the robot's eyes. The message type is `LaserScan`. Ask the system what that
message actually contains:

```bash
ros2 interface show sensor_msgs/msg/LaserScan
```

The important fields are:

- `angle_min`, `angle_max`, `angle_increment`: the angles the scanner sweeps across.
- `range_min`, `range_max`: the closest and farthest distances it can report.
- `ranges`: an array of distances, one number per laser beam. This array is what the
  robot navigates on. A small number means "something is close in that direction".

Now read the real sensor once to copy its actual values (`--once` prints a single
message then exits):

```bash
ros2 topic echo /dock/scan --once
```

You will see the real angle settings and a `ranges` array of real distances to real
obstacles. Everything you need to forge a convincing fake scan just came from
watching the target. You will keep the angle settings and change only the `ranges`.

> On the console, the DDS Bus panel marks `/dock/scan` as "exposed". That is your hint
> that the sensor topic is the attack surface.

---

## Phase 2 · The attack: feed the robot an "all clear" view

The robot always acts on the most recent scan it receives. If you publish fake scans
faster than the real sensor does, your fake becomes the message the robot believes.

Send a scan where every beam reports the maximum distance (`6.0`), which tells the
robot "there is nothing anywhere, the path is completely clear". The `-r 30` option
repeats it 30 times per second so your fake always wins over the real sensor:

```bash
ros2 topic pub -r 30 /dock/scan sensor_msgs/msg/LaserScan \
  "{header: {frame_id: laser}, angle_min: -1.5708, angle_max: 1.5708,
    angle_increment: 0.0442, range_min: 0.05, range_max: 6.0,
    ranges: [6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,
             6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,
             6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,
             6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0,6.0]}"
```

The `ranges` array has 72 entries because the scanner has 72 beams; a real `LaserScan`
genuinely carries one distance per beam, so your forged message has to as well.

**What you will see on the console:**

- The robot stops weaving around obstacles and drives straight ahead.
- It drives into the next real obstacle it can no longer "see". The robot turns red and
  a crash alert appears; the perception status flips to deceived, then collided.
- The DDS Bus panel shows an uninvited intruder node, and the Event Feed logs that the
  perception was spoofed and the robot collided.

Press `Ctrl-C` to stop the attack. The robot recovers and resumes normal navigation.

### Optional variant: a ghost wall

Instead of "all clear", make every beam report something very close (for example all
`0.5`). Now the robot believes it is boxed in on every side and refuses to move. That
is a denial of service on its navigation. Use the same command with every value in
`ranges` set to `0.5`.

---

## Why the attack works

The robot drives on whatever arrives on `/dock/scan`. With no security:

- any machine on the network may publish to the sensor topic; there is no check of who
  is sending;
- you publish faster than the real sensor, so the robot's planner uses your fake;
- the robot and its sensor are untouched; only the data is forged, and the robot trusts
  the data.

The obstacle never physically disappears. It disappears only from the robot's view of
the world.

---

## How it is defended (the Defend phase)

Turning on SROS2 (Secure ROS 2) authenticates the sensor topic so the robot accepts
scans only from its own genuine, certificated sensor. Your uninvited node has no
certificate, cannot join the secured network, and its forged scans are rejected. See
the Scenario 2 Defend walkthrough.

---

## Quick checklist

- [ ] `dock1` navigates and avoids all obstacles on the console.
- [ ] `ros2 topic echo /dock/scan --once` reveals the real scan settings.
- [ ] Publishing an all-clear scan blinds the robot and it crashes.
- [ ] The console shows deceived, then collided, and an intruder node on the DDS bus.
- [ ] Stopping the attack lets the robot recover.
