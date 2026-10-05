# NECROS · Scenario 1 · "Open Bus" · Defend Walkthrough

## What you will learn

In the attack phase you saw that a default ROS 2 (Robot Operating System 2) fleet
lets an uninvited attacker discover everything, read a robot's telemetry, and hijack
its movement. Now you will fix it the way a real robot deployment does: give every
robot program a cryptographic identity, turn on encryption, and enforce a rule about
which program is allowed to use which channel. You will not edit any program. Turning
security on is a matter of creating certificates and setting a few environment
variables.

The tool that does this is **SROS2** (Secure ROS 2). It adds three things to every
node (every running program on the robot):

1. **Authentication**: each node gets a certificate, a cryptographic ID card signed by
   a trusted authority, so the system can tell who is really who.
2. **Encryption**: the traffic is scrambled, so an eavesdropper on the network sees
   only ciphertext.
3. **Access control**: a signed policy file lists which node may publish or subscribe
   to which topic. Anything not explicitly allowed is refused.

**Your mission (shown on the console):** harden the fleet with SROS2 so your injected
commands from the attack phase are rejected.

---

## The key file: the access-control policy

The lab ships a ready-made SROS2 policy file for this fleet. It lives inside the robot
container at:

```
/etc/ros/policies/fleet_policy.xml
```

You do not need to write it; it is provided. It states least privilege for each node,
meaning each node is allowed to do only what it genuinely needs:

- each robot may publish its odometry and status, and subscribe to its command and
  goal channels, and nothing else;
- only the coordinator (the node that directs the fleet) may publish goals;
- the telemetry bridge (the node that feeds the operator console) can only listen; it
  can never send movement commands.

This policy is what stops the hijack: even a node that somehow authenticated could not
publish to a robot's command channel unless the policy grants it, and it does not.

---

## Step 1 · Open a shell on the robot and stop its software

Scenario 1's robot fleet runs inside the container named `s1-fleet`, which acts as the
robot's onboard computer. (Every scenario has its own container, named by its number:
`s1-fleet`, `s2-dock`, `s3-takeover`, `s4-convoy`, `s5-sentinel`, `s6-saboteur`.) Open a
shell on it:

```bash
docker compose exec s1-fleet bash
```

The robot's software runs as a managed background service. Check it, then stop it so
you can switch security on cleanly:

```bash
fleetctl status
fleetctl stop
```

> **What is `fleetctl`?** It is a small helper command provided by the lab to start,
> stop, and check the robot's software. On a real robot this job is done by the
> operating system's service manager, for example a **systemd** service that you would
> control with `systemctl start` and `systemctl stop`. It is just a convenience; the
> security steps below do not depend on it.

---

## Step 2 · Create the security identities

Two commands do all the cryptographic setup. The first creates a **keystore**, a
protected folder holding the fleet's certificate authority (the trusted signer) plus a
certificate and key for each node. The second reads the policy file and generates the
signed permission files from it.

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/sros2_keystore

ros2 security generate_artifacts \
    -k /etc/ros/sros2_keystore \
    -p /etc/ros/policies/fleet_policy.xml
```

You can confirm the per-node identities were created:

```bash
ros2 security list_enclaves /etc/ros/sros2_keystore
```

These are the genuine commands a robotics security engineer runs to secure a real
ROS 2 system. The setup also disables unauthenticated participants, so any program
without a valid certificate is refused entry to the network.

---

## Step 3 · Turn security on and restart the robot

You switch security on with environment variables, then start the software again. No
program is modified; the same software simply starts in secure mode.

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/sros2_keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

fleetctl start
fleetctl status
```

`ROS_SECURITY_STRATEGY=Enforce` means "reject anything that is not explicitly
allowed". The console shows the fleet as secured, and the robots keep patrolling
normally; legitimate operation is unaffected.

---

## Step 4 · Re-run the attack and watch it fail

Go back to the attacker machine and try the exact Scenario 1 attack again:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=1

ros2 node list                 # empty: the secured system is invisible to you
ros2 topic list                # the robot's topics no longer appear
ros2 topic echo /amr1/odom     # no data: you are not allowed to subscribe
ros2 topic pub -r 20 /amr1/cmd_vel geometry_msgs/msg/Twist \
    "{linear: {x: 0.8}}"       # no effect: the robot cannot be hijacked
```

Why each step now fails:

| Attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Discover the fleet | listed every node and topic | hidden: your unauthenticated machine is not admitted |
| Eavesdrop on `/amr1/odom` | read it freely | denied: no valid certificate, and traffic is encrypted |
| Hijack via `/amr1/cmd_vel` | took over the robot | denied: you cannot join, and the policy forbids it anyway |

On the console, your attacker node no longer appears on the DDS Bus panel, and the
robots stay on route. The hijack cannot land.

---

## Put the lab back to the attackable state

```bash
docker compose restart s1-fleet
```

This returns the fleet to the open, unsecured baseline so the scenario can be replayed.

---

## Why this is the real workflow

Everything here is how SROS2 is deployed on a production ROS 2 robot:

- `ros2 security` is the genuine provisioning tool;
- the policy file is a real access-control document;
- security is enabled with certificates and environment variables, with no code change;
- you restart the same robot software, now enforced.

Only the robot's physical body is simulated. The security hardening is exactly what you
would perform on real hardware.

---

## An honest caveat

Done correctly, SROS2 stops these attacks. But "security turned on" is not the same as
"secure". A policy that is too permissive, a keystore left readable by others, or
certificates that are never properly revoked can all leave a "secured" fleet open. The
later scenarios show attacks that survive even on systems that have some protection in
place, which is why defense in depth matters.

---

## Quick checklist

- [ ] `fleetctl stop` halts the fleet; the robots stop on the console.
- [ ] `create_keystore` and `generate_artifacts` complete; `list_enclaves` shows the
      identities.
- [ ] After setting the security variables, `fleetctl start` brings the fleet up
      secured and the console resumes.
- [ ] From the attacker: `ros2 node list` and `ros2 topic list` no longer show the fleet.
- [ ] `ros2 topic echo /amr1/odom` returns nothing.
- [ ] Publishing to `/amr1/cmd_vel` does not move the robot.
- [ ] `docker compose restart s1-fleet` returns the lab to the open-bus baseline.
