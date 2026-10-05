import React, { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'

// Scenario 5 "Dead Man's Switch" — a SECURED FACILITY patrolled by a sentinel robot.
// While ACTIVE it patrols and the yard is lit. Under a Denial-of-Control attack it is
// E-STOPPED (service call) or forced INACTIVE (lifecycle): the robot goes dark and
// the whole facility drops into a red alarm/blackout state — "switched off".

const TONE = '#38bdf8'
const DANGER = '#ff3b52'
const DEAD = '#5a6472'
const toXZ = (x, y) => [x, -y]

class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// Perimeter fence run along one edge (posts + rails), kept outside the patrol box.
function Fence({ z, from, to }) {
  const posts = []
  for (let x = from; x <= to; x += 2) posts.push(x)
  return (
    <group>
      {posts.map((x, i) => (
        <mesh key={i} position={[x, 0.7, z]}>
          <boxGeometry args={[0.1, 1.4, 0.1]} />
          <meshStandardMaterial color="#8a95a6" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {[0.4, 0.85, 1.3].map((y, i) => (
        <mesh key={'r' + i} position={[(from + to) / 2, y, z]}>
          <boxGeometry args={[to - from, 0.05, 0.05]} />
          <meshStandardMaterial color="#6c7788" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* chain-link suggestion: a lighter translucent panel so it actually reads */}
      <mesh position={[(from + to) / 2, 0.85, z]}>
        <boxGeometry args={[to - from, 1.1, 0.02]} />
        <meshStandardMaterial color="#9aa6b8" transparent opacity={0.22} />
      </mesh>
    </group>
  )
}

// Floodlight tower; lit (warm) when active, dark/red when the facility is down.
function FloodTower({ x, z, dark, estopped }) {
  const lampColor = estopped ? DANGER : (dark ? '#3a2020' : '#ffd27a')
  const emissive = estopped ? DANGER : (dark ? '#2a1515' : '#ffcf6e')
  const intensity = estopped ? 1.2 : (dark ? 0.05 : 1.5)
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.6, 0]}><cylinderGeometry args={[0.1, 0.13, 5.2, 8]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
      <mesh position={[0, 5.2, 0]}><boxGeometry args={[0.7, 0.25, 0.35]} />
        <meshStandardMaterial color={lampColor} emissive={emissive} emissiveIntensity={intensity} /></mesh>
      <pointLight position={[0, 5.2, 0]} intensity={estopped ? 0.6 : (dark ? 0.05 : 0.5)}
        color={estopped ? DANGER : '#ffcf8a'} distance={16} decay={2} />
    </group>
  )
}

// Guard / control post — a small lit hut at the yard corner.
function ControlPost({ dark }) {
  return (
    <group position={[10, 0, 8]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[2.4, 1.8, 2.0]} />
        <meshStandardMaterial color="#232a34" metalness={0.3} roughness={0.7} />
      </mesh>
      {/* lit window — goes dark when the facility is down */}
      <mesh position={[-1.21, 1.0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.4, 0.7]} />
        <meshBasicMaterial color={dark ? '#1a1410' : '#ffd98a'} />
      </mesh>
      <mesh position={[0, 1.95, 0]}><boxGeometry args={[2.6, 0.12, 2.2]} /><meshStandardMaterial color="#39424f" /></mesh>
    </group>
  )
}

function RouteLine({ route, dim }) {
  const pts = useMemo(() => (route || []).map(([x, y]) => {
    const [px, pz] = toXZ(x, y); return [px, 0.05, pz]
  }), [route])
  if (pts.length < 2) return null
  return <Line points={pts} color={dim ? '#2a3340' : '#35507a'} lineWidth={1.5} dashed dashSize={0.5} gapSize={0.3} />
}

function Robot({ x, y, color, dark, estopped }) {
  const ref = useRef()
  const target = useRef({ x, z: y })
  target.current = { x, z: y }
  useFrame((s) => {
    const g = ref.current; if (!g) return
    g.position.x += (target.current.x - g.position.x) * 0.25
    g.position.z += (target.current.z - g.position.z) * 0.25
    if (g.userData.ring) g.userData.ring.rotation.z = s.clock.elapsedTime * (dark ? 0 : 1.2)
    // sentinel sensor mast slowly scans while active
    if (g.userData.mast) g.userData.mast.rotation.y = dark ? 0 : s.clock.elapsedTime * 1.5
  })
  return (
    <group ref={ref} position={[x, 0, y]}>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.9, 0.28, 0.72]} />
        <meshStandardMaterial color={dark ? '#20262f' : '#1c2636'} metalness={0.5} roughness={0.6} />
      </mesh>
      {[[-0.3, -0.3], [-0.3, 0.3], [0.3, -0.3], [0.3, 0.3]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.08, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.07, 12]} /><meshStandardMaterial color="#0d131d" />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.92, 0.1, 0.74]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dark ? 0.05 : 0.6} />
      </mesh>
      <mesh position={[0, 0.66, 0]} castShadow>
        <boxGeometry args={[0.66, 0.5, 0.52]} />
        <meshStandardMaterial color={dark ? '#30363f' : '#45505f'} roughness={0.8} />
      </mesh>
      {/* rotating sentinel sensor mast (a camera/LIDAR head) */}
      <group ref={(m) => { if (ref.current) ref.current.userData.mast = m }} position={[0, 1.0, 0]}>
        <mesh><cylinderGeometry args={[0.12, 0.14, 0.18, 10]} />
          <meshStandardMaterial color={dark ? '#262c35' : '#2b3545'} /></mesh>
        <mesh position={[0.12, 0, 0]}><boxGeometry args={[0.1, 0.08, 0.08]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dark ? 0.1 : 1.4} /></mesh>
      </group>
      {/* status beacon */}
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dark ? 0.1 : 1.8} />
      </mesh>
      {/* status ring: spins while active, static + dim when halted */}
      <mesh ref={(m) => { if (ref.current) ref.current.userData.ring = m }}
        rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.7, 0.86, 32, 1, 0, estopped ? Math.PI * 2 : Math.PI * 1.4]} />
        <meshBasicMaterial color={color} transparent opacity={dark ? 0.5 : 0.85} side={THREE.DoubleSide} />
      </mesh>
      {estopped && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
          <ringGeometry args={[0.95, 1.12, 32]} />
          <meshBasicMaterial color={DANGER} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

function Scene({ scene }) {
  const pose = scene.pose || { x: 0, y: 0 }
  const [rx, rz] = toXZ(pose.x ?? 0, pose.y ?? 0)
  const estopped = scene.estopped === true
  const controllable = scene.controllable !== false && scene.status === 'ACTIVE'
  const dark = !controllable
  const color = estopped ? DANGER : (controllable ? TONE : DEAD)
  const label = scene.status || (controllable ? 'ACTIVE' : 'HALTED')
  return (
    <>
      <color attach="background" args={[dark ? '#0b0a0d' : '#0a0d14']} />
      <fog attach="fog" args={[dark ? '#0b0a0d' : '#0a0d14', 24, 54]} />
      <ambientLight intensity={dark ? 0.28 : 0.5} color={estopped ? '#ffd9dd' : '#ffffff'} />
      <hemisphereLight args={['#2f3a55', '#0a0d14', dark ? 0.35 : 0.65]} />
      <directionalLight position={[12, 20, 8]} intensity={dark ? 0.55 : 1.3} color="#cfe0ff" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />
      {estopped && <pointLight position={[0, 7, 0]} intensity={1.6} color={DANGER} distance={40} />}

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 32]} />
        <meshStandardMaterial color="#14171d" roughness={1} />
      </mesh>

      {/* secured-facility environment (all outside the patrol box x[-6,6] z[-5,0]) */}
      <Fence z={-9} from={-12} to={12} />
      <Fence z={9} from={-12} to={12} />
      <FloodTower x={-11} z={-8} dark={dark} estopped={estopped} />
      <FloodTower x={11} z={-8} dark={dark} estopped={estopped} />
      <FloodTower x={-11} z={8} dark={dark} estopped={estopped} />
      <FloodTower x={11} z={8} dark={dark} estopped={estopped} />
      <ControlPost dark={dark} />

      <RouteLine route={scene.route} dim={dark} />
      <Robot x={rx} y={rz} color={color} dark={dark} estopped={estopped} />

      <Text position={[rx, 1.7, rz]} fontSize={0.42} color={color} anchorX="center"
        outlineWidth={0.015} outlineColor="#070b12">{label}</Text>

      <OrbitControls enablePan={false} minDistance={7} maxDistance={44}
        maxPolarAngle={Math.PI / 2.25} target={[0, 0.4, 0]}
        autoRotate autoRotateSpeed={dark ? 0 : 0.3} enableDamping dampingFactor={0.1} />
    </>
  )
}

export default function Sentinel3D({ scene }) {
  return (
    <GLBoundary fallback={<div style={{ height: 560, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', fontSize: 12 }}>3D unavailable (WebGL)</div>}>
      <Canvas shadows camera={{ position: [0, 13, 15], fov: 45 }}
        style={{ width: '100%', height: 560, borderRadius: 6, background: '#0a0d14' }}>
        <Scene scene={scene || {}} />
      </Canvas>
    </GLBoundary>
  )
}
