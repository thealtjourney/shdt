/**
 * PropertyViewer3D — 3D Digital Twin viewer for individual properties.
 *
 * Fetches real building footprints from OpenStreetMap via the Overpass API
 * and extrudes them into 3D geometry.  Falls back to a parametric model
 * when no OSM data is available.
 *
 * Overlays enrichment data (EPC, repairs, complaints, crime, flood) as visual layers.
 *
 * Uses React Three Fiber + Drei for WebGL rendering inside React.
 */

import { useState, useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html, Environment, ContactShadows, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { useOSMBuilding, type BuildingFootprint } from '../hooks/useOSMBuilding'

/* ─── Types ─── */
interface PropertyData {
  id?: string
  address?: string
  postcode?: string
  property_type?: string
  bedrooms?: number
  year_built?: number
  heating_type?: string
  epc_rating?: string
  epc_potential_rating?: string
  stock_condition_score?: number
  floor_area_m2?: number
  wall_type?: string
  wall_insulation?: string
  roof_insulation?: string
  main_heating?: string
  windows?: string
  co2_emissions?: number
  energy_cost_current?: number
  energy_cost_potential?: number
  crime_risk_score?: number
  crime_burglary_3months?: number
  crime_violence_3months?: number
  crime_antisocial_3months?: number
  flood_zone?: string
  flood_risk_rivers_seas?: string
  flood_risk_surface_water?: string
  imd_decile?: number
  imd_rank?: number
  ward_name?: string
  local_authority_name?: string
  region?: string
  latitude?: number
  longitude?: number
}

interface PropertyViewer3DProps {
  property: PropertyData
  onClose: () => void
}

/* ─── Constants ─── */
const EPC_COLORS: Record<string, string> = {
  A: '#00A651', B: '#50B848', C: '#BDD62E', D: '#FDB913', E: '#F37021', F: '#ED1C24', G: '#9E1B1E',
}

const EPC_SCORES: Record<string, number> = {
  A: 95, B: 82, C: 70, D: 58, E: 40, F: 25, G: 10,
}

/* ─── Building Geometry Params ─── */
function getBuildingParams(prop: PropertyData) {
  const type = (prop.property_type || '').toLowerCase()
  const bedrooms = prop.bedrooms || 2
  const floorArea = prop.floor_area_m2 || (bedrooms * 18 + 25)
  const yearBuilt = prop.year_built || 1970

  let width = 5
  let depth = 8
  let floors = 1
  let roofType: 'pitched' | 'flat' | 'hipped' = 'pitched'
  let hasChimney = yearBuilt < 1980
  let hasGarage = false
  let hasPorch = false
  let hasBayWindow = false
  let wallThickness = 0.3

  if (type.includes('flat') || type.includes('maisonette')) {
    width = 12
    depth = 10
    floors = type.includes('maisonette') ? 2 : 4
    roofType = 'flat'
    hasChimney = false
  } else if (type.includes('bungalow')) {
    width = Math.sqrt(floorArea) * 1.3
    depth = floorArea / width
    floors = 1
    roofType = 'hipped'
    hasChimney = yearBuilt < 1985
  } else if (type.includes('detached') && !type.includes('semi')) {
    width = Math.sqrt(floorArea / 2) * 1.1
    depth = (floorArea / 2) / width
    floors = 2
    roofType = 'hipped'
    hasGarage = bedrooms >= 3
    hasPorch = true
    hasBayWindow = yearBuilt > 1920 && yearBuilt < 1970
  } else if (type.includes('semi')) {
    width = Math.sqrt(floorArea / 2) * 0.85
    depth = (floorArea / 2) / width
    floors = 2
    roofType = 'pitched'
    hasBayWindow = yearBuilt > 1930 && yearBuilt < 1970
    hasPorch = yearBuilt > 1960
  } else if (type.includes('terrace') || type.includes('town')) {
    width = Math.sqrt(floorArea / 2) * 0.7
    depth = (floorArea / 2) / width
    floors = type.includes('end') ? 2 : 2
    roofType = 'pitched'
    hasChimney = yearBuilt < 1970
  } else {
    // Default to semi-detached proportions
    width = 6
    depth = 8
    floors = 2
    roofType = 'pitched'
  }

  const floorHeight = 2.7
  const totalHeight = floors * floorHeight

  return {
    width, depth, floors, floorHeight, totalHeight, roofType,
    hasChimney, hasGarage, hasPorch, hasBayWindow, wallThickness,
    bedrooms, yearBuilt, type,
  }
}

/* ─── Wall Material with EPC thermal colour ─── */
function useWallMaterial(epcRating: string | undefined, showThermal: boolean) {
  return useMemo(() => {
    if (showThermal && epcRating) {
      const color = EPC_COLORS[epcRating] || '#FDB913'
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.8,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.3,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#E8DCCF'),
      roughness: 0.9,
      metalness: 0.02,
    })
  }, [epcRating, showThermal])
}

