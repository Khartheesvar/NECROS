import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'

// Scenario 6 "Saboteur" — a courier LOGISTICS DEPOT. The courier runs deliveries as
// actions, driving drop to drop around the floor. Under an action-cancel attack it is
// aborted mid-route: the route line to its target turns into a red "severed" slash and
// the courier flashes CANCELED, while the depot keeps waiting on undelivered drops.

const TONE = '#38bdf8'
const DANGER = '#ff3b52'
const OKGREEN = '#5be0a0'
// Realistic warehouse stock palette — kraft cardboard, muted crates, gunmetal totes
// (not toy-block rainbow). Keeps the industrial tone.
const CRATE_COLORS = ['#9c7b4f', '#8a6a3a', '#7d8590', '#6b5536', '#55606e', '#9a8257']
const toXZ = (x, y) => [x, -y]

class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// A tall warehouse shelving row (uprights + shelf decks + palletised boxes).
function ShelfRow({ x, z, len = 8, rot = 0 }) {
  const bays = Math.max(2, Math.round(len / 2))
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* uprights */}
      {Array.from({ length: bays + 1 }).map((_, i) => {
        const px = -len / 2 + i * (len / bays)
        return (
          <group key={i}>
            <mesh position={[px, 1.1, -0.5]}><boxGeometry args={[0.1, 2.2, 0.1]} /><meshStandardMaterial color="#c7962f" metalness={0.4} /></mesh>
            <mesh position={[px, 1.1, 0.5]}><boxGeometry args={[0.1, 2.2, 0.1]} /><meshStandardMaterial color="#c7962f" metalness={0.4} /></mesh>
          </group>
        )
      })}
      {/* shelf decks */}
      {[0.6, 1.4, 2.1].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}><boxGeometry args={[len, 0.08, 1.1]} /><meshStandardMaterial color="#5a6372" metalness={0.3} roughness={0.7} /></mesh>
      ))}
      {/* palletised boxes on the lower decks */}
      {Array.from({ length: bays }).map((_, i) => {
        const px = -len / 2 + (i + 0.5) * (len / bays)
        return (
          <group key={'b' + i}>
            <mesh position={[px, 0.9, 0]}><boxGeometry args={[len / bays * 0.7, 0.44, 0.8]} /><meshStandardMaterial color={CRATE_COLORS[i % 6]} roughness={0.85} /></mesh>
            {i % 2 === 0 && <mesh position={[px, 1.72, 0]}><boxGeometry args={[len / bays * 0.7, 0.44, 0.8]} /><meshStandardMaterial color={CRATE_COLORS[(i + 3) % 6]} roughness={0.85} /></mesh>}
          </group>
        )
      })}
    </group>
  )
}

