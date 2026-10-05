# NECROS · Scenario 4 · "Ghost Convoy" · Defend Walkthrough

## What you will learn

In the attack phase you froze the operator's view by replaying the robot's own real
position reports. Because the data was genuine, the usual protections do not help: a
replayed message passes authentication (it really was produced by the robot), passes
encryption (it decrypts fine), and looks perfectly reasonable. The thing wrong with it
is not what it says, but when it arrives.

So this scenario needs two layers of defense:

1. **SROS2 access control** (the same tool as the earlier scenarios) stops an outside
   attacker from publishing the replay at all, because the attacker has no certificate
   to join the secured network.
2. **A freshness check** stops a replay even from someone who is already on the network.
   The receiver rejects any report whose timestamp is old or whose sequence number does
   not keep increasing.

The simple takeaway: authentication answers "who", access control answers "what", and
freshness answers "when". Replay attacks the "when", so the program receiving the data
must check it.

**Your mission (shown on the console):** reject stale, replayed telemetry using
freshness validation together with SROS2.

---

## Layer 1 · SROS2 access control (stops an outside attacker)

### Step 1 · Open a shell on the robot and stop its software

Scenario 4's robot runs inside the container named `s4-convoy`. Open a shell on it:

```bash
docker compose exec s4-convoy bash

convoyctl status
convoyctl stop
```

> **What is `convoyctl`?** A small helper command the lab provides to start, stop, and
> check this robot's software. On a real robot the operating system's service manager
> does this job, for example a **systemd** service controlled with `systemctl start` and
> `systemctl stop`. The security steps do not depend on it.

### Step 2 · Create the security identities

The lab ships a ready-made policy file for this robot at
`/etc/ros/policies/convoy_policy.xml`. Its key rule is that only the robot itself is
allowed to publish its odometry.

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/convoy_ks

ros2 security generate_artifacts \
    -k /etc/ros/convoy_ks \
    -p /etc/ros/policies/convoy_policy.xml

ros2 security list_enclaves /etc/ros/convoy_ks
```

This also disables unauthenticated participants, so any program without a valid
certificate is refused entry to the network.

### Step 3 · Turn security on and restart the robot

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/convoy_ks
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

convoyctl start
convoyctl status
```

### Step 4 · Re-run the replay from the attacker: the outsider is locked out

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=4

ros2 topic list | grep /convoy/odom               # empty: the secured topic is hidden
ros2 bag record -o /tmp/convoy_bag /convoy/odom   # records nothing: no access
ros2 bag play --loop /tmp/convoy_bag              # cannot publish to the secured topic
```

The attacker has no certificate, so the secured network refuses it. The number of
publishers on the odometry channel stays at 1, and the reported position tracks the
truth.

| Replay attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Find the odometry channel | visible | hidden |
| Record it | captures real telemetry | no access to the secured channel |
| Replay it (outside attacker) | view freezes | rejected: unauthenticated publisher |

---

## Layer 2 · Freshness check (stops a replay from someone already inside)

SROS2 stops an outsider. But the defining danger of replay is that the data is genuine,
so an insider, a stolen credential, or any already-trusted program could replay its own
validly-signed telemetry and pass authentication. The only thing that catches that is a
freshness check in the program that receives the data.

The rule the receiver should enforce on each position report:

```text
accept a report only if BOTH:
  - its timestamp is close to "now"                        (it is not stale), AND
  - its sequence number is higher than the last accepted   (it is not a replay)
