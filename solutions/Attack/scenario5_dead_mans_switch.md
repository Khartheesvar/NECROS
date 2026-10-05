# NECROS · Scenario 5 · "Dead Man's Switch" · Attack Walkthrough

## What you will learn

Every attack so far changed what the robot does or believes. This one does something
different: it takes the robot out of service entirely, without crashing it or sending it
anywhere. You simply switch it off.

Robots do not only communicate through topics (streams of messages). They also offer
**services**, which are request-and-reply commands you can call, like pressing a button.
A real robot often exposes a service such as an emergency stop. Many robots are also
**managed nodes**, meaning their software can be told to move between states such as
"active" and "inactive", the way an operator might power a subsystem up or down. On an
open network, both of these control interfaces are unprotected, so anyone can use them.

**Your mission (shown on the console):** take a healthy patrol robot out of service
without crashing it.

---

## Before you start

Bring up the lab and open the console:

```bash
docker compose up -d
```

Open **http://localhost:3000**, click into **Scenario 5 (Dead Man's Switch)**. A patrol
robot is driving its route in a secured yard, reported as active.

Open a terminal on the attacker machine and set the DDS domain to 5 (the domain number
always matches the scenario number):

```bash
docker compose exec attacker bash
export ROS_DOMAIN_ID=5
```

> DDS (Data Distribution Service) is the messaging layer the robots use, and it only
> connects programs on the same domain number. If a command shows nothing, confirm
> `echo $ROS_DOMAIN_ID` prints `5`.

---

## Phase 1 · Reconnaissance: find the control interfaces

List who is on the network:

```bash
ros2 node list
```

You will see the patrol robot, `/sentinel/sentinel_amr`. Now list the services it
offers (the request-and-reply commands). The `-t` option shows each service's type:

```bash
ros2 service list -t | grep sentinel_amr
```

Two are interesting:

- `/sentinel/sentinel_amr/estop` of type `std_srvs/srv/Trigger`: an emergency-stop
  command. `Trigger` is the simplest kind of service; it takes no input, you just call
  it.
- `/sentinel/sentinel_amr/change_state`: the command that moves the managed node between
  states (for example, from active to inactive).

Because this robot is a managed node, you can also ask what state it is in:

```bash
ros2 lifecycle get /sentinel/sentinel_amr
```

It reports `active`. You now have two separate ways to take it out of service: call its
emergency-stop service, or move it out of the active state.

> On the console, the DDS Bus panel lists these privileged interfaces. That is your hint
> that the control commands, not any topic, are the attack surface here.

---

## Phase 2 · Take the robot out of service, method 1: the emergency-stop service

Call the emergency-stop service. It needs no input and there is no check of who is
calling:

```bash
ros2 service call /sentinel/sentinel_amr/estop std_srvs/srv/Trigger
```

The service replies `success=True, message='emergency stop engaged'`.

**What you will see on the console:** the robot stops dead, its status ring turns red, a
banner reports an emergency stop triggered by an unauthenticated caller, and the status
flips to e-stopped. The robot is not hijacked or crashed; it is simply halted.

---

## Phase 3 · Take the robot out of service, method 2: the lifecycle command

A managed node that is moved out of its active state stops doing its job. Send the
command to deactivate it:

```bash
ros2 lifecycle set /sentinel/sentinel_amr deactivate
```

It reports `Transitioning successful`.

**What you will see on the console:** the robot freezes, its status shows halted
(inactive), and a banner reports the node was forced inactive. You can confirm with
`ros2 lifecycle get /sentinel/sentinel_amr`, which now reports `inactive`.

This method is quieter than the emergency stop: no alarm is raised, because moving a
managed node between states is a normal maintenance action, one that should have
required permission but did not.

---

## Recovering the robot

To bring the robot back, move it to the active state again (this also clears the
emergency stop):

```bash
ros2 lifecycle set /sentinel/sentinel_amr activate
```

The robot returns to active and continues its patrol.

---

## Why the attack works

1. Services and the managed-state commands are real control interfaces, and on an open
   network they are exposed just like topics. Calling them is a normal operation, and
   the network never checks who is calling.
2. Nothing is forged. The emergency stop does exactly what it is meant to do, and the
   state change is a normal management step. The only problem is that anyone can trigger
   them.
3. There is no way to "sanity check" a shutdown: a robot that was stopped by an attacker
   looks exactly like one stopped for a legitimate reason.

---

## How it is defended (the Defend phase)

Turning on SROS2 (Secure ROS 2) with access control means only an authorized operator
may call the emergency-stop and state-change commands. An uninvited attacker cannot even
join the secured network, and a program that is on the network but not authorized has its
call refused. See the Scenario 5 Defend walkthrough.

---

## Quick checklist

- [ ] `ros2 node list` shows the patrol robot.
- [ ] `ros2 service list -t | grep sentinel_amr` reveals the emergency-stop and
      state-change services.
- [ ] `ros2 lifecycle get /sentinel/sentinel_amr` returns `active`.
- [ ] Calling the emergency-stop service stops the robot (status e-stopped, console red).
- [ ] `ros2 lifecycle set ... deactivate` halts the robot (status inactive).
- [ ] `ros2 lifecycle set ... activate` brings it back to its patrol.
