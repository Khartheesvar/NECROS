import React, { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

// A 3D loading-dock corridor for Scenario 2, rendered twice (truth / belief).
// World x runs down the corridor; world y -> 3D z. Rich environment + animated
// LIDAR sweep + robot character + subtle camera motion.

const TONE = '#38bdf8'
const DANGER = '#ff3b52'
const WARN = '#fbbf24'

class GLBoundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Dock({ cy }) {
  // Stacked crates placed OUTSIDE the corridor walls (scenery the robot never
  // reaches), so the robot can't appear to clip through them. z beyond ±cy.
  const crates = useMemo(() => {
    const out = []
    for (let x = 0; x <= 14; x += 2.3) {
      for (const s of [-1, 1]) {
        const h = 0.6 + ((x * 7) % 3) * 0.3
        out.push({ x: x + 0.4, z: s * (cy + 0.75), h, c: s > 0 ? '#8a6a3a' : '#6f5630' })
      }
    }
    return out
  }, [cy])

  return (
    <>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.5, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, cy * 2 + 2]} />
        <meshStandardMaterial color="#0c1420" roughness={0.95} />
      </mesh>
      {/* centre guide line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.5, 0.0, 0]}>
        <planeGeometry args={[24, 0.08]} />
        <meshBasicMaterial color="#1f3350" />
      </mesh>
      {/* yellow floor warning stripes near the dock */}
      {[-cy + 0.5, cy - 0.5].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[13.5, 0.005, z]}>
          <planeGeometry args={[3, 0.5]} />
          <meshBasicMaterial color={WARN} opacity={0.5} transparent />
        </mesh>
      ))}
      {/* side walls — aligned exactly to the robot's corridor bound (±cy), tall
          and solid so the scene reads as an enclosed corridor */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[6.5, 1.1, s * cy]} castShadow receiveShadow>
          <boxGeometry args={[24, 2.2, 0.3]} />
          <meshStandardMaterial color="#17253c" roughness={0.85} metalness={0.2} />
        </mesh>
      ))}
      {/* a few small crates set BEHIND the walls as distant scenery (kept low so
          they never dominate the view or overlap the corridor) */}
      {crates.filter((_, i) => i % 3 === 0).map((c, i) => (
        <mesh key={i} position={[c.x, 0.25, c.z]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={c.c} roughness={0.85} />
        </mesh>
      ))}
      {/* dock doors at the end */}
      {[-cy / 2, cy / 2].map((z, i) => (
        <mesh key={i} position={[15.3, 1.0, z]} castShadow>
          <boxGeometry args={[0.25, 2.0, cy - 0.3]} />
          <meshStandardMaterial color="#223850" metalness={0.5} roughness={0.5}
            emissive={TONE} emissiveIntensity={0.12} />
        </mesh>
      ))}
      <Text position={[15.1, 2.4, 0]} fontSize={0.5} color={TONE} anchorX="center"
        outlineWidth={0.02} outlineColor="#070b12">DOCK</Text>
    </>
  )
}

function Obstacle({ x, y, r, ghost }) {
  const ref = useRef()
  useFrame((_, dt) => { if (ghost && ref.current) ref.current.rotation.y += dt }) // ghost shimmer
  return (
    <mesh ref={ref} position={[x, 0.55, y]} castShadow>
      <cylinderGeometry args={[r, r, 1.1, 20]} />
      {ghost
        ? <meshStandardMaterial color={DANGER} transparent opacity={0.22}
            emissive={DANGER} emissiveIntensity={0.6} wireframe />
        : <meshStandardMaterial color="#b9852f" roughness={0.8} metalness={0.1} />}
    </mesh>
  )
}

