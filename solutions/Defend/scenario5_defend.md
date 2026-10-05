# NECROS · Scenario 5 · "Dead Man's Switch" · Defend Walkthrough

## What you will learn

In the attack phase you took the robot out of service two ways: by calling its
emergency-stop service, and by moving its managed node to the inactive state. Neither
hijacked the robot; both simply used control commands that were left open to anyone. Now
you will fix it with **SROS2** (Secure ROS 2) so that only an authorized operator may use
those commands.

The important idea is that services and state-change commands are access-controlled just
like topics. Turning on security is not only about who can join the network; it is also
about who is allowed to call which command. A program that is on the network but not
granted the emergency-stop command will have its call refused.

**Your mission (shown on the console):** lock the robot's control commands to authorized
identities with SROS2.

---

## The key file: the access-control policy

The lab ships a ready-made policy file for this robot at:

```
/etc/ros/policies/sentinel_policy.xml
```

Its rules for this scenario:

- The robot is allowed to offer its emergency-stop and state-change commands (it must,
  in order to provide them).
- No program in the policy is granted permission to call those commands. Being allowed to
  offer a command is not the same as being allowed to call it, so with no caller granted,
  nobody covered by this policy can trigger the emergency stop or change the robot's
  state. To allow legitimate control, you would add one operator identity and grant it
  exactly those two commands and nothing more.
- Unauthenticated programs are refused entry to the network entirely.

The result: an attacker with no certificate cannot join, and even a program that somehow
had a certificate could not call the control commands, because the policy does not grant
them.

---

## Step 1 · Open a shell on the robot and stop its software

Scenario 5's robot runs inside the container named `s5-sentinel`. Open a shell on it:

```bash
docker compose exec s5-sentinel bash

sentinelctl status
sentinelctl stop
```

> **What is `sentinelctl`?** A small helper command the lab provides to start, stop, and
> check this robot's software. On a real robot the operating system's service manager
> does this job, for example a **systemd** service controlled with `systemctl start` and
> `systemctl stop`. The security steps do not depend on it.

---

## Step 2 · Create the security identities

```bash
mkdir -p /etc/ros
ros2 security create_keystore /etc/ros/sentinel_ks

ros2 security generate_artifacts \
    -k /etc/ros/sentinel_ks \
    -p /etc/ros/policies/sentinel_policy.xml

ros2 security list_enclaves /etc/ros/sentinel_ks
```

The first command creates the keystore (the trusted signer plus a certificate and key for
each node). The second turns the policy file into signed permissions, including the rule
that the control commands cannot be called by outside identities. The setup also disables
unauthenticated participants.

---

## Step 3 · Turn security on and restart the robot

```bash
export ROS_SECURITY_KEYSTORE=/etc/ros/sentinel_ks
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_ENCLAVE_OVERRIDE=/

sentinelctl start
sentinelctl status
```

`ROS_SECURITY_STRATEGY=Enforce` means "reject anything not explicitly allowed". The
console shows the robot as secured and it keeps patrolling normally.

---

## Step 4 · Re-run the attack and watch it fail

Go back to the attacker machine and try both methods again:

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=5

ros2 node list                                               # the robot is not visible
ros2 service call /sentinel/sentinel_amr/estop std_srvs/srv/Trigger
#   does not go through: you are not an authorized caller
ros2 lifecycle set /sentinel/sentinel_amr deactivate
#   fails: you cannot reach or are not authorized for the command
```

The robot stays active and keeps patrolling. You have no certificate, so:

| Attack step | Before (open bus) | After (SROS2 enforced) |
|---|---|---|
| Find the control commands | visible | hidden: discovery is protected |
| Call the emergency stop | robot halted | rejected: caller not authorized |
| Deactivate the node | robot went inactive | rejected: command not callable by you |

On the console the robot stays active, with no emergency-stop or halted alert.

> Note: a rejected service call may appear to hang in the terminal rather than return an
> error, because the secured network simply never answers an unauthorized caller. Press
> `Ctrl-C` to stop waiting.

---

## Put the lab back to the attackable state

```bash
docker compose restart s5-sentinel
```

---

## Why this is the real workflow

- `ros2 security` is the genuine provisioning tool, and the policy file is a real
  access-control document that covers the robot's services and state-change commands,
  which is exactly what this attack abused.
- Security is enabled with certificates and environment variables, with no code change,
  and the same robot software is restarted secured.
- Only the robot's body is simulated. The attack and the defense are what you would use
  on a real ROS 2 robot.

---

## An honest caveat

The fix is not "hide the command"; it is least privilege, meaning each program gets only
the permissions it truly needs. Even a program with a valid certificate must be
explicitly granted the emergency-stop and state-change commands before it can use them.
Grant those only to the operator, never broadly, or a "secured" robot is still one stray
certificate away from being switched off.

---

## Quick checklist

- [ ] `sentinelctl stop` halts the robot's software.
- [ ] `create_keystore` and `generate_artifacts` from `sentinel_policy.xml` complete.
- [ ] `sentinelctl start` with security brings the robot up secured and it patrols.
- [ ] From the attacker, the robot is not visible.
- [ ] Calling the emergency-stop service no longer stops the robot.
- [ ] `ros2 lifecycle set ... deactivate` no longer disables the robot.
- [ ] `docker compose restart s5-sentinel` returns the lab to the open-bus baseline.
