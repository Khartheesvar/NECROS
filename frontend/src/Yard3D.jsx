import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'

// Scenario 3 "Rogue Coordinator" — a dense container/logistics YARD seen from a high
// command angle, with dramatic lighting and ambient fleet activity. A central
// coordinator mast issues command lines to each AMR; a rogue coordinator turns the
// lines (and robots) red.

const ROBOT_COLORS = { amr1: '#38bdf8', amr2: '#c084fc' }
const DANGER = '#ff3b52'
// Muted industrial shipping-container palette (weathered steel, rust, tan, grey) —
// not toy-block rainbow.
const CONTAINER_COLORS = ['#7d5a3c', '#55606e', '#8a6a3a', '#5a6470', '#6b5536', '#7a8490', '#9a8257', '#4a5560']
const toXZ = (x, y) => [x, -y]

class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// A single shipping container.
function Container({ x, y, z, rot = 0, color }) {
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 1.2, 1.15]} />
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.3} />
      </mesh>
      {/* corrugation ribs */}
      {[-1.0, -0.5, 0, 0.5, 1.0].map((rx, j) => (
        <mesh key={j} position={[rx, 0.6, 0.58]}>
          <boxGeometry args={[0.05, 1.1, 0.02]} />
          <meshStandardMaterial color="#000000" opacity={0.25} transparent />
        </mesh>
      ))}
      {/* doors end */}
      <mesh position={[1.3, 0.6, 0]}>
        <boxGeometry args={[0.04, 1.1, 1.1]} />
        <meshStandardMaterial color="#00000040" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

// Real pallet-racks matching the sim's RACKS footprints (robot_node.py). These are
// the obstacles the fleet actually collides with — drawn so a hijack ramming a
// robot into the interior visibly lands on shelving. Footprint: (cx,cy,half_w,half_d).
const RACKS = [
  { cx: 3.0, cy: 1.6, hw: 1.4, hd: 0.28 },
  { cx: 3.0, cy: 2.4, hw: 1.4, hd: 0.28 },
  { cx: -3.0, cy: -1.6, hw: 1.4, hd: 0.28 },
  { cx: -3.0, cy: -2.4, hw: 1.4, hd: 0.28 },
]

