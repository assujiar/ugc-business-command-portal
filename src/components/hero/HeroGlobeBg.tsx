'use client'

import { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/hooks/use-ui-store'

// =====================================================
// Constants
// =====================================================

const BRAND_PRIMARY = '#FF4600'
const BRAND_SECONDARY = '#FF9F1C'
const GLOBE_RADIUS = 2.5
const GLOBE_SEGMENTS = 48
const PARTICLE_COUNT = 800

// Jakarta coordinates
const JAKARTA = { lat: -6.2088, lng: 106.8456 }

// Destination cities (lat, lng)
const DESTINATIONS = [
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
  { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
]

// =====================================================
// Utility Functions
// =====================================================

/**
 * Convert latitude/longitude to 3D sphere coordinates
 */
function latLngToVector3(
  lat: number,
  lng: number,
  radius: number = GLOBE_RADIUS
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)

  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  return new THREE.Vector3(x, y, z)
}

/**
 * Create a curved arc between two points on the globe
 */
function createArcPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  segments: number = 50,
  heightFactor: number = 0.3
): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

  // Calculate arc height based on distance
  const distance = start.distanceTo(end)
  const arcHeight = distance * heightFactor + GLOBE_RADIUS * 0.1

  // Normalize midpoint and push it outward
  midPoint.normalize().multiplyScalar(GLOBE_RADIUS + arcHeight)

  // Create quadratic bezier curve
  const curve = new THREE.QuadraticBezierCurve3(start, midPoint, end)

  for (let i = 0; i <= segments; i++) {
    points.push(curve.getPoint(i / segments))
  }

  return points
}

// =====================================================
// Three.js Components
// =====================================================

interface GlobeProps {
  animate: boolean
}

function Globe({ animate }: GlobeProps) {
  const globeRef = useRef<THREE.Group>(null)
  const wireframeRef = useRef<THREE.LineSegments>(null)

  // Create wireframe geometry
  const wireframeGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS / 2)
    const wireframe = new THREE.WireframeGeometry(geometry)
    geometry.dispose()
    return wireframe
  }, [])

  // Rotate globe
  useFrame((_, delta) => {
    if (animate && globeRef.current) {
      globeRef.current.rotation.y += delta * 0.05
    }
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wireframeGeometry.dispose()
    }
  }, [wireframeGeometry])

  return (
    <group ref={globeRef}>
      {/* Wireframe sphere */}
      <lineSegments ref={wireframeRef} geometry={wireframeGeometry}>
        <lineBasicMaterial
          color={BRAND_PRIMARY}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </lineSegments>

      {/* Inner glow sphere */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS * 0.98, 32, 32]} />
        <meshBasicMaterial
          color={BRAND_PRIMARY}
          transparent
          opacity={0.03}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

interface ParticlesProps {
  animate: boolean
}

function Particles({ animate }: ParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)

  // Create particle geometry with positions and colors
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    const color = new THREE.Color(BRAND_PRIMARY)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Random position on sphere using golden spiral
      const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2
      const radiusAtY = Math.sqrt(1 - y * y)
      const theta = ((Math.PI * (1 + Math.sqrt(5))) * i)

      positions[i * 3] = Math.cos(theta) * radiusAtY * GLOBE_RADIUS
      positions[i * 3 + 1] = y * GLOBE_RADIUS
      positions[i * 3 + 2] = Math.sin(theta) * radiusAtY * GLOBE_RADIUS

      // Vary color intensity
      const intensity = 0.5 + Math.random() * 0.5
      colors[i * 3] = color.r * intensity
      colors[i * 3 + 1] = color.g * intensity
      colors[i * 3 + 2] = color.b * intensity
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return geo
  }, [])

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  // Animate particles
  useFrame((_, delta) => {
    if (animate && pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.05
    }
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.03}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

interface RouteArcProps {
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  animate: boolean
}

function RouteArc({ start, end, animate }: RouteArcProps) {
  const [dashOffset, setDashOffset] = useState(0)

  const points = useMemo(() => {
    const startVec = latLngToVector3(start.lat, start.lng)
    const endVec = latLngToVector3(end.lat, end.lng)
    return createArcPoints(startVec, endVec)
  }, [start, end])

  useFrame((_, delta) => {
    if (animate) {
      setDashOffset((prev) => (prev + delta * 0.5) % 1)
    }
  })

  return (
    <Line
      points={points}
      color={BRAND_SECONDARY}
      lineWidth={1.5}
      transparent
      opacity={0.7}
      dashed
      dashSize={0.15}
      gapSize={0.08}
      dashOffset={animate ? dashOffset : 0}
    />
  )
}

interface JakartaMarkerProps {
  animate: boolean
  showTooltip?: boolean
}

function JakartaMarker({ animate, showTooltip = true }: JakartaMarkerProps) {
  const markerRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null)
  const [hovered, setHovered] = useState(false)

  const position = useMemo(() => latLngToVector3(JAKARTA.lat, JAKARTA.lng), [])

  // Pulse animation
  useFrame((state) => {
    if (animate && pulseRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.3
      pulseRef.current.scale.setScalar(scale)
      if (pulseRef.current.material) {
        pulseRef.current.material.opacity = 0.6 - Math.sin(state.clock.elapsedTime * 2) * 0.4
      }
    }
  })

  return (
    <group ref={markerRef} position={position}>
      {/* Pulse ring */}
      <mesh ref={pulseRef}>
        <ringGeometry args={[0.08, 0.12, 32]} />
        <meshBasicMaterial
          color={BRAND_PRIMARY}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Center dot */}
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={BRAND_PRIMARY} />
      </mesh>

      {/* Outer ring (static) */}
      <mesh>
        <ringGeometry args={[0.1, 0.11, 32]} />
        <meshBasicMaterial
          color={BRAND_SECONDARY}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Tooltip */}
      {showTooltip && (
        <Html
          position={[0.2, 0.2, 0]}
          style={{
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <div
            className="whitespace-nowrap rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm border border-brand/30"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <span className="text-brand">Jakarta</span> - Hub
          </div>
        </Html>
      )}
    </group>
  )
}

