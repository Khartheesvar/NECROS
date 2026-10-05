import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Text, Grid } from '@react-three/drei'
import * as THREE from 'three'

// World (metres) maps directly to 3D X/Z. Y is up. Robot world (x,y) -> (x, 0, -y)
// so "north" (+y in the 2D model) points away from the camera.
const ROBOT_COLORS = { amr1: '#38bdf8', amr2: '#c084fc' }
const ALERT_COLOR = '#ff3b52'

const RACKS = [
  { x: 3.0, y: 1.6, w: 2.8, d: 0.56 },
  { x: 3.0, y: 2.4, w: 2.8, d: 0.56 },
  { x: -3.0, y: -1.6, w: 2.8, d: 0.56 },
  { x: -3.0, y: -2.4, w: 2.8, d: 0.56 },
]

function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial color="#0b111b" roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[22, 16]}
        cellSize={1}
        cellColor="#1a2740"
        sectionSize={4}
        sectionColor="#24364f"
        fadeDistance={34}
        fadeStrength={1}
        infiniteGrid={false}
      />
    </>
  )
}

function Rack({ x, y, w, d }) {
  // A multi-level pallet rack — tall steel frame with shelf decks and pallets,
  // bright enough to read clearly against the dark floor.
  const H = 2.4                     // total rack height (m)
  const levels = [0.05, 1.15, 2.25] // shelf deck heights
  const frame = '#5a7bb0'           // steel uprights/beams (light, visible)
  const deck = '#3a4f73'
  const pallet = '#b9852f'          // warm pallet tone to pop against cool scene
  const upX = [-w / 2 + 0.12, w / 2 - 0.12]
  const upZ = [-d / 2 + 0.08, d / 2 - 0.08]
  return (
    <group position={[x, 0, -y]}>
      {/* four corner uprights */}
      {upX.map((ox) => upZ.map((oz, j) => (
        <mesh key={`${ox}-${j}`} position={[ox, H / 2, oz]} castShadow>
          <boxGeometry args={[0.1, H, 0.1]} />
          <meshStandardMaterial color={frame} roughness={0.5} metalness={0.6}
            emissive={frame} emissiveIntensity={0.12} />
        </mesh>
      )))}
      {/* shelf decks + horizontal beams */}
      {levels.map((ly, li) => (
        <group key={li} position={[0, ly, 0]}>
          <mesh position={[0, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[w - 0.1, 0.08, d - 0.1]} />
            <meshStandardMaterial color={deck} roughness={0.7} metalness={0.3} />
          </mesh>
          {/* front/back beams for a racked look */}
          {upZ.map((oz, bi) => (
            <mesh key={bi} position={[0, 0.06, oz]}>
              <boxGeometry args={[w - 0.05, 0.1, 0.06]} />
              <meshStandardMaterial color={frame} metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
          {/* a couple of pallets/boxes on the lower decks */}
          {li < 2 && [-w / 4, w / 4].map((px, pi) => (
            <mesh key={pi} position={[px, 0.32, 0]} castShadow>
              <boxGeometry args={[w / 3.2, 0.55, d - 0.25]} />
              <meshStandardMaterial color={pi ? '#8a6a3a' : pallet}
                roughness={0.85} metalness={0.05} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function RouteLine({ waypoints, color }) {
  const pts = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return []
    const loop = waypoints.concat([waypoints[0]])
    return loop.map(([x, y]) => [x, 0.03, -y])
  }, [waypoints])
  if (pts.length < 2) return null
  return (
    <>
      <Line points={pts} color={color} lineWidth={2} dashed dashSize={0.3} gapSize={0.3} opacity={0.5} transparent />
      {waypoints.map(([x, y], i) => (
        <mesh key={i} position={[x, 0.03, -y]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      ))}
    </>
  )
}

function Trail({ points, color }) {
  const pts = useMemo(() => (points || []).map(([x, y]) => [x, 0.05, -y]), [points])
  if (pts.length < 2) return null
  return <Line points={pts} color={color} lineWidth={3} opacity={0.85} transparent />
}

// A warehouse AMR: low wheeled chassis carrying a shelf payload, a forward
// sensor bar, a status beacon, and a rotating LIDAR scan sweep.
function Robot({ name, data, compromised, collided, dev }) {
  const group = useRef()
  const lidar = useRef()
  const target = useRef({ x: data?.x || 0, z: -(data?.y || 0), yaw: data?.yaw || 0 })
  target.current = { x: data?.x || 0, z: -(data?.y || 0), yaw: data?.yaw || 0 }

  // Smoothly interpolate toward the latest telemetry each frame (glide, not jump).
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    g.position.x += (target.current.x - g.position.x) * 0.2
    g.position.z += (target.current.z - g.position.z) * 0.2
    let dy = target.current.yaw - g.rotation.y
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    g.rotation.y += dy * 0.2
    if (lidar.current) lidar.current.rotation.y += delta * 3.2  // spinning LIDAR
  })

  const base = ROBOT_COLORS[name] || '#38bdf8'
  const color = compromised ? ALERT_COLOR : base

  return (
    <group ref={group} position={[target.current.x, 0, target.current.z]} rotation={[0, target.current.yaw, 0]}>
      {/* low drive base (dark) */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.62, 0.18, 0.5]} />
        <meshStandardMaterial color="#1c2636" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* wheels */}
      {[[-0.26, -0.26], [-0.26, 0.26], [0.26, -0.26], [0.26, 0.26]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.07, wz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 14]} />
          <meshStandardMaterial color="#0d131d" roughness={0.9} />
        </mesh>
      ))}
      {/* top deck in robot colour */}
      <mesh position={[0, 0.235, 0]} castShadow>
        <boxGeometry args={[0.64, 0.06, 0.52]} />
        <meshStandardMaterial color={color} emissive={color}
          emissiveIntensity={compromised ? 0.8 : 0.3} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* carried shelf/payload */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.46, 0.4]} />
        <meshStandardMaterial color="#9a7742" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* forward sensor bar (shows facing direction) */}
      <mesh position={[0.32, 0.22, 0]} castShadow>
        <boxGeometry args={[0.05, 0.08, 0.34]} />
        <meshStandardMaterial color="#e8eefc" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      {/* status beacon on a small mast */}
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color}
          emissiveIntensity={compromised ? 2.2 : 0.9} />
      </mesh>

      {/* rotating LIDAR sweep: a thin bright wedge on the floor */}
      <group ref={lidar} position={[0, 0.04, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.1, 24, 0, Math.PI / 5]} />
          <meshBasicMaterial color={color} transparent opacity={compromised ? 0.28 : 0.18}
            side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* faint full scan ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.06, 1.1, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      {/* alert ring when compromised */}
      {compromised && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.6, 0.76, 32]} />
          <meshBasicMaterial color={ALERT_COLOR} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* collision burst — the robot has rammed a rack and emergency-stopped */}
      {collided && (
        <group position={[0, 0.9, 0]}>
          <mesh>
            <icosahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color="#ffae3b" emissive="#ff7a1a" emissiveIntensity={2} />
          </mesh>
          <Text position={[0, 0.42, 0]} fontSize={0.24} color="#ffbf5e"
            anchorX="center" outlineWidth={0.014} outlineColor="#070b12">
            ⚠ COLLISION
          </Text>
        </group>
      )}

      <Text position={[0, 1.02, 0]} fontSize={0.28}
        color={collided ? '#ffbf5e' : (compromised ? '#ff8795' : '#e3ecf8')}
        anchorX="center" outlineWidth={0.012} outlineColor="#070b12">
        {name}{compromised ? `  ⚠ ${dev}m` : ''}
      </Text>
    </group>
  )
}

