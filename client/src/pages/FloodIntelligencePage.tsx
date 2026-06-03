import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

/* ─── Types ─── */
interface FloodProperty {
  id: string
  address: string
  postcode: string
  latitude: number
  longitude: number
  flood_zone: string | null
  flood_risk_rivers_seas: string | null
  flood_risk_surface_water: string | null
  active_flood_warnings: number
  epc_rating: string | null
  property_type: string | null
}

interface ForecastProperty extends FloodProperty {
  forecast_risk_score: number
  forecast_risk_level: string | null
  forecast_rainfall_48h_mm: number
  forecast_rainfall_7day_mm: number
  forecast_peak_day: string | null
  forecast_peak_rainfall_mm: number
  forecast_nearby_river_level: string | null
  forecast_updated_at: string | null
}

interface ForecastSummary {
  critical_count: number
  elevated_count: number
  watch_count: number
  normal_count: number
  total_forecasted: number
  peak_risk_day: string | null
  forecast_updated_at: string | null
}

interface DailyTimeline {
  day: string
  avg_rainfall_mm: number
  critical: number
  elevated: number
  watch: number
}

interface ForecastData {
  properties: ForecastProperty[]
  summary: ForecastSummary
  daily_timeline: DailyTimeline[]
}

interface FloodSummary {
  total_properties: number
  total_with_coords: number
  zone_distribution: Record<string, number>
  surface_water_risk: Record<string, number>
  river_sea_risk: Record<string, number>
  properties_with_warnings: number
  total_active_warnings: number
}

interface FloodData {
  properties: FloodProperty[]
  summary: FloodSummary
}

/* ─── WMS Layer Definitions ─── */
interface WmsLayerConfig {
  id: string
  label: string
  group: string
  url: string
  layers: string
  color: string
  opacity: number
  defaultOn: boolean
}

/*
 * EA WMS layer configuration.
 *
 * Updated April 2026: The EA reorganised their spatial data in Jan 2025
 * under the NaFRA2 (National Flood Risk Assessment v2) programme.
 * Old per-zone URLs now return 404 — replaced with combined/NaFRA2 endpoints.
 *
 * Layer names are auto-discovered via our backend proxy (avoids CORS).
 * The `layers` field below is a hardcoded fallback; the backend
 * will override it with the real name from GetCapabilities.
 *
 * Note: Surface water, reservoir & rivers/sea layers have a MaxScaleDenominator
 * of 1:50,000 — they only become visible at zoom level ~11+.
 */
const EA_BASE = 'https://environment.data.gov.uk/spatialdata'

const WMS_LAYERS: WmsLayerConfig[] = [
  {
    id: 'fz_combined',
    label: 'Flood Zones 2 & 3 (Planning)',
    group: 'Flood Zones',
    url: `${EA_BASE}/flood-map-for-planning-flood-zones/wms`,
    layers: 'Flood_Zones_2_3_Rivers_and_Sea', // confirmed via GetCapabilities
    color: '#d32f2f',
    opacity: 0.4,
    defaultOn: true,
  },
  {
    id: 'surface_water',
    label: 'Surface Water Flood Risk',
    group: 'Surface Water',
    url: `${EA_BASE}/nafra2-risk-of-flooding-from-surface-water/wms`,
    layers: 'rofsw', // confirmed via GetCapabilities (NaFRA2)
    color: '#1565c0',
    opacity: 0.35,
    defaultOn: false,
  },
  {
    id: 'rivers_sea',
    label: 'Rivers & Sea Flood Risk',
    group: 'Rivers & Sea',
    url: `${EA_BASE}/nafra2-risk-of-flooding-from-rivers-and-sea/wms`,
    layers: 'rofrs_4band', // confirmed via GetCapabilities (NaFRA2)
    color: '#f57c00',
    opacity: 0.35,
    defaultOn: false,
  },
  {
    id: 'reservoir',
    label: 'Reservoir Flood Extent',
    group: 'Reservoir',
    url: `${EA_BASE}/reservoir-flood-extents-wet-day/wms`,
    layers: '', // auto-discovered via backend (new slug)
    color: '#7b1fa2',
    opacity: 0.3,
    defaultOn: false,
  },
  {
    id: 'historic',
    label: 'Historic Flood Outlines',
    group: 'Historic',
    url: `${EA_BASE}/historic-flood-map/wms`,
    layers: 'Historic_Flood_Map', // confirmed via GetCapabilities
    color: '#795548',
    opacity: 0.35,
    defaultOn: false,
  },
]

