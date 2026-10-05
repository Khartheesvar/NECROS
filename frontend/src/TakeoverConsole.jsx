import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import Yard3D from './Yard3D.jsx'
import { getScenario } from './scenarios.js'

// Scenario 3 "Rogue Coordinator" console — reuses the fleet 3D warehouse, themed
// for node impersonation: an impersonation banner, the rogue coordinator flagged on
// the DDS bus, and both robots shown redirected by the attacker.

const ROBOT_COLORS = { amr1: '#38bdf8', amr2: '#c084fc' }
const TRAIL_MAX = 160

export default function TakeoverConsole() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(3)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [state, setState] = useState({
    ground_truth: {}, reported: {}, routes: {},
    graph: { nodes: [], topics: [] }, events: [], impersonation: false,
  })
  const trailsRef = useRef({})
  const [, force] = useState(0)

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('takeover', (data) => {
      setState(data)
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

  // Under impersonation, treat redirected robots as "compromised" for the map tint.
  const imp = state.impersonation === true
  const meta = {}
  Object.keys(state.ground_truth || {}).forEach((name) => {
    meta[name] = { compromised: imp, dev: 0 }
  })
  const secured = state.security_enforced === true
  const names = Object.keys(state.ground_truth || {})
  const nodes = state.graph?.nodes || []
  const topics = state.graph?.topics || []

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
              Command the whole fleet by impersonating its coordinator.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">🛡 DEFEND</span>
              Bind goal-publishing to the coordinator's identity with SROS2 access control.
            </div>
          </div>
        )}
      </div>

      {imp && (
        <div className="alert-banner">
          ⚠ COORDINATOR IMPERSONATION — a rogue node is issuing fleet goals; the robots are obeying the attacker
        </div>
      )}
      {secured && (
        <div className="defend-banner">
          🔒 FLEET HARDENED — SROS2 enforced: only the authenticated coordinator may publish goals. Rogue goals are rejected.
        </div>
      )}

      <div className="console">
        <section className="map-panel">
          <div className="panel-title">
            Logistics Yard
          </div>
          <div className="map-wrap">
            <Yard3D groundTruth={state.ground_truth} rogue={imp} />
          </div>
          <div className="map-legend">
            <span><i className="dot" style={{ background: imp ? '#ff3b52' : '#5be0a0' }} /> command links {imp ? '(rogue)' : '(coordinator)'}</span>
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
            {names.map((name) => {
              const gt = state.ground_truth[name]
              return (
                <div className={`tile ${imp ? 'tile-alert' : ''}`} key={name}>
                  <div className="tile-head">
                    <span className="tile-dot" style={{ background: imp ? '#ff3b52' : ROBOT_COLORS[name] }} />
                    <span className="tile-name">{name}</span>
                    <span className={`tile-status ${imp ? 'bad' : 'ok'}`}>
                      {imp ? '⚠ ROGUE GOALS' : '✓ on mission'}
                    </span>
                  </div>
                  <div className="tile-metrics">
                    <span>pos <b>{gt ? `${gt.x.toFixed(1)}, ${gt.y.toFixed(1)}` : '—'}</b></span>
                    <span>vel <b>{gt ? gt.v.toFixed(2) : '—'}</b> m/s</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="side-panel">
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
                {topics.map((t) => {
                  const isGoal = t.name.endsWith('/goal_pose')
                  const flag = isGoal || t.sensitive
                  return (
                    <div key={t.name} className={`bus-topic ${flag && !secured ? 'sensitive' : ''}`}>
                      <span className="bus-name">{t.name}</span>
                      {flag && (secured
                        ? <span className="bus-tag ok">protected</span>
                        : <span className="bus-tag warn">{isGoal && imp ? 'HIJACKED' : 'exposed'}</span>)}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="side-panel">
            <div className="panel-title">Event Feed
              <div className="feed">
                {(state.events || []).map((e, i) => (
                  <div key={i} className={`feed-row ${e.level}`}>
                    <span className="feed-t">{e.t}</span><span className="feed-text">{e.text}</span>
                  </div>
                ))}
                {(!state.events || state.events.length === 0) &&
                  <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