function Rack({ cx, cy, hw, hd }) {
  const [x, z] = toXZ(cx, cy)
  const w = hw * 2, d = hd * 2
  return (
    <group position={[x, 0, z]}>
      {/* four upright posts */}
      {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.65, pz]} castShadow>
          <boxGeometry args={[0.1, 1.3, 0.1]} />
          <meshStandardMaterial color="#c7962f" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* two shelf decks */}
      {[0.5, 1.15].map((sy, i) => (
        <mesh key={i} position={[0, sy, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.08, d]} />
          <meshStandardMaterial color="#8a6a3a" roughness={0.85} />
        </mesh>
      ))}
      {/* palletised boxes on the shelves */}
      {[-0.7, 0.0, 0.7].map((bx, i) => (
        <mesh key={i} position={[bx, 0.72, 0]} castShadow>
          <boxGeometry args={[0.5, 0.36, d * 0.8]} />
          <meshStandardMaterial color={CONTAINER_COLORS[(i + 2) % 8]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Yard() {
  // Stacked container walls along the back and sides for a dense depot feel.
  // All containers sit OUTSIDE the robots' operating area (x in [-6,6], z in
  // [-4,4]) so the real fleet never clips through them. Back/front rows at |z|>=7,
  // side rows at |x|>=9.
  const stacks = useMemo(() => {
    const out = []
    // back wall (z = 9) and front wall (z = -8), some double-stacked
    for (let i = 0; i < 7; i++) {
      const x = -9 + i * 3
      out.push({ x, y: 0, z: 9, rot: 0, c: CONTAINER_COLORS[i % 8] })
      if (i % 2 === 0) out.push({ x, y: 1.25, z: 9, rot: 0, c: CONTAINER_COLORS[(i + 3) % 8] })
      out.push({ x, y: 0, z: -8, rot: 0, c: CONTAINER_COLORS[(i + 2) % 8] })
    }
    // left & right side rows (rotated), well outside the fleet area
    for (let i = 0; i < 5; i++) {
      const z = -6 + i * 3
      out.push({ x: -11, y: 0, z, rot: Math.PI / 2, c: CONTAINER_COLORS[(i + 1) % 8] })
      out.push({ x: 11, y: 0, z, rot: Math.PI / 2, c: CONTAINER_COLORS[(i + 5) % 8] })
      if (i % 2 === 1) {
        out.push({ x: -11, y: 1.25, z, rot: Math.PI / 2, c: CONTAINER_COLORS[i % 8] })
        out.push({ x: 11, y: 1.25, z, rot: Math.PI / 2, c: CONTAINER_COLORS[(i + 4) % 8] })
      }
    }
    return out
  }, [])

  return (
    <>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 34]} />
        <meshStandardMaterial color="#14171d" roughness={1} />
      </mesh>
      {/* painted parking bays (interior lanes) */}
      {[-4, 0, 4].map((x, i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x - 1.4, 0, 0]}>
            <planeGeometry args={[0.08, 10]} /><meshBasicMaterial color="#5a5324" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x + 1.4, 0, 0]}>
            <planeGeometry args={[0.08, 10]} /><meshBasicMaterial color="#5a5324" />
          </mesh>
        </group>
      ))}
      {/* gantry crane spanning the yard */}
      <group position={[0, 0, -6]}>
        {[-8, 8].map((lx, i) => (
          <mesh key={i} position={[lx, 2.4, 0]} castShadow>
            <boxGeometry args={[0.4, 4.8, 0.4]} />
            <meshStandardMaterial color="#c0a030" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 4.8, 0]} castShadow>
          <boxGeometry args={[16.8, 0.5, 0.6]} />
          <meshStandardMaterial color="#d4b43c" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* trolley */}
        <mesh position={[3, 4.4, 0]} castShadow>
          <boxGeometry args={[1.2, 0.5, 1.0]} />
          <meshStandardMaterial color="#2b3346" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      {/* containers (perimeter scenery) */}
      {stacks.map((c, i) => <Container key={i} {...c} />)}
      {/* interior pallet-racks — the real obstacles the fleet collides with */}
      {RACKS.map((r, i) => <Rack key={i} {...r} />)}
      {/* flood-light poles (warm) */}
      {[[-9, -8], [9, -8], [-9, 7], [9, 7]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.1, 0.12, 5, 8]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
          <mesh position={[0, 5, 0]}><boxGeometry args={[0.6, 0.2, 0.3]} /><meshStandardMaterial color="#ffd27a" emissive="#ffcf6e" emissiveIntensity={1.5} /></mesh>
          <pointLight position={[0, 5, 0]} intensity={0.5} color="#ffcf8a" distance={14} decay={2} />
        </group>
      ))}
    </>
  )
}

function CoordinatorMast({ rogue }) {
  const c = rogue ? DANGER : '#5be0a0'
  const ref = useRef()
  useFrame((s) => { if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.8 })
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.34, 2.6, 12]} />
        <meshStandardMaterial color="#2b3346" metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={ref} position={[0, 2.7, 0]}>
        <mesh><sphereGeometry args={[0.26, 16, 16]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={rogue ? 2.5 : 1.2} /></mesh>
        <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.16, 0.5, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.7} /></mesh>
      </group>
      <pointLight position={[0, 2.7, 0]} intensity={rogue ? 1.4 : 0.6} color={c} distance={10} />
      <Text position={[0, 3.4, 0]} fontSize={0.34} color={c} anchorX="center" outlineWidth={0.015} outlineColor="#070b12">
        {rogue ? '☠ ROGUE COMMAND' : 'FLEET COORDINATOR'}
      </Text>
    </group>
  )
}

