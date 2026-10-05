import React from 'react'
import { useNavigate } from 'react-router-dom'
import { getActs } from './scenarios.js'
import RobotChar from './RobotChar.jsx'

const ART_TONE = { live: '#39ff14', soon: '#fbbf24', locked: '#64748b' }

function ScenarioCard({ s, onEnter }) {
  const live = s.status === 'live'
  return (
    <button type="button" className={`rm-card2 ${s.status}`} style={{ '--nc': ART_TONE[s.status] }}
      disabled={!live} onClick={() => live && onEnter(s)}>
      <div className="rm-card-id">
        <span>SCENARIO {String(s.id).padStart(2, '0')}</span>
        <span>DDS DOMAIN {s.id}</span>
      </div>
      <div className="rm-card2-bot" aria-hidden="true">
        <RobotChar id={s.id} tone={ART_TONE[s.status]} size={132} />
        <span className="rm-pin-num">{s.id}</span>
        {live && <span className="rm-bot-ring" />}
      </div>
      <div className="rm-card2-body">
        <div className="rm-card-top">
          <h3 className="rm-codename">{s.codename}</h3>
          <span className={`rm-status ${s.status}`}>{live ? '● PLAYABLE' : '○ SOON'}</span>
        </div>
        <div className="rm-taglines">{s.tagline}</div>
        <div className="rm-detail rm-atk"><span className="rm-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m3 3 10 10M13 3 3 13M2 9l5 5M9 2l5 5" /></svg></span><div><b>Attack</b> {s.attack}</div></div>
        <div className="rm-detail rm-def"><span className="rm-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m8 2 5 2v4c0 3-5 6-5 6S3 11 3 8V4Z" /><path d="m5.5 7.5 1.7 1.7 3.3-3.4" /></svg></span><div><b>Defend</b> {s.defend}</div></div>
        <div className="rm-footer"><span className="rm-difficulty">{s.difficulty}</span>{live ? <span className="rm-enter">ENTER →</span> : <span className="rm-soon-txt">In development</span>}</div>
      </div>
    </button>
  )
}

export default function Roadmap() {
  const navigate = useNavigate()
  const acts = getActs()
  const enter = (s) => { if (s.status === 'live') navigate(`/scenario/${s.id}`) }

  return (
    <div className="range-layout">
      <a className="skip-link" href="#scenarios">Skip to scenarios</a>
      <header className="range-header">
        <div className="range-header-inner">
          <a className="range-brand" href="/" aria-label="NECROS home">
            <img className="range-brand-logo" src="/logo.png" alt="" />
            <span>NECROS<small>Attacking &amp; Defending ROS 2</small></span>
          </a>
          <nav className="range-navigation" aria-label="Range navigation">
            <a className="active" href="#scenarios">Scenarios</a>
            {acts.map((act) => <a key={act.key} href={`#${act.key}`}>{act.title}</a>)}
          </nav>
        </div>
      </header>

      <main className="roadmap" id="scenarios">
        <div className="range-intro">
          <div>
            <h1>Scenarios</h1>
            <p>Select a robot console to explore the attack and apply its defense.</p>
          </div>
          <span className="scenario-count">{acts.reduce((total, act) => total + act.scenarios.length, 0)} scenarios <span>·</span> {acts.length} modules</span>
        </div>

        {acts.map((act) => (
          <section className="rm-act" id={act.key} key={act.key} aria-labelledby={`title-${act.key}`}>
            <div className="rm-act-head">
              <div>
                <span className="rm-act-label">{act.label}</span>
                <h2 className="rm-act-title" id={`title-${act.key}`}>{act.title}</h2>
                <p className="rm-act-summary">{act.summary}</p>
              </div>
              <span className="module-total">{String(act.scenarios.length).padStart(2, '0')} scenarios</span>
            </div>
            <div className="rm-act-grid">{act.scenarios.map((s) => <ScenarioCard key={s.id} s={s} onEnter={enter} />)}</div>
          </section>
        ))}
        <footer className="rm-foot"><span>NECROS · ROS 2 Jazzy · DDS · SROS 2</span><span>Attacking &amp; Defending ROS 2</span></footer>
      </main>
    </div>
  )
}