function Scene({ groundTruth, routes, meta, trails }) {
  return (
    <>
      <color attach="background" args={['#070b12']} />
      <fog attach="fog" args={['#070b12', 22, 46]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#4a5a80', '#0a0f18', 1.0]} />
      {/* key light with shadows */}
      <directionalLight
        position={[8, 14, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {/* cool fill from the opposite side so racks aren't pure black on one face */}
      <directionalLight position={[-10, 8, -6]} intensity={0.5} color="#6f8ab5" />

      <Floor />
      {RACKS.map((r, i) => <Rack key={i} {...r} />)}

      {Object.entries(routes || {}).map(([name, wps]) => (
        <RouteLine key={name} waypoints={wps} color={ROBOT_COLORS[name] || '#64748b'} />
      ))}
      {Object.entries(trails || {}).map(([name, pts]) => (
        <Trail key={name} points={pts} color={ROBOT_COLORS[name] || '#64748b'} />
      ))}
      {Object.entries(groundTruth || {}).map(([name, d]) => (
        <Robot key={name} name={name} data={d}
          compromised={meta[name]?.compromised} collided={meta[name]?.collided}
          dev={meta[name]?.dev} />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0, 0]}
      />
    </>
  )
}

// If WebGL is unavailable or the 3D scene throws, don't take the whole dashboard
// down — show a readable fallback instead.
class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

function Fallback({ meta }) {
  return (
    <div style={{
      height: 540, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', background: '#070b12',
      borderRadius: 8, fontSize: 13, gap: 8, textAlign: 'center', padding: 20,
    }}>
      <div style={{ fontSize: 15, color: '#8ba0bd' }}>3D view unavailable</div>
      <div>WebGL isn’t available in this browser/session.</div>
      <div style={{ marginTop: 8 }}>
        {Object.entries(meta || {}).map(([n, m]) => (
          <div key={n} style={{ color: m.compromised ? '#ff6b7d' : '#8ba0bd' }}>
            {n}: {m.compromised ? `⚠ HIJACKED (${m.dev}m off route)` : '✓ on route'}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Warehouse3D({ groundTruth, routes, meta, trails }) {
  return (
    <GLBoundary fallback={<Fallback meta={meta} />}>
      <Canvas
        shadows
        camera={{ position: [-9, 9, 12], fov: 40 }}
        style={{ width: '100%', height: 540, borderRadius: 8, background: '#070b12' }}
        onCreated={({ gl }) => { gl.setClearColor('#070b12') }}
      >
        <Scene groundTruth={groundTruth} routes={routes} meta={meta} trails={trails} />
      </Canvas>
    </GLBoundary>
  )
}