/* ─── Colour Helpers ─── */
function getFloodZoneColor(zone: string | null): string {
  if (!zone) return '#9e9e9e'
  if (zone.includes('3')) return '#d32f2f'
  if (zone.includes('2')) return '#f57c00'
  if (zone.includes('1')) return '#1976d2'
  return '#9e9e9e'
}

function getFloodZoneLabel(zone: string | null): string {
  if (!zone) return 'Not Assessed'
  return zone
}

function getForecastRiskColor(level: string | null): string {
  if (!level) return '#bdbdbd'
  switch (level) {
    case 'Critical': return '#d32f2f'
    case 'Elevated': return '#f57c00'
    case 'Watch': return '#fbc02d'
    default: return '#bdbdbd'
  }
}

function getRiskColor(risk: string | null): string {
  if (!risk || risk === 'Not Assessed') return '#bdbdbd'
  const r = risk.toLowerCase()
  if (r === 'high') return '#d32f2f'
  if (r === 'medium') return '#f57c00'
  if (r === 'low') return '#43a047'
  if (r === 'very low') return '#66bb6a'
  return '#bdbdbd'
}

/**
 * Discover WMS layer names via our backend proxy (avoids CORS issues).
 * The EA WMS servers don't include CORS headers, so we proxy through FastAPI.
 */
async function discoverAllWmsLayerNames(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/analytics/wms-layer-names')
    if (!res.ok) {
      console.warn(`WMS layer discovery endpoint failed (${res.status})`)
      return {}
    }
    const json = await res.json()
    if (json.status === 'success' && json.data) {
      console.log('Discovered WMS layer names:', json.data)
      return json.data
    }
    return {}
  } catch (e) {
    console.warn('WMS layer discovery failed:', e)
    return {}
  }
}

/* ─── Fast Cached WMS Layer with Error Handling ─── */
/*
 * Routes WMS tile requests through our backend caching proxy (/api/tiles/wms-proxy).
 * The proxy caches tiles on disk for 24h so repeated views are instant.
 *
 * Performance optimisations:
 *  - Server-side tile cache (24h TTL) → revisits are instant
 *  - Browser cache headers (1h) → no re-fetch for recent tiles
 *  - Larger 512px tiles → 75% fewer HTTP requests than 256px
 *  - updateWhenIdle → no fetching during pan/zoom animations
 *  - keepBuffer 2 → smoother panning with pre-loaded edge tiles
 */
function SafeWMSTileLayer({ layer, layerName }: {
  layer: WmsLayerConfig
  layerName: string
}) {
  const map = useMap()

  useEffect(() => {
    const L = (window as any).L || require('leaflet')

    // 1px transparent PNG for error tiles (prevents grey map)
    const TRANSPARENT_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

    // Point WMS requests through our caching proxy
    const proxyUrl = `/api/tiles/wms-proxy?url=${encodeURIComponent(layer.url)}`

    const wmsLayer = L.tileLayer.wms(proxyUrl, {
      layers: layerName,
      transparent: true,
      format: 'image/png',
      opacity: layer.opacity,
      version: '1.1.1',
      maxZoom: 20,
      tileSize: 512,
      // ── Performance optimisations ──
      detectRetina: false,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 2,
      errorTileUrl: TRANSPARENT_TILE,
    })

    wmsLayer.on('tileerror', (e: any) => {
      console.warn(`Tile error for ${layer.id}:`, e.error || 'unknown')
    })

    wmsLayer.addTo(map)

    return () => {
      map.removeLayer(wmsLayer)
    }
  }, [map, layer.url, layer.id, layer.opacity, layerName])

  return null
}

/* ─── Map Fly-To Helper ─── */
function FlyToPoint({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 16, { duration: 1.2 })
    }
  }, [lat, lng, map])
  return null
}