/* ─── Thermal Glow Shell — visible heat radiation overlay ─── */
function ThermalGlow({ width, height, depth, epcRating }: {
  width: number; height: number; depth: number; epcRating?: string
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const color = EPC_COLORS[epcRating || 'D'] || '#FDB913'

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = 0.12 + Math.sin(clock.elapsedTime * 2) * 0.06
    }
  })

  return (
    <mesh ref={meshRef} position={[0, height / 2, 0]}>
      <boxGeometry args={[width + 0.6, height + 0.3, depth + 0.6]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.BackSide}
        emissive={color}
        emissiveIntensity={0.6}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ─── Building Component ─── */
function Building({ property, showThermal, showRepairs, showFlood }: {
  property: PropertyData
  showThermal: boolean
  showRepairs: boolean
  showFlood: boolean
}) {
  const params = useMemo(() => getBuildingParams(property), [property])
  const wallMat = useWallMaterial(property.epc_rating, showThermal)
  const groupRef = useRef<THREE.Group>(null!)

  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.yearBuilt < 1940 ? '#5C4033' : '#666'),
    roughness: 0.8,
  }), [params.yearBuilt])

  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#87CEEB'),
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.6,
  }), [])

  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6B3A2A'),
    roughness: 0.6,
  }), [])

  const { width, depth, floors, floorHeight, totalHeight, roofType, hasChimney, hasGarage, hasPorch, hasBayWindow } = params

  // Generate window positions
  const windows = useMemo(() => {
    const wins: { x: number; y: number; z: number; face: 'front' | 'back' | 'left' | 'right' }[] = []
    const winWidth = 0.9
    const winHeight = 1.1
    const winSpacing = width / (Math.min(params.bedrooms + 1, 4) + 1)

    for (let floor = 0; floor < floors; floor++) {
      const numWins = floor === 0 ? Math.min(params.bedrooms, 3) : Math.min(params.bedrooms + 1, 4)
      for (let w = 0; w < numWins; w++) {
        const xPos = -width / 2 + winSpacing * (w + 1)
        const yPos = floor * floorHeight + floorHeight * 0.55
        wins.push({ x: xPos, y: yPos, z: depth / 2 + 0.01, face: 'front' })
        wins.push({ x: xPos, y: yPos, z: -(depth / 2 + 0.01), face: 'back' })
      }
    }
    return wins
  }, [floors, floorHeight, width, depth, params.bedrooms])

  // Repair hotspot markers
  const repairMarkers = useMemo(() => {
    if (!showRepairs) return []
    const markers: { pos: [number, number, number]; label: string; color: string }[] = []

    const heating = (property.main_heating || property.heating_type || '').toLowerCase()
    if (heating.includes('gas') || heating.includes('boiler')) {
      markers.push({ pos: [width / 2 - 0.5, totalHeight * 0.7, depth / 2 + 0.3], label: 'Boiler', color: '#EF4444' })
    }

    const wallIns = (property.wall_insulation || '').toLowerCase()
    if (wallIns.includes('no') || wallIns === '' || wallIns.includes('none')) {
      markers.push({ pos: [-width / 2 - 0.3, totalHeight * 0.5, 0], label: 'No Wall Insulation', color: '#F59E0B' })
    }

    const roofIns = (property.roof_insulation || '').toLowerCase()
    if (roofIns.includes('no') || roofIns === '' || roofIns.includes('none') || roofIns.includes('limited')) {
      markers.push({ pos: [0, totalHeight + 1.2, 0], label: 'Roof: Insulation Needed', color: '#F59E0B' })
    }

    const windowType = (property.windows || '').toLowerCase()
    if (windowType.includes('single')) {
      markers.push({ pos: [0, totalHeight * 0.5, depth / 2 + 0.3], label: 'Single Glazing', color: '#3B82F6' })
    }

    return markers
  }, [showRepairs, property, width, depth, totalHeight])

  return (
    <group ref={groupRef}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[width + 8, depth + 8]} />
        <meshStandardMaterial color="#5a8a4a" roughness={1} />
      </mesh>

      {/* Garden path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, depth / 2 + 1.5]}>
        <planeGeometry args={[1.2, 3]} />
        <meshStandardMaterial color="#999" roughness={0.9} />
      </mesh>

      {/* Main building body */}
      <mesh position={[0, totalHeight / 2, 0]} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[width, totalHeight, depth]} />
      </mesh>

      {/* Floor lines */}
      {Array.from({ length: floors - 1 }, (_, i) => (
        <mesh key={`floor-${i}`} position={[0, (i + 1) * floorHeight, depth / 2 + 0.01]}>
          <planeGeometry args={[width - 0.1, 0.04]} />
          <meshStandardMaterial color="#999" />
        </mesh>
      ))}

      {/* Pitched Roof */}
      {roofType === 'pitched' && (
        <mesh position={[0, totalHeight + 1.1, 0]} castShadow material={roofMat}>
          <coneGeometry args={[width / 2 * 1.15, 2.2, 4]} />
        </mesh>
      )}

      {/* Hipped Roof */}
      {roofType === 'hipped' && (
        <mesh position={[0, totalHeight + 0.8, 0]} castShadow rotation={[0, Math.PI / 4, 0]} material={roofMat}>
          <coneGeometry args={[Math.max(width, depth) / 2 * 1.1, 1.6, 4]} />
        </mesh>
      )}

      {/* Flat Roof edge */}
      {roofType === 'flat' && (
        <mesh position={[0, totalHeight + 0.1, 0]} castShadow>
          <boxGeometry args={[width + 0.2, 0.2, depth + 0.2]} />
          <meshStandardMaterial color="#555" roughness={0.8} />
        </mesh>
      )}

      {/* Chimney */}
      {hasChimney && (
        <mesh position={[width / 2 - 0.5, totalHeight + (roofType === 'flat' ? 0.8 : 2.2), 0]} castShadow>
          <boxGeometry args={[0.6, 1.6, 0.6]} />
          <meshStandardMaterial color="#A0522D" roughness={0.85} />
        </mesh>
      )}

      {/* Windows */}
      {windows.map((w, i) => (
        <group key={`win-${i}`}>
          <mesh position={[w.x, w.y, w.z]} material={windowMat}>
            <planeGeometry args={[0.9, 1.1]} />
          </mesh>
          {/* Window frame */}
          <mesh position={[w.x, w.y, w.z + (w.face === 'front' ? 0.005 : -0.005)]}>
            <planeGeometry args={[0.95, 1.15]} />
            <meshStandardMaterial color="white" roughness={0.5} />
          </mesh>
          <mesh position={[w.x, w.y, w.z + (w.face === 'front' ? 0.01 : -0.01)]} material={windowMat}>
            <planeGeometry args={[0.85, 1.05]} />
          </mesh>
          {/* Mullion */}
          <mesh position={[w.x, w.y, w.z + (w.face === 'front' ? 0.015 : -0.015)]}>
            <planeGeometry args={[0.03, 1.05]} />
            <meshStandardMaterial color="white" />
          </mesh>
        </group>
      ))}

      {/* Front door */}
      <mesh position={[0, 1, depth / 2 + 0.02]} material={doorMat}>
        <planeGeometry args={[0.95, 2]} />
      </mesh>
      {/* Door frame */}
      <mesh position={[0, 1.05, depth / 2 + 0.015]}>
        <planeGeometry args={[1.1, 2.15]} />
        <meshStandardMaterial color="white" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1, depth / 2 + 0.025]} material={doorMat}>
        <planeGeometry args={[0.9, 1.95]} />
      </mesh>

      {/* Door number */}
      <Text
        position={[0, 1.7, depth / 2 + 0.04]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {(property.address || '').match(/^\d+/)?.[0] || ''}
      </Text>

      {/* Porch */}
      {hasPorch && (
        <group>
          <mesh position={[0, 1.15, depth / 2 + 0.7]} castShadow>
            <boxGeometry args={[1.6, 0.08, 1.4]} />
            <meshStandardMaterial color="#777" />
          </mesh>
          {/* Porch pillars */}
          <mesh position={[-0.7, 0.58, depth / 2 + 1.3]}>
            <cylinderGeometry args={[0.06, 0.06, 1.15, 8]} />
            <meshStandardMaterial color="white" />
          </mesh>
          <mesh position={[0.7, 0.58, depth / 2 + 1.3]}>
            <cylinderGeometry args={[0.06, 0.06, 1.15, 8]} />
            <meshStandardMaterial color="white" />
          </mesh>
        </group>
      )}

      {/* Bay Window */}
      {hasBayWindow && (
        <group position={[-width / 4, floorHeight * 0.55, depth / 2]}>
          <mesh position={[0, 0, 0.5]} material={wallMat} castShadow>
            <boxGeometry args={[1.6, 1.4, 1]} />
          </mesh>
          <mesh position={[0, 0, 1.01]} material={windowMat}>
            <planeGeometry args={[1.4, 1.2]} />
          </mesh>
          <mesh position={[-0.81, 0, 0.5]} material={windowMat} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.8, 1.2]} />
          </mesh>
          <mesh position={[0.81, 0, 0.5]} material={windowMat} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.8, 1.2]} />
          </mesh>
        </group>
      )}

      {/* Garage */}
      {hasGarage && (
        <group position={[width / 2 + 1.8, 1.2, depth / 4]}>
          <mesh castShadow>
            <boxGeometry args={[3, 2.4, depth / 2]} />
            <meshStandardMaterial color="#D0C0A0" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.2, depth / 4 + 0.01]}>
            <planeGeometry args={[2.4, 2]} />
            <meshStandardMaterial color="#555" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* Repair hotspot markers */}
      {repairMarkers.map((m, i) => (
        <group key={`repair-${i}`} position={m.pos}>
          <PulsingMarker color={m.color} />
          <Html distanceFactor={12} center style={{ pointerEvents: 'none' }}>
            <div style={{
              background: m.color, color: 'white', padding: '3px 8px', borderRadius: 6,
              fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}>
              {m.label}
            </div>
          </Html>
        </group>
      ))}

      {/* Thermal glow shell */}
      {showThermal && property.epc_rating && (
        <ThermalGlow width={width} height={totalHeight} depth={depth} epcRating={property.epc_rating} />
      )}

      {/* Flood water plane */}
      {showFlood && property.flood_zone && (
        <FloodPlane
          width={width + 12}
          depth={depth + 12}
          zone={property.flood_zone}
        />
      )}
    </group>
  )
}