otherwise: drop it and raise a "stale or replayed telemetry" alert.
```

A looping replay fails both tests: it sends old timestamps and repeats the same sequence
numbers, so each replayed report is dropped and the receiver keeps the last genuine
position. The robot's reports already include a timestamp and a sequence number, so the
receiver has everything it needs to check them.

### Turn it on and verify

> **Lab note:** `FRESHNESS_ENABLE` below is **not a real ROS 2 setting**. It is a switch
> added only for this lab so you can turn the freshness check on and off and compare. In
> a real system there is no switch: the check is simply part of the receiving program
> and always runs. The next section shows the real code.

Turn the check on and restart the robot's software:

```bash
docker compose exec s4-convoy bash
export ROS_DOMAIN_ID=4
export FRESHNESS_ENABLE=true
convoyctl restart
convoyctl status
```

Now replay from the attacker (no SROS2 this time, so you are standing in for an
already-trusted insider that SROS2 alone could not stop):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=4
ros2 bag record -o /tmp/bag /convoy/odom     # record ~6s, then Ctrl-C
ros2 bag play --loop --rate 3 /tmp/bag
```

**Result:** the replay is on the network (two publishers on the odometry channel), but
the receiver rejects every stale report. On the console the view is not spoofed, the gap
stays near zero, and a "replays rejected" count climbs as the robot keeps being tracked
correctly.

**Before-and-after proof:** turn the switch off (`convoyctl restart` without
`FRESHNESS_ENABLE`) and replay the same recording. Now the view freezes and the gap
grows, so the attack succeeds. The only difference is whether the freshness check is on.

---

## How you would do this on a real robot

On a real robot there is no switch. You write the freshness check into whatever program
acts on the telemetry (a safety monitor, the navigation input, or the operator bridge).
The pattern, using only standard ROS 2, is short:

```python
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry

STALE_SECONDS = 0.5          # tune to how often the robot reports

class FreshnessGuard(Node):
    def __init__(self):
        super().__init__('freshness_guard')
        self.last_stamp = 0.0
        self.create_subscription(Odometry, '/robot/odom', self.on_odom, 10)

    def on_odom(self, msg: Odometry):
        # 1) Freshness: how old is this report compared to my clock?
        stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        now = self.get_clock().now().nanoseconds * 1e-9
        if now - stamp > STALE_SECONDS:
            self.get_logger().warn('Dropping stale or replayed odometry')
            return                               # reject: do not act on it

        # 2) Order: never accept a timestamp older than one already seen.
        if stamp <= self.last_stamp:
            self.get_logger().warn('Dropping out-of-order or replayed odometry')
            return
        self.last_stamp = stamp

        # ...report is fresh and in order: safe to use...
```

Points worth remembering:

- Every well-formed ROS 2 sensor or telemetry message carries a timestamp in its
  header. That timestamp is the hook your check hangs on. If a message type does not
  stamp its header, fix the publisher first.
- Put the check in front of anything that acts on the data, not in the publisher (the
  attacker controls the publishing side).
- For stronger protection than timestamps alone, also carry a counter in the message
  and reject any report whose counter does not keep increasing.
- Freshness checking works together with SROS2, not instead of it. SROS2 keeps
  outsiders off the network; freshness stops a replay from anyone who is on it. Real
  robots need both.
- The check trusts the clock, so the robot and the receiver should keep their clocks in
  sync (for example with network time). Clock tampering is its own separate risk.

If you remember one thing: check the message timestamp, and drop anything stale or
out of order before acting on it.

---

## Put the lab back to the attackable state

```bash
docker compose restart s4-convoy
```

---

## Why this is the real workflow

- `ros2 security` is the genuine provisioning tool, and the policy file is a real
  access-control document that ties odometry publishing to the robot.
- The freshness-and-sequence rule is the standard, recommended defense against replay
  for ROS 2 telemetry.
- Only the robot's body is simulated. The attack (recording and replaying) and the
  defense (SROS2 plus freshness) are exactly what you would use on a real ROS 2 robot.

---

## Quick checklist

- [ ] `convoyctl stop` halts the robot; it stops on the console.
- [ ] `create_keystore` and `generate_artifacts` from `convoy_policy.xml` complete.
- [ ] `convoyctl start` with security brings the robot up secured.
- [ ] From the attacker, the odometry channel is hidden and recording/replaying fail.
- [ ] With the freshness check on, a replay is dropped, the "replays rejected" count
      rises, and the reported position never freezes.
- [ ] `docker compose restart s4-convoy` returns the lab to the open-bus baseline.
