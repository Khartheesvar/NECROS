import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'

// Scenario 4 "Ghost Convoy" — a courier DEPOT seen from a high operator angle. The
// attack is told visually: the REAL courier drives its delivery route, while a
// translucent GHOST (the pose the operator is shown, from replayed /odom) freezes at
// the depot. A pulsing red tether between them grows as the lie widens.

const TONE = '#38bdf8'
const GHOST = '#8a93a8'
const DANGER = '#ff3b52'
// Muted industrial palette (kraft/cardboard, tan, gunmetal) — not toy-block rainbow.
const CRATE_COLORS = ['#9c7b4f', '#8a6a3a', '#7d8590', '#6b5536', '#55606e', '#9a8257']
const toXZ = (x, y) => [x, -y]

class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// --- Static depot environment (perimeter shelving, dock doors, floodlights) ------
function Depot() {
  const shelves = useMemo(() => {
    const out = []
    // back wall of pallet shelving (outside the courier route box)
    for (let i = 0; i < 7; i++) out.push({ x: -9 + i * 3, z: -9.5, c: CRATE_COLORS[i % 6] })
    // front loading-dock crates
    for (let i = 0; i < 5; i++) out.push({ x: -8 + i * 4, z: 9.5, c: CRATE_COLORS[(i + 2) % 6] })
    return out
  }, [])
  return (
    <>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#14171d" roughness={1} />
      </mesh>
      {/* painted route lane markers */}
      {[-6, 0, 6].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
          <planeGeometry args={[0.06, 12]} /><meshBasicMaterial color="#2a3550" />
        </mesh>
      ))}
      {/* perimeter shelving stacks */}
      {shelves.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 1.2, 1.1]} />
            <meshStandardMaterial color={s.c} roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[2.4, 0.5, 1.0]} />
            <meshStandardMaterial color={CRATE_COLORS[(i + 3) % 6]} roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* loading-dock door frames along the back */}
      {[-6, 0, 6].map((x, i) => (
        <mesh key={'d' + i} position={[x, 1.4, -10.4]}>
          <boxGeometry args={[2.2, 2.8, 0.2]} />
          <meshStandardMaterial color="#20262f" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {/* floodlight poles (warm) at the corners */}
      {[[-11, -9], [11, -9], [-11, 9], [11, 9]].map(([x, z], i) => (
        <group key={'f' + i} position={[x, 0, z]}>
          <mesh position={[0, 2.4, 0]}><cylinderGeometry args={[0.09, 0.11, 4.8, 8]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
          <mesh position={[0, 4.8, 0]}><boxGeometry args={[0.5, 0.18, 0.28]} /><meshStandardMaterial color="#ffd27a" emissive="#ffcf6e" emissiveIntensity={1.4} /></mesh>
          <pointLight position={[0, 4.8, 0]} intensity={0.45} color="#ffcf8a" distance={16} decay={2} />
        </group>
      ))}
    </>
  )
}

// Delivery drop stations at each route waypoint; the next target pulses.
function Drops({ route, targetIdx }) {
  if (!route) return null
  return route.map(([x, y], i) => {
    const [px, pz] = toXZ(x, y)
    const active = i === targetIdx
    return (
      <group key={i} position={[px, 0, pz]}>
        {/* flat painted drop-pad marker — the robot drives onto it, nothing to clip */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.5, 0.68, 28]} />
          <meshBasicMaterial color={active ? TONE : '#30465f'} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.5, 28]} />
          <meshBasicMaterial color={active ? '#13314a' : '#0f1a28'} side={THREE.DoubleSide} />
        </mesh>
      </group>
    )
  })
}

function DepotPad({ pos }) {
  const [x, z] = toXZ(pos?.[0] ?? 0, pos?.[1] ?? 0)
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.0, 1.2, 40]} />
        <meshBasicMaterial color="#3a5278" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[1.0, 40]} />
        <meshBasicMaterial color="#111a28" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// Courier chassis with a cargo box; `ghost` renders it translucent + wireframe-ish.
