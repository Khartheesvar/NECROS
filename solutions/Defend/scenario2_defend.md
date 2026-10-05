# NECROS · Scenario 2 · "Blind Navigator" · Defend Walkthrough

## What you will learn

In the attack phase you blinded the robot by putting fake laser-scan data onto its
unprotected sensor topic. Now you will fix it the way a real robot deployment does:
turn on **SROS2** (Secure ROS 2) so the robot accepts scans only from its own genuine
sensor, and the attacker's forged data is refused. You will not edit any program;
turning security on is a matter of creating certificates and setting a few environment
variables.

SROS2 adds, to every node (every running program on the robot): a certificate (a
cryptographic ID), encryption of the traffic, and an access-control policy stating
which node may publish or subscribe to which topic.

**Your mission (shown on the console):** authenticate the sensor topic with SROS2 so
forged readings are rejected.

---

## The key file: the access-control policy

The lab ships a ready-made policy file for this robot at:

```
/etc/ros/policies/dock_policy.xml
```

Its most important rule: the robot itself is the only one allowed to publish the laser
scan. It publishes its own sensor readings and reads them back for navigation. No other
identity may publish to the scan topic, and any program without a valid certificate
cannot join the secured network at all. That single rule is what defeats the blinding
attack.

---

## Step 1 · Open a shell on the robot and stop its software

Scenario 2's robot runs inside the container named `s2-dock`, which acts as its onboard
computer. Open a shell on it, then
stop the robot's software so you can switch security on cleanly:

```bash
docker compose exec s2-dock bash

dockctl status
dockctl stop
```

> **What is `dockctl`?** A small helper command the lab provides to start, stop, and
> check this robot's software. On a real robot the operating system's service manager
> does this job, for example a **systemd** service controlled with `systemctl start`
> and `systemctl stop`. The security steps below do not depend on it.

---

## Step 2 · Create the security identities

Two commands do the cryptographic setup. The first creates a **keystore**, a protected
folder holding the trusted signer plus a certificate and key for each node. The second
reads the policy file and generates the signed permissions from it.

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/dock_ks

ros2 security generate_artifacts \
    -k /etc/ros/dock_ks \
    -p /etc/ros/policies/dock_policy.xml

ros2 security list_enclaves /etc/ros/dock_ks
```

The setup also disables unauthenticated participants, so any program without a valid
certificate is refused entry to the network.

---

## Step 3 · Turn security on and restart the robot

Switch security on with environment variables, then start the software again. The same
software simply comes up in secure mode.

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/dock_ks
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

dockctl start
dockctl status
```

`ROS_SECURITY_STRATEGY=Enforce` means "reject anything not explicitly allowed". The
console shows the robot as secured and it keeps navigating normally.

---

## Step 4 · Re-run the attack and watch it fail

Go back to the attacker machine and try the Scenario 2 attack again:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=2

ros2 topic list | grep /dock/scan      # empty: the secured topic is hidden from you

# try the same all-clear scan flood as before:
ros2 topic pub -r 30 /dock/scan sensor_msgs/msg/LaserScan "{...ranges: [6.0, ...]}"
```

The robot keeps avoiding obstacles and never crashes. You have no valid certificate, so:

| Attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Find the scan topic | visible | hidden: discovery is protected |
| Inject a fake scan | robot blinded, then crashed | rejected: you cannot publish to the secured topic, and the real sensor data is unaffected |

On the console the robot stays navigating, with no deceived or collided state, and your
forged scans have no effect.

---

## Put the lab back to the attackable state

```bash
docker compose restart s2-dock
```

---

## Why this is the real workflow

- `ros2 security` is the genuine provisioning tool.
- The policy file is a real access-control document focused on the sensor.
- Security is enabled with certificates and environment variables, with no code change,
  and the same robot software is restarted secured.

Only the robot's body and its laser scanner are simulated. The hardening steps are
exactly what you would perform on a real ROS 2 robot.

---

## An honest caveat

Done correctly, SROS2 rejects the forged scans. But "security turned on" is not the
same as "secure". A policy that is too permissive, for example one that lets a second
identity publish on a channel it should not, leaves the system open even with security
enabled. The next scenario makes exactly this point: least privilege (allowing each
node only what it truly needs) matters as much as turning security on.

---

## Quick checklist

- [ ] `dockctl stop` halts the robot; it stops on the console.
- [ ] `create_keystore` and `generate_artifacts` complete; `list_enclaves` shows the
      identities.
- [ ] After setting the security variables, `dockctl start` brings the robot up secured
      and it navigates.
- [ ] From the attacker, `ros2 topic list` no longer shows `/dock/scan`.
- [ ] The all-clear scan flood no longer blinds or crashes the robot.
- [ ] `docker compose restart s2-dock` returns the lab to the open-bus baseline.