// Static WAREHOUSE: interior shelving aisles + a conveyor/sorting line + overhead
// gantry. Distinct from S5's fenced guard-yard. All props outside the route box
// (x[-6,6], z[-5,0]) — shelving sits at the sides (|x|>=9) and back/front (|z|>=8).
function Depot() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[42, 32]} />
        <meshStandardMaterial color="#161a21" roughness={1} />
      </mesh>
      {/* tall warehouse shelving rows down both side walls (parallel aisles) */}
      <ShelfRow x={-10} z={-4} len={9} rot={Math.PI / 2} />
      <ShelfRow x={-10} z={5} len={9} rot={Math.PI / 2} />
      <ShelfRow x={10} z={-4} len={9} rot={Math.PI / 2} />
      <ShelfRow x={10} z={5} len={9} rot={Math.PI / 2} />
      {/* back wall shelving */}
      <ShelfRow x={-4} z={-10} len={9} />
      <ShelfRow x={6} z={-10} len={9} />

      {/* conveyor / sorting line along the front (the "dispatch" belt) */}
      <group position={[0, 0, 9]}>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[18, 0.3, 1.4]} /><meshStandardMaterial color="#2b323d" metalness={0.5} roughness={0.5} /></mesh>
        <mesh position={[0, 0.66, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[18, 1.0]} /><meshStandardMaterial color="#1a1f27" /></mesh>
        {/* parcels on the belt */}
        {[-7, -4, -1, 3, 6].map((x, i) => (
          <mesh key={i} position={[x, 0.86, 0]}><boxGeometry args={[0.7, 0.5, 0.7]} /><meshStandardMaterial color={CRATE_COLORS[i % 6]} roughness={0.85} /></mesh>
        ))}
        {/* belt support legs */}
        {[-8, -4, 0, 4, 8].map((x, i) => (
          <mesh key={'l' + i} position={[x, 0.2, 0]}><boxGeometry args={[0.2, 0.6, 0.2]} /><meshStandardMaterial color="#20262f" /></mesh>
        ))}
      </group>

      {/* overhead gantry spanning the aisle (distinct silhouette vs S5) */}
      <group position={[0, 0, -2]}>
        {[-9, 9].map((lx, i) => (
          <mesh key={i} position={[lx, 3.0, 0]}><boxGeometry args={[0.35, 6, 0.35]} /><meshStandardMaterial color="#c0a030" metalness={0.5} roughness={0.5} /></mesh>
        ))}
        <mesh position={[0, 6, 0]}><boxGeometry args={[18.5, 0.45, 0.5]} /><meshStandardMaterial color="#d4b43c" metalness={0.5} roughness={0.5} /></mesh>
        <mesh position={[4, 5.6, 0]}><boxGeometry args={[1.1, 0.5, 0.9]} /><meshStandardMaterial color="#2b3346" metalness={0.6} /></mesh>
      </group>

      {/* cool high-bay warehouse lighting (vs S5's warm security floods) */}
      {[[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, z], i) => (
        <mesh key={'hb' + i} position={[x, 6.2, z]}>
          <boxGeometry args={[1.4, 0.15, 0.5]} /><meshStandardMaterial color="#dfeaff" emissive="#cfe0ff" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <pointLight position={[0, 7, 0]} intensity={0.5} color="#cfe0ff" distance={26} decay={2} />
    </>
  )
}

// Delivery stations at each drop — a flat pad + a package pedestal to the side (off path).
function Drops({ drops, targetIdx, canceled }) {
  if (!drops) return null
  return drops.map(([x, y], i) => {
    const [px, pz] = toXZ(x, y)
    const active = i === targetIdx
    const col = active ? (canceled ? DANGER : TONE) : '#35507a'
    return (
      <group key={i} position={[px, 0, pz]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.5, 0.66, 28]} /><meshBasicMaterial color={col} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.5, 28]} /><meshBasicMaterial color={active ? '#13314a' : '#0f1a28'} side={THREE.DoubleSide} />
        </mesh>
        {/* small "awaiting delivery" marker number floating above */}
        <Text position={[0, 0.5, 0]} fontSize={0.3} color={col} anchorX="center"
          rotation={[-Math.PI / 2, 0, 0]}>{i + 1}</Text>
      </group>
    )
  })
}