function Bot({ x, y, color, ghost = false, label, labelColor }) {
  const ref = useRef()
  const target = useRef({ x, z: y })
  target.current = { x, z: y }
  useFrame((s) => {
    const g = ref.current; if (!g) return
    g.position.x += (target.current.x - g.position.x) * 0.22
    g.position.z += (target.current.z - g.position.z) * 0.22
    if (ghost && g.userData.flick) {
      // ghost shimmers faintly — it's not really there
      const m = g.userData.flick
      m.opacity = 0.28 + Math.sin(s.clock.elapsedTime * 3) * 0.1
    }
  })
  const op = ghost ? 0.33 : 1
  const sc = 1.35
  return (
    <group ref={ref} position={[x, 0, y]} scale={[sc, sc, sc]}>
      {/* chassis */}
      <mesh position={[0, 0.14, 0]} castShadow={!ghost}>
        <boxGeometry args={[0.95, 0.28, 0.72]} />
        <meshStandardMaterial color={ghost ? '#3a4150' : '#1c2636'} transparent={ghost} opacity={op}
          metalness={0.5} roughness={0.6} wireframe={ghost} />
      </mesh>
      {/* wheels */}
      {!ghost && [[-0.32, -0.3], [-0.32, 0.3], [0.32, -0.3], [0.32, 0.3]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.08, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.07, 12]} /><meshStandardMaterial color="#0d131d" />
        </mesh>
      ))}
      {/* accent deck */}
      <mesh position={[0, 0.33, 0]} castShadow={!ghost}>
        <boxGeometry args={[0.97, 0.09, 0.74]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={ghost ? 0.1 : 0.6}
          transparent={ghost} opacity={op} />
      </mesh>
      {/* cargo box */}
      <mesh position={[0, 0.62, 0]} castShadow={!ghost}
        ref={(m) => { if (ghost && ref.current && m) ref.current.userData.flick = m.material }}>
        <boxGeometry args={[0.62, 0.48, 0.52]} />
        <meshStandardMaterial color={ghost ? '#525b6e' : '#9a7338'} transparent={ghost} opacity={op}
          roughness={0.85} wireframe={ghost} />
      </mesh>
      {/* beacon */}
      <mesh position={[0, 0.98, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={ghost ? 0.3 : 1.6}
          transparent={ghost} opacity={op} />
      </mesh>
      {label && (
        <Text position={[0, 1.34, 0]} fontSize={0.32} color={labelColor || color} anchorX="center"
          outlineWidth={0.012} outlineColor="#070b12">{label}</Text>
      )}
    </group>
  )
}

// Pulsing red tether between the ghost (reported) and the real robot — the lie.
function GapTether({ a, b, active }) {
  const ref = useRef()
  const pts = useMemo(() => [[a[0], 0.4, a[1]], [b[0], 0.4, b[1]]], [a, b])
  useFrame((s) => { if (ref.current) ref.current.material.opacity = 0.5 + Math.sin(s.clock.elapsedTime * 5) * 0.4 })
  if (!active) return null
  return (
    <>
      <Line ref={ref} points={pts} color={DANGER} lineWidth={2.5} transparent opacity={0.8}
        dashed dashSize={0.3} gapSize={0.18} />
      <Text position={[(a[0] + b[0]) / 2, 1.0, (a[1] + b[1]) / 2]} fontSize={0.3} color={DANGER}
        anchorX="center" outlineWidth={0.012} outlineColor="#070b12">SPOOFED</Text>
    </>
  )
}

function Scene({ scene, spoofed }) {
  const gt = scene.ground_truth || { x: 0, y: 0 }
  const rep = scene.reported || gt
  const [rx, rz] = toXZ(gt.x ?? 0, gt.y ?? 0)        // real
  const [gx, gz] = toXZ(rep.x ?? 0, rep.y ?? 0)       // ghost (reported)
  const separated = Math.hypot(rx - gx, rz - gz) > 1.5
  return (
    <>
      <color attach="background" args={['#0a0d14']} />
      <fog attach="fog" args={['#0a0d14', 26, 56]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#2f3a55', '#0a0d14', 0.65]} />
      <directionalLight position={[12, 20, 8]} intensity={1.4} color="#cfe0ff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
      {spoofed && <pointLight position={[gx, 4, gz]} intensity={1.4} color={DANGER} distance={22} />}

      <Depot />
      <DepotPad pos={scene.depot} />
      <Drops route={scene.route} targetIdx={scene.target_idx} />

      {/* ghost first so the real robot draws over it when they coincide */}
      <Bot x={gx} y={gz} color={GHOST} ghost label={separated ? 'REPORTED (ghost)' : null} labelColor={GHOST} />
      <Bot x={rx} y={rz} color={spoofed ? DANGER : TONE} label={separated ? 'REAL' : 'convoy1'} />
      <GapTether a={[gx, gz]} b={[rx, rz]} active={spoofed} />

      <OrbitControls enablePan={false} minDistance={7} maxDistance={44}
        maxPolarAngle={Math.PI / 2.25} target={[0, 0.4, 0]}
        autoRotate autoRotateSpeed={0.28} enableDamping dampingFactor={0.1} />
    </>
  )
}

export default function Convoy3D({ scene }) {
  const spoofed = scene?.spoofed === true
  return (
    <GLBoundary fallback={<div style={{ height: 560, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', fontSize: 12 }}>3D unavailable (WebGL)</div>}>
      <Canvas shadows camera={{ position: [0, 13, 15], fov: 45 }}
        style={{ width: '100%', height: 560, borderRadius: 6, background: '#0a0d14' }}>
        <Scene scene={scene || {}} spoofed={spoofed} />
      </Canvas>
    </GLBoundary>
  )
}
