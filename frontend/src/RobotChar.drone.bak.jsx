import React from 'react'

// NECROS card creatures — SKULL-FACED ATTACK DRONES, one menacing variant per
// scenario. A hovering quadrotor with a central death's-head sensor pod, angled
// rotor booms with blades, neon underglow. Reads as a hostile UAV, not a mascot.
//
// Same public interface: <RobotChar id tone size />. Alternatives are kept at
// RobotChar.humanoid.bak.jsx and RobotChar.spider.bak.jsx — restore by copying over.
//
// Coordinate space: viewBox 0 0 200 224, drone body centred ~ (100, 108).

const DANGER = '#ff3b52'

function shade(hex, k = 0.55) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) * k) | 0
  const g = Math.max(0, ((n >> 8) & 255) * k) | 0
  const b = Math.max(0, (n & 255) * k) | 0
  return `rgb(${r},${g},${b})`
}

const EDGE = '#0c0f15'

function Defs({ id, tone }) {
  return (
    <defs>
      <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6b7686" />
        <stop offset="48%" stopColor="#3b4450" />
        <stop offset="100%" stopColor="#1c222b" />
      </linearGradient>
      <radialGradient id={`${id}-core`} cx="0.5" cy="0.4" r="0.7">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor={tone} />
        <stop offset="100%" stopColor={shade(tone, 0.35)} />
      </radialGradient>
      <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}

// One rotor boom with a spinning blade disc. (cx,cy) = rotor hub.
function Rotor({ cx, cy, bx, by, neon, spin = true }) {
  return (
    <g>
      {/* boom from body to rotor hub */}
      <line x1={bx} y1={by} x2={cx} y2={cy} stroke={EDGE} strokeWidth="7" strokeLinecap="round" />
      <line x1={bx} y1={by} x2={cx} y2={cy} stroke="#434e5f" strokeWidth="4" strokeLinecap="round" />
      {/* motor housing */}
      <circle cx={cx} cy={cy} r="7" fill="#2b323d" stroke={EDGE} strokeWidth="1.5" />
      {/* blade disc (CSS-spun) */}
      <g className={spin ? 'rc-rotor' : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <ellipse cx={cx} cy={cy} rx="22" ry="4" fill={neon} opacity="0.22" />
        <ellipse cx={cx} cy={cy} rx="4" ry="22" fill={neon} opacity="0.22" />
        <line x1={cx - 22} y1={cy} x2={cx + 22} y2={cy} stroke={neon} strokeWidth="1.5" opacity="0.6" />
      </g>
      <circle cx={cx} cy={cy} r="2.3" fill={neon} />
    </g>
  )
}

// Shared drone frame: 4 rotors + central body shell + underglow. The FACE is passed
// in (a skull sensor pod), so each scenario customizes only the face + accents.
function Drone({ id, tone, face, neon = tone, underglow = tone, extras }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      <ellipse cx="100" cy="200" rx="54" ry="10" fill={`url(#${id}-shadow)`} />
      {/* rotor booms (X config) */}
      <Rotor cx={44} cy={74} bx={78} by={100} neon={neon} />
      <Rotor cx={156} cy={74} bx={122} by={100} neon={neon} />
      <Rotor cx={40} cy={132} bx={78} by={120} neon={neon} />
      <Rotor cx={160} cy={132} bx={122} by={120} neon={neon} />
      {/* central fuselage — a downward-tapering hex pod */}
      <path d="M100 86 L130 102 L124 140 Q100 156 76 140 L70 102 Z"
        fill={shell} stroke={EDGE} strokeWidth="2.2" />
      {/* side vents */}
      <path d="M78 112 h10 M78 120 h10" stroke="#434e5f" strokeWidth="2" />
      <path d="M122 112 h-10 M122 120 h-10" stroke="#434e5f" strokeWidth="2" />
      {/* the skull face sensor pod */}
      {face}
      {/* neon underglow bar */}
      <g filter={`url(#${id}-glow)`}>
        <ellipse cx="100" cy="150" rx="22" ry="3.5" fill={underglow} opacity="0.7" />
      </g>
      {extras}
    </g>
  )
}

// The core skull face: cranium + two glowing eye sockets + nasal + teeth.
function SkullFace({ id, tone, eyeFill, dead = false }) {
  const ef = eyeFill || `url(#${id}-core)`
  return (
    <g>
      {/* cranium plate */}
      <path d="M100 92 Q118 94 118 112 Q118 126 110 132 L90 132 Q82 126 82 112 Q82 94 100 92 Z"
        fill="#e7ecf3" stroke={EDGE} strokeWidth="1.5" opacity="0.92" />
      {/* eye sockets */}
      {dead ? (
        <g stroke="#6b7280" strokeWidth="3" strokeLinecap="round">
          <line x1="88" y1="108" x2="97" y2="117" /><line x1="97" y1="108" x2="88" y2="117" />
          <line x1="103" y1="108" x2="112" y2="117" /><line x1="112" y1="108" x2="103" y2="117" />
        </g>
      ) : (
        <g filter={`url(#${id}-glow)`}>
          <path d="M86 106 q6 -5 12 0 q-2 10 -6 11 q-6 -1 -6 -11 z" fill={ef} />
          <path d="M114 106 q-6 -5 -12 0 q2 10 6 11 q6 -1 6 -11 z" fill={ef} />
        </g>
      )}
      {/* nasal cavity */}
      <path d="M100 118 l-3 7 6 0 z" fill="#0b0f16" />
      {/* teeth */}
      <g fill="#0b0f16">
        <rect x="90" y="128" width="2.6" height="6" />
        <rect x="95" y="128" width="2.6" height="7" />
        <rect x="100" y="128" width="2.6" height="7" />
        <rect x="105" y="128" width="2.6" height="6" />
      </g>
    </g>
  )
}

// ---- Scenario 1 "Open Bus": antennae wide, a broadcast ping — wide-open bus. ----
function DroneOpenBus({ id, tone }) {
  return (
    <Drone id={id} tone={tone} face={<SkullFace id={id} tone={tone} />}
      extras={
        <g filter={`url(#${id}-glow)`} opacity="0.8">
          {/* open broadcast rings from the pod */}
          <path d="M70 100 q-10 8 0 40" fill="none" stroke={tone} strokeWidth="1.6" />
          <path d="M130 100 q10 8 0 40" fill="none" stroke={tone} strokeWidth="1.6" />
        </g>
      } />
  )
}

// ---- Scenario 2 "Blind Navigator": dead eyes (X), a lost ping — blinded. ----
function DroneBlind({ id, tone }) {
  return (
    <Drone id={id} tone={tone} underglow="#4a5566"
      face={<SkullFace id={id} tone={tone} dead />}
      extras={<text x="138" y="96" fontSize="18" fontWeight="bold" fill={tone} fontFamily="monospace" opacity="0.85">?</text>} />
  )
}

// ---- Scenario 3 "Rogue Coordinator": red hostile skull, command horns — the alpha. ----
function DroneRogue({ id, tone }) {
  const d = DANGER
  return (
    <Drone id={id} tone={tone} neon={d} underglow={d}
      face={<SkullFace id={id} tone={tone} eyeFill={d} />}
      extras={
        <g filter={`url(#${id}-glow)`}>
          {/* command horns on the cranium */}
          <path d="M86 94 l-6 -12 10 6 z" fill={d} />
          <path d="M114 94 l6 -12 -10 6 z" fill={d} />
          {/* command beam downward */}
          <path d="M100 150 v16" stroke={d} strokeWidth="2" strokeDasharray="3 3" opacity="0.8" />
        </g>
      } />
  )
}

// ---- Scenario 4 "Ghost Convoy": a phantom duplicate drone — replayed. ----
function DroneGhost({ id, tone }) {
  return (
    <g>
      {/* ghost double behind, translucent */}
      <g opacity="0.26" transform="translate(24 -6)">
        <path d="M100 86 L130 102 L124 140 Q100 156 76 140 L70 102 Z"
          fill="#2b323d" stroke="#3a434f" strokeWidth="2" />
        <path d="M100 92 Q118 94 118 112 Q118 126 110 132 L90 132 Q82 126 82 112 Q82 94 100 92 Z"
          fill="#aeb7c4" stroke="#3a434f" strokeWidth="1.2" />
        <circle cx="44" cy="74" r="6" fill="none" stroke={tone} strokeWidth="1.5" />
        <circle cx="156" cy="74" r="6" fill="none" stroke={tone} strokeWidth="1.5" />
      </g>
      {/* real drone */}
      <Drone id={id} tone={tone} face={<SkullFace id={id} tone={tone} />}
        extras={
          <g transform="translate(100 146)" stroke={tone} strokeWidth="2" fill="none" opacity="0.85" strokeLinecap="round">
            <path d="M-6 -3 a6 6 0 1 1 -1 7" /><path d="M-7 1 l0 4 4 0" />
          </g>
        } />
    </g>
  )
}

const CHARS = { 1: DroneOpenBus, 2: DroneBlind, 3: DroneRogue, 4: DroneGhost }

export default function RobotChar({ id, tone = '#38bdf8', size = 220 }) {
  const Char = CHARS[id] || DroneOpenBus
  const uid = `rc${id}`
  return (
    <svg className="robotchar" viewBox="0 0 200 224" width={size} height={size * 1.12} aria-hidden>
      <Defs id={uid} tone={tone} />
      <g className="rc-body">
        <Char id={uid} tone={tone} />
      </g>
    </svg>
  )
}