/* ─── Main Component ─── */
export default function FloodIntelligencePage() {
  const [data, setData] = useState<FloodData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    () => new Set(WMS_LAYERS.filter(l => l.defaultOn).map(l => l.id))
  )
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<FloodProperty | null>(null)
  const [rightTab, setRightTab] = useState<'summary' | 'properties' | 'forecast' | 'info'>('summary')
  const [forecastData, setForecastData] = useState<ForecastData | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [propertyFilter, setPropertyFilter] = useState<'all' | 'zone3' | 'zone2' | 'warnings' | 'surface_high'>('all')
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const mapRef = useRef<LeafletMap | null>(null)
  const [resolvedLayers, setResolvedLayers] = useState<Record<string, string>>({})

  // Auto-discover WMS layer names via backend proxy (avoids CORS)
  useEffect(() => {
    discoverAllWmsLayerNames().then(names => {
      if (Object.keys(names).length > 0) {
        setResolvedLayers(names)
      }
    })
  }, [])

  // Fetch data
  useEffect(() => {
    fetch('/api/analytics/flood-map-data')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'success') setData(d.data)
        else setError('Failed to load flood data')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Also fetch forecast data
    setForecastLoading(true)
    fetch('/api/analytics/flood-forecast')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'success') setForecastData(d.data)
      })
      .catch(() => {}) // Forecast is optional, don't error the page
      .finally(() => setForecastLoading(false))
  }, [])

  // Toggle WMS layer
  const toggleLayer = useCallback((layerId: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      return next
    })
  }, [])

  // Filtered properties for the list
  const filteredProperties = useMemo(() => {
    if (!data) return []
    let list = data.properties
    switch (propertyFilter) {
      case 'zone3': list = list.filter(p => p.flood_zone?.includes('3')); break
      case 'zone2': list = list.filter(p => p.flood_zone?.includes('2')); break
      case 'warnings': list = list.filter(p => p.active_flood_warnings > 0); break
      case 'surface_high': list = list.filter(p => p.flood_risk_surface_water?.toLowerCase() === 'high'); break
    }
    return list.slice(0, 200) // limit for performance
  }, [data, propertyFilter])

  // Summary counts
  // Forecast lookup map for colouring markers when Forecast tab is active
  const forecastLookup = useMemo(() => {
    if (!forecastData) return new Map<string, ForecastProperty>()
    const map = new Map<string, ForecastProperty>()
    for (const p of forecastData.properties) {
      map.set(p.id, p)
    }
    return map
  }, [forecastData])

  // Whether to show forecast-based marker colours
  const showForecastMarkers = rightTab === 'forecast' && forecastData && forecastLookup.size > 0

  const summaryCards = useMemo(() => {
    if (!data?.summary) return []
    const s = data.summary
    const zone3 = Object.entries(s.zone_distribution)
      .filter(([k]) => k.includes('3'))
      .reduce((a, [, v]) => a + v, 0)
    const zone2 = Object.entries(s.zone_distribution)
      .filter(([k]) => k.includes('2'))
      .reduce((a, [, v]) => a + v, 0)
    const surfaceHigh = Object.entries(s.surface_water_risk)
      .filter(([k]) => k.toLowerCase() === 'high')
      .reduce((a, [, v]) => a + v, 0)
    const riverHigh = Object.entries(s.river_sea_risk)
      .filter(([k]) => k.toLowerCase() === 'high')
      .reduce((a, [, v]) => a + v, 0)
    return [
      { label: 'Flood Zone 3', value: zone3, color: '#d32f2f', desc: 'High probability (>1% annual chance)' },
      { label: 'Flood Zone 2', value: zone2, color: '#f57c00', desc: 'Medium probability (0.1–1%)' },
      { label: 'Surface Water High', value: surfaceHigh, color: '#1565c0', desc: 'High risk from surface water' },
      { label: 'River/Sea High', value: riverHigh, color: '#0d47a1', desc: 'High risk from rivers & sea' },
      { label: 'Active Warnings', value: s.properties_with_warnings, color: '#b71c1c', desc: `${s.total_active_warnings} total warnings` },
      { label: 'Total Properties', value: s.total_with_coords, color: '#37474f', desc: 'With coordinates on map' },
    ]
  }, [data])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f7fa' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #1565c0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#546e7a', fontSize: 14 }}>Loading flood intelligence data...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f7fa' }}>
        <div style={{ textAlign: 'center', padding: 32, background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>⚠️</p>
          <h3 style={{ color: '#d32f2f', marginBottom: 8 }}>Failed to Load Flood Data</h3>
          <p style={{ color: '#78909c', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    )
  }

  // Compute center from data
  const centerLat = data?.properties.length
    ? data.properties.reduce((a, p) => a + p.latitude, 0) / data.properties.length
    : 52.5
  const centerLng = data?.properties.length
    ? data.properties.reduce((a, p) => a + p.longitude, 0) / data.properties.length
    : -1.5

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#f5f7fa' }}>
      {/* ── Left: Map ── */}
      <div style={{ flex: '1 1 65%', position: 'relative' }}>
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={8}
          style={{ width: '100%', height: '100%' }}
          ref={mapRef as any}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* EA WMS Flood Layers (with error handling to prevent grey map) */}
          {WMS_LAYERS.map(layer => {
            const layerName = layer.layers || resolvedLayers[layer.id]
            if (!activeLayers.has(layer.id) || !layerName) return null
            return (
              <SafeWMSTileLayer
                key={`${layer.id}-${layerName}`}
                layer={layer}
                layerName={layerName}
              />
            )
          })}

          {/* Property markers */}
          {data?.properties.map(p => {
            const fp = showForecastMarkers ? forecastLookup.get(p.id) : null
            const markerColor = fp ? getForecastRiskColor(fp.forecast_risk_level) : getFloodZoneColor(p.flood_zone)
            const markerRadius = fp
              ? (fp.forecast_risk_level === 'Critical' ? 7 : fp.forecast_risk_level === 'Elevated' ? 5 : 4)
              : (p.active_flood_warnings > 0 ? 6 : 4)
            return (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={markerRadius}
              fillColor={markerColor}
              color={markerColor}
              weight={1}
              opacity={0.9}
              fillOpacity={0.7}
              eventHandlers={{
                click: () => setSelectedProperty(p),
              }}
            >
              <Popup maxWidth={280}>
                <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: '#1a237e' }}>
                    {p.address}
                  </div>
                  <div style={{ color: '#546e7a', marginBottom: 8, fontSize: 12 }}>{p.postcode}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
                    <div>
                      <span style={{ color: '#78909c' }}>Flood Zone:</span>
                      <div style={{ fontWeight: 600, color: getFloodZoneColor(p.flood_zone) }}>
                        {getFloodZoneLabel(p.flood_zone)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#78909c' }}>River/Sea:</span>
                      <div style={{ fontWeight: 600, color: getRiskColor(p.flood_risk_rivers_seas) }}>
                        {p.flood_risk_rivers_seas || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#78909c' }}>Surface Water:</span>
                      <div style={{ fontWeight: 600, color: getRiskColor(p.flood_risk_surface_water) }}>
                        {p.flood_risk_surface_water || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#78909c' }}>Warnings:</span>
                      <div style={{ fontWeight: 600, color: p.active_flood_warnings > 0 ? '#d32f2f' : '#43a047' }}>
                        {p.active_flood_warnings > 0 ? `${p.active_flood_warnings} Active` : 'None'}
                      </div>
                    </div>
                  </div>

                  {p.epc_rating && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#78909c' }}>
                      EPC: <strong style={{ color: '#333' }}>{p.epc_rating}</strong>
                      {p.property_type && <> · {p.property_type}</>}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
            )
          })}

          {flyTarget && <FlyToPoint lat={flyTarget.lat} lng={flyTarget.lng} />}
        </MapContainer>

        {/* ── Layer Toggle Panel (floating) ── */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1000,
          background: 'white', borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          maxWidth: 280, overflow: 'hidden',
        }}>
          <button
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            style={{
              width: '100%', padding: '10px 14px', border: 'none', background: '#1a237e',
              color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span>🗺️ EA Flood Layers</span>
            <span style={{ fontSize: 11 }}>{showLayerPanel ? '▲' : '▼'}</span>
          </button>
          {showLayerPanel && (
            <div style={{ padding: '8px 12px', maxHeight: 340, overflowY: 'auto' }}>
              {['River & Sea', 'Surface Water', 'Reservoir', 'Historic'].map(group => (
                <div key={group} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#78909c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {group}
                  </div>
                  {WMS_LAYERS.filter(l => l.group === group).map(layer => {
                    const hasLayer = !!(layer.layers || resolvedLayers[layer.id])
                    const isDiscovering = !layer.layers && !resolvedLayers[layer.id]
                    return (
                    <label
                      key={layer.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                        cursor: hasLayer ? 'pointer' : 'default', fontSize: 12,
                        opacity: isDiscovering ? 0.5 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={activeLayers.has(layer.id)}
                        onChange={() => hasLayer && toggleLayer(layer.id)}
                        disabled={!hasLayer}
                        style={{ accentColor: layer.color }}
                      />
                      <span style={{
                        width: 12, height: 12, borderRadius: 3,
                        backgroundColor: layer.color, opacity: activeLayers.has(layer.id) && hasLayer ? 1 : 0.3,
                        flexShrink: 0,
                      }} />
                      <span style={{ color: activeLayers.has(layer.id) && hasLayer ? '#263238' : '#90a4ae' }}>
                        {layer.label}
                        {isDiscovering && <span style={{ fontSize: 10, marginLeft: 4 }}>⏳</span>}
                      </span>
                    </label>
                    )
                  })}
                </div>
              ))}

              {/* Property legend */}
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#78909c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Property Markers
                </div>
                {[
                  { label: 'Zone 3 (High)', color: '#d32f2f' },
                  { label: 'Zone 2 (Medium)', color: '#f57c00' },
                  { label: 'Zone 1 (Low)', color: '#1976d2' },
                  { label: 'Not Assessed', color: '#9e9e9e' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                    <span style={{ color: '#546e7a' }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 6, marginTop: 6, fontSize: 11, color: '#90a4ae', lineHeight: 1.4 }}>
                💡 Surface Water, Reservoir and Historic layers require zooming in closer to appear (EA scale restriction).
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Data Panel ── */}
      <div style={{ flex: '0 0 35%', maxWidth: 480, minWidth: 340, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e0e0e0', background: 'white' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', flexShrink: 0 }}>
          {([
            { key: 'summary', label: 'Overview' },
            { key: 'forecast', label: '⚡ Forecast' },
            { key: 'properties', label: 'At-Risk Properties' },
            { key: 'info', label: 'Flood Guide' },
          ] as { key: typeof rightTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setRightTab(tab.key)}
              style={{
                flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                backgroundColor: rightTab === tab.key ? '#e3f2fd' : 'transparent',
                color: rightTab === tab.key ? '#1565c0' : '#78909c',
                borderBottom: rightTab === tab.key ? '2px solid #1565c0' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {rightTab === 'summary' && (
            <SummaryPanel cards={summaryCards} data={data!} />
          )}

          {rightTab === 'forecast' && (
            <ForecastPanel
              data={forecastData}
              loading={forecastLoading}
              onSelectProperty={(p) => {
                setSelectedProperty(p)
                setFlyTarget({ lat: p.latitude, lng: p.longitude })
              }}
            />
          )}

          {rightTab === 'properties' && (
            <PropertiesPanel
              properties={filteredProperties}
              filter={propertyFilter}
              setFilter={setPropertyFilter}
              onSelect={(p) => {
                setSelectedProperty(p)
                setFlyTarget({ lat: p.latitude, lng: p.longitude })
              }}
            />
          )}

          {rightTab === 'info' && <FloodGuidePanel />}
        </div>
      </div>
    </div>
  )
}

/* ─── Summary Panel ─── */
function SummaryPanel({ cards, data }: { cards: any[]; data: FloodData }) {
  return (
    <div>
      {/* Summary cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {cards.map(card => (
          <div
            key={card.label}
            style={{
              padding: '14px 12px', borderRadius: 10,
              background: `linear-gradient(135deg, ${card.color}15, ${card.color}08)`,
              border: `1px solid ${card.color}25`,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value.toLocaleString()}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#37474f', marginTop: 2 }}>{card.label}</div>
            <div style={{ fontSize: 11, color: '#78909c', marginTop: 2 }}>{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Zone Distribution Bar */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#263238', marginBottom: 10 }}>Flood Zone Distribution</h4>
        {Object.entries(data.summary.zone_distribution)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([zone, count]) => {
            const pct = data.summary.total_properties > 0 ? (count / data.summary.total_properties * 100) : 0
            return (
              <div key={zone} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: '#37474f', fontWeight: 500 }}>{zone}</span>
                  <span style={{ color: '#78909c' }}>{count.toLocaleString()} ({pct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, backgroundColor: '#eceff1', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, width: `${Math.max(pct, 0.5)}%`,
                    backgroundColor: getFloodZoneColor(zone),
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )
          })}
      </div>

      {/* River/Sea vs Surface Water Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <RiskBreakdown title="River & Sea Risk" data={data.summary.river_sea_risk} />
        <RiskBreakdown title="Surface Water Risk" data={data.summary.surface_water_risk} />
      </div>
    </div>
  )
}

/* ─── Risk Breakdown Mini-Chart ─── */
function RiskBreakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([a], [b]) => {
    const order: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2, 'Very Low': 3, 'Not Assessed': 4 }
    return (order[a] ?? 5) - (order[b] ?? 5)
  })
  const total = entries.reduce((a, [, v]) => a + v, 0)

  return (
    <div style={{ padding: 10, background: '#f5f7fa', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#37474f', marginBottom: 8 }}>{title}</div>
      {entries.map(([level, count]) => (
        <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            backgroundColor: getRiskColor(level),
          }} />
          <span style={{ flex: 1, color: '#546e7a' }}>{level}</span>
          <span style={{ color: '#78909c', fontWeight: 600 }}>
            {count.toLocaleString()} ({total > 0 ? (count / total * 100).toFixed(0) : 0}%)
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── Properties Panel ─── */
function PropertiesPanel({
  properties,
  filter,
  setFilter,
  onSelect,
}: {
  properties: FloodProperty[]
  filter: string
  setFilter: (f: any) => void
  onSelect: (p: FloodProperty) => void
}) {
  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'zone3', label: 'Zone 3' },
          { key: 'zone2', label: 'Zone 2' },
          { key: 'warnings', label: 'Active Warnings' },
          { key: 'surface_high', label: 'Surface High' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 16, border: '1px solid',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              backgroundColor: filter === f.key ? '#1565c0' : 'white',
              color: filter === f.key ? 'white' : '#546e7a',
              borderColor: filter === f.key ? '#1565c0' : '#cfd8dc',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#78909c', marginBottom: 10 }}>
        Showing {properties.length} properties {properties.length >= 200 && '(limited to 200)'}
      </div>

      {/* Property list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {properties.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px', borderRadius: 8, border: '1px solid #e0e0e0',
              cursor: 'pointer', background: 'white', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#1565c0'; (e.target as HTMLElement).style.boxShadow = '0 1px 4px rgba(21,101,192,0.15)' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#e0e0e0'; (e.target as HTMLElement).style.boxShadow = 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', marginTop: 3, flexShrink: 0,
                backgroundColor: getFloodZoneColor(p.flood_zone),
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.address}
                </div>
                <div style={{ fontSize: 11, color: '#78909c', marginTop: 2 }}>
                  {p.postcode}
                  {p.flood_zone && <> · <span style={{ color: getFloodZoneColor(p.flood_zone), fontWeight: 600 }}>{p.flood_zone}</span></>}
                  {p.flood_risk_rivers_seas && <> · R/S: {p.flood_risk_rivers_seas}</>}
                  {p.flood_risk_surface_water && <> · SW: {p.flood_risk_surface_water}</>}
                  {p.active_flood_warnings > 0 && <> · <span style={{ color: '#d32f2f', fontWeight: 600 }}>⚠ {p.active_flood_warnings} Warning{p.active_flood_warnings > 1 ? 's' : ''}</span></>}
                </div>
              </div>
            </div>
          </button>
        ))}

        {properties.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#90a4ae', fontSize: 13 }}>
            No properties match the selected filter.
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Forecast Panel ─── */
function ForecastPanel({
  data,
  loading,
  onSelectProperty,
}: {
  data: ForecastData | null
  loading: boolean
  onSelectProperty: (p: ForecastProperty) => void
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#78909c' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #1565c0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13 }}>Loading forecast data...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!data || data.properties.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 36, marginBottom: 8 }}>🌤️</p>
        <h4 style={{ color: '#37474f', marginBottom: 8 }}>No Forecast Data Yet</h4>
        <p style={{ color: '#78909c', fontSize: 13, lineHeight: 1.6 }}>
          Run the forecast enrichment to pull 7-day weather predictions and calculate dynamic flood risk scores:
        </p>
        <div style={{ margin: '12px auto', padding: '10px 16px', background: '#f5f7fa', borderRadius: 8, fontFamily: 'monospace', fontSize: 13, display: 'inline-block' }}>
          ./start.sh --forecast
        </div>
        <p style={{ color: '#90a4ae', fontSize: 12, marginTop: 12 }}>
          This fetches rainfall forecasts from the UK Met Office models via Open-Meteo and combines them with your flood zone data.
        </p>
      </div>
    )
  }

  const { summary, daily_timeline, properties } = data
  const updatedAt = summary.forecast_updated_at
    ? new Date(summary.forecast_updated_at)
    : null
  const hoursAgo = updatedAt
    ? Math.round((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60))
    : null

  // Top at-risk properties (Critical + Elevated, max 50)
  const atRisk = properties
    .filter(p => p.forecast_risk_level === 'Critical' || p.forecast_risk_level === 'Elevated')
    .slice(0, 50)

  // Max rainfall for timeline bar scaling
  const maxRainfall = Math.max(1, ...daily_timeline.map(d => d.avg_rainfall_mm))

  return (
    <div>
      {/* Last updated header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 12, color: '#78909c' }}>
        <span>
          {updatedAt
            ? `Last updated: ${hoursAgo === 0 ? 'Just now' : `${hoursAgo}h ago`}`
            : 'Not yet updated'}
        </span>
        <span style={{ fontSize: 11, color: '#90a4ae' }}>Source: UK Met Office via Open-Meteo</span>
      </div>

      {/* Alert banner if Critical properties exist */}
      {summary.critical_count > 0 && (
        <div style={{
          padding: '12px 14px', borderRadius: 10, marginBottom: 14,
          background: 'linear-gradient(135deg, #d32f2f18, #d32f2f08)',
          border: '1px solid #d32f2f30',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#c62828', marginBottom: 4 }}>
            ⚠️ {summary.critical_count} Properties at Critical Flood Risk
          </div>
          <div style={{ fontSize: 12, color: '#d32f2f', lineHeight: 1.5 }}>
            {summary.peak_risk_day
              ? `Peak risk expected on ${summary.peak_risk_day} due to heavy rainfall forecast.`
              : 'Multiple risk factors are combining to create elevated flood risk.'}
            {' '}These properties are in high flood zones with significant rainfall predicted in the next 48 hours.
          </div>
        </div>
      )}

      {/* Risk breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Critical', count: summary.critical_count, color: '#d32f2f', bg: '#d32f2f' },
          { label: 'Elevated', count: summary.elevated_count, color: '#f57c00', bg: '#f57c00' },
          { label: 'Watch', count: summary.watch_count, color: '#f9a825', bg: '#fbc02d' },
          { label: 'Normal', count: summary.normal_count, color: '#43a047', bg: '#43a047' },
        ].map(card => (
          <div
            key={card.label}
            style={{
              padding: '10px 8px', borderRadius: 8, textAlign: 'center',
              background: `${card.bg}10`, border: `1px solid ${card.bg}25`,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.count.toLocaleString()}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#546e7a' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 5-Day Timeline */}
      {daily_timeline.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#263238', marginBottom: 10 }}>Rainfall Forecast Timeline</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            {daily_timeline.map((day, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#546e7a', marginBottom: 4 }}>{day.day}</div>

                {/* Rain bar */}
                <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{
                    width: '70%',
                    height: `${Math.max(4, (day.avg_rainfall_mm / maxRainfall) * 60)}px`,
                    borderRadius: '4px 4px 0 0',
                    background: day.avg_rainfall_mm > 20
                      ? 'linear-gradient(to top, #d32f2f, #ef5350)'
                      : day.avg_rainfall_mm > 10
                        ? 'linear-gradient(to top, #f57c00, #ff9800)'
                        : day.avg_rainfall_mm > 5
                          ? 'linear-gradient(to top, #fbc02d, #ffee58)'
                          : 'linear-gradient(to top, #90caf9, #bbdefb)',
                    transition: 'height 0.3s ease',
                  }} />
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: '#37474f' }}>{day.avg_rainfall_mm}mm</div>

                {/* Risk dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 4 }}>
                  {day.critical > 0 && (
                    <span style={{ fontSize: 9, color: '#d32f2f', fontWeight: 700 }}>{day.critical}⬤</span>
                  )}
                  {day.elevated > 0 && (
                    <span style={{ fontSize: 9, color: '#f57c00', fontWeight: 700 }}>{day.elevated}⬤</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring explanation */}
      <div style={{
        padding: 10, borderRadius: 8, marginBottom: 16,
        background: '#e3f2fd', fontSize: 12, color: '#1565c0', lineHeight: 1.5,
      }}>
        <strong>How risk scores work:</strong> Each property gets a score (0–100) combining its flood zone (30%), forecast rainfall (30%), surface water risk (15%), river/sea risk (15%), and active EA warnings (10%). Critical = 70+, Elevated = 40–69, Watch = 15–39.
      </div>

      {/* At-risk properties list */}
      {atRisk.length > 0 && (
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#263238', marginBottom: 8 }}>
            Highest Risk Properties ({atRisk.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {atRisk.map(p => (
              <button
                key={p.id}
                onClick={() => onSelectProperty(p)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 12px', borderRadius: 8, border: '1px solid #e0e0e0',
                  cursor: 'pointer', background: 'white', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#d32f2f'; (e.target as HTMLElement).style.boxShadow = '0 1px 4px rgba(211,47,47,0.15)' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#e0e0e0'; (e.target as HTMLElement).style.boxShadow = 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                    color: 'white', flexShrink: 0, marginTop: 2,
                    backgroundColor: p.forecast_risk_level === 'Critical' ? '#d32f2f' : '#f57c00',
                  }}>
                    {p.forecast_risk_level}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.address}
                    </div>
                    <div style={{ fontSize: 11, color: '#78909c', marginTop: 2 }}>
                      {p.postcode}
                      {p.flood_zone && <> · {p.flood_zone}</>}
                      {' '}· Score: <strong style={{ color: '#d32f2f' }}>{p.forecast_risk_score}</strong>
                      {' '}· 48h rain: {p.forecast_rainfall_48h_mm}mm
                      {p.forecast_peak_day && <> · Peak: {p.forecast_peak_day}</>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {atRisk.length === 0 && summary.total_forecasted > 0 && (
        <div style={{ textAlign: 'center', padding: 24, color: '#43a047' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>✅</p>
          <p style={{ fontWeight: 600, fontSize: 14 }}>No Critical or Elevated Risk Properties</p>
          <p style={{ fontSize: 12, color: '#78909c', marginTop: 4 }}>
            Current weather forecasts show low flood risk across your portfolio for the next 7 days.
          </p>
        </div>
      )}
    </div>
  )
}

/* ─── Flood Guide Panel ─── */
function FloodGuidePanel() {
  const cards = [
    {
      title: 'Flood Zones Explained',
      color: '#1565c0',
      content: [
        { label: 'Zone 1 — Low Risk', text: 'Less than 0.1% chance of flooding in any year (1 in 1,000). This is the lowest-risk category.' },
        { label: 'Zone 2 — Medium Risk', text: '0.1% to 1% chance of river flooding, or 0.1% to 0.5% chance of sea flooding per year.' },
        { label: 'Zone 3 — High Risk', text: 'Greater than 1% chance of river flooding, or greater than 0.5% chance of sea flooding per year. These properties need urgent attention.' },
      ],
    },
    {
      title: 'Types of Flooding',
      color: '#0d47a1',
      content: [
        { label: 'River & Sea (Fluvial/Coastal)', text: 'Flooding from rivers overflowing or high tides/storm surges. The EA Flood Zones show this risk.' },
        { label: 'Surface Water (Pluvial)', text: 'Flooding from heavy rainfall overwhelming drainage. Shown as 1-in-30 year (frequent) and 1-in-100 year (less frequent) events.' },
        { label: 'Reservoir', text: 'Flooding if a reservoir were to fail. Very rare but potentially severe. Shows the maximum possible extent.' },
        { label: 'Historic Floods', text: 'Outlines of areas that have actually flooded in the past, recorded by the Environment Agency.' },
      ],
    },
    {
      title: 'Understanding the EA Map Layers',
      color: '#1a237e',
      content: [
        { label: 'Red overlays (Zone 3)', text: 'Areas the EA classifies as high probability for river/sea flooding. Properties here require flood risk assessment for planning.' },
        { label: 'Orange overlays (Zone 2)', text: 'Medium probability areas. Development should consider flood resilience measures.' },
        { label: 'Blue overlays (Surface Water)', text: 'Areas at risk from surface water. 1-in-30 year events happen relatively often; 1-in-100 year events are less frequent but more extensive.' },
        { label: 'Purple overlays (Reservoir)', text: 'Maximum possible flood extent if a reservoir failed. These are worst-case scenarios, not predictions.' },
        { label: 'Brown overlays (Historic)', text: 'Areas that have actually experienced flooding. Useful for understanding real-world flood patterns.' },
      ],
    },
    {
      title: 'What This Means for Social Housing',
      color: '#37474f',
      content: [
        { label: 'Maintenance Planning', text: 'Properties in Zones 2/3 may need flood-resilient materials, raised electrics, and regular drainage checks.' },
        { label: 'Insurance & Costs', text: 'Flood Zone 3 properties typically face higher insurance premiums. Factor this into long-term financial planning.' },
        { label: 'Tenant Safety', text: 'Properties with active flood warnings should have emergency plans in place. Surface water risk affects ground-floor and basement flats most.' },
        { label: 'Investment Decisions', text: 'Use this data alongside EPC and condition scores to prioritise retrofit and resilience investment.' },
      ],
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {cards.map(card => (
        <div
          key={card.title}
          style={{
            borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${card.color}20`,
            background: `linear-gradient(135deg, ${card.color}08, ${card.color}03)`,
          }}
        >
          <div style={{ padding: '10px 14px', backgroundColor: `${card.color}12`, borderBottom: `1px solid ${card.color}15` }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: card.color }}>{card.title}</h4>
          </div>
          <div style={{ padding: '10px 14px' }}>
            {card.content.map(item => (
              <div key={item.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#37474f' }}>{item.label}</div>
                <div style={{ fontSize: 12, color: '#546e7a', lineHeight: 1.5, marginTop: 2 }}>{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding: 12, borderRadius: 8, background: '#e3f2fd', fontSize: 12, color: '#1565c0', lineHeight: 1.5 }}>
        <strong>Data Source:</strong> All flood map layers are streamed live from the Environment Agency's Spatial Data Catalogue. Property-level flood data comes from EA API enrichment. The data updates when the EA publishes new flood maps.
      </div>
    </div>
  )
}
