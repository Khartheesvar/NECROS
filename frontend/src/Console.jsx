import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import Warehouse3D from './Warehouse3D.jsx'
import { getScenario } from './scenarios.js'

// Shared robot palette (must match Warehouse3D).
const ROBOT_COLORS = { amr1: '#38bdf8', amr2: '#c084fc' }
const TRAIL_MAX = 160                  // points of history per robot

// ---- Status tile -------------------------------------------------------------
function StatusTile({ name, gt, meta }) {
  const color = ROBOT_COLORS[name] || '#38bdf8'
  const bad = meta.compromised
  return (
    <div className={`tile ${bad ? 'tile-alert' : ''}`}>
      <div className="tile-head">
        <span className="tile-dot" style={{ background: color }} />
        <span className="tile-name">{name}</span>
        <span className={`tile-status ${bad ? 'bad' : 'ok'}`}>
          {bad ? '⚠ HIJACKED' : '✓ ON ROUTE'}
        </span>
      </div>
      <div className="tile-metrics">
        <span>pos <b>{gt ? `${gt.x.toFixed(1)}, ${gt.y.toFixed(1)}` : '—'}</b></span>
        <span>vel <b>{gt ? `${gt.v.toFixed(2)}` : '—'}</b> m/s</span>
        <span>dev <b className={bad ? 'bad' : ''}>{meta.dev ?? 0}</b> m</span>
      </div>
    </div>
  )
}

function BusPanel({ graph, secured }) {
  const nodes = graph?.nodes || []
  const topics = graph?.topics || []
  return (
    <div className="panel-title">DDS Bus {secured && <span className="bus-secured">🔒 secured</span>}
      <div className="bus">
        <div className="bus-sub">nodes on the bus</div>
        {nodes.map((n) => (
          <div key={n.name} className={`bus-node ${n.foreign ? 'foreign' : ''}`}>
            <span className="bus-ico">{n.foreign ? '☠' : '●'}</span>
            <span className="bus-name">{n.name}</span>
            {n.foreign && <span className="bus-tag">INTRUDER</span>}
          </div>
        ))}
        <div className="bus-sub">topics</div>
        {topics.map((t) => (
          <div key={t.name} className={`bus-topic ${t.sensitive && !secured ? 'sensitive' : ''}`}>
            <span className="bus-name">{t.name}</span>
            {t.sensitive && (secured
              ? <span className="bus-tag ok">protected</span>
              : <span className="bus-tag warn">exposed</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}

function EventFeed({ events }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [events])
  return (
    <div className="panel-title">Event Feed
      <div className="feed" ref={ref}>
        {(events || []).map((e, i) => (
          <div key={i} className={`feed-row ${e.level}`}>
            <span className="feed-t">{e.t}</span>
            <span className="feed-text">{e.text}</span>
          </div>
        ))}
        {(!events || events.length === 0) && <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
      </div>
    </div>
  )
}

export default function Console() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(1)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [state, setState] = useState({ ground_truth: {}, reported: {}, routes: {}, graph: { nodes: [], topics: [] }, events: [] })
  const trailsRef = useRef({})
  const [, force] = useState(0)

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('telemetry', (data) => {
      setState(data)
      // accumulate trails from ground truth
      const t = trailsRef.current
      Object.entries(data.ground_truth || {}).forEach(([name, r]) => {
        if (!r) return
        if (!t[name]) t[name] = []
        const last = t[name][t[name].length - 1]
        if (!last || Math.hypot(last[0] - r.x, last[1] - r.y) > 0.05) {
          t[name].push([r.x, r.y])
          if (t[name].length > TRAIL_MAX) t[name].shift()
        }
      })
      force((n) => n + 1)
    })
    return () => socket.close()
  }, [])

  // per-robot meta (compromised, deviation, collision) from reported state
  const meta = {}
  Object.entries(state.reported || {}).forEach(([name, r]) => {
    meta[name] = {
      compromised: r.compromised === true,
      collided: r.collided === true,
      dev: r.route_deviation ?? 0,
    }
  })

  const anyCompromised = Object.values(meta).some((m) => m.compromised)
  const names = Object.keys(state.ground_truth || {})
  const secured = state.security_enforced === true

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="back-link" title="Back to scenarios">←</Link>
        <div className="brand">
          <span className="logo">NECROS</span>
          <span className="subtitle">Attacking &amp; Defending ROS 2</span>
        </div>
        <div className="scen">SCENARIO {scenario.id} · {scenario.codename}</div>
        <div className={`secbadge ${secured ? 'on' : 'off'}`}>
          {secured ? '🔒 SROS2 ENFORCED' : '🔓 OPEN BUS'}
        </div>
        <div className={`conn ${connected ? 'up' : 'down'}`}>
          {connected ? '● LIVE' : '○ OFFLINE'}
        </div>
      </header>

      <div className={`mission ${missionOpen ? 'open' : 'closed'}`}>
        <button className="mission-toggle" onClick={() => setMissionOpen((o) => !o)}>
          <span className="mission-chip">MISSION</span>
          <span className="mission-caret">{missionOpen ? '▾' : '▸'}</span>
        </button>
        {missionOpen && (
          <div className="mission-body">
            <div className="mission-line">
              <span className="mission-tag atk">⚔ ATTACK</span>
              Seize control of a patrolling robot and drive it off its route, without being the coordinator.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">🛡 DEFEND</span>
              Harden the fleet with SROS2 so your injected commands are rejected.
            </div>
          </div>
        )}
      </div>

      {secured && (
        <div className="defend-banner">
          🔒 FLEET HARDENED — SROS2 enforced: authentication + encryption + access control. Unauthorized nodes are rejected.
        </div>
      )}

      {anyCompromised && !secured && (
        <div className="alert-banner">
          ⚠ FLEET COMPROMISED — unauthorized <code>cmd_vel</code> control detected on the DDS bus
        </div>
      )}

      <div className="console">
        <section className="map-panel">
          <div className="panel-title">
            Warehouse Floor
          </div>
          <div className="map-wrap">
            <Warehouse3D
              groundTruth={state.ground_truth}
              routes={state.routes}
              meta={meta}
              trails={trailsRef.current}
            />
          </div>
          <div className="map-legend">
            <span><i className="dash" /> intended patrol route</span>
            <span><i className="solid" /> actual path (trail)</span>
            <span className="muted">drag to orbit · scroll to zoom</span>
            {names.map((n) => (
              <span key={n}><i className="dot" style={{ background: ROBOT_COLORS[n] }} /> {n}</span>
            ))}
          </div>
        </section>

        <aside className="side-col">
          <div className="side-panel">
            <div className="panel-title">Fleet Status</div>
            {names.length === 0 && <div className="waiting">Waiting for fleet telemetry…</div>}
            {names.map((name) => (
              <StatusTile key={name} name={name} gt={state.ground_truth[name]} meta={meta[name] || {}} />
            ))}
          </div>

          <div className="side-panel">
            <BusPanel graph={state.graph} secured={secured} />
          </div>

          <div className="side-panel">
            <EventFeed events={state.events} />
          </div>
        </aside>
      </div>
    </div>
  )
}
