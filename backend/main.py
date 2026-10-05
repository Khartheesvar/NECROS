#!/usr/bin/env python3
"""
NECROS — backend relay (Attacking and Defending ROS 2).

Connects to the ROS 2 telemetry_bridge TCP feed (ground-truth + reported fleet
state) and rebroadcasts it to the browser operator dashboard over Socket.IO.
Also computes a per-robot "divergence" (distance between where the robot really
is vs. where the coordinator believes it is) — the number that spikes during a
spoofing attack.

Keep this thin: it is transport + a derived metric, nothing security-sensitive.
"""

import asyncio
import json
import time
import math
import os

import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "localhost")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "9100"))
DOCK_HOST = os.environ.get("DOCK_HOST", "dock")
DOCK_PORT = int(os.environ.get("DOCK_PORT", "9101"))
TAKEOVER_HOST = os.environ.get("TAKEOVER_HOST", "takeover")
TAKEOVER_PORT = int(os.environ.get("TAKEOVER_PORT", "9102"))
CONVOY_HOST = os.environ.get("CONVOY_HOST", "convoy")
CONVOY_PORT = int(os.environ.get("CONVOY_PORT", "9103"))
SENTINEL_HOST = os.environ.get("SENTINEL_HOST", "sentinel")
SENTINEL_PORT = int(os.environ.get("SENTINEL_PORT", "9104"))
SABOTEUR_HOST = os.environ.get("SABOTEUR_HOST", "saboteur")
SABOTEUR_PORT = int(os.environ.get("SABOTEUR_PORT", "9105"))

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
api = FastAPI(title="NECROS", version="0.1.0")
api.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
app = socketio.ASGIApp(sio, other_asgi_app=api)

_latest = {"ground_truth": {}, "reported": {}, "routes": {},
           "divergence": {}, "graph": {"nodes": [], "topics": []}, "events": [],
           "security_enforced": False}

# Scenario 2 (dock) latest state.
_dock = {"scene": {}, "graph": {"nodes": [], "topics": []},
         "security_enforced": False, "events": []}
_dock_events = []
_dock_prev = {}

# Scenario 3 (takeover / rogue coordinator) latest state.
_takeover = {"ground_truth": {}, "reported": {}, "routes": {},
             "graph": {"nodes": [], "topics": []}, "impersonation": False,
             "security_enforced": False, "events": []}
_tk_events = []
_tk_prev = {}

# Scenario 4 (convoy / capture-replay) latest state.
_convoy = {"scene": {}, "graph": {"nodes": [], "topics": []},
           "defense": {}, "security_enforced": False, "events": []}
_convoy_events = []
_convoy_prev = {}

# Scenario 5 (sentinel / denial of control) latest state.
_sentinel = {"scene": {}, "graph": {"nodes": [], "topics": []},
             "security_enforced": False, "events": []}
_sentinel_events = []
_sentinel_prev = {}

# Scenario 6 (saboteur / action-cancel sabotage) latest state.
_saboteur = {"scene": {}, "graph": {"nodes": [], "topics": []},
             "security_enforced": False, "events": []}
_saboteur_events = []
_saboteur_prev = {}

# Rolling event log (most recent last). Derived from graph + state transitions.
_events = []
_MAX_EVENTS = 60

# Transition-tracking state for event derivation.
_prev_nodes = set()
_prev_compromised = {}
_prev_collided = {}
_seeded = False


def add_event(level, text):
    """Append a timestamped event (level: info|warn|ok) to the rolling log."""
    _events.append({
        "t": time.strftime("%H:%M:%S"),
        "level": level,
        "text": text,
    })
    if len(_events) > _MAX_EVENTS:
        del _events[0 : len(_events) - _MAX_EVENTS]