/* ─── Real Building (OSM Footprint extruded) ─── */
function RealBuilding({ footprint, property, showThermal, showRepairs, showFlood }: {
  footprint: BuildingFootprint
  property: PropertyData
  showThermal: boolean
  showRepairs: boolean
  showFlood: boolean
}) {
  const wallMat = useWallMaterial(property.epc_rating, showThermal)
  const groupRef = useRef<THREE.Group>(null!)

  // Build extruded geometry from the real footprint polygon
  const geometry = useMemo(() => {
    try {
      const pts = footprint.points
      if (pts.length < 3) return null

      const shape = new THREE.Shape()
      shape.moveTo(pts[0].x, pts[0].z)
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i].x, pts[i].z)
      }
      shape.closePath()

      // Add holes (courtyards) if any
      for (const hole of footprint.holes) {
        if (hole.length < 3) continue
        const holePath = new THREE.Path()
        holePath.moveTo(hole[0].x, hole[0].z)
        for (let i = 1; i < hole.length; i++) {
          holePath.lineTo(hole[i].x, hole[i].z)
        }
        holePath.closePath()
        shape.holes.push(holePath)
      }

      const extrudeSettings = {
        depth: footprint.height,
        bevelEnabled: false,
        steps: 1,
      }

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      // Rotate so extrusion goes upward (Y axis) instead of along Z
      geo.rotateX(-Math.PI / 2)
      return geo
    } catch (err) {
      console.warn('Failed to create building geometry from OSM footprint:', err)
      return null
    }
  }, [footprint])

  // Compute bounding dimensions for ground plane, flood, markers etc.
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of footprint.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const width = maxX - minX
    const depth = maxZ - minZ
    return { width, depth, minX, maxX, minZ, maxZ }
  }, [footprint])

  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#666'),
    roughness: 0.8,
  }), [])

  // Repair / maintenance markers — always show something useful
  const repairMarkers = useMemo(() => {
    if (!showRepairs) return []
    const markers: { pos: [number, number, number]; label: string; color: string; severity: 'high' | 'medium' | 'low' }[] = []
    const h = footprint.height

    // Heating system
    const heating = (property.main_heating || property.heating_type || '').toLowerCase()
    if (heating) {
      const isOldSystem = heating.includes('gas') || heating.includes('boiler') || heating.includes('oil')
      markers.push({
        pos: [bounds.maxX + 0.5, h * 0.7, 0],
        label: `Heating: ${property.main_heating || property.heating_type || 'Unknown'}`,
        color: isOldSystem ? '#EF4444' : '#10B981',
        severity: isOldSystem ? 'high' : 'low',
      })
    }

    // Wall insulation
    const wallIns = (property.wall_insulation || '').toLowerCase()
    if (wallIns) {
      const poor = wallIns.includes('no') || wallIns.includes('none') || wallIns.includes('partial')
      markers.push({
        pos: [bounds.minX - 0.5, h * 0.5, 0],
        label: `Walls: ${property.wall_insulation}`,
        color: poor ? '#F59E0B' : '#10B981',
        severity: poor ? 'medium' : 'low',
      })
    }

    // Roof insulation
    const roofIns = (property.roof_insulation || '').toLowerCase()
    if (roofIns) {
      const poor = roofIns.includes('no') || roofIns.includes('none') || roofIns.includes('limited')
      markers.push({
        pos: [0, h + 1.5, 0],
        label: `Roof: ${property.roof_insulation}`,
        color: poor ? '#F59E0B' : '#10B981',
        severity: poor ? 'medium' : 'low',
      })
    }

    // Windows
    const windowType = (property.windows || '').toLowerCase()
    if (windowType) {
      const poor = windowType.includes('single')
      markers.push({
        pos: [0, h * 0.5, bounds.maxZ + 0.5],
        label: `Windows: ${property.windows}`,
        color: poor ? '#3B82F6' : '#10B981',
        severity: poor ? 'medium' : 'low',
      })
    }

    // Stock condition
    if (property.stock_condition_score != null) {
      const score = property.stock_condition_score
      markers.push({
        pos: [bounds.maxX + 0.5, h * 0.3, bounds.maxZ * 0.5],
        label: `Condition: ${score}/100`,
        color: score < 40 ? '#EF4444' : score < 70 ? '#F59E0B' : '#10B981',
        severity: score < 40 ? 'high' : score < 70 ? 'medium' : 'low',
      })
    }

    return markers
  }, [showRepairs, property, footprint, bounds])

  if (!geometry) return null

  return (
    <group ref={groupRef}>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[bounds.width + 10, bounds.depth + 10]} />
        <meshStandardMaterial color="#5a8a4a" roughness={1} />
      </mesh>

      {/* Real building body */}
      <mesh castShadow receiveShadow material={wallMat} geometry={geometry} />

      {/* Thermal glow shell when EPC thermal is active */}
      {showThermal && property.epc_rating && (
        <ThermalGlow
          width={bounds.width}
          height={footprint.height}
          depth={bounds.depth}
          epcRating={property.epc_rating}
        />
      )}

      {/* Flat roof cap */}
      <mesh position={[0, footprint.height + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={roofMat}>
        <planeGeometry args={[bounds.width + 0.2, bounds.depth + 0.2]} />
      </mesh>

      {/* Repair hotspot markers */}
      {repairMarkers.map((m, i) => (
        <group key={`repair-${i}`} position={m.pos}>
          <PulsingMarker color={m.color} />
          {/* Connecting line from marker to building */}
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.6, 4]} />
            <meshStandardMaterial color={m.color} transparent opacity={0.5} />
          </mesh>
          <Html distanceFactor={10} center style={{ pointerEvents: 'none' }}>
            <div style={{
              background: m.color, color: 'white', padding: '4px 10px', borderRadius: 6,
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              borderLeft: m.severity === 'high' ? '3px solid #fff' : 'none',
            }}>
              {m.severity === 'high' ? '⚠ ' : m.severity === 'medium' ? '• ' : '✓ '}{m.label}
            </div>
          </Html>
        </group>
      ))}

      {/* Flood water plane — show for any flood data */}
      {showFlood && property.flood_zone && (
        <FloodPlane
          width={bounds.width + 14}
          depth={bounds.depth + 14}
          zone={property.flood_zone}
        />
      )}
    </group>
  )
}

