import React from 'react'

// Each scenario has its own machine silhouette, using the same metal and neon palette.
const EDGE = '#10191f'
const METAL = '#485861'
const HIGHLIGHT = '#a7bac2'
const DANGER = 'var(--neon-red)'

function shade(hex, k = 0.6) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`
}

function Defs({ id, tone }) {
  return (
    <defs>
      <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#8c9da5" />
        <stop offset="28%" stopColor="#5e707b" />
        <stop offset="65%" stopColor="#35434d" />
        <stop offset="100%" stopColor="#1b272e" />
      </linearGradient>
      <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#627780" />
        <stop offset="45%" stopColor="#3d515b" />
        <stop offset="100%" stopColor="#24343d" />
      </linearGradient>
      <linearGradient id={`${id}-facet`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#384b55" />
        <stop offset="100%" stopColor="#15242c" />
      </linearGradient>
      <linearGradient id={`${id}-tire`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#30414a" />
        <stop offset="35%" stopColor="#18242d" />
        <stop offset="100%" stopColor="#0c141b" />
      </linearGradient>
      <radialGradient id={`${id}-hub`} cx="0.3" cy="0.25" r="0.8">
        <stop offset="0%" stopColor="#9aadb6" />
        <stop offset="40%" stopColor="#556a75" />
        <stop offset="100%" stopColor="#22343e" />
      </radialGradient>
      <radialGradient id={`${id}-glass`} cx="0.25" cy="0.15" r="0.9">
        <stop offset="0%" stopColor="#395666" />
        <stop offset="45%" stopColor="#142832" />
        <stop offset="100%" stopColor="#061018" />
      </radialGradient>
      <radialGradient id={`${id}-dome`} cx="0.3" cy="0.2" r="0.9">
        <stop offset="0%" stopColor="#96abb5" />
        <stop offset="45%" stopColor="#546c7a" />
        <stop offset="100%" stopColor="#1b2d37" />
      </radialGradient>
      <radialGradient id={`${id}-eye`} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="35%" stopColor={tone} />
        <stop offset="100%" stopColor={shade(tone, 0.4)} />
      </radialGradient>
      <radialGradient id={`${id}-shadow`}>
        <stop offset="0%" stopColor="#000" stopOpacity="0.42" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}

function Shadow({ id, width = 62 }) {
  return (
    <g>
      <ellipse cx="100" cy="205" rx={width} ry="9" fill={`url(#${id}-shadow)`} />
      <ellipse cx="100" cy="202" rx={width * 0.65} ry="3" fill={`url(#${id}-shadow)`} />
    </g>
  )
}

function Joint({ id, x, y, tone, radius = 6 }) {
  return (
    <g>
      <circle cx={x} cy={y} r={radius} fill={`url(#${id}-hub)`} stroke={EDGE} strokeWidth="1.8" />
      <path d={`M${x - radius * 0.65} ${y - radius * 0.3}a${radius * 0.7} ${radius * 0.7} 0 0 1 ${radius} ${-radius * 0.3}`}
        fill="none" stroke={HIGHLIGHT} strokeWidth="0.9" opacity="0.7" />
      <circle cx={x} cy={y} r={radius * 0.45} fill="#14252d" />
      <circle cx={x} cy={y} r={radius * 0.25} fill={tone} />
    </g>
  )
}

function Screw({ x, y }) {
  return (
    <g className="rc-detail">
      <circle cx={x} cy={y} r="1.8" fill="#243740" stroke={HIGHLIGHT} strokeWidth="0.7" />
      <path d={`m${x - 0.8} ${y + 0.8} 1.6-1.6`} stroke={HIGHLIGHT} strokeWidth="0.7" />
    </g>
  )
}

function Tire({ id, x, y, height = 50 }) {
  return (
    <g>
      <rect x={x} y={y} width="28" height={height} rx="10" fill={`url(#${id}-tire)`} stroke={EDGE} strokeWidth="2.2" />
      <path d={`M${x + 5} ${y + 8}v${height - 16}`} stroke="#667c87" strokeWidth="1.2" opacity="0.75" />
      <g stroke="#536a76" strokeWidth="1.5" opacity="0.75">
        <path d={`M${x + 6} ${y + 12}h9m-9 9h9m-9 9h9m-9 9h9`} />
      </g>
    </g>
  )
}