def derive_events(graph, reported):
    """Emit events for new/left DDS nodes and compromise state changes."""
    global _prev_nodes, _prev_compromised, _prev_collided, _seeded

    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)

    if not _seeded:
        # First snapshot: don't flood with "joined" for the whole fleet.
        _prev_nodes = cur
        _prev_compromised = {r: v.get("compromised", False)
                             for r, v in reported.items()}
        _prev_collided = {r: v.get("collided", False)
                          for r, v in reported.items()}
        _seeded = True
        add_event("info", "fleet online — monitoring DDS bus")
        return

    for n in cur - _prev_nodes:
        if nodes.get(n):
            add_event("warn", f"⚠ unauthorized node joined the DDS bus: {n}")
        else:
            add_event("info", f"node joined: {n}")
    for n in _prev_nodes - cur:
        add_event("info", f"node left: {n}")
    _prev_nodes = cur

    for r, v in reported.items():
        was = _prev_compromised.get(r, False)
        now = v.get("compromised", False)
        if now and not was:
            dev = v.get("route_deviation", "?")
            add_event("warn", f"⚠ {r} HIJACKED — off-route {dev}m (cmd_vel injection)")
        elif was and not now:
            add_event("ok", f"✓ {r} back on route (watchdog recovered control)")
        _prev_compromised[r] = now

        # Collision with warehouse shelving (physical consequence of a hijack).
        col_was = _prev_collided.get(r, False)
        col_now = v.get("collided", False)
        if col_now and not col_was:
            add_event("warn", f"⚠ {r} COLLISION with rack — emergency stop")
        _prev_collided[r] = col_now


@api.get("/api/health")
async def health():
    return {"status": "ok", "bridge": f"{BRIDGE_HOST}:{BRIDGE_PORT}"}


@api.get("/api/state")
async def state():
    return _latest


@api.get("/api/dock")
async def dock_state():
    return _dock


@api.get("/api/takeover")
async def takeover_state():
    return _takeover


@api.get("/api/convoy")
async def convoy_state():
    return _convoy


@api.get("/api/sentinel")
async def sentinel_state():
    return _sentinel


@api.get("/api/saboteur")
async def saboteur_state():
    return _saboteur


def dock_add_event(level, text):
    _dock_events.append({"t": time.strftime("%H:%M:%S"), "level": level, "text": text})
    if len(_dock_events) > 40:
        del _dock_events[0:len(_dock_events) - 40]


def derive_dock_events(scene, graph):
    """Events for the dock scenario: intruder nodes, deception, collision."""
    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)
    if "seeded" not in _dock_prev:
        _dock_prev["seeded"] = True
        _dock_prev["nodes"] = cur
        _dock_prev["deceived"] = scene.get("deceived", False)
        _dock_prev["collided"] = scene.get("collided", False)
        dock_add_event("info", "dock AMR online — navigating on /scan")
        return
    for n in cur - _dock_prev["nodes"]:
        dock_add_event("warn" if nodes.get(n) else "info",
                       (f"⚠ unauthorized node joined the bus: {n}" if nodes.get(n)
                        else f"node joined: {n}"))
    for n in _dock_prev["nodes"] - cur:
        dock_add_event("info", f"node left: {n}")
    _dock_prev["nodes"] = cur
    dec = scene.get("deceived", False)
    if dec and not _dock_prev["deceived"]:
        dock_add_event("warn", "⚠ PERCEPTION SPOOFED — robot believes path clear while an obstacle is real")
    _dock_prev["deceived"] = dec
    col = scene.get("collided", False)
    if col and not _dock_prev["collided"]:
        dock_add_event("warn", "⚠ COLLISION — robot drove into a real obstacle (blinded)")
    _dock_prev["collided"] = col


async def dock_consumer():
    while True:
        try:
            reader, writer = await asyncio.open_connection(DOCK_HOST, DOCK_PORT)
            print(f"[backend] connected to dock {DOCK_HOST}:{DOCK_PORT}", flush=True)
            while True:
                # Read with a timeout: the bridge pushes ~10x/sec, so no data for
                # 5s means the connection is stale (e.g. the dock container was
                # recreated) — drop it and reconnect instead of hanging forever.
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] dock feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    scene = data.get("scene", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    derive_dock_events(scene, graph)
                    _dock["scene"] = scene
                    _dock["graph"] = graph
                    _dock["security_enforced"] = data.get("security_enforced", False)
                    _dock["events"] = _dock_events[-12:]
                    await sio.emit("dock", _dock)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001
                    print(f"[backend] dock record error: {e}", flush=True)
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] dock not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            print(f"[backend] dock consumer error: {e}; reconnecting", flush=True)
            await asyncio.sleep(2)


def compute_divergence(ground_truth: dict, reported: dict) -> dict:
    """Distance between true pose and the coordinator's reported pose, per robot."""
    out = {}
    for robot, gt in ground_truth.items():
        rep = reported.get(robot)
        if not rep:
            continue
        rx = rep.get("reported_x")
        ry = rep.get("reported_y")
        if rx is None or ry is None:
            continue
        out[robot] = round(math.hypot(gt["x"] - rx, gt["y"] - ry), 3)
    return out