/* ─── Pulsing Marker ─── */
function PulsingMarker({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (!meshRef.current) return // guard: ref not yet assigned
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.15
    meshRef.current.scale.set(s, s, s)
  })
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  )
}

/* ─── Flood Plane ─── */
function FloodPlane({ width, depth, zone }: { width: number; depth: number; zone: string }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const baseHeight = zone === 'Zone 3' ? 0.6 : zone === 'Zone 2' ? 0.3 : 0.08

  useFrame(({ clock }) => {
    const y = baseHeight + Math.sin(clock.elapsedTime * 0.8) * 0.08
    if (meshRef.current) meshRef.current.position.y = y
  })

  const opacity = zone === 'Zone 3' ? 0.45 : zone === 'Zone 2' ? 0.30 : 0.12
  const color = zone === 'Zone 3' ? '#1565C0' : zone === 'Zone 2' ? '#1E88E5' : '#42A5F5'

  return (
    <group>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, baseHeight, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          emissive={color}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Zone label */}
      <Html position={[width / 2 - 1, baseHeight + 0.3, depth / 2 - 1]} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: zone === 'Zone 3' ? '#DC2626' : zone === 'Zone 2' ? '#F59E0B' : '#3B82F6',
          color: 'white', padding: '3px 10px', borderRadius: 6,
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          Flood {zone}
        </div>
      </Html>
    </group>
  )
}

