import React from 'react'

// Humanoid robot mascots — one expressive pose per scenario, theme-matched.
// Drawn as detailed vector characters (gradients + shading) so they read as
// polished game-style mascots, not flat icons. ~220px tall.

// Shared defs: dark, battle-worn gunmetal body keyed to a tone color. NECROS style —
// menacing machines, not cute mascots: charcoal plating, glowing visor, hazard accent.
function Defs({ id, tone }) {
  return (
    <defs>
      {/* mid-tone cold steel — dark enough to stay serious, light enough to read
          against the near-black page */}
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b97a8" />
        <stop offset="52%" stopColor="#5d6879" />
        <stop offset="100%" stopColor="#3a434f" />
      </linearGradient>
      <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={tone} />
        <stop offset="100%" stopColor={shade(tone)} />
      </linearGradient>
      {/* glowing visor — a hot core fading to black, reads as a hostile eye-slit */}
      <radialGradient id={`${id}-visor`} cx="0.5" cy="0.5" r="0.75">
        <stop offset="0%" stopColor={tone} stopOpacity="0.45" />
        <stop offset="45%" stopColor="#0a0e15" />
        <stop offset="100%" stopColor="#05080d" />
      </radialGradient>
      <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#000" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      {/* soft outer glow for eyes/accents */}
      <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}
function shade(hex) {
  // darken a hex color ~35%
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) * 0.65) | 0
  const g = Math.max(0, ((n >> 8) & 255) * 0.65) | 0
  const b = Math.max(0, (n & 255) * 0.65) | 0
  return `rgb(${r},${g},${b})`
}

// Dark stroke for the plating outlines (crisp silhouette on the dark page), and a
// darker seam line that reads against the mid-tone steel body.
const EDGE = '#10151c'
const PLATE_SEAM = '#2b333e'
const DARKPLATE = '#454f5d'  // brow / neck / recessed plates

// Shared body parts (legs, torso, neck) so each pose only customizes arms + head.
function Legs({ b, a }) {
  return (
    <g fill={b} stroke={EDGE} strokeWidth="1.5">
      <rect x="82" y="150" width="15" height="46" rx="6" />
      <rect x="103" y="150" width="15" height="46" rx="6" />
      {/* worn hazard-striped feet */}
      <rect x="79" y="190" width="21" height="12" rx="3" fill={a} />
      <rect x="100" y="190" width="21" height="12" rx="3" fill={a} />
      {/* knee seams */}
      <line x1="82" y1="172" x2="97" y2="172" stroke={PLATE_SEAM} strokeWidth="1" />
      <line x1="103" y1="172" x2="118" y2="172" stroke={PLATE_SEAM} strokeWidth="1" />
    </g>
  )
}
function Torso({ id, b, a, tone, chest }) {
  return (
    <>
      <rect x="66" y="92" width="68" height="64" rx="12" fill={b} stroke={EDGE} strokeWidth="1.5" />
      {/* plate seams / worn paneling */}
      <line x1="66" y1="118" x2="134" y2="118" stroke={PLATE_SEAM} strokeWidth="1" opacity="0.8" />
      <line x1="100" y1="92" x2="100" y2="108" stroke={PLATE_SEAM} strokeWidth="1" opacity="0.6" />
      {/* reactor/core window with a hot accent core */}
      <rect x="83" y="108" width="34" height="30" rx="4" fill="#07090e" stroke={a} strokeWidth="1.5" />
      <rect x="83" y="108" width="34" height="30" rx="4" fill={`url(#${id}-visor)`} opacity="0.7" />
      {chest}
      {/* neck */}
      <rect x="92" y="80" width="16" height="14" rx="3" fill="" stroke={EDGE} strokeWidth="1" />
    </>
  )
}
function Head({ id, b, tone, eyes, antenna = true }) {
  return (
    <>
      <rect x="74" y="42" width="52" height="42" rx="11" fill={b} stroke={EDGE} strokeWidth="1.5" />
      {/* brow plate for a heavier, grimmer look */}
      <rect x="74" y="42" width="52" height="9" rx="4" fill="#454f5d" stroke={EDGE} strokeWidth="1" />
      {/* recessed visor slit */}
      <rect x="79" y="54" width="42" height="20" rx="7" fill={`url(#${id}-visor)`} stroke={EDGE} strokeWidth="1" />
      {eyes}
      {antenna && <>
        <line x1="100" y1="42" x2="100" y2="31" stroke="#454f5d" strokeWidth="2.5" />
        <circle cx="100" cy="28" r="3.2" fill={tone} filter={`url(#${id}-glow)`} />
      </>}
    </>
  )
}
// Menacing glowing slit-eyes (hostile machine stare), colored by the scenario tone.
const normalEyes = (id, tone) => (
  <g filter={`url(#${id}-glow)`}>
    <rect x="86" y="61" width="12" height="5" rx="2.5" fill={tone} />
    <rect x="102" y="61" width="12" height="5" rx="2.5" fill={tone} />
  </g>
)