# ---- Scenario 3: takeover / rogue coordinator ----
def tk_add_event(level, text):
    _tk_events.append({"t": time.strftime("%H:%M:%S"), "level": level, "text": text})
    if len(_tk_events) > 40:
        del _tk_events[0:len(_tk_events) - 40]


def derive_tk_events(graph, impersonation):
    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)
    if "seeded" not in _tk_prev:
        _tk_prev["seeded"] = True
        _tk_prev["nodes"] = cur
        _tk_prev["imp"] = impersonation
        tk_add_event("info", "fleet online — coordinator issuing patrol goals")
        return
    for n in cur - _tk_prev["nodes"]:
        tk_add_event("warn" if nodes.get(n) else "info",
                     (f"⚠ unauthorized node joined the bus: {n}" if nodes.get(n)
                      else f"node joined: {n}"))
    for n in _tk_prev["nodes"] - cur:
        tk_add_event("info", f"node left: {n}")
    _tk_prev["nodes"] = cur
    if impersonation and not _tk_prev["imp"]:
        tk_add_event("warn", "⚠ COORDINATOR IMPERSONATION — a rogue node is issuing fleet goals")
    elif not impersonation and _tk_prev["imp"]:
        tk_add_event("ok", "✓ rogue coordinator gone — legitimate control restored")
    _tk_prev["imp"] = impersonation


async def takeover_consumer():
    while True:
        try:
            reader, writer = await asyncio.open_connection(TAKEOVER_HOST, TAKEOVER_PORT)
            print(f"[backend] connected to takeover {TAKEOVER_HOST}:{TAKEOVER_PORT}", flush=True)
            while True:
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] takeover feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    gt = data.get("ground_truth", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    imp = data.get("impersonation", False)
                    derive_tk_events(graph, imp)
                    _takeover["ground_truth"] = gt
                    _takeover["reported"] = data.get("reported", {})
                    _takeover["routes"] = data.get("routes", _takeover.get("routes", {}))
                    _takeover["graph"] = graph
                    _takeover["impersonation"] = imp
                    _takeover["security_enforced"] = data.get("security_enforced", False)
                    _takeover["events"] = _tk_events[-12:]
                    await sio.emit("takeover", _takeover)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001
                    print(f"[backend] takeover record error: {e}", flush=True)
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] takeover not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            print(f"[backend] takeover consumer error: {e}; reconnecting", flush=True)
            await asyncio.sleep(2)


# ---- Scenario 4: convoy / capture-replay ----
def convoy_add_event(level, text):
    _convoy_events.append({"t": time.strftime("%H:%M:%S"), "level": level, "text": text})
    if len(_convoy_events) > 40:
        del _convoy_events[0:len(_convoy_events) - 40]


def derive_convoy_events(scene, graph):
    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)
    replaying = scene.get("replaying", False)
    spoofed = scene.get("spoofed", False)
    if "seeded" not in _convoy_prev:
        _convoy_prev["seeded"] = True
        _convoy_prev["nodes"] = cur
        _convoy_prev["replaying"] = replaying
        _convoy_prev["spoofed"] = spoofed
        convoy_add_event("info", "convoy online — reporting telemetry on /convoy/odom")
        return
    for n in cur - _convoy_prev["nodes"]:
        convoy_add_event("warn" if nodes.get(n) else "info",
                         (f"⚠ unauthorized node joined the bus: {n}" if nodes.get(n)
                          else f"node joined: {n}"))
    for n in _convoy_prev["nodes"] - cur:
        convoy_add_event("info", f"node left: {n}")
    _convoy_prev["nodes"] = cur
    if replaying and not _convoy_prev["replaying"]:
        convoy_add_event("warn", "⚠ second publisher on /convoy/odom — telemetry is being replayed")
    elif not replaying and _convoy_prev["replaying"]:
        convoy_add_event("ok", "✓ replay publisher gone — live telemetry restored")
    _convoy_prev["replaying"] = replaying
    if spoofed and not _convoy_prev["spoofed"]:
        convoy_add_event("warn", "⚠ TELEMETRY SPOOFED — reported position is stale; the convoy has moved")
    elif not spoofed and _convoy_prev["spoofed"]:
        convoy_add_event("ok", "✓ reported position matches ground truth again")
    _convoy_prev["spoofed"] = spoofed


