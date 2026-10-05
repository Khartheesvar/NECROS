import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getActs } from './scenarios.js'
import RobotChar from './RobotChar.jsx'

// NECROS landing page / level-select. Scenarios are grouped into ACTS (see
// scenarios.js) so a player sees the shared root cause of a group, never a single
// technique in isolation. Layout is data-driven: each act renders a titled band of
// scenario cards that wraps, so adding scenarios or acts needs no layout changes.

const ART_TONE = { live: '#34d399', soon: '#fbbf24', locked: '#64748b' }

function ScenarioCard({ s, onEnter }) {
  const live = s.status === 'live'
  return (
    <div className={`rm-card2 ${s.status}`} style={{ '--nc': ART_TONE[s.status] }}
      onClick={() => live && onEnter(s)} role={live ? 'button' : undefined}>
      <div className="rm-card2-bot">
        <RobotChar id={s.id} tone={ART_TONE[s.status]} size={132} />
        <span className="rm-pin-num">{s.id}</span>
        {live && <span className="rm-bot-ring" />}
      </div>
      <div className="rm-card2-body">
        <div className="rm-card-top">
          <span className="rm-codename">{s.codename}</span>
          <span className={`rm-status ${s.status}`}>
            {live ? '● PLAYABLE' : '○ SOON'}
          </span>
        </div>
        <div className="rm-taglines">{s.tagline}</div>
        <div className="rm-detail rm-atk"><span className="rm-ico">⚔</span><b>Attack</b> {s.attack}</div>
        <div className="rm-detail rm-def"><span className="rm-ico">🛡</span><b>Defend</b> {s.defend}</div>
        <div className="rm-footer">
          {live
            ? <span className="rm-enter">ENTER →</span>
            : <span className="rm-soon-txt">in development</span>}
        </div>
      </div>
    </div>
  )
}

export default function Roadmap() {
  const navigate = useNavigate()
  const acts = getActs()
  const enter = (s) => { if (s.status === 'live') navigate(`/scenario/${s.id}`) }

  return (
    <div className="roadmap">
      <header className="rm-header">
        <div className="rm-brand">
          <span className="rm-logo">☠ NECROS</span>
          <span className="rm-sub">Attacking &amp; Defending ROS 2</span>
        </div>
        <div className="rm-tag">ROBOT FLEET SECURITY RANGE</div>
      </header>

      <p className="rm-intro">
        A hands-on range for attacking and defending an autonomous robot fleet. Each
        stage: a ROS&nbsp;2 / DDS attack, then the defense that stops it.
      </p>

      {acts.map((act, ai) => (
        <section className="rm-act" key={act.key}>
          <div className="rm-act-head">
            <span className="rm-act-label">{act.label}</span>
            <h2 className="rm-act-title">{act.title}</h2>
            <span className="rm-act-rule" />
          </div>
          {act.summary && <p className="rm-act-summary">{act.summary}</p>}
          <div className="rm-act-grid">
            {act.scenarios.map((s) => (
              <ScenarioCard key={s.id} s={s} onEnter={enter} />
            ))}
          </div>
        </section>
      ))}

      <footer className="rm-foot">
        ROS 2 Jazzy · DDS · SROS2
      </footer>
    </div>
  )
}