/* ─── Floating Data Card (HTML overlay in 3D space) ─── */
function DataCard({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  return (
    <Html position={position} distanceFactor={15} center style={{ pointerEvents: 'none' }}>
      <div style={{
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(8px)',
        minWidth: 140,
        border: '1px solid #e5e7eb',
      }}>
        {children}
      </div>
    </Html>
  )
}

/* ─── Scene Setup ─── */
function Scene({ property, footprint, showThermal, showRepairs, showFlood, showDataCards }: {
  property: PropertyData
  footprint: BuildingFootprint | null
  showThermal: boolean
  showRepairs: boolean
  showFlood: boolean
  showDataCards: boolean
}) {
  const params = getBuildingParams(property)

  // Use footprint dimensions when available, otherwise parametric
  const bWidth = footprint
    ? Math.max(...footprint.points.map(p => p.x)) - Math.min(...footprint.points.map(p => p.x))
    : params.width
  const bHeight = footprint ? footprint.height : params.totalHeight
  const bDepth = footprint
    ? Math.max(...footprint.points.map(p => p.z)) - Math.min(...footprint.points.map(p => p.z))
    : params.depth

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} />

      <Sky sunPosition={[100, 40, 100]} />

      {/* Building — real footprint or parametric fallback */}
      {footprint ? (
        <RealBuilding
          footprint={footprint}
          property={property}
          showThermal={showThermal}
          showRepairs={showRepairs}
          showFlood={showFlood}
        />
      ) : (
        <Building
          property={property}
          showThermal={showThermal}
          showRepairs={showRepairs}
          showFlood={showFlood}
        />
      )}

      {/* Floating data cards */}
      {showDataCards && (
        <>
          {/* EPC Card */}
          {property.epc_rating && (
            <DataCard position={[-bWidth / 2 - 2.5, bHeight * 0.7, 0]}>
              <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Energy Rating</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  display: 'inline-block', width: 28, height: 28, borderRadius: 6,
                  backgroundColor: EPC_COLORS[property.epc_rating] || '#999',
                  color: 'white', fontWeight: 700, fontSize: 16, textAlign: 'center', lineHeight: '28px',
                }}>
                  {property.epc_rating}
                </span>
                {property.epc_potential_rating && (
                  <>
                    <span style={{ fontSize: 12, color: '#999' }}>→</span>
                    <span style={{
                      display: 'inline-block', width: 28, height: 28, borderRadius: 6,
                      backgroundColor: EPC_COLORS[property.epc_potential_rating] || '#999',
                      color: 'white', fontWeight: 700, fontSize: 16, textAlign: 'center', lineHeight: '28px',
                    }}>
                      {property.epc_potential_rating}
                    </span>
                  </>
                )}
              </div>
              {property.energy_cost_current != null && (
                <p style={{ fontSize: 10, color: '#666', margin: '4px 0 0' }}>
                  £{property.energy_cost_current}/yr → £{property.energy_cost_potential}/yr
                </p>
              )}
            </DataCard>
          )}

          {/* Crime Card */}
          {property.crime_risk_score != null && (
            <DataCard position={[bWidth / 2 + 2.5, bHeight * 0.7, 0]}>
              <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Crime Risk</p>
              <p style={{
                fontSize: 22, fontWeight: 700, margin: '2px 0',
                color: property.crime_risk_score >= 7 ? '#DC2626' : property.crime_risk_score >= 4 ? '#F59E0B' : '#10B981',
              }}>
                {property.crime_risk_score}<span style={{ fontSize: 12, color: '#999' }}>/10</span>
              </p>
              <div style={{ fontSize: 10, color: '#666', lineHeight: 1.5 }}>
                {property.crime_burglary_3months != null && <div>Burglary: {property.crime_burglary_3months}</div>}
                {property.crime_violence_3months != null && <div>Violence: {property.crime_violence_3months}</div>}
                {property.crime_antisocial_3months != null && <div>ASB: {property.crime_antisocial_3months}</div>}
              </div>
            </DataCard>
          )}

          {/* Flood Card */}
          {property.flood_zone && (
            <DataCard position={[bWidth / 2 + 2.5, bHeight * 0.2, 0]}>
              <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Flood Risk</p>
              <p style={{
                fontSize: 14, fontWeight: 700, margin: '2px 0',
                color: property.flood_zone === 'Zone 3' ? '#DC2626' : property.flood_zone === 'Zone 2' ? '#F59E0B' : '#10B981',
              }}>
                {property.flood_zone}
              </p>
              <div style={{ fontSize: 10, color: '#666', lineHeight: 1.5 }}>
                {property.flood_risk_rivers_seas && <div>Rivers/Sea: {property.flood_risk_rivers_seas}</div>}
                {property.flood_risk_surface_water && <div>Surface: {property.flood_risk_surface_water}</div>}
              </div>
            </DataCard>
          )}

          {/* Condition / IMD Card */}
          {(property.stock_condition_score != null || property.imd_decile != null) && (
            <DataCard position={[-bWidth / 2 - 2.5, bHeight * 0.2, 0]}>
              {property.stock_condition_score != null && (
                <>
                  <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Condition Score</p>
                  <p style={{
                    fontSize: 22, fontWeight: 700, margin: '2px 0',
                    color: property.stock_condition_score >= 70 ? '#10B981' : property.stock_condition_score >= 40 ? '#F59E0B' : '#DC2626',
                  }}>
                    {property.stock_condition_score}<span style={{ fontSize: 12, color: '#999' }}>/100</span>
                  </p>
                </>
              )}
              {property.imd_decile != null && (
                <>
                  <p style={{ fontSize: 10, color: '#888', margin: '6px 0 0' }}>IMD Deprivation</p>
                  <p style={{
                    fontSize: 14, fontWeight: 700, margin: '2px 0',
                    color: property.imd_decile <= 3 ? '#DC2626' : property.imd_decile <= 6 ? '#F59E0B' : '#10B981',
                  }}>
                    Decile {property.imd_decile}
                    <span style={{ fontSize: 10, color: '#999', fontWeight: 400, marginLeft: 4 }}>
                      {property.imd_decile <= 3 ? '(Most deprived)' : property.imd_decile <= 6 ? '(Mid)' : '(Least deprived)'}
                    </span>
                  </p>
                </>
              )}
            </DataCard>
          )}
        </>
      )}

      <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={30} blur={2} />
      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
        maxDistance={50}
        target={[0, bHeight / 2, 0]}
        enableDamping
        dampingFactor={0.1}
      />
    </>
  )
}