async def convoy_consumer():
    while True:
        try:
            reader, writer = await asyncio.open_connection(CONVOY_HOST, CONVOY_PORT)
            print(f"[backend] connected to convoy {CONVOY_HOST}:{CONVOY_PORT}", flush=True)
            while True:
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] convoy feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    scene = data.get("scene", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    derive_convoy_events(scene, graph)
                    _convoy["scene"] = scene
                    _convoy["graph"] = graph
                    _convoy["defense"] = data.get("defense", {})
                    _convoy["security_enforced"] = data.get("security_enforced", False)
                    _convoy["events"] = _convoy_events[-12:]
                    await sio.emit("convoy", _convoy)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001
                    print(f"[backend] convoy record error: {e}", flush=True)
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] convoy not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            print(f"[backend] convoy consumer error: {e}; reconnecting", flush=True)
            await asyncio.sleep(2)


# ---- Scenario 5: sentinel / denial of control ----
def sentinel_add_event(level, text):
    _sentinel_events.append({"t": time.strftime("%H:%M:%S"), "level": level, "text": text})
    if len(_sentinel_events) > 40:
        del _sentinel_events[0:len(_sentinel_events) - 40]


def derive_sentinel_events(scene, graph):
    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)
    status = scene.get("status")
    controllable = scene.get("controllable", True)
    if "seeded" not in _sentinel_prev:
        _sentinel_prev["seeded"] = True
        _sentinel_prev["nodes"] = cur
        _sentinel_prev["status"] = status
        sentinel_add_event("info", "sentinel online — ACTIVE, patrolling")
        return
    for n in cur - _sentinel_prev["nodes"]:
        sentinel_add_event("warn" if nodes.get(n) else "info",
                           (f"⚠ unauthorized node joined the bus: {n}" if nodes.get(n)
                            else f"node joined: {n}"))
    for n in _sentinel_prev["nodes"] - cur:
        sentinel_add_event("info", f"node left: {n}")
    _sentinel_prev["nodes"] = cur
    if status != _sentinel_prev.get("status"):
        if status == "ESTOPPED":
            sentinel_add_event("warn", "⚠ E-STOP engaged via service call — robot halted (denial of control)")
        elif status == "HALTED":
            sentinel_add_event("warn", "⚠ node forced INACTIVE via lifecycle — control removed")
        elif status == "ACTIVE":
            sentinel_add_event("ok", "✓ control restored — sentinel ACTIVE again")
        _sentinel_prev["status"] = status


async def sentinel_consumer():
    while True:
        try:
            reader, writer = await asyncio.open_connection(SENTINEL_HOST, SENTINEL_PORT)
            print(f"[backend] connected to sentinel {SENTINEL_HOST}:{SENTINEL_PORT}", flush=True)
            while True:
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] sentinel feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    scene = data.get("scene", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    derive_sentinel_events(scene, graph)
                    _sentinel["scene"] = scene
                    _sentinel["graph"] = graph
                    _sentinel["security_enforced"] = data.get("security_enforced", False)
                    _sentinel["events"] = _sentinel_events[-12:]
                    await sio.emit("sentinel", _sentinel)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001
                    print(f"[backend] sentinel record error: {e}", flush=True)
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] sentinel not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            print(f"[backend] sentinel consumer error: {e}; reconnecting", flush=True)
            await asyncio.sleep(2)


# ---- Scenario 6: saboteur / action-cancel sabotage ----
def saboteur_add_event(level, text):
    _saboteur_events.append({"t": time.strftime("%H:%M:%S"), "level": level, "text": text})
    if len(_saboteur_events) > 40:
        del _saboteur_events[0:len(_saboteur_events) - 40]


def derive_saboteur_events(scene, graph):
    nodes = {n["name"]: n.get("foreign", False) for n in graph.get("nodes", [])}
    cur = set(nodes)
    aborted = scene.get("aborted", 0)
    if "seeded" not in _saboteur_prev:
        _saboteur_prev["seeded"] = True
        _saboteur_prev["nodes"] = cur
        _saboteur_prev["aborted"] = aborted
        _saboteur_prev["delivered"] = scene.get("delivered", 0)
        saboteur_add_event("info", "courier online — running deliveries as actions")
        return
    for n in cur - _saboteur_prev["nodes"]:
        saboteur_add_event("warn" if nodes.get(n) else "info",
                           (f"⚠ unauthorized node joined the bus: {n}" if nodes.get(n)
                            else f"node joined: {n}"))
    for n in _saboteur_prev["nodes"] - cur:
        saboteur_add_event("info", f"node left: {n}")
    _saboteur_prev["nodes"] = cur
    # a rising aborted-count means a cancel sabotage just landed
    if aborted > _saboteur_prev.get("aborted", 0):
        saboteur_add_event("warn", "⚠ delivery CANCELED via action cancel service — mission sabotaged")
    _saboteur_prev["aborted"] = aborted
    delivered = scene.get("delivered", 0)
    if delivered > _saboteur_prev.get("delivered", 0):
        saboteur_add_event("ok", f"✓ delivery completed (total {delivered})")
    _saboteur_prev["delivered"] = delivered


