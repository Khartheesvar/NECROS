import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { getScenario } from './scenarios.js'
import Convoy3D from './Convoy3D.jsx'

// Scenario 4 "Ghost Convoy" console — capture-and-replay / telemetry spoofing.
// The operator trusts the pose reported on /convoy/odom. Under a replay attack a
// second publisher re-emits captured telemetry, freezing the reported pose at the
// depot while the real convoy drives on. The gap between REAL and REPORTED is the
// attack (loss of truth via authentic-but-stale data).

const TONE = '#38bdf8'
const GHOST = '#8a93a8'
const DANGER = '#ff3b52'

export default function ConvoyConsole() {
  const { id } = useParams()
  const scenario = getScenario(id) || getScenario(4)
  const [connected, setConnected] = useState(false)
  const [missionOpen, setMissionOpen] = useState(true)
  const [convoy, setConvoy] = useState({
    scene: {}, graph: { nodes: [], topics: [] }, events: [], security_enforced: false,
  })

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('convoy', (d) => setConvoy(d))
    return () => socket.close()
  }, [])

  const scene = convoy.scene || {}
  const defense = convoy.defense || {}
  const freshnessOn = defense.freshness_enabled === true
  const rejected = defense.rejected || 0
  const secured = convoy.security_enforced === true
  const replaying = scene.replaying === true
  const spoofed = scene.spoofed === true
  const defended = scene.defended === true
  const gt = scene.ground_truth || {}
  const rep = scene.reported || {}
  const gap = scene.gap ?? 0
  const pubs = scene.odom_publishers ?? 1
  const nodes = convoy.graph?.nodes || []
  const topics = convoy.graph?.topics || []

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="back-link" title="Back to scenarios">←</Link>
        <div className="brand">
          <span className="logo">NECROS</span>
          <span className="subtitle">Attacking &amp; Defending ROS 2</span>
        </div>
        <div className="scen">SCENARIO {scenario.id} · {scenario.codename}</div>
        <div className={`secbadge ${secured || freshnessOn ? 'on' : 'off'}`}>
          {secured && freshnessOn ? '🔒 SROS2 + FRESHNESS'
            : secured ? '🔒 SROS2 ENFORCED'
            : freshnessOn ? '🔒 FRESHNESS CHECK' : '🔓 OPEN BUS'}
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
              Freeze the operator's view on a lie while the convoy moves, forging nothing.
            </div>
            <div className="mission-line">
              <span className="mission-tag def">🛡 DEFEND</span>
              Reject stale, replayed telemetry with freshness validation and SROS2.
            </div>
          </div>
        )}
      </div>

      {spoofed && (
        <div className="alert-banner">
          ⚠ TELEMETRY SPOOFED — the operator view is frozen on replayed /odom; the real convoy has moved {gap} m away
        </div>
      )}
      {replaying && !spoofed && (
        <div className="alert-banner" style={{ background: '#5a4a1a' }}>
          ⚠ REPLAY PUBLISHER DETECTED — a second node is publishing /convoy/odom (captured telemetry)
        </div>
      )}
      {(secured || defended) && (
        <div className="defend-banner">
          🔒 TELEMETRY HARDENED — {secured && 'SROS2 access control'}{secured && freshnessOn && ' + '}
          {freshnessOn && `freshness/sequence validation (${rejected} replayed samples rejected)`}: stale replayed /odom is dropped, the operator view stays truthful.
        </div>
      )}

      <div className="console">
        <section className="map-panel">
          <div className="panel-title">
            Delivery Depot
          </div>
          <div className="map-wrap">
            <Convoy3D scene={scene} />
          </div>
          <div className="map-legend">
            <span><i className="dot" style={{ background: spoofed ? DANGER : TONE }} /> real convoy (ground truth)</span>
            <span><i className="dot" style={{ background: GHOST }} /> reported (what the operator sees)</span>
            <span className="muted">drag to orbit · scroll to zoom</span>
          </div>
        </section>

        <aside className="side-col">
          <div className="side-panel">
            <div className="panel-title">Convoy Status</div>
            <div className={`tile ${spoofed ? 'tile-alert' : ''}`}>
              <div className="tile-head">
                <span className="tile-dot" style={{ background: spoofed ? DANGER : TONE }} />
                <span className="tile-name">convoy1</span>
                <span className={`tile-status ${spoofed ? 'bad' : 'ok'}`}>
                  {spoofed ? '⚠ TELEMETRY SPOOFED' : (replaying ? '⚠ replay present' : '✓ telemetry live')}
                </span>
              </div>
              <div className="tile-metrics">
                <span>real pos <b>{gt.x !== undefined ? `${gt.x}, ${gt.y}` : '—'}</b></span>
                <span>reported <b>{rep.x !== undefined ? `${rep.x}, ${rep.y}` : '—'}</b></span>
              </div>
              <div className="tile-metrics">
                <span>gap <b style={{ color: spoofed ? DANGER : undefined }}>{gap} m</b></span>
                <span>/odom publishers <b style={{ color: pubs > 1 ? DANGER : undefined }}>{pubs}</b></span>
              </div>
              {freshnessOn && (
                <div className="tile-metrics">
                  <span>freshness check <b style={{ color: '#5be0a0' }}>ON</b></span>
                  <span>replays rejected <b style={{ color: rejected > 0 ? '#5be0a0' : undefined }}>{rejected}</b></span>
                </div>
              )}
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
                {topics.map((t) => {
                  const isOdom = t.name.endsWith('/odom')
                  const flag = isOdom || t.sensitive
                  return (
                    <div key={t.name} className={`bus-topic ${flag && !secured ? 'sensitive' : ''}`}>
                      <span className="bus-name">{t.name}</span>
                      {flag && (secured
                        ? <span className="bus-tag ok">protected</span>
                        : <span className="bus-tag warn">{isOdom && replaying ? 'REPLAYED' : 'exposed'}</span>)}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="side-panel">
            <div className="panel-title">Event Feed
              <div className="feed">
                {(convoy.events || []).map((e, i) => (
                  <div key={i} className={`feed-row ${e.level}`}>
                    <span className="feed-t">{e.t}</span><span className="feed-text">{e.text}</span>
                  </div>
                ))}
                {(!convoy.events || convoy.events.length === 0) &&
                  <div className="feed-row info"><span className="feed-text">no events yet…</span></div>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