interface DestinationMarkersProps {
  animate: boolean
}

function DestinationMarkers({ animate }: DestinationMarkersProps) {
  return (
    <>
      {DESTINATIONS.map((dest, index) => {
        const position = latLngToVector3(dest.lat, dest.lng)
        return (
          <mesh key={dest.name} position={position}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshBasicMaterial
              color={BRAND_PRIMARY}
              transparent
              opacity={0.7}
            />
          </mesh>
        )
      })}
    </>
  )
}

interface SceneProps {
  animate: boolean
}

function Scene({ animate }: SceneProps) {
  const { camera } = useThree()

  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 0, 7)
    camera.lookAt(0, 0, 0)
  }, [camera])

  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={0.5} />

      {/* Point light for glow effect */}
      <pointLight
        position={[5, 5, 5]}
        intensity={0.5}
        color={BRAND_PRIMARY}
      />

      {/* Globe components */}
      <Globe animate={animate} />
      <Particles animate={animate} />

      {/* Route arcs from Jakarta */}
      {DESTINATIONS.map((dest) => (
        <RouteArc
          key={dest.name}
          start={JAKARTA}
          end={dest}
          animate={animate}
        />
      ))}

      {/* Markers */}
      <JakartaMarker animate={animate} />
      <DestinationMarkers animate={animate} />
    </>
  )
}

// =====================================================
// Fallback Component
// =====================================================

function FallbackMap() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <Image
        src="/maps/map-hero.svg"
        alt="Global logistics network"
        fill
        className="object-contain opacity-30"
        priority={false}
      />
    </div>
  )
}

// =====================================================
// Vignette Overlay Component
// =====================================================

function VignetteOverlay() {
  return (
    <>
      {/* Top vignette */}
      <div className="hero-vignette-top absolute inset-x-0 top-0 h-32 pointer-events-none" />

      {/* Bottom vignette */}
      <div className="hero-vignette-bottom absolute inset-x-0 bottom-0 h-40 pointer-events-none" />

      {/* Left vignette */}
      <div className="hero-vignette-left absolute inset-y-0 left-0 w-32 pointer-events-none" />

      {/* Right vignette */}
      <div className="hero-vignette-right absolute inset-y-0 right-0 w-32 pointer-events-none" />

      {/* Center radial gradient for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 60% 50%, transparent 30%, hsl(var(--background)) 80%)`,
        }}
      />
    </>
  )
}

// =====================================================
// Main Component
// =====================================================

export interface HeroGlobeBgProps {
  className?: string
}

export function HeroGlobeBg({ className = '' }: HeroGlobeBgProps) {
  const { isDesktop, supportsWebGL, prefersReducedMotion, isMounted } = useUIStore()
  const [isClient, setIsClient] = useState(false)

  // Ensure we're on client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Determine if we should render 3D
  const shouldRender3D = isClient && isMounted && isDesktop && supportsWebGL
  const shouldAnimate = !prefersReducedMotion

  return (
    <div className={`absolute inset-0 -z-10 pointer-events-none ${className}`}>
      <AnimatePresence mode="wait">
        {!isClient ? (
          // SSR placeholder
          <motion.div
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background"
          />
        ) : shouldRender3D ? (
          // 3D Globe
          <motion.div
            key="globe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <Canvas
              dpr={[1, 1.5]}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
              }}
              camera={{ fov: 45, near: 0.1, far: 100 }}
              style={{ background: 'transparent' }}
            >
              <Scene animate={shouldAnimate} />
            </Canvas>
          </motion.div>
        ) : (
          // Fallback SVG Map
          <motion.div
            key="fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <FallbackMap />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vignette overlays for text readability */}
      <VignetteOverlay />
    </div>
  )
}

export default HeroGlobeBg
