/**
 * useOSMBuilding — Fetches real building footprint polygons from OpenStreetMap
 * via the Overpass API, given a lat/lng coordinate.
 *
 * Returns the closest building's outline as an array of {x, z} points
 * (in metres, centred on the building) plus height info if available.
 *
 * Falls back gracefully: if no footprint is found or the request fails,
 * the caller can continue with the parametric model.
 */

import { useState, useEffect, useRef } from 'react'

/* ─── Types ─── */
export interface BuildingFootprint {
  /** Outline points in local metres, centred on centroid.  Closed polygon. */
  points: { x: number; z: number }[]
  /** Building height in metres (from OSM tags, or estimated from levels) */
  height: number
  /** Number of floors if known */
  levels: number | null
  /** Raw OSM building type tag (e.g. "residential", "apartments") */
  osmType: string | null
  /** Whether this footprint has inner holes (courtyards etc.) */
  holes: { x: number; z: number }[][]
}

export interface UseOSMBuildingResult {
  footprint: BuildingFootprint | null
  loading: boolean
  error: string | null
}

/* ─── Simple in-memory cache keyed on "lat,lng" rounded to 6dp ─── */
const cache = new Map<string, BuildingFootprint | null>()

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

/* ─── Haversine distance (metres) between two lat/lng points ─── */
function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ─── Convert lat/lng polygon to local metre coords centred on centroid ─── */
function toLocalMetres(
  geometry: { lat: number; lon: number }[],
  centroidLat: number,
  centroidLon: number,
): { x: number; z: number }[] {
  // At the centroid's latitude, 1° longitude = cos(lat) × 111320 m
  const metreLat = 111320
  const metreLon = 111320 * Math.cos((centroidLat * Math.PI) / 180)

  return geometry.map((p) => ({
    x: (p.lon - centroidLon) * metreLon,
    z: -(p.lat - centroidLat) * metreLat, // negate so north = -z (Three.js convention)
  }))
}

/* ─── Pick the closest building to the target coordinate ─── */
function pickClosest(
  elements: any[],
  targetLat: number,
  targetLon: number,
): any | null {
  let best: any = null
  let bestDist = Infinity

  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 3) continue

    // Compute centroid of the polygon
    let cLat = 0
    let cLon = 0
    for (const p of el.geometry) {
      cLat += p.lat
      cLon += p.lon
    }
    cLat /= el.geometry.length
    cLon /= el.geometry.length

    const dist = haversineMetres(targetLat, targetLon, cLat, cLon)
    if (dist < bestDist) {
      bestDist = dist
      best = el
    }
  }

  return best
}

/* ─── Derive height from OSM tags + property data ─── */
function deriveHeight(
  tags: Record<string, string> | undefined,
  propertyFloors?: number,
): { height: number; levels: number | null } {
  const FLOOR_HEIGHT = 2.8 // metres per floor

  if (tags?.height) {
    const h = parseFloat(tags.height)
    if (!isNaN(h) && h > 0) {
      const levels = tags['building:levels'] ? parseInt(tags['building:levels'], 10) : null
      return { height: h, levels }
    }
  }

  if (tags?.['building:levels']) {
    const lvl = parseInt(tags['building:levels'], 10)
    if (!isNaN(lvl) && lvl > 0) return { height: lvl * FLOOR_HEIGHT, levels: lvl }
  }

  // Fall back to property data
  if (propertyFloors && propertyFloors > 0) {
    return { height: propertyFloors * FLOOR_HEIGHT, levels: propertyFloors }
  }

  // Ultimate fallback: 2-storey house
  return { height: 2 * FLOOR_HEIGHT, levels: 2 }
}

/* ─── The Hook ─── */
export function useOSMBuilding(
  latitude: number | undefined,
  longitude: number | undefined,
  floors?: number,
): UseOSMBuildingResult {
  const [footprint, setFootprint] = useState<BuildingFootprint | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!latitude || !longitude) return

    const key = cacheKey(latitude, longitude)
    if (cache.has(key)) {
      setFootprint(cache.get(key)!)
      setLoading(false)
      return
    }

    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const query = `[out:json][timeout:15];
(
  way["building"](around:40,${latitude},${longitude});
);
out geom;`

    const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

    fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Overpass API ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return

        const elements = (data.elements || []).filter(
          (el: any) => el.type === 'way' && el.geometry && el.geometry.length >= 3,
        )

        if (elements.length === 0) {
          cache.set(key, null)
          setFootprint(null)
          setLoading(false)
          return
        }

        const closest = pickClosest(elements, latitude, longitude)
        if (!closest) {
          cache.set(key, null)
          setFootprint(null)
          setLoading(false)
          return
        }

        // Compute centroid
        let cLat = 0
        let cLon = 0
        for (const p of closest.geometry) {
          cLat += p.lat
          cLon += p.lon
        }
        cLat /= closest.geometry.length
        cLon /= closest.geometry.length

        const points = toLocalMetres(closest.geometry, cLat, cLon)
        const { height, levels } = deriveHeight(closest.tags, floors)

        const result: BuildingFootprint = {
          points,
          height,
          levels,
          osmType: closest.tags?.building || null,
          holes: [], // TODO: handle relation members for courtyards
        }

        cache.set(key, result)
        setFootprint(result)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn('OSM building fetch failed, will use parametric model:', err.message)
        cache.set(key, null)
        setError(err.message)
        setFootprint(null)
        setLoading(false)
      })

    return () => controller.abort()
  }, [latitude, longitude, floors])

  return { footprint, loading, error }
}