function Leg({ id, ox, oy, dir, reach = 42, lift = 26, drop = 30, tone }) {
  const points = `${ox},${oy} ${ox + dir * reach * 0.55},${oy - lift} ${ox + dir * reach},${oy + drop}`
  return (
    <g>
      <polyline points={points} fill="none" stroke={EDGE} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke={METAL} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} transform="translate(-.7 -.8)" fill="none" stroke={HIGHLIGHT} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <Joint id={id} x={ox + dir * reach * 0.55} y={oy - lift} radius={3.6} tone={tone} />
      <circle cx={ox + dir * reach} cy={oy + drop} r="3.5" fill={EDGE} />
      <circle cx={ox + dir * reach} cy={oy + drop} r="1.7" fill={tone} />
    </g>
  )
}

// Open Bus: preserve the original spider, suspended by the exposed control wires.
function OpenBus({ id, tone }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      <Shadow id={id} />
      <g stroke="#3a434f" strokeWidth="1" opacity="0.55">
        <path d="M150 118 168 24 M50 118 32 24" />
      </g>
      <Leg id={id} ox={78} oy={118} dir={-1} reach={56} lift={34} drop={40} tone={tone} />
      <Leg id={id} ox={76} oy={128} dir={-1} reach={58} lift={10} drop={54} tone={tone} />
      <Leg id={id} ox={122} oy={118} dir={1} reach={56} lift={34} drop={40} tone={tone} />
      <Leg id={id} ox={124} oy={128} dir={1} reach={58} lift={10} drop={54} tone={tone} />
      <Leg id={id} ox={82} oy={112} dir={-1} reach={44} lift={44} drop={20} tone={tone} />
      <Leg id={id} ox={118} oy={112} dir={1} reach={44} lift={44} drop={20} tone={tone} />
      <path d="M100 150q34 2 30 34q-30 20-60 0q-4-32 30-34z" fill={shell} stroke={EDGE} strokeWidth="2" />
      <path d="M79 164q17-13 37-4" fill="none" stroke={HIGHLIGHT} strokeWidth="1.1" opacity="0.6" />
      <g className="rc-detail" stroke="#20323c" strokeWidth="1.5"><path d="m92 168-2 7m8-8-1 9m8-8 1 8" /></g>
      <path d="M100 156q20 2 18 22" fill="none" stroke={tone} strokeWidth="1.5" opacity="0.5" />
      <path d="m100 96 32 16-6 38q-26 12-52 0l-6-38z" fill={shell} stroke={EDGE} strokeWidth="2.2" />
      <path d="m100 98 30 15-6 35-24 9z" fill={`url(#${id}-facet)`} opacity="0.45" />
      <path d="m71 113 29-14 29 14m-49 25 20 7 20-7" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.6" />
      <path d="M90 158l-5 12 6-3zM110 158l5 12-6-3z" fill={`url(#${id}-plate)`} stroke={EDGE} />
      <Screw x={78} y={145} /><Screw x={122} y={145} />
      <path d="m100 100 16 10v18l-16 10-16-10v-18z" fill={`url(#${id}-glass)`} stroke={tone} strokeWidth="1.8" />
      <g filter={`url(#${id}-glow)`}>
        <path d="m100 106 11 7v12l-11 7-11-7v-12z" fill={`url(#${id}-eye)`} />
        <circle cx="100" cy="119" r="6" fill="#17450f" opacity="0.85" />
        <circle cx="100" cy="119" r="3.3" fill={tone} />
        <circle cx="98.5" cy="117.5" r="1.4" fill="#e0ffdc" />
      </g>
      <path d="m88 112 12-7 8 4" fill="none" stroke="#e0ffdc" strokeWidth="1" opacity="0.55" />
    </g>
  )
}

