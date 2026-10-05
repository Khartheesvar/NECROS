import { uiText } from './uiText.js'
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { getScenario } from './scenarios.js'
import Dock3D from './Dock3D.jsx'

// Scenario 2 "Blind Navigator" console: a dock corridor shown TWO ways —
// Ground Truth (reality) vs the Robot's Belief (what the spoofed scan shows).
// The gap between them IS the attack (loss of truth / perception spoofing).

const TONE = '#38bdf8'
const DANGER = '#ff3b52'

export default function DockConsole() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(2)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [dock, setDock] = useState({ scene: {}, graph: { nodes: [], topics: [] }, events: [], security_enforced: false })

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('dock', (d) => setDock(d))
    return () => socket.close()
  }, [])

  const scene = dock.scene || {}
  const secured = dock.security_enforced === true
  const deceived = scene.deceived === true
  const collided = scene.collided === true
  const nodes = dock.graph?.nodes || []
  const topics = dock.graph?.topics || []

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="back-link" title="Back to scenarios">←</Link>
        <div className="brand">
          <img className="app-logo" src="/logo.png" alt="" />
          <span className="logo">NECROS</span>
          <span className="subtitle">Attacking &amp; Defending ROS 2</span>
        </div>
        <div className="scen">SCENARIO {scenario.id} · {scenario.codename}</div>
        <div className={`secbadge ${secured ? 'on' : 'off'}`}>
          {secured ? 'SROS2 ENFORCED' : 'OPEN BUS'}
        </div>
        <div className={`conn ${connected ? 'up' : 'down'}`}>
          {connected ? '● LIVE' : '○ OFFLINE'}
        </div>
      </header>

      <div className={`mission ${missionOpen ? 'open' : 'closed'}`}>
        <button className="mission-toggle" aria-expanded={missionOpen} onClick={() => setMissionOpen((o) => !o)}>
          <span className="mission-chip">Mission brief</span>
          <span className="mission-caret">{missionOpen ? '▾' : '▸'}</span>
        </button>
        {missionOpen && (
          <div className="mission-body">
            <div className="mission-line">
              <span className="mission-tag atk">ATTACK</span>
              Make the robot crash without touching its motors.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">DEFEND</span>
              Authenticate the sensor topic with SROS2 so forged readings are rejected.
            </div>
          </div>
        )}
      </div>

      {collided && (
        <div className="alert-banner">
          ⚠ COLLISION: robot drove into a real obstacle while blinded by spoofed <code>/scan</code>
        </div>
      )}
      {deceived && !collided && (
        <div className="alert-banner alert-warning">
          ⚠ PERCEPTION SPOOFED: the robot believes the path is clear, but an obstacle is really ahead
        </div>
      )}

      <div className="console-wide">
        <section className="map-panel">
          <div className="panel-title">
            Loading Dock
          </div>
          <div className="dock-view dock-view-solo">
            <div className="dock-view-head">
              <span className="dock-view-sub">
                {deceived || collided
                  ? 'robot navigating on SPOOFED /scan: perception compromised'
                  : 'robot navigating on its real LIDAR /scan'}
              </span>
            </div>
            <Dock3D scene={scene} mode="truth" />
          </div>
          <div className="dock-legend">
            <span className="muted">drag to rotate · scroll to zoom</span>
            <span className="muted">spoofing the /scan topic blinds the robot, causing it to drive into obstacles it can no longer "see"</span>
          </div>
        </section>

        <aside className="side-row">
          <div className="side-panel">
            <div className="panel-title">Perception Status</div>
            <div className={`tile ${deceived || collided ? 'tile-alert' : ''}`}>
              <div className="tile-head">
                <span className="tile-dot" style={{ background: collided ? DANGER : (deceived ? '#fbbf24' : TONE) }} />
                <span className="tile-name">dock1</span>
                <span className={`tile-status ${deceived || collided ? 'bad' : 'ok'}`}>
                  {collided ? '⚠ COLLIDED' : deceived ? '⚠ DECEIVED' : '✓ navigating'}
                </span>
              </div>
              <div className="tile-metrics">
                <span>real <b>{scene.true ? `${scene.true.x}, ${scene.true.y}` : 'N/A'}</b></span>
                <span>believes clear: <b>{String(scene.believed_clear_ahead ?? 'N/A')}</b></span>
              </div>
              <div className="tile-metrics">
                <span>obstacle really ahead: <b className={scene.real_obstacle_ahead != null ? 'bad' : ''}>
                  {scene.real_obstacle_ahead != null ? `${scene.real_obstacle_ahead} m` : 'none'}</b></span>
              </div>
            </div>
          </div>

          <div className="side-panel">
            <div className="panel-title">DDS Bus {secured && <span className="bus-secured">secured</span>}
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
          </div>

          <div className="side-panel">
            <div className="panel-title">Event Feed
              <div className="feed">
                {(dock.events || []).map((e, i) => (
                  <div key={i} className={`feed-row ${e.level}`}>
                    <span className="feed-t">{e.t}</span><span className="feed-text">{uiText(e.text)}</span>
                  </div>
                ))}
                {(!dock.events || dock.events.length === 0) &&
                  <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