function LidarSweep({ color }) {
  const ref = useRef()
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y -= dt * 2.6 })
  return (
    <group ref={ref} position={[0, 0.05, 0]}>
      {/* a bright sweeping wedge on the floor — kept short so it doesn't visually
          poke through the corridor walls when the robot drives near them */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 24, 0, Math.PI / 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Robot({ x, y, color, collided }) {
  const ref = useRef()
  const target = useRef({ x, z: y })
  target.current = { x, z: y }
  const beacon = useRef()
  useFrame((state) => {
    const g = ref.current
    if (g) {
      g.position.x += (target.current.x - g.position.x) * 0.25
      g.position.z += (target.current.z - g.position.z) * 0.25
    }
    if (beacon.current && collided) {
      beacon.current.material.emissiveIntensity = 1.5 + Math.sin(state.clock.elapsedTime * 10) * 1.5
    }
  })
  const c = collided ? DANGER : color
  return (
    <group ref={ref} position={[x, 0, y]}>
      {/* drive base + wheels */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.66, 0.18, 0.52]} />
        <meshStandardMaterial color="#1c2636" metalness={0.5} roughness={0.6} />
      </mesh>
      {[[-0.28, -0.28], [-0.28, 0.28], [0.28, -0.28], [0.28, 0.28]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.07, wz]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
          <meshStandardMaterial color="#0d131d" roughness={0.9} />
        </mesh>
      ))}
      {/* deck */}
      <mesh position={[0, 0.235, 0]} castShadow>
        <boxGeometry args={[0.68, 0.07, 0.54]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={collided ? 0.9 : 0.35} />
      </mesh>
      {/* payload */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.5, 0.46, 0.42]} />
        <meshStandardMaterial color="#9a7742" roughness={0.85} />
      </mesh>
      {/* forward sensor */}
      <mesh position={[0.35, 0.22, 0]}>
        <boxGeometry args={[0.06, 0.1, 0.36]} />
        <meshStandardMaterial color="#e8eefc" emissive={c} emissiveIntensity={0.8} />
      </mesh>
      {/* status beacon */}
      <mesh ref={beacon} position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={collided ? 2.5 : 0.9} />
      </mesh>
      <LidarSweep color={c} />
      {collided && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <ringGeometry args={[0.7, 0.9, 32]} />
          <meshBasicMaterial color={DANGER} transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// A fully code-controlled chase camera. The camera position is ALWAYS computed
// relative to the robot (orbit angle + distance + height), so the robot can never
// go off-screen. The user adjusts the orbit angle by dragging and the distance by
// scrolling — but the framing is guaranteed. This replaces OrbitControls (whose
// independent camera state kept fighting the follow logic).
function ChaseCamera({ follow }) {
  const { camera, gl } = useThree()
  // yaw 0 = straight behind the robot looking down the corridor (+x), with a
  // slightly elevated (top-down-ish) angle. User can still drag to orbit.
  const orbit = useRef({ yaw: 0, dist: 7, height: 4.5 })
  const look = useRef(new THREE.Vector3())

  useEffect(() => {
    const el = gl.domElement
    let dragging = false, px = 0
    const down = (e) => { dragging = true; px = e.clientX }
    const up = () => { dragging = false }
    const move = (e) => {
      if (!dragging) return
      orbit.current.yaw += (e.clientX - px) * 0.008
      px = e.clientX
    }
    const wheel = (e) => {
      e.preventDefault()
      orbit.current.dist = Math.max(3.5, Math.min(18, orbit.current.dist + e.deltaY * 0.01))
      orbit.current.height = orbit.current.dist * 0.46
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', move)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', move)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame(() => {
    const fx = follow.current?.x ?? 0
    const fz = follow.current?.z ?? 0
    const { yaw, dist, height } = orbit.current
    // desired camera position = behind the robot by `dist` at angle `yaw`
    const cx = fx - Math.cos(yaw) * dist
    const cz = fz - Math.sin(yaw) * dist
    camera.position.lerp(new THREE.Vector3(cx, height, cz), 0.15)
    look.current.lerp(new THREE.Vector3(fx + 1, 0.5, fz), 0.2)
    camera.lookAt(look.current)
  })
  return null
}

function Scene({ scene, mode }) {
  const cy = scene.corridor_y || 2.2
  const obstacles = scene.obstacles || []
  const truth = scene.true || { x: -2, y: 0 }
  const believed = scene.believed || truth
  const blinded = scene.believed_clear_ahead && scene.real_obstacle_ahead != null
  const pose = mode === 'truth' ? truth : believed
  // Normal robot colour; it turns red (DANGER) via the `collided` flag in <Robot>.
  const robotColor = TONE
  const follow = useRef({ x: pose.x, z: pose.y })
  follow.current = { x: pose.x, z: pose.y }
  const controls = useRef()

  return (
    <>
      <color attach="background" args={['#070b12']} />
      <fog attach="fog" args={['#070b12', 16, 42]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#4a5a80', '#0a0f18', 0.9]} />
      <directionalLight position={[2, 12, 7]} intensity={1.5} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      {/* warm dock-door glow from the end */}
      <pointLight position={[15, 2, 0]} intensity={0.6} color={TONE} distance={14} />

      <Dock cy={cy} />
      {obstacles.map((o, i) => {
        if (mode === 'belief' && blinded) return <Obstacle key={i} x={o[0]} y={o[1]} r={o[2]} ghost />
        return <Obstacle key={i} x={o[0]} y={o[1]} r={o[2]} />
      })}
      <Robot x={pose.x} y={pose.y} color={robotColor} collided={mode === 'truth' && scene.collided} />
      <ChaseCamera follow={follow} />
    </>
  )
}

export default function Dock3D({ scene, mode, height = 460 }) {
  return (
    <GLBoundary fallback={<div style={{ height, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#6b7f9c', fontSize: 12 }}>3D unavailable (WebGL)</div>}>
      <Canvas shadows camera={{ position: [-8, 4.5, 0], fov: 50 }}
        style={{ width: '100%', height, borderRadius: 6, background: '#070b12' }}>
        <Scene scene={scene} mode={mode} />
      </Canvas>
    </GLBoundary>
  )
}