// Scenario 1 — "Open Bus": arms wrenched up like a puppet on strings — exposed,
// no will of its own. Strings descend from above; the stance is helpless, not happy.
function OpenBusBot({ id, tone }) {
  const b = `url(#${id}-body)`, a = `url(#${id}-accent)`
  return (
    <g>
      <ellipse cx="100" cy="212" rx="54" ry="10" fill={`url(#${id}-shadow)`} />
      {/* puppet strings pulling the arms up */}
      <g stroke="#3a434f" strokeWidth="1" opacity="0.7">
        <line x1="40" y1="78" x2="30" y2="20" />
        <line x1="160" y1="78" x2="170" y2="20" />
      </g>
      <Legs b={b} a={a} />
      <g fill={b} stroke={EDGE} strokeWidth="1.5">
        <rect x="40" y="92" width="34" height="12" rx="5" transform="rotate(-30 57 98)" />
        <rect x="126" y="92" width="34" height="12" rx="5" transform="rotate(30 143 98)" />
        <circle cx="38" cy="78" r="8" fill={a} stroke={EDGE} />
        <circle cx="162" cy="78" r="8" fill={a} stroke={EDGE} />
      </g>
      <Torso id={id} b={b} a={a} tone={tone}
        chest={<path d="M93 122 h14 M100 115 v14" stroke={tone} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />} />
      <Head id={id} b={b} tone={tone} eyes={normalEyes(id, tone)} />
    </g>
  )
}

// Scenario 2 — "Blind Navigator": a dead/blinded visor (X-slashed) and clenched
// hands clamped to the head — sensor-spoofed, navigating blind. Grim, not cutesy.
function BlindBot({ id, tone }) {
  const b = `url(#${id}-body)`, a = `url(#${id}-accent)`
  return (
    <g>
      <ellipse cx="100" cy="212" rx="54" ry="10" fill={`url(#${id}-shadow)`} />
      <Legs b={b} a={a} />
      {/* arms raised, gripping the head */}
      <g fill={b} stroke={EDGE} strokeWidth="1.5">
        <rect x="60" y="68" width="12" height="36" rx="5" transform="rotate(-40 66 86)" />
        <rect x="128" y="68" width="12" height="36" rx="5" transform="rotate(40 134 86)" />
      </g>
      <Torso id={id} b={b} a={a} tone={tone}
        chest={<path d="M90 126 q10 8 20 0" stroke={tone} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />} />
      <Head id={id} b={b} tone={tone} eyes={
        // dead visor: a dim X where the stare should be (blinded)
        <g stroke="#6b7280" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <line x1="88" y1="59" x2="98" y2="69" /><line x1="98" y1="59" x2="88" y2="69" />
          <line x1="102" y1="59" x2="112" y2="69" /><line x1="112" y1="59" x2="102" y2="69" />
        </g>
      } />
      {/* clenched hands gripping the sides of the head */}
      <rect x="70" y="54" width="13" height="14" rx="3" fill={a} stroke={EDGE} strokeWidth="1.5" />
      <rect x="117" y="54" width="13" height="14" rx="3" fill={a} stroke={EDGE} strokeWidth="1.5" />
      {/* ghost/false reading glyph above — being fed a lie */}
      <text x="142" y="46" fontSize="20" fontWeight="bold" fill={tone} fontFamily="monospace" opacity="0.85">!?</text>
    </g>
  )
}