/* ─── Data Panel (2D overlay) ─── */
function DataPanel({ property }: { property: PropertyData }) {
  const params = getBuildingParams(property)

  const statRow = (label: string, value: string | number | undefined | null, color?: string) => {
    if (value == null || value === '') return null
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: color || '#333' }}>{value}</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 260, maxHeight: 'calc(100% - 32px)',
      overflowY: 'auto', background: 'rgba(255,255,255,0.95)', borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)', backdropFilter: 'blur(12px)',
      padding: '16px 18px', zIndex: 20,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>
        {property.address || 'Property'}
      </h3>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        {property.postcode} · {property.ward_name || property.local_authority_name || ''}
      </p>

      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Building</p>
        {statRow('Type', property.property_type)}
        {statRow('Bedrooms', property.bedrooms)}
        {statRow('Year Built', property.year_built)}
        {statRow('Floor Area', property.floor_area_m2 ? `${property.floor_area_m2} m²` : null)}
        {statRow('Heating', property.heating_type || property.main_heating)}
        {statRow('Walls', property.wall_type)}
        {statRow('Wall Insulation', property.wall_insulation)}
        {statRow('Roof Insulation', property.roof_insulation)}
        {statRow('Windows', property.windows)}
      </div>

      {property.epc_rating && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Energy</p>
          {statRow('Current EPC', property.epc_rating, EPC_COLORS[property.epc_rating])}
          {statRow('Potential EPC', property.epc_potential_rating, property.epc_potential_rating ? EPC_COLORS[property.epc_potential_rating] : undefined)}
          {statRow('CO₂ Emissions', property.co2_emissions != null ? `${property.co2_emissions} t/yr` : null)}
          {statRow('Energy Cost', property.energy_cost_current != null ? `£${property.energy_cost_current}/yr` : null)}
          {statRow('Potential Cost', property.energy_cost_potential != null ? `£${property.energy_cost_potential}/yr` : null)}
        </div>
      )}

      {property.crime_risk_score != null && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Safety & Risk</p>
          {statRow('Crime Risk', `${property.crime_risk_score}/10`,
            property.crime_risk_score >= 7 ? '#DC2626' : property.crime_risk_score >= 4 ? '#F59E0B' : '#10B981')}
          {statRow('Flood Zone', property.flood_zone,
            property.flood_zone === 'Zone 3' ? '#DC2626' : property.flood_zone === 'Zone 2' ? '#F59E0B' : '#10B981')}
          {statRow('IMD Decile', property.imd_decile != null ? `${property.imd_decile}/10` : null,
            (property.imd_decile || 10) <= 3 ? '#DC2626' : (property.imd_decile || 10) <= 6 ? '#F59E0B' : '#10B981')}
          {statRow('Condition', property.stock_condition_score != null ? `${property.stock_condition_score}/100` : null)}
        </div>
      )}

      {property.local_authority_name && (
        <div>
          <p style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Location</p>
          {statRow('Local Authority', property.local_authority_name)}
          {statRow('Region', property.region)}
          {statRow('Ward', property.ward_name)}
        </div>
      )}
    </div>
  )
}

