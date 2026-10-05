# NECROS · Scenario 6 · "Saboteur" · Defend Walkthrough

## What you will learn

In the attack phase you sabotaged the courier by repeatedly cancelling its deliveries,
because the cancel command was open to anyone. Now you will fix it with **SROS2** (Secure
ROS 2) so that only an authorized commander may cancel a delivery.

The key idea is that an action (a long-running task like navigation) is built from
several behind-the-scenes commands, and those commands are access-controlled just like
anything else. It is easy to protect a robot's topics and forget that its action commands
need protecting too. Securing the cancel command is what stops this attack.

**Your mission (shown on the console):** authorize who may cancel tasks with SROS2.

---

## The key file: the access-control policy

The lab ships a ready-made policy file for this robot at:

```
/etc/ros/policies/saboteur_policy.xml
```

Its rules for this scenario:

- The courier is allowed to offer and use its own delivery action, including the cancel
  command, because it manages its own deliveries.
- No other program is allowed to send a cancel. Being allowed to offer a command is not
  the same as being allowed to call it, so no outside program can cancel the courier's
  deliveries. To add a real external operator, you would grant that one identity
  permission to send goals and cancels, and nothing more.
- Unauthenticated programs are refused entry to the network entirely.

So an attacker with no certificate cannot join, and even a program that somehow had a
certificate could not cancel the courier's deliveries unless the policy grants it.

---

## Step 1 · Open a shell on the robot and stop its software

Scenario 6's robot runs inside the container named `s6-saboteur`. Open a shell on it:

```bash
docker compose exec s6-saboteur bash

saboteurctl status
saboteurctl stop
```

> **What is `saboteurctl`?** A small helper command the lab provides to start, stop, and
> check this robot's software. On a real robot the operating system's service manager
> does this job, for example a **systemd** service controlled with `systemctl start` and
> `systemctl stop`. The security steps do not depend on it.

---

## Step 2 · Create the security identities

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/saboteur_ks

ros2 security generate_artifacts \
    -k /etc/ros/saboteur_ks \
    -p /etc/ros/policies/saboteur_policy.xml

ros2 security list_enclaves /etc/ros/saboteur_ks
```

The first command creates the keystore (the trusted signer plus a certificate and key for
each node). The second turns the policy file into signed permissions, including the rule
that the cancel command cannot be called by outside identities. The setup also disables
unauthenticated participants.

---

## Step 3 · Turn security on and restart the robot

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/saboteur_ks
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

saboteurctl start
saboteurctl status
```

`ROS_SECURITY_STRATEGY=Enforce` means "reject anything not explicitly allowed". The
console shows the robot as secured, and the courier keeps delivering normally because its
own deliveries and cancels are authorized.

---

## Step 4 · Re-run the attack and watch it fail

Go back to the attacker machine and try the sabotage again:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=6

ros2 action list                      # empty: the secured action is hidden from you

ros2 service call /saboteur/navigate_to_pose/_action/cancel_goal \
  action_msgs/srv/CancelGoal \
  "{goal_info: {goal_id: {uuid: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}, stamp: {sec: 0, nanosec: 0}}}"
```

The courier keeps completing deliveries and the sabotaged counter stays at 0. You have no
certificate, so:

| Attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Find the action | visible | hidden: discovery is protected |
| Find the cancel command | visible | hidden |
| Send the cancel-all request | aborted every delivery | rejected: you are not an authorized caller |

On the console the courier stays delivering, with no sabotage alert and no climbing abort
count.

> Note: a rejected cancel may appear to hang in the terminal rather than return an error,
> because the secured network simply never answers an unauthorized caller. Press `Ctrl-C`
> to stop waiting.

---

## Put the lab back to the attackable state

```bash
docker compose restart s6-saboteur
```

---

## Why this is the real workflow

- `ros2 security` is the genuine provisioning tool, and the policy file is a real
  access-control document that covers the robot's action commands, which is what this
  attack abused.
- The action used here (`NavigateToPose`) is the same one real robots use for
  navigation, so the attack and defense reflect real deployments.
- Security is enabled with certificates and environment variables, with no code change,
  and the same robot software is restarted secured.

---

## An honest caveat

It is easy to protect a robot's topics and forget that an action is also a set of
commands that need protecting. If a policy secures the data topics but leaves the cancel
command open to anyone, security is turned on yet the robot's work can still be
sabotaged. Least privilege has to cover the action's commands too, not only the topics.

---

## Quick checklist

- [ ] `saboteurctl stop` halts the courier's software.
- [ ] `create_keystore` and `generate_artifacts` from `saboteur_policy.xml` complete.
- [ ] `saboteurctl start` with security brings the courier up secured and it delivers.
- [ ] From the attacker, the action is hidden.
- [ ] The cancel-all request no longer aborts deliveries; the sabotaged count stays 0.
- [ ] `docker compose restart s6-saboteur` returns the lab to the open-bus baseline.