function Courier({ x, y, color, canceled }) {
  const ref = useRef()
  const target = useRef({ x, z: y })
  target.current = { x, z: y }
  useFrame((s) => {
    const g = ref.current; if (!g) return
    g.position.x += (target.current.x - g.position.x) * 0.3
    g.position.z += (target.current.z - g.position.z) * 0.3
    if (g.userData.ring && canceled) g.userData.ring.material.opacity = 0.5 + Math.sin(s.clock.elapsedTime * 6) * 0.4
  })
  return (
    <group ref={ref} position={[x, 0, y]}>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.95, 0.28, 0.72]} /><meshStandardMaterial color="#1c2636" metalness={0.5} roughness={0.6} />
      </mesh>
      {[[-0.32, -0.3], [-0.32, 0.3], [0.32, -0.3], [0.32, 0.3]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.08, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.07, 12]} /><meshStandardMaterial color="#0d131d" />
        </mesh>
      ))}
      <mesh position={[0, 0.33, 0]} castShadow>
        <boxGeometry args={[0.97, 0.09, 0.74]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      {/* cargo package it's trying to deliver */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.6, 0.48, 0.5]} /><meshStandardMaterial color={canceled ? '#5a3030' : '#9a7338'} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <sphereGeometry args={[0.1, 12, 12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
      {canceled && (
        <mesh ref={(m) => { if (ref.current) ref.current.userData.ring = m }}
          rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <ringGeometry args={[0.95, 1.14, 32]} /><meshBasicMaterial color={DANGER} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// Route to the active drop; on cancel it becomes a red severed line with an X slash.
function RouteToTarget({ from, to, canceled }) {
  const pts = useMemo(() => [[from[0], 0.08, from[1]], [to[0], 0.08, to[1]]], [from, to])
  const mid = [(from[0] + to[0]) / 2, 0.3, (from[1] + to[1]) / 2]
  return (
    <>
      <Line points={pts} color={canceled ? DANGER : TONE} lineWidth={canceled ? 3 : 2}
        dashed dashSize={canceled ? 0.22 : 0.6} gapSize={0.25} />
      {canceled && (
        <Text position={mid} fontSize={0.5} color={DANGER} anchorX="center"
          outlineWidth={0.02} outlineColor="#070b12">✕</Text>
      )}
    </>
  )
}

function Scene({ scene }) {
  const pose = scene.pose || { x: 0, y: 0 }
  const [rx, rz] = toXZ(pose.x ?? 0, pose.y ?? 0)
  const status = scene.mission_status || 'idle'
  const canceled = status === 'canceled' || scene.sabotaged === true
  const delivered = status === 'delivered'
  const color = canceled ? DANGER : (delivered ? OKGREEN : TONE)
  const drops = scene.drops || []
  const ti = scene.target_idx ?? 0
  const tgt = drops[ti] ? toXZ(drops[ti][0], drops[ti][1]) : [rx, rz]
  return (
    <>
      <color attach="background" args={['#0a0d14']} />
      <fog attach="fog" args={['#0a0d14', 26, 56]} />
      <ambientLight intensity={0.48} />
      <hemisphereLight args={['#2f3a55', '#0a0d14', 0.65]} />
      <directionalLight position={[12, 20, 8]} intensity={1.35} color="#cfe0ff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
      {canceled && <pointLight position={[rx, 4, rz]} intensity={1.3} color={DANGER} distance={22} />}

      <Depot />
      <Drops drops={drops} targetIdx={ti} canceled={canceled} />
      <RouteToTarget from={[rx, rz]} to={tgt} canceled={canceled} />
      <Courier x={rx} y={rz} color={color} canceled={canceled} />

      <Text position={[rx, 1.7, rz]} fontSize={0.4} color={color} anchorX="center"
        outlineWidth={0.015} outlineColor="#070b12">
        {canceled ? 'CANCELED' : (delivered ? 'DELIVERED' : 'DELIVERING')}
      </Text>

      <OrbitControls enablePan={false} minDistance={7} maxDistance={44}
        maxPolarAngle={Math.PI / 2.25} target={[0, 0.4, 0]}
        autoRotate autoRotateSpeed={0.3} enableDamping dampingFactor={0.1} />
    </>
  )
}

export default function Saboteur3D({ scene }) {
  return (
    <GLBoundary fallback={<div style={{ height: 560, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', fontSize: 12 }}>3D unavailable (WebGL)</div>}>
      <Canvas shadows camera={{ position: [11, 9, 13], fov: 46 }}
        style={{ width: '100%', height: 560, borderRadius: 6, background: '#0a0d14' }}>
        <Scene scene={scene || {}} />
      </Canvas>
    </GLBoundary>
  )
}