function CommandLine({ to, rogue }) {
  const ref = useRef()
  const pts = useMemo(() => [[0, 2.0, 0], [to[0], 0.4, to[1]]], [to])
  // pulse opacity
  useFrame((s) => { if (ref.current) ref.current.material.opacity = (rogue ? 0.65 : 0.4) + Math.sin(s.clock.elapsedTime * 4) * 0.3 })
  const c = rogue ? DANGER : '#5be0a0'
  return <Line ref={ref} points={pts} color={c} lineWidth={rogue ? 3 : 1.8}
    dashed dashSize={0.4} gapSize={0.2} transparent opacity={0.5} />
}

function Robot({ x, y, color, rogue }) {
  const ref = useRef()
  const target = useRef({ x, z: y })
  target.current = { x, z: y }
  useFrame(() => {
    const g = ref.current; if (!g) return
    g.position.x += (target.current.x - g.position.x) * 0.2
    g.position.z += (target.current.z - g.position.z) * 0.2
  })
  const c = rogue ? DANGER : color
  return (
    <group ref={ref} position={[x, 0, y]}>
      <mesh position={[0, 0.13, 0]} castShadow><boxGeometry args={[0.74, 0.24, 0.58]} /><meshStandardMaterial color="#1c2636" metalness={0.5} roughness={0.6} /></mesh>
      {[[-0.3,-0.3],[-0.3,0.3],[0.3,-0.3],[0.3,0.3]].map(([wx,wz],i)=>(
        <mesh key={i} position={[wx,0.08,wz]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.1,0.1,0.07,12]} /><meshStandardMaterial color="#0d131d" /></mesh>
      ))}
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.76, 0.08, 0.6]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={rogue ? 0.9 : 0.4} /></mesh>
      <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[0.6, 0.45, 0.48]} /><meshStandardMaterial color="#8a6a3a" roughness={0.85} /></mesh>
      {/* beacon */}
      <mesh position={[0, 0.9, 0]}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={rogue ? 2 : 0.8} /></mesh>
      {rogue && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.65, 0.85, 28]} /><meshBasicMaterial color={DANGER} transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

function Scene({ groundTruth, rogue }) {
  return (
    <>
      <color attach="background" args={['#0a0d14']} />
      <fog attach="fog" args={['#0a0d14', 26, 54]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#2f3a55', '#0a0d14', 0.7]} />
      {/* dramatic key light with long shadows */}
      <directionalLight position={[14, 20, 6]} intensity={1.5} color="#cfe0ff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
      {rogue && <pointLight position={[0, 6, 0]} intensity={1.6} color={DANGER} distance={30} />}

      <Yard />
      <CoordinatorMast rogue={rogue} />

      {/* the real, backend-driven robots + command lines (amr1 / amr2 only — the
          actual fleet nodes the coordinator commands and the attack can hijack) */}
      {Object.entries(groundTruth || {}).map(([name, r]) => {
        if (!r) return null
        const [x, z] = toXZ(r.x, r.y)
        return (
          <React.Fragment key={name}>
            <CommandLine to={[x, z]} rogue={rogue} />
            <Robot x={x} y={z} color={ROBOT_COLORS[name] || '#38bdf8'} rogue={rogue} />
          </React.Fragment>
        )
      })}

      {/* gentle cinematic auto-rotation; user can still drag/zoom (no camera fight) */}
      <OrbitControls enablePan={false} minDistance={10} maxDistance={44}
        maxPolarAngle={Math.PI / 2.3} target={[0, 0.5, -1]}
        autoRotate autoRotateSpeed={0.3} enableDamping dampingFactor={0.1} />
    </>
  )
}

export default function Yard3D({ groundTruth, rogue }) {
  return (
    <GLBoundary fallback={<div style={{ height: 460, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', fontSize: 12 }}>3D unavailable (WebGL)</div>}>
      <Canvas shadows camera={{ position: [0, 15, 17], fov: 42 }}
        style={{ width: '100%', height: 460, borderRadius: 6, background: '#0a0d14' }}>
        <Scene groundTruth={groundTruth} rogue={rogue} />
      </Canvas>
    </GLBoundary>
  )
}