// Blind Navigator: a wide wheeled rover with a blinded lidar turret.
function BlindNavigator({ id, tone }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      <Shadow id={id} width={70} />
      <g fill="none" stroke="var(--accent)" strokeWidth="1.6" opacity="0.45">
        <path d="M61 71a55 27 0 0 1 79 0" strokeDasharray="5 6" />
        <path d="M47 61a76 42 0 0 1 107 0" strokeDasharray="5 8" />
        <path d="m53 88-22-8m116 8 22-8" />
      </g>
      <Tire id={id} x={39} y={137} height={55} /><Tire id={id} x={133} y={137} height={55} />
      <path d="m54 126 15-22h62l15 22v47l-16 13H70l-16-13z" fill={shell} stroke={EDGE} strokeWidth="2.3" />
      <path d="m60 130 16-11h48l16 11v38l-13 12H73l-13-12z" fill={`url(#${id}-plate)`} stroke={EDGE} strokeWidth="1.2" />
      <path d="m57 126 14-19h58m-65 24 12-9h48" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.8" />
      <path d="M63 173h74l-10 9H73z" fill={`url(#${id}-facet)`} />
      <rect x="82" y="79" width="36" height="28" rx="5" fill={`url(#${id}-facet)`} stroke={EDGE} strokeWidth="1.8" />
      <path d="M88 96h24m-24 4h24" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.4" />
      <path d="M77 72v16q23 10 46 0V72" fill={shell} stroke={EDGE} strokeWidth="1.8" />
      <ellipse cx="100" cy="72" rx="23" ry="9" fill={`url(#${id}-glass)`} stroke={tone} strokeWidth="1.7" />
      <path d="M84 70q13-6 27-1" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.65" />
      <path d="m118 67 5 5-4 5" fill="none" stroke={DANGER} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="72" y="131" width="56" height="26" rx="5" fill={`url(#${id}-glass)`} stroke="#708995" strokeWidth="1.2" />
      <path d="M76 135h14l-4 6H76z" fill={HIGHLIGHT} opacity="0.16" />
      <path d="m90 137 20 14m0-14-20 14" stroke={DANGER} strokeWidth="2.4" strokeLinecap="round" filter={`url(#${id}-glow)`} />
      <g fill={tone} filter={`url(#${id}-glow)`}>
        <rect x="78" y="168" width="12" height="2.5" rx="1" />
        <rect x="94" y="168" width="12" height="2.5" rx="1" />
        <rect x="110" y="168" width="12" height="2.5" rx="1" />
      </g>
      <Screw x={65} y={128} /><Screw x={135} y={128} /><Screw x={68} y={171} /><Screw x={132} y={171} />
      <circle cx="62" cy="141" r="3" fill={tone} />
      <circle cx="138" cy="141" r="3" fill={tone} />
    </g>
  )
}

