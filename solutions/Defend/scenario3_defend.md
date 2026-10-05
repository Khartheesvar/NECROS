# NECROS · Scenario 3 · "Rogue Coordinator" · Defend Walkthrough

## What you will learn

In the attack phase you impersonated the coordinator and commanded the fleet, because
the goal channel accepted orders from anyone. Now you will fix it with **SROS2** (Secure
ROS 2) so that only the real coordinator is allowed to send goals, and the robots only
accept goals from it.

The key idea is **access control**, also called least privilege: every program is
allowed to do only what it genuinely needs. This is stronger than authentication alone.
Authentication answers "is this program who it claims to be?"; access control answers
"is this program allowed to do this?". Even a program with a valid certificate will be
refused if the policy does not grant it the goal channel.

**Your mission (shown on the console):** bind goal publishing to the coordinator's
identity so a rogue sender cannot command the fleet.

---

## The key file: the access-control policy

The lab ships a ready-made policy file for this fleet at:

```
/etc/ros/policies/takeover_policy.xml
```

Its most important rules are:

- only the coordinator is allowed to publish to the robots' goal channels;
- the robots may only receive goals, never publish them;
- no other program is allowed to publish goals at all.

Because of this, a rogue sender cannot command the robots even if it somehow got a
certificate, and an uninvited attacker with no certificate cannot join the secured
network in the first place.

---

## Step 1 · Open a shell on the fleet and stop its software

Scenario 3's robot fleet runs inside the container named `s3-takeover`. Open a shell on it
and stop the
software so you can switch security on cleanly:

```bash
docker compose exec s3-takeover bash

takeoverctl status
takeoverctl stop
```

> **What is `takeoverctl`?** A small helper command the lab provides to start, stop, and
> check this fleet's software. On a real robot the operating system's service manager
> does this job, for example a **systemd** service controlled with `systemctl start` and
> `systemctl stop`. The security steps below do not depend on it.

---

## Step 2 · Create the security identities

Two commands do the cryptographic setup. The first creates a **keystore** (a protected
folder with the trusted signer plus a certificate and key for each node). The second
reads the policy file and generates the signed permissions from it.

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/fleet_ks

ros2 security generate_artifacts \
    -k /etc/ros/fleet_ks \
    -p /etc/ros/policies/takeover_policy.xml

ros2 security list_enclaves /etc/ros/fleet_ks
```

The setup also disables unauthenticated participants, so any program without a valid
certificate is refused entry to the network. The signed permissions include the rule
that only the coordinator may publish goals.

---

## Step 3 · Turn security on and restart the fleet

Switch security on with environment variables, then start the software again. The same
software comes up secured.

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/fleet_ks
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

takeoverctl start
takeoverctl status
```

`ROS_SECURITY_STRATEGY=Enforce` means "reject anything not explicitly allowed". The
console shows the fleet as secured, and the real coordinator keeps directing the robots
normally.

---

## Step 4 · Re-run the attack and watch it fail

Go back to the attacker machine and try the Scenario 3 impersonation again:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=3

ros2 topic list | grep goal_pose       # empty: the secured channels are hidden from you

# try the same coordinator impersonation as before:
ros2 topic pub -r 10 /amr1/goal_pose geometry_msgs/msg/Pose \
  "{position: {x: 3.0, y: 1.6, z: 0.0}}"
```

`amr1` keeps following the real coordinator and never diverts. You have no certificate
permitting you to send goals, so:

| Attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Find the goal channel | topic and publisher visible | hidden: discovery is protected |
| Count the publishers | rose to 2 under attack | stays 1: you cannot register as a publisher |
| Send a fake goal | the fleet obeyed you | rejected: you are not allowed to publish goals, and the robots obey only the coordinator |

On the console the robots stay on mission, with no impersonation or hijacked-goal alert,
and your forged goals have no effect.

---

## Put the lab back to the attackable state

```bash
docker compose restart s3-takeover
```

---

## Why this is the real workflow

- `ros2 security` is the genuine provisioning tool.
- The policy file is a real access-control document, and its coordinator-only rule for
  goals is what defeats the impersonation.
- Security is enabled with certificates and environment variables, with no code change,
  and the same fleet software is restarted secured.

Only the robots' bodies are simulated. The hardening steps are exactly what you would
perform on a real ROS 2 fleet.

---

## An honest caveat

Authentication alone would not have stopped this attack; the robots never checked who
was sending goals. What stops it is authorization: the policy allows only the
coordinator to publish goals. If the policy were too permissive, for example if it
granted a robot or a generic program permission to publish goals, SROS2 would be turned
on yet the impersonation would still succeed. Least privilege is the real control, not
simply "security enabled".

---

## Quick checklist

- [ ] `takeoverctl stop` halts the fleet; the robots stop on the console.
- [ ] `create_keystore` and `generate_artifacts` complete; `list_enclaves` shows the
      identities.
- [ ] After setting the security variables, `takeoverctl start` brings the fleet up
      secured and the coordinator directs the robots.
- [ ] From the attacker, `ros2 topic list` no longer shows the goal channels.
- [ ] Publishing to `/amr1/goal_pose` no longer diverts the robot, and no impersonation
      alert appears.
- [ ] `ros2 topic info /amr1/goal_pose --verbose` stays `Publisher count: 1` during the
      attempt.
- [ ] `docker compose restart s3-takeover` returns the lab to the open-bus baseline.
