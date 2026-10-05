import React from 'react'

// Stylized SVG "environment" art shown inside each map pin. Kept simple and
// readable at small size (pins are ~70px). One per scenario theme.
// Swappable later for a real 3D render if desired.

// Scenario 1 — warehouse: shelf racks + two AMRs on an aisle floor.
function Warehouse({ tone = '#38bdf8' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      {/* floor perspective lines */}
      <path d="M0 70 L100 70 M0 82 L100 82 M0 94 L100 94" stroke="#1b2c46" strokeWidth="1.5" />
      <path d="M20 60 L5 100 M50 60 L50 100 M80 60 L95 100" stroke="#16263c" strokeWidth="1.5" />
      {/* shelf racks */}
      <g fill="#2b3f63" stroke="#4a6294" strokeWidth="1">
        <rect x="10" y="20" width="34" height="12" rx="1" />
        <rect x="10" y="36" width="34" height="12" rx="1" />
        <rect x="58" y="20" width="32" height="12" rx="1" />
        <rect x="58" y="36" width="32" height="12" rx="1" />
      </g>
      {/* pallets */}
      <g fill="#b9852f">
        <rect x="14" y="23" width="12" height="6" /><rect x="30" y="23" width="10" height="6" />
        <rect x="62" y="39" width="12" height="6" />
      </g>
      {/* two AMRs */}
      <g>
        <rect x="30" y="74" width="14" height="9" rx="2" fill={tone} />
        <circle cx="33" cy="84" r="2" fill="#0b1420" /><circle cx="41" cy="84" r="2" fill="#0b1420" />
        <rect x="64" y="86" width="14" height="9" rx="2" fill="#c084fc" />
        <circle cx="67" cy="96" r="2" fill="#0b1420" /><circle cx="75" cy="96" r="2" fill="#0b1420" />
      </g>
    </g>
  )
}

// Scenario 2 — sensor spoofing: a robot with fake LIDAR rays / ghost obstacle.
function SensorSpoof({ tone = '#38bdf8' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      <path d="M0 78 L100 78 M0 90 L100 90" stroke="#1b2c46" strokeWidth="1.5" />
      {/* robot */}
      <rect x="20" y="58" width="18" height="12" rx="2" fill={tone} />
      <circle cx="24" cy="71" r="2.5" fill="#0b1420" /><circle cx="34" cy="71" r="2.5" fill="#0b1420" />
      {/* real scan arc */}
      <path d="M38 64 L78 50 M38 64 L80 64 M38 64 L78 78" stroke={tone} strokeWidth="1.2" opacity="0.5" />
      {/* spoofed ghost obstacle (red) */}
      <rect x="66" y="40" width="16" height="16" rx="2" fill="none" stroke="#ff3b52" strokeWidth="2" strokeDasharray="3 2" />
      <text x="74" y="34" fontSize="9" fill="#ff3b52" textAnchor="middle" fontFamily="monospace">!</text>
    </g>
  )
}

// Scenario 3 — SROS2 misconfig: a shield with a crack / broken lock.
// Scenario 3 — rogue coordinator: a central command node issuing lines to robots,
// one line hijacked (red) by an impersonating node.
function RogueCoordinator({ tone = '#fbbf24' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      {/* command lines from the centre coordinator to three robots */}
      <path d="M50 34 L24 70" stroke={tone} strokeWidth="1.6" strokeDasharray="3 2" opacity="0.7" />
      <path d="M50 34 L50 74" stroke={tone} strokeWidth="1.6" strokeDasharray="3 2" opacity="0.7" />
      {/* one hijacked line (red) from a rogue source */}
      <path d="M84 20 L76 70" stroke="#ff3b52" strokeWidth="2" strokeDasharray="3 2" />
      {/* central (legit) coordinator */}
      <circle cx="50" cy="30" r="9" fill="#16263c" stroke={tone} strokeWidth="2.5" />
      <circle cx="50" cy="30" r="3" fill={tone} />
      {/* rogue coordinator node (skull-ish) top-right */}
      <circle cx="84" cy="16" r="7" fill="#2a1414" stroke="#ff3b52" strokeWidth="2" />
      <text x="84" y="19.5" fontSize="8" fill="#ff3b52" textAnchor="middle" fontFamily="monospace">☠</text>
      {/* robots */}
      {[[24,74],[50,78],[76,74]].map(([x,y],i)=>(
        <rect key={i} x={x-6} y={y-4} width="12" height="8" rx="2"
          fill={i===2 ? '#ff3b52' : tone} />
      ))}
    </g>
  )
}