async def saboteur_consumer():
    while True:
        try:
            reader, writer = await asyncio.open_connection(SABOTEUR_HOST, SABOTEUR_PORT)
            print(f"[backend] connected to saboteur {SABOTEUR_HOST}:{SABOTEUR_PORT}", flush=True)
            while True:
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] saboteur feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                try:
                    data = json.loads(line.decode())
                    scene = data.get("scene", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    derive_saboteur_events(scene, graph)
                    _saboteur["scene"] = scene
                    _saboteur["graph"] = graph
                    _saboteur["security_enforced"] = data.get("security_enforced", False)
                    _saboteur["events"] = _saboteur_events[-12:]
                    await sio.emit("saboteur", _saboteur)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001
                    print(f"[backend] saboteur record error: {e}", flush=True)
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] saboteur not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001
            print(f"[backend] saboteur consumer error: {e}; reconnecting", flush=True)
            await asyncio.sleep(2)


async def bridge_consumer():
    """Reconnecting client for the telemetry_bridge newline-JSON feed."""
    while True:
        try:
            reader, writer = await asyncio.open_connection(BRIDGE_HOST, BRIDGE_PORT)
            print(f"[backend] connected to bridge {BRIDGE_HOST}:{BRIDGE_PORT}", flush=True)
            while True:
                # Timeout read: no data for 5s => stale connection, reconnect.
                try:
                    line = await asyncio.wait_for(reader.readline(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("[backend] fleet feed stale; reconnecting", flush=True)
                    break
                if not line:
                    break
                # Per-record processing is isolated: a bad record or a bug in event
                # derivation must never kill the stream (that would freeze the HMI).
                try:
                    data = json.loads(line.decode())
                    gt = data.get("ground_truth", {})
                    rep = data.get("reported", {})
                    graph = data.get("graph", {"nodes": [], "topics": []})
                    derive_events(graph, rep)
                    # Emit an event when the fleet's security posture changes.
                    sec = data.get("security_enforced", False)
                    if sec != _latest.get("security_enforced"):
                        if sec:
                            add_event("ok", "✓ SROS2 ENFORCED — fleet hardened (auth + encryption + access control)")
                        else:
                            add_event("warn", "⚠ security DISABLED — fleet on open bus")
                    _latest["ground_truth"] = gt
                    _latest["reported"] = rep
                    _latest["routes"] = data.get("routes", _latest.get("routes", {}))
                    _latest["security_enforced"] = sec
                    _latest["graph"] = graph
                    _latest["events"] = _events[-12:]  # last dozen for the HMI feed
                    _latest["divergence"] = compute_divergence(gt, rep)
                    await sio.emit("telemetry", _latest)
                except json.JSONDecodeError:
                    continue
                except Exception as e:  # noqa: BLE001 — keep the stream alive
                    import traceback
                    print(f"[backend] record error: {e}", flush=True)
                    traceback.print_exc()
                    continue
        except (ConnectionRefusedError, OSError) as e:
            print(f"[backend] bridge not ready ({e}); retrying in 2s", flush=True)
            await asyncio.sleep(2)
        except Exception as e:  # noqa: BLE001 — reconnect on any unexpected error
            print(f"[backend] consumer error: {e}; reconnecting in 2s", flush=True)
            await asyncio.sleep(2)


@sio.event
async def connect(sid, environ):
    print(f"[backend] HMI client connected: {sid}", flush=True)
    await sio.emit("telemetry", _latest, to=sid)
    await sio.emit("dock", _dock, to=sid)
    await sio.emit("takeover", _takeover, to=sid)
    await sio.emit("convoy", _convoy, to=sid)
    await sio.emit("sentinel", _sentinel, to=sid)
    await sio.emit("saboteur", _saboteur, to=sid)


@api.on_event("startup")
async def startup():
    asyncio.create_task(bridge_consumer())
    asyncio.create_task(dock_consumer())
    asyncio.create_task(takeover_consumer())
    asyncio.create_task(convoy_consumer())
    asyncio.create_task(sentinel_consumer())
    asyncio.create_task(saboteur_consumer())


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
