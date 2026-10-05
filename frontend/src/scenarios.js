// NECROS scenario registry — single source of truth for the roadmap + console.
// Each scenario is a stage in an attacker's escalation against the same ROS 2 fleet.
//
// Scenarios are grouped into ACTS (see ACTS below). An act is a theme that ties
// several scenarios to one root cause, so a player never judges a single technique
// in isolation — e.g. S1-S3 are three faces of the SAME unauthenticated bus. To add
// a scenario later, append it here with an `act` key; the landing page groups it
// automatically. To add a new act, add an entry to ACTS.

// Acts, in display order. `key` matches each scenario's `act`.
export const ACTS = [
  {
    key: 'open-bus',
    label: 'MODULE 01',
    title: 'The Open Bus',
    summary: 'One unauthenticated DDS bus, exploited three ways.',
  },
  {
    key: 'beyond-bus',
    label: 'MODULE 02',
    title: 'Ghosts & Blackouts',
    summary: 'Attacks on freshness and availability.',
  },
]

export const SCENARIOS = [
  {
    id: 1,
    act: 'open-bus',
    codename: 'OPEN BUS',
    title: 'Open Bus',
    tagline: 'Unauthenticated ROS 2 / DDS',
    attack: 'DDS discovery abuse · eavesdrop · cmd_vel hijack',
    defend: 'SROS2: authentication + encryption + access control',
    difficulty: 'Entry',
    status: 'live',          // live | soon | locked
  },
  {
    id: 2,
    act: 'open-bus',
    codename: 'BLIND NAVIGATOR',
    title: 'Blind Navigator',
    tagline: 'Sensor spoofing (LaserScan)',
    attack: 'DDS discovery abuse · sensor reconnaissance · perception spoofing',
    defend: 'SROS2: authenticate the sensor stream',
    difficulty: 'Intermediate',
    status: 'live',
  },
  {
    id: 3,
    act: 'open-bus',
    codename: 'ROGUE COORDINATOR',
    title: 'Rogue Coordinator',
    tagline: 'Node impersonation / fleet takeover',
    attack: 'DDS discovery abuse · authority spoofing · node impersonation',
    defend: 'SROS2: access control bound to node identity',
    difficulty: 'Advanced',
    status: 'live',
  },
  {
    id: 4,
    act: 'beyond-bus',
    codename: 'GHOST CONVOY',
    title: 'Ghost Convoy',
    tagline: 'Capture & replay (telemetry spoofing)',
    attack: 'Telemetry capture · replay · operator-view spoofing',
    defend: 'SROS2 + freshness / sequence validation',
    difficulty: 'Advanced',
    status: 'live',
  },
  {
    id: 5,
    act: 'beyond-bus',
    codename: 'DEAD MANS SWITCH',
    title: "Dead Man's Switch",
    tagline: 'Denial of control (service / lifecycle abuse)',
    attack: 'Privileged interface abuse · denial of control',
    defend: 'SROS2: authorize service and lifecycle calls',
    difficulty: 'Advanced',
    status: 'live',
  },
  {
    id: 6,
    act: 'beyond-bus',
    codename: 'SABOTEUR',
    title: 'Saboteur',
    tagline: 'Action goal cancellation (task sabotage)',
    attack: 'Action interface abuse · task sabotage',
    defend: 'SROS2: authorize who may cancel tasks',
    difficulty: 'Advanced',
    status: 'live',
  },
]

export const getScenario = (id) =>
  SCENARIOS.find((s) => String(s.id) === String(id))

// Group scenarios by act, in ACTS order. Scenarios whose `act` matches no known act
// (or have none) fall into a trailing "Unsorted" group so nothing is ever dropped.
export const getActs = () => {
  const groups = ACTS.map((a) => ({
    ...a,
    scenarios: SCENARIOS.filter((s) => s.act === a.key),
  }))
  const known = new Set(ACTS.map((a) => a.key))
  const orphans = SCENARIOS.filter((s) => !known.has(s.act))
  if (orphans.length) {
    groups.push({ key: 'more', label: 'MORE', title: 'More Scenarios',
      summary: '', scenarios: orphans })
  }
  return groups.filter((g) => g.scenarios.length)
}