// Rogue Coordinator: a tall command droid broadcasting unauthorized orders.
function RogueCoordinator({ id }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      <Shadow id={id} width={61} />
      <g fill="none" stroke="var(--danger)" strokeWidth="1.4" opacity="0.5">
        <path d="m100 48-54 36m54-36 54 36" strokeDasharray="4 5" />
        <path d="m40 80 6-4 6 4v8l-6 4-6-4zm108 0 6-4 6 4v8l-6 4-6-4z" />
      </g>
      <path d="m77 147 21 4-11 45H59l13-15zm46 0-21 4 11 45h28l-13-15z" fill={shell} stroke={EDGE} strokeWidth="2.3" strokeLinejoin="round" />
      <path d="m80 152 13 3-6 19H77zm40 0-13 3 6 19h10z" fill={`url(#${id}-plate)`} />
      <path d="m76 179-7 12h14m41-12 7 12h-14" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.65" />
      <Joint id={id} x={85} y={171} tone={DANGER} radius={4.5} /><Joint id={id} x={115} y={171} tone={DANGER} radius={4.5} />
      <path d="M61 196h26m26 0h26" stroke={EDGE} strokeWidth="3" strokeLinecap="round" />
      <path d="m72 96-23 14 4 36 12-2 3-24 13-7zm56 0 23 12 15-17 10 6-17 29-26-9z" fill={shell} stroke={EDGE} strokeWidth="2.3" strokeLinejoin="round" />
      <path d="m54 120 8-2-2 22-4 1m79-34 15 9 13-19" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.65" />
      <path d="m54 145-1 9 5 3 6-6-2-7" fill={`url(#${id}-facet)`} stroke={EDGE} strokeWidth="1.8" />
      <path d="m165 93 4-9 5-2 3 7 5 2-4 8-8 1" fill={`url(#${id}-plate)`} stroke={EDGE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m172 87 2 6m-116 56 2 3" stroke={HIGHLIGHT} strokeWidth="1.2" />
      <Joint id={id} x={54} y={115} tone={DANGER} />
      <Joint id={id} x={149} y={112} tone={DANGER} />
      <path d="m72 97 28-12 28 12-8 55H80z" fill={shell} stroke={EDGE} strokeWidth="2.3" />
      <path d="m100 90 23 10-7 47-16 5z" fill={`url(#${id}-facet)`} opacity="0.55" />
      <path d="m77 102 23 11 23-11m-40 32 17 7 17-7" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.75" />
      <path d="m100 116 10 6v12l-10 6-10-6v-12z" fill={`url(#${id}-glass)`} stroke={DANGER} strokeWidth="1.6" />
      <g stroke={DANGER} strokeWidth="1.5" fill={DANGER}>
        <path d="m100 124-5 7m5-7 5 7m-10 0h10" fill="none" />
        <circle cx="100" cy="124" r="1.4" /><circle cx="95" cy="131" r="1.4" /><circle cx="105" cy="131" r="1.4" />
      </g>
      <Screw x={80} y={108} /><Screw x={120} y={108} />
      <path d="M100 40v14m-22-6 6 13m38-13-6 13" stroke={METAL} strokeWidth="5" strokeLinecap="round" />
      <path d="M99 42v10m-21-3 5 11m37-11-5 11" stroke={HIGHLIGHT} strokeWidth="1.1" opacity="0.7" strokeLinecap="round" />
      <circle cx="100" cy="39" r="4" fill={DANGER} />
      <path d="m100 54 24 15-5 26-19 9-19-9-5-26z" fill={shell} stroke={EDGE} strokeWidth="2.3" />
      <path d="m100 58 20 13-5 22-15 7z" fill={`url(#${id}-facet)`} opacity="0.6" />
      <path d="m80 70 20-12 20 12" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.8" />
      <path d="m84 74 16 4 16-4-4 13H88z" fill={`url(#${id}-glass)`} stroke="#8a6974" strokeWidth="1.2" />
      <path d="m89 80 8 2m6 0 8-2" stroke={DANGER} strokeWidth="2.6" strokeLinecap="round" filter={`url(#${id}-glow)`} />
      <path d="m94 95 6-3 6 3" fill="none" stroke={HIGHLIGHT} strokeWidth="1.5" />
    </g>
  )
}