/* ─── Layer Toggle Bar ─── */
function LayerBar({ layers, onChange }: {
  layers: { thermal: boolean; repairs: boolean; flood: boolean; dataCards: boolean }
  onChange: (key: string, val: boolean) => void
}) {
  const btn = (key: string, label: string, icon: string, active: boolean) => (
    <button
      key={key}
      onClick={() => onChange(key, !active)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
        borderRadius: 8, border: active ? '2px solid #1B4F72' : '2px solid transparent',
        backgroundColor: active ? '#EBF5FB' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer', fontSize: 12, fontWeight: 600,
        color: active ? '#1B4F72' : '#999',
        transition: 'all 0.2s ease',
        opacity: active ? 1 : 0.6,
        textDecoration: active ? 'none' : 'line-through',
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: active ? '#10B981' : '#D1D5DB',
        display: 'inline-block',
        transition: 'background-color 0.2s ease',
      }} />
    </button>
  )

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 8, zIndex: 20, background: 'rgba(255,255,255,0.9)',
      padding: '8px 12px', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      backdropFilter: 'blur(8px)',
    }}>
      {btn('thermal', 'EPC Thermal', '🌡️', layers.thermal)}
      {btn('repairs', 'Repair Hotspots', '🔧', layers.repairs)}
      {btn('flood', 'Flood Risk', '🌊', layers.flood)}
      {btn('dataCards', 'Data Cards', '📊', layers.dataCards)}
    </div>
  )
}