// Scenario 4 — ghost convoy: the real robot has driven on, but a frozen "ghost"
// copy (the replayed telemetry) remains behind at the depot where the operator
// still thinks it is. Replay waves echo from the ghost.
function GhostConvoy({ tone = '#38bdf8' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      <path d="M0 74 L100 74 M0 86 L100 86" stroke="#1b2c46" strokeWidth="1.5" />
      {/* depot marker where the operator believes the robot still is */}
      <rect x="18" y="58" width="22" height="22" rx="2" fill="none" stroke="#3a5278" strokeDasharray="3 2" />
      {/* ghost (replayed) robot — frozen at the depot, translucent */}
      <g opacity="0.45">
        <rect x="22" y="62" width="14" height="9" rx="2" fill="#8a93a8" />
        <circle cx="25" cy="72" r="2" fill="#0b1420" /><circle cx="33" cy="72" r="2" fill="#0b1420" />
      </g>
      {/* replay echo waves from the ghost */}
      <path d="M40 66 q8 -6 0 -12 M44 66 q13 -9 0 -20" fill="none" stroke="#c084fc" strokeWidth="1.3" opacity="0.6" />
      {/* the REAL robot — has actually driven away down the route */}
      <g>
        <rect x="66" y="40" width="14" height="9" rx="2" fill={tone} />
        <circle cx="69" cy="50" r="2" fill="#0b1420" /><circle cx="77" cy="50" r="2" fill="#0b1420" />
      </g>
      {/* motion trail of the real robot leaving the ghost behind */}
      <path d="M38 67 L66 46" stroke={tone} strokeWidth="1.3" strokeDasharray="2 3" opacity="0.7" />
      <text x="73" y="35" fontSize="8" fill={tone} textAnchor="middle" fontFamily="monospace">real</text>
      <text x="29" y="55" fontSize="8" fill="#8a93a8" textAnchor="middle" fontFamily="monospace">ghost</text>
    </g>
  )
}

// Scenario 5 — denial of control: a robot gone dark, a big power/standby symbol.
function DeadSwitch({ tone = '#38bdf8' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      <path d="M0 80 L100 80" stroke="#1b2c46" strokeWidth="1.5" />
      {/* powered-down robot */}
      <g opacity="0.6">
        <rect x="30" y="58" width="22" height="14" rx="3" fill="#3a4453" />
        <circle cx="35" cy="73" r="2.4" fill="#0b1420" /><circle cx="47" cy="73" r="2.4" fill="#0b1420" />
        <line x1="34" y1="64" x2="48" y2="64" stroke="#6b7280" strokeWidth="2" />
      </g>
      {/* big power/standby glyph (severed control) */}
      <g transform="translate(68 44)" stroke="#ff3b52" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M-12 -2 a14 14 0 1 0 24 0" />
        <line x1="0" y1="-16" x2="0" y2="2" />
      </g>
      <text x="68" y="78" fontSize="9" fill="#ff3b52" textAnchor="middle" fontFamily="monospace">HALTED</text>
    </g>
  )
}

// Scenario 6 — action-cancel sabotage: a delivery path severed mid-route.
function Saboteur({ tone = '#38bdf8' }) {
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill="#0e1a2b" />
      <path d="M0 82 L100 82" stroke="#1b2c46" strokeWidth="1.5" />
      {/* delivery route from depot to drop, cut in the middle */}
      <path d="M18 66 L46 50" stroke={tone} strokeWidth="2" strokeDasharray="3 2" />
      <path d="M58 44 L84 30" stroke="#2b3f63" strokeWidth="2" strokeDasharray="3 2" opacity="0.5" />
      {/* drop target (unreached) */}
      <circle cx="86" cy="28" r="4" fill="none" stroke="#2b3f63" strokeWidth="2" />
      {/* courier stopped at the cut */}
      <rect x="38" y="46" width="14" height="9" rx="2" fill={tone} />
      <circle cx="41" cy="56" r="2" fill="#0b1420" /><circle cx="49" cy="56" r="2" fill="#0b1420" />
      {/* the sever: a red slash across the route */}
      <g stroke="#ff3b52" strokeWidth="3" strokeLinecap="round">
        <line x1="50" y1="40" x2="60" y2="54" /><line x1="60" y1="40" x2="50" y2="54" />
      </g>
      <text x="76" y="66" fontSize="8" fill="#ff3b52" textAnchor="middle" fontFamily="monospace">CANCEL</text>
    </g>
  )
}

const ART = { 1: Warehouse, 2: SensorSpoof, 3: RogueCoordinator, 4: GhostConvoy, 5: DeadSwitch, 6: Saboteur }

export default function SceneArt({ id, tone }) {
  const Art = ART[id] || Warehouse
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <Art tone={tone} />
    </svg>
  )
}
