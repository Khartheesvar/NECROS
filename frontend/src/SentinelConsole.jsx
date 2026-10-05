import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { getScenario } from './scenarios.js'
import Sentinel3D from './Sentinel3D.jsx'

// Scenario 5 "Dead Man's Switch" console — Denial of Control. The sentinel patrols
// while ACTIVE; an attacker disables it via `ros2 lifecycle set deactivate` or
// `ros2 service call .../estop`. The robot does not get hijacked — it goes dark.

const TONE = '#38bdf8'
const DANGER = '#ff3b52'
const DEAD = '#8a93a8'

export default function SentinelConsole() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(5)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [sentinel, setSentinel] = useState({
    scene: {}, graph: { nodes: [], topics: [] }, events: [], security_enforced: false,
  })

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('sentinel', (d) => setSentinel(d))
    return () => socket.close()
  }, [])

  const scene = sentinel.scene || {}
  const secured = sentinel.security_enforced === true
  const status = scene.status || '—'
  const estopped = scene.estopped === true
  const controllable = scene.controllable === true && status === 'ACTIVE'
  const down = !controllable
  const pose = scene.pose || {}
  const nodes = sentinel.graph?.nodes || []
  const topics = sentinel.graph?.topics || []
  const statusColor = estopped ? DANGER : (controllable ? '#5be0a0' : DEAD)

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
              Take a healthy patrol robot out of service without crashing it.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">🛡 DEFEND</span>
              Lock its control interfaces to authorized identities with SROS2.
            </div>
          </div>
        )}
      </div>

      {estopped && !secured && (
        <div className="alert-banner">
          ⚠ EMERGENCY STOP engaged via unauthenticated service call — the sentinel is halted (denial of control)
        </div>
      )}
      {down && !estopped && !secured && (
        <div className="alert-banner">
          ⚠ NODE FORCED INACTIVE via lifecycle transition — control has been removed; the sentinel is frozen
        </div>
      )}
      {secured && (
        <div className="defend-banner">
          🔒 CONTROL HARDENED — SROS2: the e-stop + lifecycle services reject unauthorized callers.
        </div>
      )}

      <div className="console">
        <section className="map-panel">
          <div className="panel-title">
            Patrol Depot
          </div>
          <div className="map-wrap">
            <Sentinel3D scene={scene} />
          </div>
          <div className="map-legend">
            <span><i className="dot" style={{ background: statusColor }} /> sentinel ({status})</span>
            <span className="muted">drag to orbit · scroll to zoom</span>
          </div>
        </section>

        <aside className="side-col">
          <div className="side-panel">
            <div className="panel-title">Control Status</div>
            <div className={`tile ${down ? 'tile-alert' : ''}`}>
              <div className="tile-head">
                <span className="tile-dot" style={{ background: statusColor }} />
                <span className="tile-name">sentinel1</span>
                <span className={`tile-status ${down ? 'bad' : 'ok'}`}>
                  {estopped ? '⚠ E-STOPPED' : (controllable ? '✓ ACTIVE' : '⚠ HALTED')}
                </span>
              </div>
              <div className="tile-metrics">
                <span>lifecycle <b>{scene.lifecycle || '—'}</b></span>
                <span>e-stop <b style={{ color: estopped ? DANGER : undefined }}>{estopped ? 'ENGAGED' : 'clear'}</b></span>
              </div>
              <div className="tile-metrics">
                <span>pos <b>{pose.x !== undefined ? `${pose.x}, ${pose.y}` : '—'}</b></span>
                <span>vel <b>{pose.v !== undefined ? pose.v : '—'}</b> m/s</span>
              </div>
            </div>
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
                {topics.map((t) => (
                  <div key={t.name} className="bus-topic">
                    <span className="bus-name">{t.name}</span>
                  </div>
                ))}
                <div className="bus-sub">privileged interfaces</div>
                <div className={`bus-topic ${!secured ? 'sensitive' : ''}`}>
                  <span className="bus-name">~/estop (Trigger)</span>
                  {secured ? <span className="bus-tag ok">protected</span>
                    : <span className="bus-tag warn">{estopped ? 'ABUSED' : 'exposed'}</span>}
                </div>
                <div className={`bus-topic ${!secured ? 'sensitive' : ''}`}>
                  <span className="bus-name">lifecycle/change_state</span>
                  {secured ? <span className="bus-tag ok">protected</span>
                    : <span className="bus-tag warn">{down && !estopped ? 'ABUSED' : 'exposed'}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="side-panel">
            <div className="panel-title">Event Feed
              <div className="feed">
                {(sentinel.events || []).map((e, i) => (
                  <div key={i} className={`feed-row ${e.level}`}>
                    <span className="feed-t">{e.t}</span><span className="feed-text">{e.text}</span>
                  </div>
                ))}
                {(!sentinel.events || sentinel.events.length === 0) &&
                  <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