/* ─── Main Exported Component ─── */
export default function PropertyViewer3D({ property, onClose }: PropertyViewer3DProps) {
  const [layers, setLayers] = useState({
    thermal: true,
    repairs: true,
    flood: true,
    dataCards: true,
  })

  const handleLayerChange = useCallback((key: string, val: boolean) => {
    setLayers(prev => ({ ...prev, [key]: val }))
  }, [])

  // Fetch real building footprint from OpenStreetMap
  const { footprint, loading: osmLoading } = useOSMBuilding(
    property.latitude,
    property.longitude,
    property.bedrooms ? Math.ceil(property.bedrooms / 2) + 1 : undefined, // estimate floors from bedrooms
  )

  // Lock the footprint once resolved — never swap models after the Canvas mounts.
  // This prevents the Three.js scene graph swap that crashes the WebGL context.
  const resolvedFootprint = useRef<BuildingFootprint | null | undefined>(undefined)
  if (!osmLoading && resolvedFootprint.current === undefined) {
    resolvedFootprint.current = footprint // null (no data) or the real footprint
  }
  const canvasReady = resolvedFootprint.current !== undefined
  const activeFootprint = resolvedFootprint.current ?? null

  const modelSource = activeFootprint ? 'OpenStreetMap footprint' : osmLoading ? 'Loading...' : 'Parametric model'

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
      backgroundColor: '#000',
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'white', margin: 0 }}>
              3D Digital Twin — {property.address || 'Property'}
            </h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              {property.postcode} · {property.property_type} · {property.bedrooms} bed · Built {property.year_built}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Model source badge */}
          <span style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
            backgroundColor: footprint ? 'rgba(16,185,129,0.2)' : osmLoading ? 'rgba(255,255,255,0.1)' : 'rgba(245,158,11,0.2)',
            color: footprint ? '#6EE7B7' : osmLoading ? 'rgba(255,255,255,0.5)' : '#FCD34D',
            border: `1px solid ${footprint ? 'rgba(16,185,129,0.3)' : osmLoading ? 'rgba(255,255,255,0.15)' : 'rgba(245,158,11,0.3)'}`,
          }}>
            {modelSource}
          </span>
          {property.epc_rating && (
            <span style={{
              padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: 13,
              backgroundColor: EPC_COLORS[property.epc_rating], color: 'white',
            }}>
              EPC {property.epc_rating}
            </span>
          )}
          {property.crime_risk_score != null && (
            <span style={{
              padding: '4px 12px', borderRadius: 6, fontWeight: 600, fontSize: 12,
              backgroundColor: property.crime_risk_score >= 7 ? '#DC2626' : property.crime_risk_score >= 4 ? '#F59E0B' : '#10B981',
              color: 'white',
            }}>
              Crime {property.crime_risk_score}/10
            </span>
          )}
        </div>
      </div>

      {/* 3D Canvas — only mount ONCE after we know which model to use */}
      {canvasReady ? (
        <Canvas
          shadows
          camera={{ position: [15, 12, 18], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        >
          <Scene
            property={property}
            footprint={activeFootprint}
            showThermal={layers.thermal}
            showRepairs={layers.repairs}
            showFlood={layers.flood}
            showDataCards={layers.dataCards}
          />
        </Canvas>
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div style={{
              width: 40, height: 40, border: '4px solid #333', borderTopColor: '#2980B9',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            <p style={{ fontSize: 14 }}>Fetching building outline from OpenStreetMap...</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>3D model will appear shortly</p>
          </div>
        </div>
      )}

      {/* Data Panel */}
      <DataPanel property={property} />

      {/* Layer toggle bar */}
      <LayerBar layers={layers} onChange={handleLayerChange} />

      {/* Controls hint */}
      <div style={{
        position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
        fontSize: 11, color: 'rgba(255,255,255,0.5)', zIndex: 20, textAlign: 'center',
      }}>
        Drag to orbit · Scroll to zoom · Right-drag to pan
      </div>
    </div>
  )
}