// Scenario 3 — "Rogue Coordinator": a menacing impostor. A commanding, pointing arm
// (issuing illegitimate orders), hostile red eyes, and a skull sigil on the chest.
function RogueBot({ id, tone }) {
  const b = `url(#${id}-body)`, a = `url(#${id}-accent)`
  const danger = '#ff3b52'
  return (
    <g>
      <ellipse cx="100" cy="212" rx="54" ry="10" fill={`url(#${id}-shadow)`} />
      <Legs b={b} a={a} />
      {/* left arm down; right arm extended, commanding */}
      <g fill={b} stroke={EDGE} strokeWidth="1.5">
        <rect x="52" y="96" width="15" height="32" rx="6" />
        <rect x="128" y="100" width="42" height="12" rx="5" />
        {/* pointing hand */}
        <circle cx="174" cy="106" r="7" fill={danger} stroke={EDGE} />
      </g>
      {/* command beam from the hand */}
      <path d="M181 106 h14" stroke={danger} strokeWidth="2" strokeDasharray="3 3" opacity="0.8" />
      <Torso id={id} b={b} a={a} tone={tone}
        chest={
          // skull sigil — the impostor's mark
          <g transform="translate(100 122)" fill={danger} opacity="0.9">
            <circle cx="0" cy="-2" r="6.5" />
            <rect x="-5" y="2" width="10" height="4" rx="1" />
            <circle cx="-2.4" cy="-2.5" r="1.6" fill="#07090e" />
            <circle cx="2.4" cy="-2.5" r="1.6" fill="#07090e" />
          </g>
        } />
      <Head id={id} b={b} tone={tone} eyes={
        // hostile red stare (overrides tone — this one is the threat)
        <g filter={`url(#${id}-glow)`}>
          <rect x="86" y="60" width="12" height="6" rx="3" fill={danger} transform="rotate(8 92 63)" />
          <rect x="102" y="60" width="12" height="6" rx="3" fill={danger} transform="rotate(-8 108 63)" />
        </g>
      } />
    </g>
  )
}

// Scenario 4 — "Ghost Convoy": a spectral double. A faded duplicate steps out of the
// solid body (replayed telemetry) — the real robot and its ghost, same machine.
function GhostBot({ id, tone }) {
  const b = `url(#${id}-body)`, a = `url(#${id}-accent)`
  return (
    <g>
      <ellipse cx="100" cy="212" rx="54" ry="10" fill={`url(#${id}-shadow)`} />
      {/* ghost double offset behind, translucent — the replayed copy */}
      <g opacity="0.3" transform="translate(22 0)">
        <g fill="#2b323c" stroke="#3a434f" strokeWidth="1.2">
          <rect x="82" y="150" width="15" height="46" rx="6" />
          <rect x="103" y="150" width="15" height="46" rx="6" />
          <rect x="66" y="92" width="68" height="64" rx="12" />
          <rect x="52" y="98" width="15" height="30" rx="6" />
          <rect x="133" y="98" width="15" height="30" rx="6" />
          <rect x="74" y="42" width="52" height="42" rx="11" />
        </g>
        <rect x="86" y="61" width="12" height="5" rx="2.5" fill={tone} />
        <rect x="102" y="61" width="12" height="5" rx="2.5" fill={tone} />
      </g>
      {/* the real, solid robot */}
      <Legs b={b} a={a} />
      <g fill={b} stroke={EDGE} strokeWidth="1.5">
        <rect x="52" y="98" width="15" height="30" rx="6" />
        <rect x="133" y="98" width="15" height="30" rx="6" />
      </g>
      <Torso id={id} b={b} a={a} tone={tone}
        chest={
          // replay glyph: two offset arrows looping
          <g transform="translate(100 123)" stroke={tone} strokeWidth="2" fill="none" opacity="0.85" strokeLinecap="round">
            <path d="M-6 -3 a6 6 0 1 1 -1 7" /><path d="M-7 1 l0 4 4 0" />
          </g>
        } />
      <Head id={id} b={b} tone={tone} eyes={normalEyes(id, tone)} />
    </g>
  )
}

const CHARS = { 1: OpenBusBot, 2: BlindBot, 3: RogueBot, 4: GhostBot }

export default function RobotChar({ id, tone = '#38bdf8', size = 220 }) {
  const Char = CHARS[id] || OpenBusBot
  const uid = `rc${id}`
  return (
    <svg className="robotchar" viewBox="0 0 200 224" width={size} height={size * 1.12} aria-hidden>
      <Defs id={uid} tone={tone} />
      {/* wrapper lets the whole bot idle-bob via CSS */}
      <g className="rc-body">
        <Char id={uid} tone={tone} />
      </g>
    </svg>
  )
}
