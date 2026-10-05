import React from 'react'

// NECROS card creatures — low-poly NEON ROBOTIC SPIDERS, one menacing variant per
// scenario. Dark metal chassis, angular segmented legs, a glowing hex sensor eye,
// neon rim accents. Designed to read as a predator on a dark card, not a mascot.
//
// Same public interface as before: <RobotChar id tone size />. The humanoid version
// is kept at RobotChar.humanoid.bak.jsx — restore by copying it over this file.
//
// Coordinate space: viewBox 0 0 200 224, body centred ~ (100, 120).

const DANGER = '#ff3b52'

function shade(hex, k = 0.6) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) * k) | 0
  const g = Math.max(0, ((n >> 8) & 255) * k) | 0
  const b = Math.max(0, (n & 255) * k) | 0
  return `rgb(${r},${g},${b})`
}

function Defs({ id, tone }) {
  return (
    <defs>
      {/* dark metal carapace */}
      <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6b7686" />
        <stop offset="45%" stopColor="#3b4450" />
        <stop offset="100%" stopColor="#1c222b" />
      </linearGradient>
      {/* glowing sensor eye */}
      <radialGradient id={`${id}-eye`} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="35%" stopColor={tone} />
        <stop offset="100%" stopColor={shade(tone, 0.4)} />
      </radialGradient>
      <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#000" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}

const EDGE = '#0c0f15'

// One angular, segmented leg. Origin at the body attach point; `dir` = -1 left / +1
// right; `spread`/`drop` shape the knee + foot; `glow` tints the neon joints.
function Leg({ ox, oy, dir, reach = 42, lift = 26, drop = 30, neon }) {
  const kneeX = ox + dir * reach * 0.55
  const kneeY = oy - lift
  const footX = ox + dir * reach
  const footY = oy + drop
  return (
    <g>
      {/* upper + lower segments */}
      <polyline points={`${ox},${oy} ${kneeX},${kneeY} ${footX},${footY}`}
        fill="none" stroke={EDGE} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${ox},${oy} ${kneeX},${kneeY} ${footX},${footY}`}
        fill="none" stroke="#3a4453" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* neon joint at the knee + a tip spark at the foot */}
      <circle cx={kneeX} cy={kneeY} r="3" fill={neon} />
      <circle cx={footX} cy={footY} r="2.2" fill={neon} opacity="0.9" />
    </g>
  )
}

// The shared body: carapace (two chevron plates), hex sensor eye, neon spine.
function Body({ id, tone, eye, mark, neon = tone }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      {/* abdomen (rear, lower) */}
      <path d="M100 150 q34 2 30 34 q-30 20 -60 0 q-4 -32 30 -34 z"
        fill={shell} stroke={EDGE} strokeWidth="2" />
      <path d="M100 156 q20 2 18 22" fill="none" stroke={neon} strokeWidth="1.5" opacity="0.5" />
      {/* cephalothorax (front, main plate) */}
      <path d="M100 96 L132 112 L126 150 Q100 162 74 150 L68 112 Z"
        fill={shell} stroke={EDGE} strokeWidth="2.2" />
      {/* plate chevrons */}
      <path d="M78 118 L100 126 L122 118" fill="none" stroke="#434e5f" strokeWidth="2" />
      <path d="M82 134 L100 140 L118 134" fill="none" stroke="#434e5f" strokeWidth="1.6" opacity="0.8" />
      {/* two forward mandible fangs */}
      <path d="M90 158 l-5 12 6 -3 z" fill="#3a4453" stroke={EDGE} strokeWidth="1" />
      <path d="M110 158 l5 12 -6 -3 z" fill="#3a4453" stroke={EDGE} strokeWidth="1" />
      {/* hex sensor eye housing */}
      <g>
        <path d="M100 100 L116 110 L116 128 L100 138 L84 128 L84 110 Z"
          fill="#07090e" stroke={neon} strokeWidth="2" />
        {eye}
      </g>
      {mark}
    </g>
  )
}

// Standard glowing hex eye (the predator's stare).
const hexEye = (id, tone) => (
  <g filter={`url(#${id}-glow)`}>
    <path d="M100 106 L111 113 L111 125 L100 132 L89 125 L89 113 Z" fill={`url(#${id}-eye)`} />
    {/* small secondary ocelli */}
    <circle cx="92" cy="121" r="1.6" fill={tone} />
    <circle cx="108" cy="121" r="1.6" fill={tone} />
  </g>
)

// ---- Scenario 1 "Open Bus": legs wrenched outward, puppet strings — hijacked. ----
function SpiderOpenBus({ id, tone }) {
  return (
    <g>
      <ellipse cx="100" cy="206" rx="62" ry="11" fill={`url(#${id}-shadow)`} />
      {/* puppet strings from above */}
      <g stroke="#3a434f" strokeWidth="1" opacity="0.55">
        <line x1="150" y1="118" x2="168" y2="24" />
        <line x1="50" y1="118" x2="32" y2="24" />
      </g>
      {/* legs splayed wide (over-extended / not in control) */}
      <Leg ox={78} oy={118} dir={-1} reach={56} lift={34} drop={40} neon={tone} />
      <Leg ox={76} oy={128} dir={-1} reach={58} lift={10} drop={54} neon={tone} />
      <Leg ox={122} oy={118} dir={1} reach={56} lift={34} drop={40} neon={tone} />
      <Leg ox={124} oy={128} dir={1} reach={58} lift={10} drop={54} neon={tone} />
      <Leg ox={82} oy={112} dir={-1} reach={44} lift={44} drop={20} neon={tone} />
      <Leg ox={118} oy={112} dir={1} reach={44} lift={44} drop={20} neon={tone} />
      <Body id={id} tone={tone} eye={hexEye(id, tone)}
        mark={<path d="M93 126 h14 M100 119 v14" stroke={tone} strokeWidth="2" strokeLinecap="round" opacity="0.8" />} />
    </g>
  )
}

// ---- Scenario 2 "Blind Navigator": dead eye (X), legs groping — blinded. ----
function SpiderBlind({ id, tone }) {
  return (
    <g>
      <ellipse cx="100" cy="206" rx="60" ry="11" fill={`url(#${id}-shadow)`} />
      {/* front legs raised / feeling the air, rear legs planted */}
      <Leg ox={80} oy={110} dir={-1} reach={46} lift={48} drop={6} neon={tone} />
      <Leg ox={78} oy={122} dir={-1} reach={52} lift={18} drop={48} neon={tone} />
      <Leg ox={120} oy={110} dir={1} reach={46} lift={48} drop={6} neon={tone} />
      <Leg ox={122} oy={122} dir={1} reach={52} lift={18} drop={48} neon={tone} />
      <Leg ox={84} oy={116} dir={-1} reach={40} lift={30} drop={34} neon={tone} />
      <Leg ox={116} oy={116} dir={1} reach={40} lift={30} drop={34} neon={tone} />
      <Body id={id} tone={tone} neon={tone} eye={
        // dead/blinded hex eye: dim housing with an X
        <g>
          <path d="M100 106 L111 113 L111 125 L100 132 L89 125 L89 113 Z" fill="#11161d" />
          <g stroke="#6b7280" strokeWidth="3" strokeLinecap="round">
            <line x1="92" y1="114" x2="108" y2="126" /><line x1="108" y1="114" x2="92" y2="126" />
          </g>
        </g>
      } mark={<text x="134" y="104" fontSize="18" fontWeight="bold" fill={tone} fontFamily="monospace" opacity="0.85">?</text>} />
    </g>
  )
}

// ---- Scenario 3 "Rogue Coordinator": the red ALPHA — bigger, aggressive, skull. ----
function SpiderRogue({ id, tone }) {
  const d = DANGER
  return (
    <g>
      <ellipse cx="100" cy="206" rx="66" ry="12" fill={`url(#${id}-shadow)`} />
      {/* aggressive forward-reaching stance, red neon joints */}
      <Leg ox={78} oy={116} dir={-1} reach={60} lift={40} drop={34} neon={d} />
      <Leg ox={76} oy={128} dir={-1} reach={62} lift={14} drop={50} neon={d} />
      <Leg ox={122} oy={116} dir={1} reach={60} lift={40} drop={34} neon={d} />
      <Leg ox={124} oy={128} dir={1} reach={62} lift={14} drop={50} neon={d} />
      <Leg ox={84} oy={110} dir={-1} reach={50} lift={50} drop={14} neon={d} />
      <Leg ox={116} oy={110} dir={1} reach={50} lift={50} drop={14} neon={d} />
      <Body id={id} tone={tone} neon={d} eye={
        <g filter={`url(#${id}-glow)`}>
          <path d="M100 106 L111 113 L111 125 L100 132 L89 125 L89 113 Z" fill={d} />
          {/* skull sockets in the eye */}
          <circle cx="95" cy="118" r="2.2" fill="#07090e" />
          <circle cx="105" cy="118" r="2.2" fill="#07090e" />
          <rect x="97" y="124" width="6" height="3" rx="1" fill="#07090e" />
        </g>
      } mark={
        // crown of command spikes on the carapace
        <g stroke={d} strokeWidth="2" fill={d} opacity="0.9">
          <path d="M86 100 l4 -10 4 10 z" /><path d="M100 98 l4 -12 4 12 z" transform="translate(-4 0)" />
          <path d="M110 100 l4 -10 4 10 z" />
        </g>
      } />
    </g>
  )
}

// ---- Scenario 4 "Ghost Convoy": a translucent double skitters out — replay. ----
function SpiderGhost({ id, tone }) {
  return (
    <g>
      <ellipse cx="100" cy="206" rx="60" ry="11" fill={`url(#${id}-shadow)`} />
      {/* ghost double, offset + translucent */}
      <g opacity="0.28" transform="translate(26 -4)">
        <Leg ox={78} oy={118} dir={-1} reach={52} lift={30} drop={40} neon={tone} />
        <Leg ox={122} oy={118} dir={1} reach={52} lift={30} drop={40} neon={tone} />
        <Leg ox={82} oy={126} dir={-1} reach={48} lift={14} drop={48} neon={tone} />
        <Leg ox={118} oy={126} dir={1} reach={48} lift={14} drop={48} neon={tone} />
        <path d="M100 96 L132 112 L126 150 Q100 162 74 150 L68 112 Z"
          fill="#2b323d" stroke="#3a434f" strokeWidth="2" />
        <path d="M100 100 L116 110 L116 128 L100 138 L84 128 L84 110 Z" fill="#11161d" stroke={tone} strokeWidth="1.5" />
      </g>
      {/* the real spider */}
      <Leg ox={78} oy={118} dir={-1} reach={52} lift={32} drop={40} neon={tone} />
      <Leg ox={76} oy={128} dir={-1} reach={54} lift={12} drop={52} neon={tone} />
      <Leg ox={122} oy={118} dir={1} reach={52} lift={32} drop={40} neon={tone} />
      <Leg ox={124} oy={128} dir={1} reach={54} lift={12} drop={52} neon={tone} />
      <Leg ox={84} oy={112} dir={-1} reach={44} lift={44} drop={20} neon={tone} />
      <Leg ox={116} oy={112} dir={1} reach={44} lift={44} drop={20} neon={tone} />
      <Body id={id} tone={tone} eye={hexEye(id, tone)}
        mark={
          // replay loop glyph
          <g transform="translate(100 124)" stroke={tone} strokeWidth="2" fill="none" opacity="0.85" strokeLinecap="round">
            <path d="M-6 -3 a6 6 0 1 1 -1 7" /><path d="M-7 1 l0 4 4 0" />
          </g>
        } />
    </g>
  )
}

const CHARS = { 1: SpiderOpenBus, 2: SpiderBlind, 3: SpiderRogue, 4: SpiderGhost }

export default function RobotChar({ id, tone = '#38bdf8', size = 220 }) {
  const Char = CHARS[id] || SpiderOpenBus
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