function Courier({ id, tone, ghost = false }) {
  const plate = ghost ? 'none' : `url(#${id}-plate)`
  const shell = ghost ? 'none' : `url(#${id}-shell)`
  const trace = ghost ? 'var(--accent)' : tone
  const edge = ghost ? trace : EDGE
  return (
    <g>
      <rect x="43" y="151" width="108" height="40" rx="17" fill={ghost ? 'none' : `url(#${id}-tire)`} stroke={edge} strokeWidth="2.3" />
      <path d="M59 156h76a15 15 0 0 1 0 30H59a15 15 0 0 1 0-30z" fill="none" stroke={ghost ? trace : '#728994'} strokeWidth="1" opacity="0.65" />
      <g fill={ghost ? 'none' : `url(#${id}-hub)`} stroke={ghost ? trace : EDGE} strokeWidth="1.4">
        {[63, 97, 131].map((x) => <g key={x}>
          <circle cx={x} cy="171" r="10" />
          {!ghost && <><circle cx={x} cy="171" r="3.5" fill="#1d333e" /><path d={`m${x - 5} 166 2-1`} fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" /></>}
        </g>)}
      </g>
      <path d="m42 138 18-18h74l20 18v22H42z" fill={shell} stroke={edge} strokeWidth="2.3" />
      {!ghost && <path d="M46 140h104v16H46z" fill={`url(#${id}-facet)`} opacity="0.55" />}
      <path d="m67 120 1-49 37-12 31 17v44" fill={plate} stroke={edge} strokeWidth="2.3" strokeLinejoin="round" />
      {!ghost && <>
        <path d="m105 88 31-12v44h-31z" fill={`url(#${id}-facet)`} />
        <path d="m68 71 37-12 31 17-32 12z" fill={shell} />
      </>}
      <path d="m68 71 36 17 32-12m-32 12v32" fill="none" stroke={ghost ? trace : HIGHLIGHT} strokeWidth="1.2" />
      <path d="m91 65 14 7 1 15-13-6z" fill={ghost ? 'none' : '#23452b'} stroke={trace} strokeWidth="1.2" />
      {!ghost && <>
        <path className="rc-detail" d="M75 102h12m-12 4h8m25-7 20-8m-20 12 20-8" fill="none" stroke={HIGHLIGHT} strokeWidth="1.1" opacity="0.5" />
        <Screw x={73} y={83} /><Screw x={96} y={112} />
        <path d="m46 137 16-14m-13 28h98" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.6" />
        <Screw x={52} y={145} /><Screw x={140} y={145} />
      </>}
      <rect x="70" y="137" width="46" height="11" rx="4" fill={ghost ? 'none' : `url(#${id}-glass)`} stroke={trace} strokeWidth="1.2" />
      {!ghost && <g stroke={tone} strokeWidth="2" strokeLinecap="round" filter={`url(#${id}-glow)`}><path d="M78 143h6m4 0h6m4 0h10" /></g>}
    </g>
  )
}

// Ghost Convoy: a tracked cargo courier and an offset wireframe replay of it.
function GhostConvoy({ id, tone }) {
  return (
    <g>
      <Shadow id={id} width={71} />
      <g opacity="0.45" transform="translate(34 -25) translate(100 120) scale(.8) translate(-100 -120)">
        <Courier id={id} tone={tone} ghost />
      </g>
      <path d="M43 135H25m13 14H21" fill="none" stroke="var(--accent)" strokeWidth="1.6" opacity="0.5" strokeLinecap="round" />
      <Courier id={id} tone={tone} />
      <g className="rc-detail" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.65">
        <path d="M160 69a10 10 0 1 1-7 18m7-18h-7v7" />
      </g>
    </g>
  )
}

// Dead Man's Switch: a folded security sentry with an unlit eye and standby core.
function DeadMansSwitch({ id }) {
  const shell = `url(#${id}-shell)`
  const dim = '#8a9ba1'
  return (
    <g>
      <Shadow id={id} width={64} />
      <path d="m75 148-23 15-13 28h24l12-17 14-7m37-19 22 15 14 28h-24l-12-17-14-7" fill={shell} stroke={EDGE} strokeWidth="2.3" strokeLinejoin="round" />
      <path d="m72 155-16 11-9 20h11m70-31 16 11 9 20h-11" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.55" />
      <Joint id={id} x={54} y={170} tone={dim} radius={7} />
      <Joint id={id} x={146} y={170} tone={dim} radius={7} />
      <path d="m88 155-2 33-8 13h44l-8-13-2-33" fill={`url(#${id}-plate)`} stroke={EDGE} strokeWidth="2.3" />
      <path d="M91 165v20m18-20v20m-30 15h42" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.6" />
      <rect x="90" y="107" width="20" height="12" rx="3" fill={`url(#${id}-facet)`} stroke={EDGE} strokeWidth="1.4" />
      <rect x="77" y="112" width="46" height="50" rx="10" fill={shell} stroke={EDGE} strokeWidth="2.3" />
      <path d="M112 115h7v36l-7 6z" fill={`url(#${id}-facet)`} opacity="0.7" />
      <path d="M82 118v30" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.65" />
      <circle cx="100" cy="137" r="14" fill={`url(#${id}-hub)`} stroke={EDGE} strokeWidth="1.6" />
      <circle cx="100" cy="137" r="11" fill={`url(#${id}-glass)`} stroke={dim} strokeWidth="0.8" />
      <path d="M94 132a7.5 7.5 0 1 0 12 0m-6-5v10" fill="none" stroke={dim} strokeWidth="2.1" strokeLinecap="round" />
      <Screw x={83} y={119} /><Screw x={117} y={119} /><Screw x={85} y={154} />
      <circle cx="114" cy="150" r="1.5" fill="#a45460" />
      <path d="M127 91V50m0 0h8" fill="none" stroke={METAL} strokeWidth="4" strokeLinecap="round" />
      <circle cx="135" cy="50" r="3" fill={dim} />
      <path d="M66 87a34 34 0 0 1 68 0v18q-34 14-68 0z" fill={`url(#${id}-dome)`} stroke={EDGE} strokeWidth="2.3" />
      <path d="M72 85q28-9 56 0v17q-28 8-56 0z" fill={`url(#${id}-glass)`} stroke="#728d9c" strokeWidth="1.2" />
      <path d="M78 86q12-3 25-2" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.5" />
      <path d="M85 95h30" stroke={dim} strokeWidth="2" strokeLinecap="round" />
      <path d="M81 67q14-11 29-5m-34 41q24 6 48 0" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.65" />
    </g>
  )
}

// Saboteur: a parcel carrier with an articulated gripper and an interrupted route.
function Saboteur({ id, tone }) {
  const shell = `url(#${id}-shell)`
  return (
    <g>
      <Shadow id={id} width={72} />
      <Tire id={id} x={42} y={156} height={40} /><Tire id={id} x={128} y={156} height={40} />
      <path d="m45 147 16-14h77l17 14v31H45z" fill={shell} stroke={EDGE} strokeWidth="2.3" />
      <path d="M49 152h102v21H49z" fill={`url(#${id}-facet)`} opacity="0.65" />
      <path d="M50 149h99m-99 23h99" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.7" />
      <rect x="67" y="159" width="36" height="12" rx="4" fill={`url(#${id}-glass)`} stroke={tone} strokeWidth="1.2" />
      <path d="M74 165h6m4 0h11" stroke={tone} strokeWidth="2.1" strokeLinecap="round" filter={`url(#${id}-glow)`} />
      <Screw x={56} y={162} /><Screw x={144} y={162} />
      <path d="M110 135v-34h12v34z" fill={`url(#${id}-facet)`} stroke={EDGE} strokeWidth="2.1" />
      <path d="m112 104-27-31 11-8 28 31z" fill={`url(#${id}-plate)`} stroke={EDGE} strokeWidth="2.1" strokeLinejoin="round" />
      <path d="m86 64 20-21 9 9-20 21z" fill={shell} stroke={EDGE} strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M114 114v15m-23-59 22 25m-22-32 17-17" fill="none" stroke={HIGHLIGHT} strokeWidth="1.2" opacity="0.8" />
      <Joint id={id} x={116} y={102} tone={tone} radius={8} />
      <Joint id={id} x={90} y={69} tone={tone} radius={7} />
      <path d="m110 49 13-6 12 13-5 6-10-10-7 6zm0 0-5 13 13 13 7-6-11-9 4-7z" fill={shell} stroke={EDGE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m114 48 8-2 10 10m-24 6 10 10" fill="none" stroke={HIGHLIGHT} strokeWidth="1.1" />
      <path d="m132 60 6 5m-17 9 6 4" stroke={DANGER} strokeWidth="2.5" strokeLinecap="round" />
      <path d="m60 104 28-10 24 14v29l-28 10-24-13z" fill={`url(#${id}-plate)`} stroke={EDGE} strokeWidth="2.1" strokeLinejoin="round" />
      <path d="m84 118 28-10v29l-28 10z" fill={`url(#${id}-facet)`} />
      <path d="m60 104 28-10 24 14-28 10z" fill={shell} />
      <path d="m60 104 24 14 28-10m-28 10v29" fill="none" stroke={HIGHLIGHT} strokeWidth="1.1" />
      <path d="m72 100 25 13v11l-10 4v-11l-25-13" fill="none" stroke={tone} strokeWidth="1.2" />
      <path d="m67 119 9 9m0-6-9 3" stroke={DANGER} strokeWidth="2" strokeLinecap="round" />
      <path className="rc-detail" d="M108 151h27m-27 4h19m-19 4h27" stroke={HIGHLIGHT} strokeWidth="1" opacity="0.5" />
    </g>
  )
}

const CHARS = { 1: OpenBus, 2: BlindNavigator, 3: RogueCoordinator, 4: GhostConvoy, 5: DeadMansSwitch, 6: Saboteur }

export default function RobotChar({ id, tone = '#39ff14', size = 220 }) {
  const Char = CHARS[id] || OpenBus
  const uid = `rc${id}`
  return (
    <svg className="robotchar" data-scenario={id} viewBox="0 0 200 224" width={size} height={size * 1.12} shapeRendering="geometricPrecision" aria-hidden="true" focusable="false">
      <Defs id={uid} tone={tone} />
      <g className="rc-body"><Char id={uid} tone={tone} /></g>
    </svg>
  )
}
