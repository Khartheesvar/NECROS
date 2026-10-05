import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { getScenario } from './scenarios.js'
import Saboteur3D from './Saboteur3D.jsx'

// Scenario 6 "Saboteur" console — action goal cancellation (task sabotage). The
// courier runs deliveries as NavigateToPose actions; an attacker calls the action's
// cancel service to abort each mission mid-drive. The robot is healthy and not
// hijacked — it just never finishes its work.

const TONE = '#38bdf8'
const DANGER = '#ff3b52'
const OKGREEN = '#5be0a0'

export default function SaboteurConsole() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(6)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [saboteur, setSaboteur] = useState({
    scene: {}, graph: { nodes: [], topics: [] }, events: [], security_enforced: false,
  })

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('saboteur', (d) => setSaboteur(d))
    return () => socket.close()
  }, [])

  const scene = saboteur.scene || {}
  const secured = saboteur.security_enforced === true
  const status = scene.mission_status || '—'
  const canceled = status === 'canceled' || scene.sabotaged === true
  const delivered = scene.delivered ?? 0
  const aborted = scene.aborted ?? 0
  const rate = scene.rate ?? 0
  const abortRate = scene.abort_rate ?? 0
  const halted = scene.halted === true
  const pose = scene.pose || {}
  const nodes = saboteur.graph?.nodes || []
  const topics = saboteur.graph?.topics || []
  const statusColor = canceled ? DANGER : (status === 'delivered' ? OKGREEN : TONE)

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
              Sabotage a courier's deliveries, aborting its missions without hijacking or disabling it.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">🛡 DEFEND</span>
              Authorize who may cancel tasks with SROS2.
            </div>
          </div>
        )}
      </div>

      {halted && !secured && (
        <div className="alert-banner">
          ⚠ DELIVERIES SABOTAGED — an unauthenticated client is aborting the courier's deliveries at will via the action cancel service (denial of productivity)
        </div>
      )}
      {canceled && !halted && !secured && (
        <div className="alert-banner">
          ⚠ DELIVERY CANCELED — an unauthenticated client is cancelling the courier's missions via the action cancel service
        </div>
      )}
      {secured && (
        <div className="defend-banner">
          🔒 TASKS HARDENED — SROS2: only the authorized commander may cancel goals; rogue cancels are rejected.
        </div>
      )}

      <div className="console">
        <section className="map-panel">
          <div className="panel-title">
            Courier Depot
          </div>
          <div className="map-wrap">
            <Saboteur3D scene={scene} />
          </div>
          <div className="map-legend">
            <span><i className="dot" style={{ background: statusColor }} /> courier ({status})</span>
            <span className="muted">drag to orbit · scroll to zoom</span>
          </div>
        </section>

        <aside className="side-col">
          <div className="side-panel">
            <div className="panel-title">Mission Status</div>
            <div className={`tile ${canceled ? 'tile-alert' : ''}`}>
              <div className="tile-head">
                <span className="tile-dot" style={{ background: statusColor }} />
                <span className="tile-name">courier1</span>
                <span className={`tile-status ${canceled ? 'bad' : 'ok'}`}>
                  {canceled ? '⚠ SABOTAGED' : (status === 'delivered' ? '✓ delivered' : '✓ delivering')}
                </span>
              </div>
              <div className="tile-metrics">
                <span>delivered <b style={{ color: OKGREEN }}>{delivered}</b></span>
                <span>sabotaged <b style={{ color: aborted > 0 ? DANGER : undefined }}>{aborted}</b></span>
              </div>
              <div className="tile-metrics">
                <span>cancel rate <b style={{ color: abortRate > 0 ? DANGER : OKGREEN }}>{abortRate}/min</b></span>
                <span>{halted ? <b style={{ color: DANGER }}>⚠ UNDER ATTACK</b> : <span>nominal</span>}</span>
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
                <div className="bus-sub">privileged interfaces</div>
                <div className={`bus-topic ${!secured ? 'sensitive' : ''}`}>
                  <span className="bus-name">navigate_to_pose/_action/cancel_goal</span>
                  {secured ? <span className="bus-tag ok">protected</span>
                    : <span className="bus-tag warn">{canceled ? 'ABUSED' : 'exposed'}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="side-panel">
            <div className="panel-title">Event Feed
              <div className="feed">
                {(saboteur.events || []).map((e, i) => (
                  <div key={i} className={`feed-row ${e.level}`}>
                    <span className="feed-t">{e.t}</span><span className="feed-text">{e.text}</span>
                  </div>
                ))}
                {(!saboteur.events || saboteur.events.length === 0) &&
                  <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
