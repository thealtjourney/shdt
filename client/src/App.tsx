import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FilterProvider, useFilters } from './context/FilterContext'
import { MapContainer, TileLayer, useMap, CircleMarker, Popup } from 'react-leaflet'
import type { Property } from './types/property'
import 'leaflet/dist/leaflet.css'
import './index.css'

const PropertyViewer3D = lazy(() => import('./components/PropertyViewer3D'))
const DigitalTwinPage = lazy(() => import('./pages/DigitalTwinPage'))
const FloodIntelligencePage = lazy(() => import('./pages/FloodIntelligencePage'))

// First extracted Insights tab — see ./pages/insights/REFACTOR_PATTERN.md
import { GuideTab } from './pages/insights/GuideTab'

// Phase 3 — domain credibility pages
const CompliancePage = lazy(() => import('./pages/CompliancePage'))
const TenantSatisfactionPage = lazy(() => import('./pages/TenantSatisfactionPage'))
const AwaabCasesPage = lazy(() => import('./pages/AwaabCasesPage'))

// Landing page / overview launchpad
const OverviewPage = lazy(() => import('./pages/OverviewPage'))

// Phase 4 — scheduled enrichment audit page
const EnrichmentStatusPage = lazy(() => import('./pages/EnrichmentStatusPage'))

/* ─── Error Boundary for 3D Viewer ─── */
class Viewer3DErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message || 'Unknown error' }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('3D Viewer crashed:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: '#111',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', color: 'white', maxWidth: 400 }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>3D Viewer Error</h3>
            <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>{this.state.errorMsg}</p>
            <button
              onClick={() => { this.setState({ hasError: false, errorMsg: '' }); this.props.onError?.() }}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                backgroundColor: '#1B4F72', color: 'white', fontWeight: 600, fontSize: 14,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ─── Constants ─── */
const EPC_RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const PROPERTY_TYPES = ['Detached', 'Semi-detached', 'Terraced', 'Flat', 'Bungalow', 'Other']
const HEATING_TYPES = ['Gas', 'Electric', 'Oil', 'Solid Fuel', 'Heat Pump', 'Other']
const EPC_COLORS: Record<string, string> = {
  A: '#1B7A2B', B: '#4CAF50', C: '#8BC34A', D: '#FFD600',
  E: '#FF9800', F: '#FF5722', G: '#D32F2F',
}

/* ─── Filter Sidebar ─── */
function FilterSidebar() {
  const { filters, setFilters, resetFilters } = useFilters()
  const [isOpen, setIsOpen] = useState(true)

  const activeCount = [
    filters.epcRatings.length > 0 ? 1 : 0,
    filters.propertyType ? 1 : 0,
    filters.bedroomsRange[0] !== 0 || filters.bedroomsRange[1] !== 10 ? 1 : 0,
    filters.yearBuiltRange[0] !== 1800 || filters.yearBuiltRange[1] !== new Date().getFullYear() ? 1 : 0,
    filters.heatingType ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const toggleEpc = (rating: string) => {
    const newRatings = filters.epcRatings.includes(rating)
      ? filters.epcRatings.filter(r => r !== rating)
      : [...filters.epcRatings, rating]
    setFilters({ ...filters, epcRatings: newRatings })
  }

  const sidebarStyle: React.CSSProperties = {
    position: 'fixed', top: 56, left: 0, bottom: 0, width: 300,
    backgroundColor: 'white', boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
    overflowY: 'auto', zIndex: 900, padding: '20px',
    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 0.25s ease',
  }
  const toggleBtnStyle: React.CSSProperties = {
    position: 'fixed', top: 66, left: isOpen ? 300 : 0, zIndex: 901,
    backgroundColor: 'white', border: '1px solid #ccc', borderLeft: 'none',
    borderRadius: '0 6px 6px 0', padding: '8px 6px', cursor: 'pointer',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.1)', transition: 'left 0.25s ease',
  }
  const epcBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, fontWeight: 600, fontSize: 13,
    border: 'none', cursor: 'pointer',
    backgroundColor: active ? '#1B4F72' : '#e5e7eb', color: active ? 'white' : '#374151',
  })
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 13, backgroundColor: 'white',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6,
  }

  return (
    <>
      <button style={toggleBtnStyle} onClick={() => setIsOpen(!isOpen)} title={isOpen ? 'Hide filters' : 'Show filters'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
          {isOpen ? <path d="M15 19l-7-7 7-7" /> : <path d="M9 5l7 7-7 7" />}
        </svg>
      </button>
      <div style={sidebarStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>Filters</h2>
          {activeCount > 0 && (
            <button onClick={resetFilters} style={{ fontSize: 12, fontWeight: 600, color: '#1B4F72', background: 'none', border: 'none', cursor: 'pointer' }}>
              Reset ({activeCount})
            </button>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>EPC Rating</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EPC_RATINGS.map(r => (
              <button key={r} style={epcBtnStyle(filters.epcRatings.includes(r))} onClick={() => toggleEpc(r)}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Property Type</label>
          <select style={selectStyle} value={filters.propertyType || ''} onChange={e => setFilters({ ...filters, propertyType: e.target.value || undefined })}>
            <option value="">All Types</option>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={labelStyle}>Bedrooms</label>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{filters.bedroomsRange[0]} – {filters.bedroomsRange[1]}</span>
          </div>
          <input type="range" min={0} max={10} value={filters.bedroomsRange[0]} onChange={e => setFilters({ ...filters, bedroomsRange: [+e.target.value, filters.bedroomsRange[1]] })} style={{ width: '100%' }} />
          <input type="range" min={0} max={10} value={filters.bedroomsRange[1]} onChange={e => setFilters({ ...filters, bedroomsRange: [filters.bedroomsRange[0], +e.target.value] })} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={labelStyle}>Year Built</label>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{filters.yearBuiltRange[0]} – {filters.yearBuiltRange[1]}</span>
          </div>
          <input type="range" min={1800} max={new Date().getFullYear()} value={filters.yearBuiltRange[0]} onChange={e => setFilters({ ...filters, yearBuiltRange: [+e.target.value, filters.yearBuiltRange[1]] })} style={{ width: '100%' }} />
          <input type="range" min={1800} max={new Date().getFullYear()} value={filters.yearBuiltRange[1]} onChange={e => setFilters({ ...filters, yearBuiltRange: [filters.yearBuiltRange[0], +e.target.value] })} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Heating Type</label>
          <select style={selectStyle} value={filters.heatingType || ''} onChange={e => setFilters({ ...filters, heatingType: e.target.value || undefined })}>
            <option value="">All Types</option>
            {HEATING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </>
  )
}

/* ─── EPC Legend ─── */
function EpcLegend() {
  const [isOpen, setIsOpen] = useState(true)
  const ratings = [
    { label: 'A', color: '#1B7A2B' }, { label: 'B', color: '#4CAF50' },
    { label: 'C', color: '#8BC34A' }, { label: 'D', color: '#FFD600' },
    { label: 'E', color: '#FF9800' }, { label: 'F', color: '#FF5722' },
    { label: 'G', color: '#D32F2F' }, { label: 'Unknown', color: '#9E9E9E' },
  ]
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 900 }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        position: 'absolute', top: -36, right: 0, backgroundColor: 'white',
        border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px',
        cursor: 'pointer', fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
      }}>
        {isOpen ? 'Hide Legend' : 'Show Legend'}
      </button>
      {isOpen && (
        <div style={{ backgroundColor: 'white', borderRadius: 8, padding: 14, border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', minWidth: 140 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#111' }}>EPC Ratings</h3>
          {ratings.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: r.color, border: '1px solid #ccc', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#444' }}>{r.label}</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: '#888', marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>Higher ratings = better efficiency</p>
        </div>
      )}
    </div>
  )
}

/* ─── Collapsible Section ─── */
function Section({ title, icon, defaultOpen = false, children, accentColor = '#1B4F72' }: { title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode; accentColor?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 12, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: open ? '#f9fafb' : 'white', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: accentColor }}>{title}</span>
        <span style={{ fontSize: 11, color: '#999', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #eee' }}>{children}</div>}
    </div>
  )
}

/* ─── Detail Row ─── */
function DetailRow({ label, value, color }: { label: string; value: any; color?: string }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ fontSize: 12, color: '#666' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || '#111', textAlign: 'right', maxWidth: '55%' }}>{value}</span>
    </div>
  )
}

/* ─── Property Detail Panel ─── */
function PropertyPanel({ propertyId, isOpen, onClose }: { propertyId: string | null; isOpen: boolean; onClose: () => void }) {
  const [property, setProperty] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show3D, setShow3D] = useState(false)

  // Keep a stable ref to the property data so the 3D viewer survives re-renders
  const propertyForViewer = useRef<any>(null)
  if (property) propertyForViewer.current = property

  // Reset 3D viewer when panel closes
  useEffect(() => {
    if (!isOpen) setShow3D(false)
  }, [isOpen])

  useEffect(() => {
    if (!propertyId || !isOpen) return
    setLoading(true); setError(null)
    fetch(`/api/properties/${propertyId}`)
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json() })
      .then(d => {
        // Flatten GeoJSON Feature into a flat object for easy field access
        const flat = {
          id: d.id,
          latitude: d.geometry?.coordinates?.[1],
          longitude: d.geometry?.coordinates?.[0],
          ...d.properties,
        };
        setProperty(flat);
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [propertyId, isOpen])

  const panelStyle: React.CSSProperties = {
    position: 'fixed', right: 0, top: 56, bottom: 0, width: 400,
    backgroundColor: 'white', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
    zIndex: 950, overflowY: 'auto', padding: 20,
    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.3s ease',
  }

  const p = property
  const epcRating = p?.epc_rating?.toUpperCase() || 'N/A'
  const epcColor = EPC_COLORS[epcRating] || '#9E9E9E'

  const crimeRiskColor = (score: number) => score > 7 ? '#DC2626' : score > 4 ? '#F59E0B' : '#10B981'
  const floodColor = (level: string) => level === 'High' ? '#DC2626' : level === 'Medium' ? '#F59E0B' : '#10B981'

  return (
    <>
      {isOpen && !show3D && <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 940 }} />}
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Property Details</h2>
          <button onClick={() => show3D ? setShow3D(false) : onClose()} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#666', padding: '0 4px' }}>x</button>
        </div>
        {loading && <p style={{ color: '#666', fontSize: 14 }}>Loading details...</p>}
        {error && <p style={{ color: '#c00', fontSize: 14 }}>Backend not running — start the server to view details.</p>}
        {p && !loading && (
          <div>
            {/* Header */}
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 4 }}>{p.address}</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{p.postcode}</p>
            {p.uprn && <p style={{ fontSize: 11, color: '#999', fontFamily: 'monospace', marginBottom: 12 }}>UPRN: {p.uprn}</p>}

            {/* Quick badges row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', backgroundColor: epcColor, color: 'white', fontWeight: 700, fontSize: 20 }}>{epcRating}</div>
              {p.crime_risk_score != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 8, padding: '6px 12px', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: 11, color: '#666' }}>Crime</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: crimeRiskColor(p.crime_risk_score) }}>{p.crime_risk_score}/10</span>
                </div>
              )}
              {p.flood_zone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', borderRadius: 8, padding: '6px 12px', border: '1px solid #bfdbfe' }}>
                  <span style={{ fontSize: 11, color: '#666' }}>Flood</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: p.flood_zone === 'Zone 3' ? '#DC2626' : p.flood_zone === 'Zone 2' ? '#F59E0B' : '#3B82F6' }}>{p.flood_zone}</span>
                </div>
              )}
              {p.region && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 8, padding: '6px 12px', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#166534' }}>{p.region}</span>
                </div>
              )}
            </div>

            {/* 3D Digital Twin Button */}
            <button
              onClick={() => setShow3D(true)}
              style={{
                width: '100%', padding: '12px 16px', marginBottom: 16,
                background: 'linear-gradient(135deg, #1B4F72 0%, #2980B9 100%)',
                color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 12px rgba(27,79,114,0.35)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'translateY(-1px)'; (e.target as HTMLElement).style.boxShadow = '0 6px 16px rgba(27,79,114,0.45)' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'translateY(0)'; (e.target as HTMLElement).style.boxShadow = '0 4px 12px rgba(27,79,114,0.35)' }}
            >
              <span style={{ fontSize: 18 }}>🏗️</span>
              View 3D Digital Twin
            </button>

            {/* Core Property Info */}
            <Section title="Property Information" icon="🏠" defaultOpen={true}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {([['Type', p.property_type], ['Bedrooms', p.bedrooms], ['Year Built', p.year_built], ['Heating', p.heating_type]] as [string, any][]).map(([label, val]) => (
                  <div key={label} style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 10 }}>
                    <p style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{val ?? 'N/A'}</p>
                  </div>
                ))}
              </div>
              {p.stock_condition_score != null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: '#444' }}>Condition Score</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{p.stock_condition_score}</span>
                  </div>
                  <div style={{ width: '100%', height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(p.stock_condition_score, 100)}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 3 }} />
                  </div>
                </div>
              )}
              <DetailRow label="Built Form" value={p.built_form} />
              <DetailRow label="Construction Period" value={p.construction_age_band} />
              <DetailRow label="Floor Area" value={p.floor_area_m2 ? `${p.floor_area_m2} m²` : null} />
            </Section>

            {/* Location & Geography */}
            {(p.local_authority_name || p.ward_name || p.lsoa_name) && (
              <Section title="Location & Geography" icon="📍" accentColor="#2563EB">
                <DetailRow label="Local Authority" value={p.local_authority_name} />
                <DetailRow label="Region" value={p.region} />
                <DetailRow label="Ward" value={p.ward_name} />
                <DetailRow label="LSOA" value={p.lsoa_name} />
                <DetailRow label="LSOA Code" value={p.lsoa_code} />
                <DetailRow label="MSOA" value={p.msoa_name} />
                <DetailRow label="Parish" value={p.parish} />
                <DetailRow label="Constituency" value={p.parliamentary_constituency} />
              </Section>
            )}

            {/* Crime Statistics */}
            {p.crime_risk_score != null && (
              <Section title="Crime Statistics" icon="🔒" accentColor="#DC2626">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: crimeRiskColor(p.crime_risk_score), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>{p.crime_risk_score}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Risk Score: {p.crime_risk_score}/10</p>
                    <p style={{ fontSize: 11, color: '#888' }}>{p.crime_total_3months ?? 0} total crimes (3 months)</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {([
                    ['Burglary', p.crime_burglary_3months],
                    ['Anti-social', p.crime_antisocial_3months],
                    ['Violence', p.crime_violence_3months],
                    ['Criminal Damage', p.crime_criminal_damage_3months],
                    ['Robbery', p.crime_robbery_3months],
                    ['Other', p.crime_other_3months],
                  ] as [string, number | null][]).filter(([, v]) => v != null && v > 0).map(([label, val]) => (
                    <div key={label} style={{ backgroundColor: '#fef2f2', borderRadius: 6, padding: '6px 10px' }}>
                      <p style={{ fontSize: 10, color: '#888' }}>{label}</p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{val}</p>
                    </div>
                  ))}
                </div>
                {p.crime_last_updated && <p style={{ fontSize: 10, color: '#999', marginTop: 8 }}>Updated: {p.crime_last_updated}</p>}
              </Section>
            )}

            {/* Flood Risk */}
            {(p.flood_risk_rivers_seas || p.flood_zone) && (
              <Section title="Flood Risk" icon="🌊" accentColor="#0891B2">
                {p.flood_zone && (
                  <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 6, fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'white', backgroundColor: p.flood_zone === 'Zone 3' ? '#DC2626' : p.flood_zone === 'Zone 2' ? '#F59E0B' : '#3B82F6' }}>
                    {p.flood_zone}
                  </div>
                )}
                <DetailRow label="River/Sea Risk" value={p.flood_risk_rivers_seas} color={p.flood_risk_rivers_seas ? floodColor(p.flood_risk_rivers_seas) : undefined} />
                <DetailRow label="Surface Water Risk" value={p.flood_risk_surface_water} color={p.flood_risk_surface_water ? floodColor(p.flood_risk_surface_water) : undefined} />
                {p.active_flood_warnings > 0 && (
                  <div style={{ marginTop: 8, padding: '6px 10px', backgroundColor: '#fef3c7', borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#92400E' }}>
                    {p.active_flood_warnings} active flood warning(s) nearby
                  </div>
                )}
              </Section>
            )}

            {/* EPC / Energy Details */}
            {(p.epc_score || p.wall_type || p.main_heating) && (
              <Section title="Energy Performance" icon="⚡" accentColor="#059669">
                {p.epc_score != null && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <p style={{ fontSize: 10, color: '#888' }}>Current</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: epcColor }}>{epcRating}</p>
                      <p style={{ fontSize: 11, color: '#666' }}>Score: {p.epc_score}</p>
                    </div>
                    {p.epc_potential_rating && (
                      <div style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: '#888' }}>Potential</p>
                        <p style={{ fontSize: 22, fontWeight: 700, color: EPC_COLORS[p.epc_potential_rating.toUpperCase()] || '#999' }}>{p.epc_potential_rating.toUpperCase()}</p>
                        <p style={{ fontSize: 11, color: '#666' }}>Score: {p.epc_potential_score}</p>
                      </div>
                    )}
                  </div>
                )}
                <DetailRow label="Walls" value={p.wall_type} />
                <DetailRow label="Wall Insulation" value={p.wall_insulation} />
                <DetailRow label="Roof" value={p.roof_insulation} />
                <DetailRow label="Main Heating" value={p.main_heating} />
                <DetailRow label="Main Fuel" value={p.main_fuel} />
                <DetailRow label="Hot Water" value={p.hot_water} />
                <DetailRow label="Lighting" value={p.lighting} />
                <DetailRow label="Windows" value={p.windows} />
                {(p.co2_emissions || p.energy_cost_current) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    {p.co2_emissions != null && (
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: '#888' }}>CO2 (current)</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{p.co2_emissions} t/yr</p>
                      </div>
                    )}
                    {p.co2_potential != null && (
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: '#888' }}>CO2 (potential)</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{p.co2_potential} t/yr</p>
                      </div>
                    )}
                    {p.energy_cost_current != null && (
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: '#888' }}>Energy (current)</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{p.energy_cost_current} kWh/m²</p>
                      </div>
                    )}
                    {p.energy_cost_potential != null && (
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: '#888' }}>Energy (potential)</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{p.energy_cost_potential} kWh/m²</p>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>

      {/* Full-screen click blocker — prevents map clicks from changing propertyId while 3D is open */}
      {show3D && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'transparent' }} />
      )}

      {/* 3D Viewer Modal — rendered outside panel div so it won't unmount with panel re-renders */}
      {show3D && propertyForViewer.current && (
        <Viewer3DErrorBoundary onError={() => setShow3D(false)}>
          <Suspense fallback={
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'white' }}>
                <div style={{ width: 40, height: 40, border: '4px solid #333', borderTopColor: '#2980B9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontSize: 14 }}>Loading 3D Digital Twin...</p>
              </div>
            </div>
          }>
            <PropertyViewer3D property={propertyForViewer.current} onClose={() => setShow3D(false)} />
          </Suspense>
        </Viewer3DErrorBoundary>
      )}
    </>
  )
}

/* ─── Cluster marker type ─── */
interface ClusterMarker {
  id: string
  latitude: number
  longitude: number
  count: number
  dominant_epc_rating?: string
}

/* ─── Map Content (markers + data fetching, inside MapContainer) ─── */
function MapContent({ onSelectProperty }: { onSelectProperty: (id: string) => void }) {
  const map = useMap()
  const { filters } = useFilters()
  const [properties, setProperties] = useState<Property[]>([])
  const [clusters, setClusters] = useState<ClusterMarker[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchProperties = useCallback(() => {
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    setLoading(true); setError(null)

    const params = new URLSearchParams({
      min_lat: bounds.getSouth().toString(), min_lng: bounds.getWest().toString(),
      max_lat: bounds.getNorth().toString(), max_lng: bounds.getEast().toString(),
    })
    if (zoom < 14) params.append('zoom_level', zoom.toString())
    if (filters.epcRatings.length > 0) params.append('epcRatings', filters.epcRatings.join(','))
    if (filters.propertyType) params.append('propertyType', filters.propertyType)
    if (filters.heatingType) params.append('heatingType', filters.heatingType)

    const endpoint = zoom < 14 ? '/api/properties/cluster' : '/api/properties/bbox'
    fetch(`${endpoint}?${params}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(data => {
        const allFeatures = data.features || []

        // Separate clusters from individual properties
        const clusterFeatures = allFeatures.filter((f: any) => f.cluster || String(f.id || '').startsWith('cluster_'))
        const individualFeatures = allFeatures.filter((f: any) => !f.cluster && !String(f.id || '').startsWith('cluster_'))

        // Parse individual properties
        const props: Property[] = individualFeatures.map((f: any) => ({
          id: f.id || f.properties?.id || '',
          address: f.properties?.address || '',
          postcode: f.properties?.postcode || '',
          latitude: f.geometry?.coordinates?.[1] ?? 0,
          longitude: f.geometry?.coordinates?.[0] ?? 0,
          epc_rating: f.properties?.epc_rating || f.properties?.dominant_epc_rating || undefined,
          property_type: f.properties?.property_type || undefined,
          bedrooms: f.properties?.bedrooms || undefined,
          year_built: f.properties?.year_built || undefined,
          heating_type: f.properties?.heating_type || undefined,
          stock_condition_score: f.properties?.stock_condition_score || undefined,
        }))

        // Parse cluster features
        const clusterMarkers: ClusterMarker[] = clusterFeatures.map((f: any) => ({
          id: f.id || `cluster_${Math.random()}`,
          latitude: f.geometry?.coordinates?.[1] ?? 0,
          longitude: f.geometry?.coordinates?.[0] ?? 0,
          count: f.properties?.count || 0,
          dominant_epc_rating: f.properties?.dominant_epc_rating || undefined,
        }))

        setProperties(props)
        setClusters(clusterMarkers)
        setLoading(false)
      })
      .catch(err => { console.error('API fetch failed:', err); setError(err.message || 'Connection failed'); setLoading(false) })
  }, [map, filters])

  useEffect(() => {
    const debouncedFetch = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(fetchProperties, 500)
    }
    map.on('moveend', debouncedFetch)
    debouncedFetch()
    return () => { map.off('moveend', debouncedFetch); if (timerRef.current) clearTimeout(timerRef.current) }
  }, [map, fetchProperties])

  return (
    <>
      {/* Cluster markers — shown at low zoom levels */}
      {clusters.map(c => {
        const color = EPC_COLORS[c.dominant_epc_rating?.toUpperCase() || ''] || '#1B4F72'
        // Subtle radius: small dots that scale gently with count (min 4, max 14)
        const radius = Math.min(14, Math.max(4, 3 + Math.log10(Math.max(c.count, 1)) * 3.5))
        return (
          <CircleMarker key={c.id} center={[c.latitude, c.longitude]} radius={radius}
            fillColor={color} color={color} weight={1} opacity={0.9} fillOpacity={0.55}
            eventHandlers={{ click: () => map.setView([c.latitude, c.longitude], map.getZoom() + 3) }}>
            <Popup>
              <div style={{ padding: 8, minWidth: 140, textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: '#1B4F72' }}>{c.count.toLocaleString()}</p>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>properties in this area</p>
                {c.dominant_epc_rating && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: '#555' }}>Dominant EPC:</span>
                    <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 4, backgroundColor: color, color: 'white', fontWeight: 700, fontSize: 12, textAlign: 'center', lineHeight: '22px' }}>{c.dominant_epc_rating}</span>
                  </div>
                )}
                <button onClick={() => map.setView([c.latitude, c.longitude], map.getZoom() + 3)} style={{ marginTop: 8, width: '100%', padding: '6px 0', backgroundColor: '#1B4F72', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Zoom In</button>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Individual property markers — shown at high zoom levels */}
      {properties.map(p => {
        const color = EPC_COLORS[p.epc_rating?.toUpperCase() || ''] || '#9E9E9E'
        return (
          <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={6}
            fillColor={color} color={color} weight={2} opacity={1} fillOpacity={0.8}
            eventHandlers={{ click: () => onSelectProperty(p.id) }}>
            <Popup>
              <div style={{ padding: 8, minWidth: 180 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.address}</p>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{p.postcode}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#555' }}>EPC:</span>
                  <span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 4, backgroundColor: color, color: 'white', fontWeight: 700, fontSize: 12, textAlign: 'center', lineHeight: '22px' }}>{p.epc_rating?.toUpperCase() || '?'}</span>
                  {p.property_type && <span style={{ fontSize: 11, color: '#555' }}>{p.property_type}</span>}
                </div>
                <button onClick={() => onSelectProperty(p.id)} style={{ marginTop: 8, width: '100%', padding: '6px 0', backgroundColor: '#1B4F72', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>View Details</button>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
      {loading && (
        <div style={{ position: 'absolute', top: 10, left: 320, zIndex: 800, backgroundColor: 'white', padding: '6px 14px', borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.12)', fontSize: 13, color: '#555' }}>Loading properties...</div>
      )}
      {error && !loading && (
        <div style={{ position: 'absolute', top: 10, left: 320, zIndex: 800, backgroundColor: '#fff8f0', padding: '8px 14px', borderRadius: 6, border: '1px solid #f0d0a0', fontSize: 12, color: '#885500' }}>API error: {error} — check backend terminal for details</div>
      )}
    </>
  )
}

/* ─── Map Page ─── */
function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const handleSelect = (id: string) => { setSelectedId(id); setPanelOpen(true) }
  const handleClose = () => setPanelOpen(false)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer center={[52.5, -1.5]} zoom={6} style={{ width: '100%', height: '100%', backgroundColor: '#f5f5f5' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapContent onSelectProperty={handleSelect} />
      </MapContainer>
      <FilterSidebar />
      <EpcLegend />
      <PropertyPanel propertyId={selectedId} isOpen={panelOpen} onClose={handleClose} />
    </div>
  )
}

/* ─── Dashboard ─── */
function AnalyticsDashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [epcData, setEpcData] = useState<any>(null)
  const [geoData, setGeoData] = useState<any[]>([])
  const [retrofitData, setRetrofitData] = useState<any>(null)
  const [enrichment, setEnrichment] = useState<any>(null)
  const [crimeData, setCrimeData] = useState<any>(null)
  const [floodData, setFloodData] = useState<any>(null)
  const [regionData, setRegionData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    Promise.all([
      fetch('/api/analytics/overview').then(r => r.json()),
      fetch('/api/analytics/epc-distribution?target_year=2030').then(r => r.json()),
      fetch('/api/analytics/geographic-summary').then(r => r.json()),
      fetch('/api/analytics/retrofit-priorities?page=1&page_size=10').then(r => r.json()),
      fetch('/api/analytics/enrichment-summary').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/crime-summary').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/flood-summary').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/region-summary').then(r => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([ov, epc, geo, retro, enrich, crime, flood, region]) => {
        setOverview(ov.data)
        setEpcData(epc.data)
        setGeoData(geo.data || [])
        setRetrofitData(retro.data)
        setEnrichment(enrich.data)
        setCrimeData(crime.data)
        setFloodData(flood.data)
        setRegionData(region.data || [])
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f8f9fa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1B4F72', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <p style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading analytics...</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f8f9fa' }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ color: '#c00', fontWeight: 600, fontSize: 16 }}>Error loading analytics</p>
        <p style={{ color: '#666', marginTop: 8 }}>{error}</p>
      </div>
    </div>
  )

  // Prepare chart data
  const epcChartData = epcData?.bands?.map((b: any) => ({
    name: b.rating, value: b.count, percentage: b.percentage,
  })) || []

  const ageChartData = overview?.age_brackets
    ? Object.entries(overview.age_brackets).map(([name, count]) => ({ name, count: count as number }))
    : []

  const heatingChartData = overview?.heating_types
    ? Object.entries(overview.heating_types).slice(0, 6).map(([name, value]) => ({ name, value: value as number }))
    : []

  const propertyTypeData = overview?.property_types
    ? Object.entries(overview.property_types).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 6)
    : []

  const totalProperties = overview?.total_properties || 0
  const retrofitCandidates = overview?.retrofit_candidates || 0
  const avgCondition = overview?.average_condition_score

  // Average EPC calculation
  const avgEpc = epcChartData.length > 0
    ? (() => {
        const epcOrder: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 }
        const total = epcChartData.reduce((s: number, i: any) => s + i.value, 0)
        const weighted = epcChartData.reduce((s: number, i: any) => s + (epcOrder[i.name] || 0) * i.value, 0)
        return String.fromCharCode(64 + Math.round(weighted / total))
      })()
    : 'N/A'

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  }

  const epcNumericMap: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G' }
  const HEATING_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

  return (
    <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%', padding: '24px 32px', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 }}>Portfolio Analytics</h2>

      {/* Key Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {([
          { label: 'Total Properties', value: totalProperties.toLocaleString(), sub: 'Properties in portfolio', accent: '#1B4F72' },
          { label: 'Average EPC', value: avgEpc, sub: 'Estimated average rating', accent: '#2E7D32' },
          { label: 'Retrofit Candidates', value: retrofitCandidates.toLocaleString(), sub: totalProperties ? `${((retrofitCandidates / totalProperties) * 100).toFixed(1)}% of portfolio` : 'EPC D or below', accent: '#E65100' },
          { label: 'Avg. Condition', value: avgCondition != null ? avgCondition.toFixed(1) : 'N/A', sub: 'Condition score (1-5)', accent: '#6A1B9A' },
        ]).map(m => (
          <div key={m.label} style={{ ...cardStyle, borderLeft: `4px solid ${m.accent}` }}>
            <p style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 6 }}>{m.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{m.value}</p>
            <p style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1: EPC + Property Age */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>EPC Distribution</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200 }}>
            {epcChartData.map((d: any) => {
              const maxVal = Math.max(...epcChartData.map((x: any) => x.value), 1)
              const barH = (d.value / maxVal) * 180
              return (
                <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>{d.value.toLocaleString()}</span>
                  <div style={{ width: '100%', height: barH, backgroundColor: EPC_COLORS[d.name] || '#999', borderRadius: '6px 6px 0 0', minHeight: 4 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: '#444' }}>{d.name}</span>
                </div>
              )
            })}
          </div>
          {epcData?.target && (
            <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#1B4F72' }}>
              EPC C Target (2030): <strong>{epcData.target.percentage_at_target}%</strong> of properties at C or above
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Property Age Distribution</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200 }}>
            {ageChartData.map((d: any) => {
              const maxVal = Math.max(...ageChartData.map((x: any) => x.count), 1)
              const barH = (d.count / maxVal) * 180
              return (
                <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>{d.count.toLocaleString()}</span>
                  <div style={{ width: '100%', height: barH, backgroundColor: '#3B82F6', borderRadius: '6px 6px 0 0', minHeight: 4 }} />
                  <span style={{ fontSize: 10, fontWeight: 500, marginTop: 6, color: '#444', textAlign: 'center' }}>{d.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Charts Row 2: Heating Type + Property Types */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Heating Type Distribution</h3>
          {heatingChartData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {heatingChartData.map((d: any, i: number) => {
                const maxVal = Math.max(...heatingChartData.map((x: any) => x.value), 1)
                return (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#555', minWidth: 90 }}>{d.name}</span>
                    <div style={{ flex: 1, height: 20, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(d.value / maxVal) * 100}%`, height: '100%', backgroundColor: HEATING_COLORS[i % HEATING_COLORS.length], borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#333', minWidth: 50, textAlign: 'right' }}>{d.value.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          ) : <p style={{ color: '#999', fontSize: 13 }}>No heating data available</p>}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Property Types</h3>
          {propertyTypeData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {propertyTypeData.map(([type, count]: any) => {
                const maxVal = Math.max(...propertyTypeData.map(([, c]: any) => c), 1)
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#555', minWidth: 110 }}>{type}</span>
                    <div style={{ flex: 1, height: 20, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxVal) * 100}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#333', minWidth: 50, textAlign: 'right' }}>{count.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          ) : <p style={{ color: '#999', fontSize: 13 }}>No property type data available</p>}
        </div>
      </div>

      {/* Retrofit Priorities Table */}
      {retrofitData?.properties && retrofitData.properties.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Retrofit Priorities (Top Properties)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Address', 'Postcode', 'EPC', 'Type', 'Year', 'Priority'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Address' || h === 'Type' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retrofitData.properties.map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', color: '#333', fontWeight: 500 }}>{p.address?.length > 45 ? p.address.substring(0, 45) + '...' : p.address}</td>
                    <td style={{ padding: '10px 12px', color: '#666', textAlign: 'center' }}>{p.postcode}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 600, fontSize: 12, color: 'white', backgroundColor: EPC_COLORS[p.epc_rating] || '#999' }}>{p.epc_rating || '?'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{p.property_type}</td>
                    <td style={{ padding: '10px 12px', color: '#666', textAlign: 'center' }}>{p.year_built || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#111' }}>{p.priority_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enrichment Coverage */}
      {enrichment && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Data Enrichment Coverage</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {([
              { label: 'Postcodes.io', data: enrichment.postcode, color: '#3B82F6' },
              { label: 'Crime Stats', data: enrichment.crime, color: '#EF4444' },
              { label: 'Flood Risk', data: enrichment.flood, color: '#06B6D4' },
              { label: 'EPC Details', data: enrichment.epc, color: '#10B981' },
            ]).map(e => (
              <div key={e.label} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, border: '1px solid #eee' }}>
                <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{e.label}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{e.data?.coverage_pct ?? 0}%</span>
                  <span style={{ fontSize: 11, color: '#888' }}>({e.data?.enriched?.toLocaleString() ?? 0})</span>
                </div>
                <div style={{ width: '100%', height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${e.data?.coverage_pct ?? 0}%`, height: '100%', backgroundColor: e.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crime & Flood Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Crime Summary */}
        {crimeData && crimeData.enriched_count > 0 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Crime Risk Overview</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#888' }}>Avg Risk Score</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: crimeData.avg_risk_score > 5 ? '#DC2626' : crimeData.avg_risk_score > 3 ? '#F59E0B' : '#10B981' }}>{crimeData.avg_risk_score}/10</p>
              </div>
              <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#888' }}>Avg Crimes (3mo)</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>{crimeData.avg_total_crimes}</p>
              </div>
            </div>
            {crimeData.risk_distribution?.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>Risk Distribution</p>
                {crimeData.risk_distribution.map((r: any) => {
                  const maxCount = Math.max(...crimeData.risk_distribution.map((x: any) => x.count), 1)
                  const bandColor = r.band.includes('Very High') ? '#DC2626' : r.band.includes('High') ? '#F59E0B' : r.band.includes('Medium') ? '#3B82F6' : '#10B981'
                  return (
                    <div key={r.band} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#555', minWidth: 110 }}>{r.band}</span>
                      <div style={{ flex: 1, height: 16, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', backgroundColor: bandColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#333', minWidth: 40, textAlign: 'right' }}>{r.count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Flood Summary */}
        {floodData && (floodData.flood_zones?.length > 0 || floodData.river_sea_risk?.length > 0) && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Flood Risk Overview</h3>
            {floodData.properties_with_warnings > 0 && (
              <div style={{ backgroundColor: '#fef3c7', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13, color: '#92400E', fontWeight: 500 }}>
                {floodData.properties_with_warnings} properties near active flood warnings
              </div>
            )}
            {floodData.flood_zones?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>Flood Zones</p>
                {floodData.flood_zones.map((z: any) => {
                  const maxCount = Math.max(...floodData.flood_zones.map((x: any) => x.count), 1)
                  const zoneColor = z.zone === 'Zone 3' ? '#DC2626' : z.zone === 'Zone 2' ? '#F59E0B' : '#3B82F6'
                  return (
                    <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#555', minWidth: 60 }}>{z.zone}</span>
                      <div style={{ flex: 1, height: 16, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(z.count / maxCount) * 100}%`, height: '100%', backgroundColor: zoneColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#333', minWidth: 50, textAlign: 'right' }}>{z.count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {floodData.river_sea_risk?.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>River/Sea Risk</p>
                {floodData.river_sea_risk.map((r: any) => {
                  const maxCount = Math.max(...floodData.river_sea_risk.map((x: any) => x.count), 1)
                  const riskColor = r.level === 'High' ? '#DC2626' : r.level === 'Medium' ? '#F59E0B' : '#10B981'
                  return (
                    <div key={r.level} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#555', minWidth: 60 }}>{r.level}</span>
                      <div style={{ flex: 1, height: 16, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', backgroundColor: riskColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#333', minWidth: 50, textAlign: 'right' }}>{r.count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Region Summary Table */}
      {regionData.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Local Authority Summary</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Local Authority', 'Region', 'Properties', 'Avg Crime Risk', 'High Flood', 'Avg EPC Score'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Local Authority' || h === 'Region' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regionData.slice(0, 20).map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#333' }}>{r.local_authority || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{r.region || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>{r.property_count?.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {r.avg_crime_risk != null ? (
                        <span style={{ fontWeight: 600, color: r.avg_crime_risk > 5 ? '#DC2626' : r.avg_crime_risk > 3 ? '#F59E0B' : '#10B981' }}>{r.avg_crime_risk}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>{r.high_flood_risk_count ?? '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>{r.avg_epc_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Geographic Summary Table */}
      {geoData.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Geographic Summary (by Postcode District)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['District', 'Properties', 'Avg EPC', 'Avg Condition', 'Retrofit %'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'District' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {geoData.slice(0, 15).map((d: any, i: number) => {
                  const avgEpcLetter = epcNumericMap[Math.round(d.avg_epc_numeric)] || 'N/A'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500, color: '#333' }}>{d.district || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>{d.property_count?.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 600, fontSize: 12, color: 'white', backgroundColor: EPC_COLORS[avgEpcLetter] || '#999' }}>{avgEpcLetter}</span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>{d.avg_condition_score?.toFixed(1) || 'N/A'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#111' }}>{d.retrofit_percentage?.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Insights Page ─── */
function InsightsPage() {
  const [areaRisk, setAreaRisk] = useState<any[]>([])
  const [fuelPoverty, setFuelPoverty] = useState<any>(null)
  const [complaints, setComplaints] = useState<any>(null)
  const [repairs, setRepairs] = useState<any>(null)
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [census, setCensus] = useState<any>(null)
  const [broadband, setBroadband] = useState<any>(null)
  const [demographicsLoading, setDemographicsLoading] = useState(false)
  const [demographicsLoaded, setDemographicsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'strategic' | 'risk' | 'epc' | 'fuel' | 'complaints' | 'repairs' | 'demographics' | 'hotspots' | 'guide'>('strategic')
  const [hotspots, setHotspots] = useState<any>(null)
  const [hotspotsLoading, setHotspotsLoading] = useState(false)
  const [hotspotsLoaded, setHotspotsLoaded] = useState(false)
  const [hotspotFilter, setHotspotFilter] = useState<'combined' | 'repairs' | 'complaints'>('combined')
  const [strategicInsights, setStrategicInsights] = useState<any>(null)
  const [strategicLoading, setStrategicLoading] = useState(false)
  const [strategicLoaded, setStrategicLoaded] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/analytics/area-risk-heatmap').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/analytics/fuel-poverty').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/complaints-summary').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/repairs-summary').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/analytics/overview').then(r => r.json()).catch(() => ({ data: null })),
    ])
      .then(([risk, fuel, comp, rep, ov]) => {
        setAreaRisk(risk.data || [])
        setFuelPoverty(fuel.data)
        setComplaints(comp.data || null)
        setRepairs(rep.data || null)
        setOverview(ov.data || null)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  // Lazy-load demographics & broadband data only when the tab is first selected
  useEffect(() => {
    if (activeTab === 'demographics' && !demographicsLoaded && !demographicsLoading) {
      setDemographicsLoading(true)
      Promise.all([
        fetch('/api/analytics/census-demographics').then(r => r.json()).catch(() => ({ data: null })),
        fetch('/api/analytics/broadband-utilities').then(r => r.json()).catch(() => ({ data: null })),
      ])
        .then(([cen, bb]) => {
          setCensus(cen.data || null)
          setBroadband(bb.data || null)
          setDemographicsLoaded(true)
          setDemographicsLoading(false)
        })
        .catch(() => { setDemographicsLoading(false) })
    }
  }, [activeTab, demographicsLoaded, demographicsLoading])

  // Lazy-load hotspots data only when tab is first selected
  useEffect(() => {
    if (activeTab === 'hotspots' && !hotspotsLoaded && !hotspotsLoading) {
      setHotspotsLoading(true)
      fetch('/api/analytics/postcode-hotspots').then(r => r.json())
        .then(json => {
          setHotspots(json.data || null)
          setHotspotsLoaded(true)
          setHotspotsLoading(false)
        })
        .catch(() => { setHotspotsLoading(false) })
    }
  }, [activeTab, hotspotsLoaded, hotspotsLoading])

  // Lazy-load strategic insights when tab is first selected (or on mount since it's default)
  useEffect(() => {
    if (activeTab === 'strategic' && !strategicLoaded && !strategicLoading) {
      setStrategicLoading(true)
      fetch('/api/analytics/strategic-insights').then(r => r.json())
        .then(json => {
          setStrategicInsights(json.data || null)
          setStrategicLoaded(true)
          setStrategicLoading(false)
        })
        .catch(() => { setStrategicLoading(false) })
    }
  }, [activeTab, strategicLoaded, strategicLoading])

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  }

  const riskColor = (level: string) =>
    level === 'Critical' ? '#DC2626' : level === 'High' ? '#F59E0B' : level === 'Medium' ? '#3B82F6' : '#10B981'

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #1B4F72' : '3px solid transparent',
    backgroundColor: 'transparent', color: active ? '#1B4F72' : '#888',
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f8f9fa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1B4F72', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <p style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading insights...</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: '#f8f9fa' }}>
      <p style={{ color: '#c00', fontWeight: 600 }}>Error: {error}</p>
    </div>
  )

  const fp = fuelPoverty?.summary || {}

  return (
    <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%', padding: '24px 32px', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 4 }}>Strategic Insights</h2>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>Data-driven analysis to support investment and welfare decisions</p>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 24, flexWrap: 'wrap' }}>
        <button style={tabStyle(activeTab === 'strategic')} onClick={() => setActiveTab('strategic')}>Strategic Insights</button>
        <button style={tabStyle(activeTab === 'risk')} onClick={() => setActiveTab('risk')}>Area Risk Heatmap</button>
        <button style={tabStyle(activeTab === 'epc')} onClick={() => setActiveTab('epc')}>EPC Overview</button>
        <button style={tabStyle(activeTab === 'fuel')} onClick={() => setActiveTab('fuel')}>Fuel Poverty Indicators</button>
        <button style={tabStyle(activeTab === 'complaints')} onClick={() => setActiveTab('complaints')}>Complaints Analysis</button>
        <button style={tabStyle(activeTab === 'repairs')} onClick={() => setActiveTab('repairs')}>Repairs &amp; Contractors</button>
        <button style={tabStyle(activeTab === 'demographics')} onClick={() => setActiveTab('demographics')}>Demographics &amp; Connectivity</button>
        <button style={tabStyle(activeTab === 'hotspots')} onClick={() => setActiveTab('hotspots')}>Operational Hotspots</button>
        <button style={tabStyle(activeTab === 'guide')} onClick={() => setActiveTab('guide')}>Understanding Your Data</button>
      </div>

      {/* ─── Strategic Insights Tab ─── */}
      {activeTab === 'strategic' && (
        <div>
          {strategicLoading && (
            <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
              <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1B4F72', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              Analysing all data sources — cross-correlating EPC, crime, flood, deprivation, census, broadband, repairs, and complaints...
            </div>
          )}
          {strategicInsights && strategicInsights.insights && (
            <div>
              <div style={{ ...cardStyle, marginBottom: 20, background: 'linear-gradient(135deg, #1B4F72 0%, #2980B9 100%)', color: 'white' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Cross-Correlated Strategic Intelligence</h3>
                <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>
                  {strategicInsights.total_insights} insights generated by analysing IoD 2025 deprivation, flood risk, Census 2021 demographics,
                  broadband coverage, {(() => { try { return (repairs?.summary?.total_orders || 0).toLocaleString() } catch { return '88K+' } })()} repair orders, and {(() => { try { return complaints?.summary?.total_complaints || 0 } catch { return '159' } })()} complaints in combination.
                </p>
              </div>

              {strategicInsights.insights.map((insight: any, idx: number) => {
                const severityColors: Record<string, { bg: string; border: string; badge: string; badgeText: string }> = {
                  critical: { bg: '#fef2f2', border: '#fca5a5', badge: '#dc2626', badgeText: 'white' },
                  high: { bg: '#fffbeb', border: '#fcd34d', badge: '#d97706', badgeText: 'white' },
                  medium: { bg: '#f0f9ff', border: '#93c5fd', badge: '#2563eb', badgeText: 'white' },
                  info: { bg: '#f0fdf4', border: '#86efac', badge: '#16a34a', badgeText: 'white' },
                }
                const colors = severityColors[insight.severity] || severityColors.info
                return (
                  <div key={idx} style={{
                    ...cardStyle, marginBottom: 16, borderLeft: `4px solid ${colors.border}`,
                    backgroundColor: idx === 0 ? colors.bg : 'white',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ fontSize: 32, lineHeight: 1 }}>{insight.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'white', backgroundColor: colors.badge,
                            padding: '2px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
                            {insight.severity}
                          </span>
                          <span style={{ fontSize: 12, color: '#888' }}>Insight #{insight.rank}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: colors.badge, marginLeft: 'auto' }}>{insight.metric}</span>
                        </div>
                        <h4 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 8px' }}>{insight.title}</h4>
                        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.6, margin: '0 0 12px' }}>{insight.description}</p>

                        <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1B4F72', textTransform: 'uppercase', marginBottom: 4 }}>Recommended Action</div>
                          <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{insight.action}</p>
                        </div>

                        {insight.top_postcodes && insight.top_postcodes.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Top Postcodes</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {insight.top_postcodes.slice(0, 5).map((pc: any, i: number) => (
                                <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                  backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 600 }}>
                                  {pc.postcode}: {pc.repairs} repairs (£{(pc.cost / 1000).toFixed(0)}K)
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {insight.areas && insight.areas.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Affected Wards</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {insight.areas.slice(0, 5).map((area: string, i: number) => (
                                <span key={i} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6,
                                  backgroundColor: '#f3f4f6', color: '#555' }}>{area}</span>
                              ))}
                              {insight.areas.length > 5 && (
                                <span style={{ fontSize: 12, padding: '3px 10px', color: '#888' }}>
                                  +{insight.areas.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {insight.data_sources.map((src: string, i: number) => (
                            <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                              backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>{src}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {strategicInsights.insights.length === 0 && (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: '#888' }}>
                  No strategic insights could be generated. Ensure data enrichment has been run (EPC, crime, flood, census, broadband).
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* ─── Area Risk Heatmap Tab ─── */}
      {activeTab === 'risk' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 8 }}>Composite Area Risk Score</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Each area is scored 0-100 combining crime risk (30%), flood risk (30%), and deprivation (40%). Higher scores indicate areas needing more attention and investment.
            </p>

            {/* Risk level summary badges */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {(['Critical', 'High', 'Medium', 'Low'] as const).map(level => {
                const count = areaRisk.filter(a => a.risk_level === level).length
                return (
                  <div key={level} style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: '10px 14px', borderLeft: `4px solid ${riskColor(level)}` }}>
                    <p style={{ fontSize: 11, color: '#888' }}>{level} Risk</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{count}</p>
                    <p style={{ fontSize: 11, color: '#aaa' }}>areas</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick-reference: what the columns mean */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ ...cardStyle, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 6 }}>Crime Score (0–30)</h4>
              <p style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 8 }}>
                Based on UK Police API data — reported crimes within 1 mile of each property over 3 months. Each property gets a 0–10 risk score, which is scaled to 0–30 for the composite.
              </p>
              <div style={{ fontSize: 11, color: '#991B1B', lineHeight: 1.7 }}>
                <strong>0–8:</strong> Low crime area<br/>
                <strong>9–18:</strong> Moderate crime<br/>
                <strong>19–30:</strong> High crime — consider security investment
              </div>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 6 }}>Flood Score (0–30)</h4>
              <p style={{ fontSize: 12, color: '#1E3A5F', lineHeight: 1.6, marginBottom: 8 }}>
                From Environment Agency data. Each property is classified by flood zone, then averaged across the ward.
              </p>
              <div style={{ fontSize: 11, color: '#1E40AF', lineHeight: 1.7 }}>
                <strong>Zone 1</strong> (5 pts): Low risk — less than 0.1% annual chance of flooding<br/>
                <strong>Zone 2</strong> (15 pts): Medium — 0.1–1% annual chance<br/>
                <strong>Zone 3</strong> (30 pts): High — greater than 1% annual chance (1 in 100 years)
              </div>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6', marginBottom: 6 }}>Deprivation Score (0–40)</h4>
              <p style={{ fontSize: 12, color: '#4C1D95', lineHeight: 1.6, marginBottom: 8 }}>
                From the English Indices of Deprivation (IoD 2025). Ranks all ~33,000 areas in England across income, employment, health, education, crime, housing, and environment.
              </p>
              <div style={{ fontSize: 11, color: '#5B21B6', lineHeight: 1.7 }}>
                <strong>IMD Decile 1–3:</strong> Most deprived 30% — highest score<br/>
                <strong>Decile 4–6:</strong> Mid-range deprivation<br/>
                <strong>Decile 7–10:</strong> Least deprived — lowest score
              </div>
            </div>
          </div>

          {/* Risk Table */}
          {areaRisk.length > 0 ? (
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Area Risk Rankings</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      {['Rank', 'Ward', 'Local Authority', 'Properties', 'Risk Score', 'Crime', 'Flood', 'Deprivation', 'IMD Decile', 'Level'].map(h => (
                        <th key={h} style={{ padding: '10px 10px', textAlign: h === 'Ward' || h === 'Local Authority' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {areaRisk.slice(0, 40).map((a: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#888' }}>{i + 1}</td>
                        <td style={{ padding: '10px', fontWeight: 500, color: '#333', maxWidth: 180 }}>{a.area_name}</td>
                        <td style={{ padding: '10px', color: '#666', maxWidth: 140 }}>{a.local_authority || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#666' }}>{a.property_count}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: riskColor(a.risk_level) }}>{a.composite_risk_score}</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <div style={{ width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
                            <div style={{ width: `${(a.crime_component / 30) * 100}%`, height: '100%', backgroundColor: '#EF4444', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#888' }}>{a.crime_component}/30</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <div style={{ width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
                            <div style={{ width: `${(a.flood_component / 30) * 100}%`, height: '100%', backgroundColor: '#06B6D4', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#888' }}>{a.flood_component}/30</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <div style={{ width: '100%', height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
                            <div style={{ width: `${(a.imd_component / 40) * 100}%`, height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#888' }}>{a.imd_component}/40</span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#666' }}>{a.avg_imd_decile ?? '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11, color: 'white', backgroundColor: riskColor(a.risk_level) }}>{a.risk_level}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>📊</p>
              <p style={{ color: '#333', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Area Risk Data Not Yet Available</p>
              <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                The dashboard needs enrichment data to calculate area-level crime, flood, and deprivation scores.
              </p>
              <div style={{ marginTop: 20, padding: 16, backgroundColor: '#f0f9ff', borderRadius: 8, display: 'inline-block', textAlign: 'left' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1B4F72', marginBottom: 8 }}>To populate this view, run from the project root:</p>
                <code style={{ fontSize: 12, color: '#444', backgroundColor: '#e0ecf4', padding: '6px 12px', borderRadius: 4, display: 'block' }}>
                  ./start.sh --enrich
                </code>
                <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                  Or run individually: <code style={{ fontSize: 11 }}>cd server && python enrich_all.py --skip epc</code>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── EPC Overview Tab ─── */}
      {activeTab === 'epc' && (
        <div>
          {/* Explainer */}
          <div style={{ ...cardStyle, marginBottom: 24, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#166534', marginBottom: 8 }}>Energy Performance Certificates (EPC)</h3>
            <p style={{ fontSize: 13, color: '#15803D', lineHeight: 1.6 }}>
              EPCs rate a property's energy efficiency from A (most efficient) to G (least efficient). Social housing providers must achieve EPC Band C or above by 2030. Properties rated D–G are below target and represent both a compliance risk and an opportunity to reduce tenant energy bills. The gap between current and potential ratings shows how much improvement is achievable through retrofit.
            </p>
          </div>

          {(() => {
            const epcDist = overview?.epc_distribution || {}
            const epcBands = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
            const totalEpc = epcBands.reduce((sum, b) => sum + (epcDist[b] || 0), 0)
            const atOrAboveC = (epcDist['A'] || 0) + (epcDist['B'] || 0) + (epcDist['C'] || 0)
            const belowC = totalEpc - atOrAboveC
            const pctAtC = totalEpc > 0 ? ((atOrAboveC / totalEpc) * 100).toFixed(1) : '0'
            const retrofit = overview?.retrofit_candidates || 0

            if (totalEpc === 0) {
              return (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
                  <p style={{ fontSize: 36, marginBottom: 12 }}>⚡</p>
                  <p style={{ color: '#333', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No EPC Data Available</p>
                  <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                    EPC data can be populated by running the EPC enrichment script. This requires a free API key from the Open Data Communities register.
                  </p>
                  <div style={{ marginTop: 20, padding: 16, backgroundColor: '#f0fdf4', borderRadius: 8, display: 'inline-block', textAlign: 'left' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 8 }}>To enrich EPC data:</p>
                    <p style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>1. Register at <strong>epc.opendatacommunities.org</strong> for a free API key</p>
                    <p style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>2. Add to your <code style={{ fontSize: 11, backgroundColor: '#e0f2e9', padding: '2px 4px', borderRadius: 2 }}>.env</code> file: <code style={{ fontSize: 11, backgroundColor: '#e0f2e9', padding: '2px 4px', borderRadius: 2 }}>EPC_API_KEY=... EPC_EMAIL=...</code></p>
                    <p style={{ fontSize: 12, color: '#444' }}>3. Run: <code style={{ fontSize: 11, backgroundColor: '#e0f2e9', padding: '2px 4px', borderRadius: 2 }}>cd server && python enrich_epc.py</code></p>
                  </div>
                </div>
              )
            }

            return (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                  <div style={{ ...cardStyle, borderLeft: '4px solid #1B7A2B' }}>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>At or Above Band C</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#1B7A2B' }}>{atOrAboveC.toLocaleString()}</p>
                    <p style={{ fontSize: 11, color: '#aaa' }}>{pctAtC}% of rated properties — meeting 2030 target</p>
                  </div>
                  <div style={{ ...cardStyle, borderLeft: '4px solid #FF5722' }}>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Below Band C</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#FF5722' }}>{belowC.toLocaleString()}</p>
                    <p style={{ fontSize: 11, color: '#aaa' }}>Requiring retrofit to meet 2030 target</p>
                  </div>
                  <div style={{ ...cardStyle, borderLeft: '4px solid #F59E0B' }}>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Retrofit Candidates</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>{retrofit.toLocaleString()}</p>
                    <p style={{ fontSize: 11, color: '#aaa' }}>EPC D–G properties eligible for improvement</p>
                  </div>
                  <div style={{ ...cardStyle, borderLeft: '4px solid #3B82F6' }}>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Total Rated</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: '#3B82F6' }}>{totalEpc.toLocaleString()}</p>
                    <p style={{ fontSize: 11, color: '#aaa' }}>of {(overview?.total_properties || 0).toLocaleString()} total properties</p>
                  </div>
                </div>

                {/* EPC Distribution Chart */}
                <div style={{ ...cardStyle, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>EPC Band Distribution</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, padding: '0 10px' }}>
                    {epcBands.map(band => {
                      const count = epcDist[band] || 0
                      const maxCount = Math.max(...epcBands.map(b => epcDist[b] || 0), 1)
                      const barH = (count / maxCount) * 150
                      const pct = totalEpc > 0 ? ((count / totalEpc) * 100).toFixed(1) : '0'
                      return (
                        <div key={band} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4 }}>{count.toLocaleString()}</span>
                          <div style={{ width: '100%', height: barH, backgroundColor: EPC_COLORS[band] || '#999', borderRadius: '6px 6px 0 0', minHeight: 4 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: '#333' }}>{band}</span>
                          <span style={{ fontSize: 10, color: '#888' }}>{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                  {/* 2030 target line explanation */}
                  <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                    <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
                      <strong>2030 Target:</strong> All social housing must reach EPC Band C or above. Properties in bands A–C ({pctAtC}%) already meet this target. The remaining {belowC.toLocaleString()} properties in bands D–G need improvement through measures like insulation, heating upgrades, window replacement, or solar panels.
                    </p>
                  </div>
                </div>

                {/* Band explanation */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>What the Bands Mean</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { band: 'A', score: '92–100', desc: 'Highest efficiency — very low energy costs, modern insulation and renewables' },
                      { band: 'B', score: '81–91', desc: 'High efficiency — well-insulated, efficient heating, low carbon emissions' },
                      { band: 'C', score: '69–80', desc: 'Good efficiency — the 2030 target for social housing, reasonable energy costs' },
                      { band: 'D', score: '55–68', desc: 'Below target — moderate energy waste, would benefit from retrofit measures' },
                      { band: 'E', score: '39–54', desc: 'Poor efficiency — high energy costs, likely contributing to fuel poverty' },
                      { band: 'F', score: '21–38', desc: 'Very poor — significant heat loss, urgent retrofit needed' },
                      { band: 'G', score: '1–20', desc: 'Worst efficiency — highest energy costs, critical intervention required' },
                    ].map(({ band, score, desc }) => (
                      <div key={band} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0' }}>
                        <span style={{ display: 'inline-block', width: 28, height: 28, borderRadius: 6, backgroundColor: EPC_COLORS[band], color: 'white', fontWeight: 700, fontSize: 14, textAlign: 'center', lineHeight: '28px', flexShrink: 0 }}>{band}</span>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Band {band} (Score {score})</p>
                          <p style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ─── Fuel Poverty Tab ─── */}
      {activeTab === 'fuel' && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ ...cardStyle, borderLeft: '4px solid #DC2626' }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>High Risk</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#DC2626' }}>{fp.high_risk_count?.toLocaleString() || 0}</p>
              <p style={{ fontSize: 11, color: '#aaa' }}>Poor EPC + most deprived areas ({fp.high_risk_pct || 0}%)</p>
            </div>
            <div style={{ ...cardStyle, borderLeft: '4px solid #F59E0B' }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>At Risk</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>{fp.at_risk_count?.toLocaleString() || 0}</p>
              <p style={{ fontSize: 11, color: '#aaa' }}>Below EPC D + deprived areas ({fp.at_risk_pct || 0}%)</p>
            </div>
            <div style={{ ...cardStyle, borderLeft: '4px solid #3B82F6' }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Poor EPC (E-G)</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#3B82F6' }}>{fp.poor_epc_count?.toLocaleString() || 0}</p>
              <p style={{ fontSize: 11, color: '#aaa' }}>Inefficient properties</p>
            </div>
            <div style={{ ...cardStyle, borderLeft: '4px solid #8B5CF6' }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>High Deprivation</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#8B5CF6' }}>{fp.high_deprivation_count?.toLocaleString() || 0}</p>
              <p style={{ fontSize: 11, color: '#aaa' }}>IMD decile 1-3 (most deprived 30%)</p>
            </div>
          </div>

          {/* Explanation card */}
          <div style={{ ...cardStyle, marginBottom: 24, backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>What is Fuel Poverty?</h3>
            <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
              A household is in fuel poverty if they have required fuel costs above the national median and would be left with income below the poverty line after paying those costs. Properties with poor energy efficiency (EPC E-G) in areas of high deprivation (IMD decile 1-3) are at highest risk. These households benefit most from retrofit investment — improving both tenant welfare and long-term property value.
            </p>
          </div>

          {/* EPC vs Deprivation Cross-Tab */}
          {fuelPoverty?.cross_tabulation?.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>EPC Rating vs Deprivation Level</h3>
              <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>Properties in the bottom-right cells (poor EPC + high deprivation) are at greatest risk of fuel poverty.</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 12 }}>EPC</th>
                      {['Most Deprived (1-3)', 'Mid Deprivation (4-6)', 'Least Deprived (7-10)'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(epc => {
                      const row = fuelPoverty.cross_tabulation.filter((r: any) => r.epc_rating === epc)
                      const getCount = (band: string) => row.find((r: any) => r.deprivation_band === band)?.count || 0
                      const most = getCount('Most Deprived (1-3)')
                      const mid = getCount('Mid Deprivation (4-6)')
                      const least = getCount('Least Deprived (7-10)')
                      if (most + mid + least === 0) return null
                      const isHighRisk = ['E', 'F', 'G'].includes(epc)
                      return (
                        <tr key={epc} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 600, fontSize: 12, color: 'white', backgroundColor: EPC_COLORS[epc] || '#999' }}>{epc}</span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, backgroundColor: isHighRisk && most > 0 ? '#fef2f2' : 'transparent', color: isHighRisk && most > 0 ? '#DC2626' : '#333' }}>
                            {most > 0 ? most.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>
                            {mid > 0 ? mid.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>
                            {least > 0 ? least.toLocaleString() : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fuel Poverty Hotspot Areas */}
          {fuelPoverty?.areas?.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 6 }}>Fuel Poverty Hotspot Areas</h3>
              <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Areas with the most properties combining poor EPC and high deprivation — priority areas for retrofit investment.</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      {['Area', 'Authority', 'Properties', 'High Risk', 'At Risk', 'Avg IMD Decile', 'Avg EPC'].map(h => (
                        <th key={h} style={{ padding: '10px 10px', textAlign: h === 'Area' || h === 'Authority' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fuelPoverty.areas.map((a: any, i: number) => {
                      const epcNumMap: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G' }
                      const avgEpcLetter = a.avg_epc_numeric ? epcNumMap[Math.round(a.avg_epc_numeric)] || '?' : '—'
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px', fontWeight: 500, color: '#333', maxWidth: 180 }}>{a.area}</td>
                          <td style={{ padding: '10px', color: '#666', maxWidth: 140 }}>{a.local_authority || '—'}</td>
                          <td style={{ padding: '10px', textAlign: 'center', color: '#666' }}>{a.properties}</td>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#DC2626' }}>{a.high_risk}</td>
                          <td style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#F59E0B' }}>{a.at_risk}</td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: a.avg_imd_decile && a.avg_imd_decile <= 3 ? '#DC2626' : a.avg_imd_decile && a.avg_imd_decile <= 6 ? '#F59E0B' : '#10B981' }}>
                              {a.avg_imd_decile ?? '—'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 600, fontSize: 12, color: 'white', backgroundColor: EPC_COLORS[avgEpcLetter] || '#999' }}>{avgEpcLetter}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!fuelPoverty?.areas?.length && !fuelPoverty?.cross_tabulation?.length && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#888', fontSize: 14 }}>No fuel poverty data available yet.</p>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>Run the IMD enrichment script first: python enrich_imd.py --download</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Complaints Analysis Tab ─── */}
      {activeTab === 'complaints' && (
        <div>
          {complaints ? (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ ...cardStyle, borderLeft: '4px solid #DC2626' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Open Complaints</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#DC2626' }}>{complaints.summary?.total_complaints || 0}</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>Requiring resolution</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #F59E0B' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Stage 2 Escalations</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>{complaints.summary?.stage_2_count || 0}</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>{complaints.summary?.escalation_rate_pct || 0}% escalation rate</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #3B82F6' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Avg Response Time</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#3B82F6' }}>{complaints.summary?.avg_response_days || 0}</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>days to respond</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #10B981' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Top Category</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#10B981' }}>{complaints.summary?.top_category || 'N/A'}</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>Most frequent complaint type</p>
                </div>
              </div>

              {/* Explainer */}
              <div style={{ ...cardStyle, marginBottom: 24, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', marginBottom: 8 }}>Why Complaints Data Matters for Digital Twins</h3>
                <p style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6 }}>
                  Complaints data reveals where service delivery is failing tenants. High complaint volumes in specific categories (e.g. reactive repairs, damp/condensation) signal systemic property issues that a digital twin can help predict and prevent. Stage 2 escalations indicate unresolved problems that erode tenant trust — tracking these by area and category helps prioritise investment in the properties and services that need it most. Combining complaint hotspots with EPC, crime, and deprivation data enables a holistic view of which communities are under the most pressure.
                </p>
              </div>

              {/* Complaints by Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Complaints by Category</h3>
                  {(complaints.by_category || []).map((c: any) => {
                    const maxCount = Math.max(...(complaints.by_category || []).map((x: any) => x.count))
                    return (
                      <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#555', width: 180, flexShrink: 0, textAlign: 'right' }}>{c.category}</span>
                        <div style={{ flex: 1, height: 18, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(c.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#DC2626', borderRadius: 4, minWidth: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#333', width: 30 }}>{c.count}</span>
                      </div>
                    )
                  })}
                </div>

                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Complaints by Area</h3>
                  {(complaints.by_area || []).map((a: any) => {
                    const maxCount = Math.max(...(complaints.by_area || []).map((x: any) => x.count))
                    return (
                      <div key={a.area} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: '#555', width: 160, flexShrink: 0, textAlign: 'right' }}>{a.area}</span>
                        <div style={{ flex: 1, height: 22, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(a.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#F59E0B', borderRadius: 4, minWidth: 2 }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#333', width: 35 }}>{a.count}</span>
                      </div>
                    )
                  })}

                  <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 10 }}>Stage Breakdown</h4>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {(complaints.by_stage || []).map((s: any) => (
                        <div key={s.stage} style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                          <p style={{ fontSize: 11, color: '#888' }}>{s.stage}</p>
                          <p style={{ fontSize: 20, fontWeight: 700, color: s.stage === 'Stage 2' ? '#DC2626' : '#3B82F6' }}>{s.count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Complaints Table */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Recent Complaints</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        {['Case ID', 'Stage', 'Category', 'Address', 'Postcode', 'Area', 'Logged', 'Days', 'Type'].map(h => (
                          <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(complaints.recent || []).map((r: any) => (
                        <tr key={r.case_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: '#333', fontSize: 12 }}>{r.case_id}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: 'white', backgroundColor: r.stage === 'Stage 2' ? '#DC2626' : '#3B82F6' }}>{r.stage}</span>
                          </td>
                          <td style={{ padding: '8px', color: '#555', fontSize: 12, maxWidth: 150 }}>{r.category}</td>
                          <td style={{ padding: '8px', color: '#555', fontSize: 12, maxWidth: 180 }}>{r.address}</td>
                          <td style={{ padding: '8px', color: '#666', fontSize: 12 }}>{r.postcode}</td>
                          <td style={{ padding: '8px', color: '#666', fontSize: 12 }}>{r.area}</td>
                          <td style={{ padding: '8px', color: '#666', fontSize: 12, whiteSpace: 'nowrap' }}>{r.logged_date}</td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600, color: (r.total_days ?? 0) > 5 ? '#DC2626' : '#10B981' }}>{r.total_days ?? '—'}</td>
                          <td style={{ padding: '8px', color: '#666', fontSize: 12 }}>{r.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#888', fontSize: 14 }}>No complaints data available.</p>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>Place "Complaints Data 1.xlsx" in the project root to enable this view.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Repairs & Contractor Performance Tab ─── */}
      {activeTab === 'repairs' && (
        <div>
          {repairs ? (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ ...cardStyle, borderLeft: '4px solid #1B4F72' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Total Repair Orders</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#1B4F72' }}>{(repairs.summary?.total_orders || 0).toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>{(repairs.summary?.unique_properties || 0).toLocaleString()} unique properties</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #DC2626' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Total Spend</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#DC2626' }}>{'\u00A3'}{((repairs.summary?.total_cost || 0) / 1000000).toFixed(1)}M</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>Median {'\u00A3'}{(repairs.summary?.median_cost || 0).toFixed(0)} per order</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #10B981' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>On-Time Attendance</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: (repairs.summary?.on_time_pct || 0) >= 85 ? '#10B981' : '#F59E0B' }}>{repairs.summary?.on_time_pct || 0}%</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>{(repairs.summary?.on_time_yes || 0).toLocaleString()} of {((repairs.summary?.on_time_yes || 0) + (repairs.summary?.on_time_no || 0)).toLocaleString()}</p>
                </div>
                <div style={{ ...cardStyle, borderLeft: '4px solid #8B5CF6' }}>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>First Time Fix Rate</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: '#8B5CF6' }}>{repairs.summary?.first_time_fix_rate || 0}%</p>
                  <p style={{ fontSize: 11, color: '#aaa' }}>{(repairs.summary?.ftf_yes || 0).toLocaleString()} fixed first visit</p>
                </div>
              </div>

              {/* Explainer */}
              <div style={{ ...cardStyle, marginBottom: 24, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1E40AF', marginBottom: 8 }}>Why Repairs Data Matters for Digital Twins</h3>
                <p style={{ fontSize: 13, color: '#1E3A5F', lineHeight: 1.6 }}>
                  Repairs data is the operational heartbeat of your housing portfolio. By analysing repair frequency, cost, and type against property attributes (age, EPC rating, construction type), a digital twin can predict which properties are likely to need intervention before failures occur. Contractor performance metrics — on-time rates, first-time fix rates, and cost-per-repair — directly inform procurement decisions and service level agreements. Properties with repeated "No Heat or Hot Water" repairs, for example, are strong candidates for heating system replacement in your retrofit planning.
                </p>
              </div>

              {/* Top Contractors Table */}
              <div style={{ ...cardStyle, marginBottom: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Contractor Performance</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        {['Contractor', 'Total Spend', 'Orders', 'Avg Cost', 'On-Time %', 'On-Time'].map(h => (
                          <th key={h} style={{ padding: '10px 8px', textAlign: h === 'Contractor' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(repairs.top_contractors || []).map((c: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 500, color: '#333', maxWidth: 250 }}>{c.contractor}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: '#111' }}>{'\u00A3'}{c.total_spend >= 1000000 ? (c.total_spend / 1000000).toFixed(1) + 'M' : c.total_spend >= 1000 ? (c.total_spend / 1000).toFixed(0) + 'K' : c.total_spend.toFixed(0)}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', color: '#666' }}>{c.order_count.toLocaleString()}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', color: '#666' }}>{'\u00A3'}{c.avg_cost.toFixed(0)}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <div style={{ width: 60, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${c.on_time_pct}%`, height: '100%', backgroundColor: c.on_time_pct >= 85 ? '#10B981' : c.on_time_pct >= 70 ? '#F59E0B' : '#DC2626', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: c.on_time_pct >= 85 ? '#10B981' : c.on_time_pct >= 70 ? '#F59E0B' : '#DC2626' }}>{c.on_time_pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, color: 'white', backgroundColor: c.on_time_pct >= 85 ? '#10B981' : c.on_time_pct >= 70 ? '#F59E0B' : '#DC2626' }}>
                              {c.on_time_pct >= 85 ? 'Good' : c.on_time_pct >= 70 ? 'Fair' : 'Poor'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Repair Types + Trade + Priority breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                {/* Top Repair Types */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Most Common Repair Types</h3>
                  {(repairs.by_repair_type || []).slice(0, 12).map((r: any) => {
                    const maxCount = Math.max(...(repairs.by_repair_type || []).map((x: any) => x.count))
                    return (
                      <div key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#555', width: 220, flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type}</span>
                        <div style={{ flex: 1, height: 16, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 4, minWidth: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#333', width: 45, textAlign: 'right' }}>{r.count.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Trade + Priority */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>By Trade</h3>
                  {(repairs.by_trade || []).slice(0, 10).map((t: any) => {
                    const maxCount = Math.max(...(repairs.by_trade || []).map((x: any) => x.count))
                    return (
                      <div key={t.trade} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: '#555', width: 140, flexShrink: 0, textAlign: 'right' }}>{t.trade}</span>
                        <div style={{ flex: 1, height: 16, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(t.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#8B5CF6', borderRadius: 4, minWidth: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#333', width: 45, textAlign: 'right' }}>{t.count.toLocaleString()}</span>
                      </div>
                    )
                  })}

                  <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 10 }}>Priority Breakdown (Top 8)</h4>
                    {(repairs.by_priority || []).slice(0, 8).map((p: any) => {
                      const maxCount = Math.max(...(repairs.by_priority || []).slice(0, 8).map((x: any) => x.count))
                      return (
                        <div key={p.priority} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: '#555', width: 140, flexShrink: 0, textAlign: 'right' }}>{p.priority}</span>
                          <div style={{ flex: 1, height: 14, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${(p.count / maxCount) * 100}%`, height: '100%', backgroundColor: '#F59E0B', borderRadius: 4, minWidth: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#333', width: 45, textAlign: 'right' }}>{p.count.toLocaleString()}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Monthly Trend */}
              {(repairs.monthly_trend || []).length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 16 }}>Monthly Repair Volume &amp; Spend</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          {['Month', 'Orders', 'Spend', 'Volume'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Month' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(repairs.monthly_trend || []).map((m: any) => {
                          const maxOrders = Math.max(...(repairs.monthly_trend || []).map((x: any) => x.orders))
                          return (
                            <tr key={m.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 500, color: '#333' }}>{m.month}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#666' }}>{m.orders.toLocaleString()}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: '#111' }}>{'\u00A3'}{(m.spend / 1000).toFixed(0)}K</td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ width: '100%', height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${(m.orders / maxOrders) * 100}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 4 }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#888', fontSize: 14 }}>No repairs data available.</p>
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>Place "Repairs by Contractor.xlsx" in the project root to enable this view.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Demographics & Connectivity Tab ─── */}
      {activeTab === 'demographics' && (
        demographicsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#1B4F72', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
              <p style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading demographics &amp; connectivity data...</p>
            </div>
          </div>
        ) : (
        <div>
          {/* Census Section */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>Census 2021 Demographics</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              LSOA-level demographic data from the ONS Census 2021 — age profiles, household composition, and vulnerability indicators across your portfolio.
            </p>

            {census && census.enriched_count > 0 ? (
              <>
                {/* Portfolio-wide headline stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Elderly (65+)', value: census.portfolio_averages?.elderly_pct, suffix: '%', color: '#DC2626' },
                    { label: 'Children (0-15)', value: census.portfolio_averages?.children_pct, suffix: '%', color: '#3B82F6' },
                    { label: 'Working Age', value: census.portfolio_averages?.working_age_pct, suffix: '%', color: '#10B981' },
                    { label: 'Disability', value: census.portfolio_averages?.disability_pct, suffix: '%', color: '#F59E0B' },
                    { label: 'Single Person HH', value: census.portfolio_averages?.single_person_hh_pct, suffix: '%', color: '#8B5CF6' },
                  ].map((s, i) => (
                    <div key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: '12px 14px', borderLeft: `4px solid ${s.color}` }}>
                      <p style={{ fontSize: 11, color: '#888' }}>{s.label}</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{s.value != null ? `${s.value}${s.suffix}` : '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Additional vulnerability indicators */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'No Central Heating', value: census.portfolio_averages?.no_central_heating_pct, suffix: '%' },
                    { label: 'Overcrowded', value: census.portfolio_averages?.overcrowded_pct, suffix: '%' },
                    { label: 'Non-English Speakers', value: census.portfolio_averages?.non_english_speaker_pct, suffix: '%' },
                    { label: 'Pop. Density (per ha)', value: census.portfolio_averages?.population_density, suffix: '' },
                  ].map((s, i) => (
                    <div key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
                      <p style={{ fontSize: 11, color: '#888' }}>{s.label}</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{s.value != null ? `${s.value}${s.suffix}` : '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Elderly Concentration Table */}
                {census.elderly_concentration && census.elderly_concentration.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Areas with Highest Elderly Population</h4>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Wards ranked by proportion of residents aged 65+. Higher elderly concentration may indicate greater need for adapted housing, accessibility improvements, and support services.</p>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            {['Ward', 'Local Authority', 'Properties', 'Elderly %', 'Disability %', 'Single Person %'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Ward' || h === 'Local Authority' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {census.elderly_concentration.map((r: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 500, color: '#333' }}>{r.ward}</td>
                              <td style={{ padding: '8px 10px', color: '#666' }}>{r.local_authority || '—'}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.properties}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: (r.avg_elderly_pct || 0) > 25 ? '#DC2626' : '#333' }}>{r.avg_elderly_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#666' }}>{r.avg_disability_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#666' }}>{r.avg_single_person_pct ?? '—'}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* LA Breakdown */}
                {census.local_authority_breakdown && census.local_authority_breakdown.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Local Authority Vulnerability Breakdown</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            {['Local Authority', 'Properties', 'Elderly %', 'Disability %', 'Overcrowded %', 'No Heating %', 'Non-English %'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Local Authority' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {census.local_authority_breakdown.map((r: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 500, color: '#333' }}>{r.local_authority}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.properties}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.avg_elderly_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.avg_disability_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.avg_overcrowded_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.avg_no_heating_pct ?? '—'}%</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.avg_non_english_pct ?? '—'}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>👥</p>
                <p style={{ color: '#333', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Census Data Not Yet Available</p>
                <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                  Run the Census enrichment to populate demographic data from the ONS Census 2021.
                </p>
                <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, display: 'inline-block' }}>
                  <code style={{ fontSize: 12, color: '#444' }}>./start.sh --census</code>
                </div>
              </div>
            )}
          </div>

          {/* Broadband & Utilities Section */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>Broadband &amp; Utilities</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Broadband speeds, fibre availability, and electricity/gas distribution network operators across your portfolio.
            </p>

            {broadband && broadband.enriched_count > 0 ? (
              <>
                {/* Broadband speed headline stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Avg Download', value: broadband.broadband?.avg_download_mbps, suffix: ' Mbps', color: '#3B82F6' },
                    { label: 'Avg Upload', value: broadband.broadband?.avg_upload_mbps, suffix: ' Mbps', color: '#10B981' },
                    { label: 'Superfast Available', value: broadband.broadband?.superfast_pct, suffix: '%', color: '#F59E0B' },
                    { label: 'FTTP (Full Fibre)', value: broadband.broadband?.fttp_pct, suffix: '%', color: '#8B5CF6' },
                  ].map((s, i) => (
                    <div key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: '12px 14px', borderLeft: `4px solid ${s.color}` }}>
                      <p style={{ fontSize: 11, color: '#888' }}>{s.label}</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{s.value != null ? `${s.value}${s.suffix}` : '—'}</p>
                    </div>
                  ))}
                </div>

                {/* Speed Distribution */}
                {broadband.broadband?.speed_distribution && broadband.broadband.speed_distribution.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Download Speed Distribution</h4>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
                      {broadband.broadband.speed_distribution.map((b: any, i: number) => {
                        const maxCount = Math.max(...broadband.broadband.speed_distribution.map((x: any) => x.count))
                        const height = maxCount > 0 ? (b.count / maxCount) * 100 : 0
                        const colors = ['#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#EDE9FE']
                        return (
                          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#333', marginBottom: 4 }}>{b.count}</p>
                            <div style={{ height: `${height}%`, minHeight: 4, backgroundColor: colors[i] || '#E5E7EB', borderRadius: '4px 4px 0 0', border: '1px solid rgba(0,0,0,0.08)' }} />
                            <p style={{ fontSize: 10, color: '#888', marginTop: 4, lineHeight: 1.2 }}>{b.band}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Utilities Grid: DNO + GDN */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                  {/* Electricity DNO */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Electricity Distribution (DNO)</h4>
                    {broadband.electricity?.dno_breakdown && broadband.electricity.dno_breakdown.length > 0 ? (
                      <div>
                        {broadband.electricity.dno_breakdown.map((d: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontSize: 13, color: '#333' }}>{d.dno}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{d.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#888' }}>No DNO data available</p>
                    )}
                  </div>

                  {/* Gas GDN */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 12 }}>Gas Distribution (GDN)</h4>
                    {broadband.gas?.gdn_breakdown && broadband.gas.gdn_breakdown.length > 0 ? (
                      <div>
                        {broadband.gas.gdn_breakdown.map((g: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontSize: 13, color: '#333' }}>{g.gdn}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{g.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#888' }}>No GDN data available</p>
                    )}
                  </div>
                </div>

                {/* Digital Divide Table */}
                {broadband.digital_divide && broadband.digital_divide.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 8 }}>Digital Divide — Areas with Slowest Broadband</h4>
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Areas ranked by lowest average download speed. Poor connectivity may impact tenants' ability to access online services and smart home energy management.</p>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                            {['Ward', 'Local Authority', 'Properties', 'Avg Download', 'Superfast', 'Full Fibre'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Ward' || h === 'Local Authority' ? 'left' : 'center', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {broadband.digital_divide.map((r: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 500, color: '#333' }}>{r.ward}</td>
                              <td style={{ padding: '8px 10px', color: '#666' }}>{r.local_authority || '—'}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.properties}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: (r.avg_download_mbps || 0) < 30 ? '#DC2626' : '#333' }}>{r.avg_download_mbps ?? '—'} Mbps</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.superfast_count}/{r.properties}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.fttp_count}/{r.properties}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📡</p>
                <p style={{ color: '#333', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Broadband &amp; Utilities Data Not Yet Available</p>
                <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                  Run the broadband enrichment to populate Ofcom broadband speeds and utility provider data.
                </p>
                <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, display: 'inline-block' }}>
                  <code style={{ fontSize: 12, color: '#444' }}>./start.sh --broadband</code>
                </div>
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* ─── Operational Hotspots Tab ─── */}
      {activeTab === 'hotspots' && (
        hotspotsLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#1B4F72', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: '#888', fontSize: 13 }}>Loading operational hotspots...</p>
          </div>
        ) : hotspots ? (
        <div>
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 8 }}>Postcode Hotspot Map</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Each circle represents a postcode area. Size and colour indicate the volume of repairs and complaints — larger, redder circles signal areas with the highest operational demand.
            </p>

            {/* Toggle filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['combined', 'repairs', 'complaints'] as const).map(f => (
                <button key={f} onClick={() => setHotspotFilter(f)} style={{
                  padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid',
                  cursor: 'pointer', textTransform: 'capitalize',
                  backgroundColor: hotspotFilter === f ? (f === 'repairs' ? '#F97316' : f === 'complaints' ? '#DC2626' : '#1B4F72') : 'white',
                  color: hotspotFilter === f ? 'white' : '#555',
                  borderColor: hotspotFilter === f ? 'transparent' : '#ddd',
                }}>{f}</button>
              ))}
            </div>

            {/* Map */}
            <div style={{ height: 500, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
              <MapContainer center={[52.5, -1.5]} zoom={7} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
                {(hotspots.hotspots || [])
                  .filter((h: any) => h.lat && h.lng)
                  .map((h: any) => {
                    const count = hotspotFilter === 'repairs' ? h.repair_count
                      : hotspotFilter === 'complaints' ? h.complaint_count
                      : h.combined_count
                    if (count === 0) return null
                    const maxCount = Math.max(
                      ...(hotspots.hotspots || []).map((x: any) =>
                        hotspotFilter === 'repairs' ? x.repair_count
                          : hotspotFilter === 'complaints' ? x.complaint_count
                          : x.combined_count
                      ).filter((n: number) => n > 0)
                    )
                    const ratio = maxCount > 0 ? count / maxCount : 0
                    const radius = 5 + ratio * 25
                    // Green → amber → red
                    const r = Math.min(255, Math.floor(ratio * 2 * 255))
                    const g = Math.min(255, Math.floor((1 - ratio) * 2 * 180))
                    const color = `rgb(${r}, ${g}, 30)`
                    return (
                      <CircleMarker key={h.postcode} center={[h.lat, h.lng]} radius={radius}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 1 }}>
                        <Popup>
                          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                            <strong style={{ fontSize: 14 }}>{h.postcode}</strong><br />
                            <span style={{ color: '#888' }}>{h.property_count} properties</span><br />
                            <span style={{ color: '#F97316' }}>Repairs: {h.repair_count.toLocaleString()}</span><br />
                            <span style={{ color: '#DC2626' }}>Complaints: {h.complaint_count}</span><br />
                            <span style={{ color: '#555' }}>Repair Cost: £{(h.total_repair_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        </Popup>
                      </CircleMarker>
                    )
                  })}
              </MapContainer>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
              {[
                { label: 'Postcodes', value: hotspots.summary?.total_postcodes?.toLocaleString() || '0' },
                { label: 'Repairs Mapped', value: hotspots.summary?.total_repairs_mapped?.toLocaleString() || '0' },
                { label: 'Complaints Mapped', value: hotspots.summary?.total_complaints_mapped?.toLocaleString() || '0' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: 12, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: '#888' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top postcodes table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 16 }}>Top 20 Postcodes by Volume</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['Rank', 'Postcode', 'Properties', 'Repairs', 'Complaints', 'Combined', 'Repair Cost'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Postcode' ? 'left' : 'right', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(hotspots.hotspots || [])
                    .filter((h: any) => h.combined_count > 0)
                    .sort((a: any, b: any) => {
                      const aVal = hotspotFilter === 'repairs' ? a.repair_count : hotspotFilter === 'complaints' ? a.complaint_count : a.combined_count
                      const bVal = hotspotFilter === 'repairs' ? b.repair_count : hotspotFilter === 'complaints' ? b.complaint_count : b.combined_count
                      return bVal - aVal
                    })
                    .slice(0, 20)
                    .map((h: any, i: number) => (
                      <tr key={h.postcode} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#888' }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1B4F72' }}>{h.postcode}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{h.property_count}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#F97316', fontWeight: 600 }}>{h.repair_count.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>{h.complaint_count}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{h.combined_count.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>£{(h.total_repair_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ) : (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 14, color: '#888' }}>No hotspot data available. Ensure complaints and repairs data files are present.</p>
          </div>
        )
      )}

      {/* ─── Understanding Your Data Tab ─── */}
      {activeTab === 'guide' && <GuideTab />}
    </div>
  )
}

/* ─── Data Upload Page ─── */
function DataUploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const DB_COLUMNS = [
    { key: 'address', label: 'Address', required: true },
    { key: 'postcode', label: 'Postcode', required: false },
    { key: 'property_type', label: 'Property Type', required: false },
    { key: 'bedrooms', label: 'Bedrooms', required: false },
    { key: 'year_built', label: 'Year Built', required: false },
    { key: 'heating_type', label: 'Heating Type', required: false },
    { key: 'epc_rating', label: 'EPC Rating', required: false },
    { key: 'floor_area_sqm', label: 'Floor Area (sqm)', required: false },
    { key: 'tenure_type', label: 'Tenure Type', required: false },
    { key: 'construction_type', label: 'Construction Type', required: false },
  ]

  const handleFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) { alert('Please select a CSV file'); return }
    setFile(f); setResult(null)
    const formData = new FormData()
    formData.append('file', f)
    try {
      const res = await fetch('/api/data-hub/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        setUploadId(data.upload_id)
        // Fetch preview
        const prev = await fetch(`/api/data-hub/preview/${data.upload_id}`)
        const prevData = await prev.json()
        setPreview({ headers: prevData.headers, rows: prevData.rows })
        // Auto-map matching columns
        const auto: Record<string, string> = {}
        DB_COLUMNS.forEach(col => {
          const match = (prevData.headers as string[]).find(
            (h: string) => h.toLowerCase().replace(/[\s_-]/g, '') === col.key.replace(/_/g, '')
          )
          if (match) auto[col.key] = match
        })
        setMapping(auto)
      }
    } catch { /* ignore */ }
  }

  const handleImport = async () => {
    if (!uploadId) return
    setImporting(true); setResult(null)
    try {
      const res = await fetch('/api/data-hub/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: uploadId, column_mapping: mapping, import_mode: importMode }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e: any) { setResult({ status: 'error', errors: [e.message] }) }
    finally { setImporting(false) }
  }

  const handleDownloadTemplate = () => {
    window.open('/api/data-hub/template', '_blank')
  }

  const reset = () => { setFile(null); setUploadId(null); setPreview(null); setMapping({}); setResult(null) }

  const containerStyle: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: 24 }
  const cardStyle: React.CSSProperties = { backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24, marginBottom: 16 }
  const dropZoneStyle: React.CSSProperties = {
    border: `2px dashed ${dragActive ? '#1B4F72' : '#d1d5db'}`, borderRadius: 12, padding: 48,
    textAlign: 'center', cursor: 'pointer', backgroundColor: dragActive ? '#f0f4ff' : '#fafafa',
    transition: 'all 0.15s',
  }
  const btnPrimary: React.CSSProperties = { padding: '10px 24px', backgroundColor: '#1B4F72', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
  const btnOutline: React.CSSProperties = { ...btnPrimary, backgroundColor: 'white', color: '#1B4F72', border: '1px solid #1B4F72' }
  const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: 0 }}>Import Data</h1>
          <p style={{ fontSize: 14, color: '#666', margin: '4px 0 0' }}>Upload a CSV file to add properties to your portfolio</p>
        </div>
        <button onClick={handleDownloadTemplate} style={btnOutline}>Download Template</button>
      </div>

      {/* Success/Error result */}
      {result && (
        <div style={{ ...cardStyle, backgroundColor: result.status === 'success' ? '#f0fdf4' : '#fef2f2',
          borderColor: result.status === 'success' ? '#86efac' : '#fca5a5' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: result.status === 'success' ? '#166534' : '#991b1b', marginBottom: 8 }}>
            {result.status === 'success' ? 'Import Successful' : 'Import Had Errors'}
          </div>
          <div style={{ fontSize: 14, color: '#333' }}>
            {result.imported ?? 0} of {result.total ?? 0} rows imported. {result.failed ?? 0} failed.
          </div>
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: 12, maxHeight: 150, overflowY: 'auto', fontSize: 12, color: '#991b1b' }}>
              {result.errors.map((e: string, i: number) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <button onClick={reset} style={{ ...btnPrimary, marginTop: 16 }}>Upload Another File</button>
        </div>
      )}

      {/* Drop zone */}
      {!result && !preview && (
        <div style={dropZoneStyle}
          onDragEnter={e => { e.preventDefault(); setDragActive(true) }}
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
          onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
          <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 4 }}>Drag and drop your CSV file here</div>
          <div style={{ fontSize: 13, color: '#888' }}>or click to browse. CSV files only.</div>
        </div>
      )}

      {/* Preview + mapping */}
      {!result && preview && (
        <>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontWeight: 600, color: '#111' }}>{file?.name}</span>
                <span style={{ color: '#888', fontSize: 13, marginLeft: 8 }}>
                  {preview.rows.length} rows previewed · {preview.headers.length} columns
                </span>
              </div>
              <button onClick={reset} style={{ ...btnOutline, padding: '6px 12px', fontSize: 12 }}>Change File</button>
            </div>
            {/* Preview table */}
            <div style={{ overflowX: 'auto', maxHeight: 220 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>{preview.headers.map((h, i) => (
                    <th key={i} style={{ padding: '6px 10px', backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb',
                      textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i}>{row.map((cell, j) => (
                      <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #f0f0f0', color: '#555',
                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column mapping */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>Column Mapping</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              Map your CSV columns to database fields. Only "Address" is required.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {DB_COLUMNS.map(col => (
                <div key={col.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    {col.label} {col.required && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <select value={mapping[col.key] || ''} onChange={e => setMapping(m => ({ ...m, [col.key]: e.target.value }))}
                    style={selectStyle}>
                    <option value="">— Skip —</option>
                    {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Import mode + button */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 12 }}>Import Mode</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {(['add', 'replace'] as const).map(mode => (
                <label key={mode} style={{ flex: 1, padding: 14, border: `2px solid ${importMode === mode ? '#1B4F72' : '#e5e7eb'}`,
                  borderRadius: 8, cursor: 'pointer', backgroundColor: importMode === mode ? '#f0f4ff' : 'white' }}>
                  <input type="radio" name="mode" checked={importMode === mode} onChange={() => setImportMode(mode)}
                    style={{ marginRight: 8 }} />
                  <span style={{ fontWeight: 600 }}>{mode === 'add' ? 'Add' : 'Replace'}</span>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {mode === 'add' ? 'Add new records to existing data' : 'Clear all existing data first (caution!)'}
                  </div>
                </label>
              ))}
            </div>
            {importMode === 'replace' && (
              <div style={{ padding: 12, backgroundColor: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e', marginBottom: 16 }}>
                ⚠️ Replace mode will delete ALL existing properties before importing. This cannot be undone.
              </div>
            )}
            <button onClick={handleImport} disabled={importing || !mapping.address}
              style={{ ...btnPrimary, width: '100%', opacity: (importing || !mapping.address) ? 0.5 : 1 }}>
              {importing ? 'Importing...' : `Import ${preview.rows.length}+ Properties`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Scenario Planner Page ─── */
function ScenarioPage() {
  const [options, setOptions] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Form state
  const [scenarioName, setScenarioName] = useState('Retrofit Scenario')
  const [targetEpc, setTargetEpc] = useState('C')
  const [selectedEpcRatings, setSelectedEpcRatings] = useState<string[]>([])
  const [selectedWard, setSelectedWard] = useState('')
  const [selectedLA, setSelectedLA] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedInterventions, setSelectedInterventions] = useState<string[]>(['insulation', 'heating'])

  useEffect(() => {
    fetch('/api/scenarios/options').then(r => r.json()).then(setOptions).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggleEpc = (r: string) => {
    setSelectedEpcRatings(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }
  const toggleIntervention = (i: string) => {
    setSelectedInterventions(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  const runScenario = async () => {
    setRunning(true); setResult(null)
    const filters: any = {}
    if (selectedEpcRatings.length > 0) filters.epc_ratings = selectedEpcRatings
    if (selectedWard) filters.ward_name = selectedWard
    if (selectedLA) filters.local_authority_name = selectedLA
    if (selectedType) filters.property_type = selectedType

    try {
      const res = await fetch('/api/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenarioName, filters, target_epc: targetEpc,
          interventions: selectedInterventions,
        }),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
      else setResult({ error: data.detail || 'Scenario failed' })
    } catch (e: any) { setResult({ error: e.message }) }
    finally { setRunning(false) }
  }

  const containerStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: 24 }
  const cardStyle: React.CSSProperties = { backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24, marginBottom: 16 }
  const btnPrimary: React.CSSProperties = { padding: '12px 28px', backgroundColor: '#1B4F72', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const chipStyle = (active: boolean, color?: string): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    backgroundColor: active ? (color || '#1B4F72') : '#f3f4f6', color: active ? 'white' : '#374151',
    transition: 'all 0.1s',
  })
  const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }
  const statCard = (label: string, value: string, sub?: string, accent?: string): React.ReactNode => (
    <div style={{ flex: 1, padding: 20, backgroundColor: accent || '#f9fafb', borderRadius: 10, textAlign: 'center', minWidth: 160 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#111' }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Loading scenario options...</div>

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: '0 0 4px' }}>Scenario Planner</h1>
      <p style={{ fontSize: 14, color: '#666', margin: '0 0 24px' }}>Model the cost, carbon, and energy impact of retrofit interventions across your portfolio.</p>

      {/* Scenario config */}
      <div style={{ display: 'grid', gridTemplateColumns: result ? '380px 1fr' : '1fr', gap: 16 }}>
        <div>
          {/* Name */}
          <div style={cardStyle}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Scenario Name</label>
            <input type="text" value={scenarioName} onChange={e => setScenarioName(e.target.value)}
              style={{ ...selectStyle, marginBottom: 0 }} />
          </div>

          {/* Target EPC */}
          <div style={cardStyle}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Target EPC Rating</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['A', 'B', 'C', 'D'].map(r => (
                <button key={r} onClick={() => setTargetEpc(r)} style={chipStyle(targetEpc === r, EPC_COLORS[r])}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Filter by current EPC */}
          <div style={cardStyle}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Properties to Include (by current EPC)
            </label>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Leave empty to include all properties below target</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EPC_RATINGS.map(r => (
                <button key={r} onClick={() => toggleEpc(r)} style={chipStyle(selectedEpcRatings.includes(r), EPC_COLORS[r])}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={cardStyle}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Area Filters</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={selectedLA} onChange={e => setSelectedLA(e.target.value)} style={selectStyle}>
                <option value="">All Local Authorities</option>
                {(options?.local_authorities || []).map((la: string) => <option key={la} value={la}>{la}</option>)}
              </select>
              <select value={selectedWard} onChange={e => setSelectedWard(e.target.value)} style={selectStyle}>
                <option value="">All Wards</option>
                {(options?.wards || []).map((w: string) => <option key={w} value={w}>{w}</option>)}
              </select>
              <select value={selectedType} onChange={e => setSelectedType(e.target.value)} style={selectStyle}>
                <option value="">All Property Types</option>
                {(options?.property_types || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Interventions */}
          <div style={cardStyle}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Interventions</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(options?.interventions || []).map((intv: any) => (
                <label key={intv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                  borderRadius: 8, border: `1px solid ${selectedInterventions.includes(intv.id) ? '#1B4F72' : '#e5e7eb'}`,
                  backgroundColor: selectedInterventions.includes(intv.id) ? '#f0f4ff' : 'white', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedInterventions.includes(intv.id)}
                    onChange={() => toggleIntervention(intv.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{intv.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{intv.description} · {intv.cost_range}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Run button */}
          <button onClick={runScenario} disabled={running || selectedInterventions.length === 0}
            style={{ ...btnPrimary, width: '100%', opacity: (running || selectedInterventions.length === 0) ? 0.5 : 1, marginBottom: 16 }}>
            {running ? 'Running Scenario...' : 'Run Scenario'}
          </button>
        </div>

        {/* Results panel */}
        {result && !result.error && (
          <div>
            <div style={cardStyle}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4 }}>{result.scenario_name}</h2>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{result.properties_affected?.toLocaleString()} properties affected</p>

              {/* Key metrics */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                {statCard('Total Cost', `£${((result.total_cost_estimate || 0) / 1000000).toFixed(1)}M`, 'estimated investment', '#f0f4ff')}
                {statCard('Cost / Property', `£${(result.avg_cost_per_property || 0).toLocaleString()}`, 'average', '#f0f4ff')}
                {statCard('CO₂ Saved', `${(result.total_co2_savings_tonnes_year || 0).toLocaleString()}t`, 'per year', '#f0fdf4')}
                {statCard('Energy Saved', `£${((result.total_energy_savings_year || 0) / 1000000).toFixed(1)}M`, 'per year', '#fefce8')}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {statCard('Payback', `${(result.payback_years || 0).toFixed(1)} yrs`, 'cost / annual savings')}
              </div>
            </div>

            {/* EPC shift */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 16 }}>EPC Distribution Change</h3>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>BEFORE</div>
                  {EPC_RATINGS.map(r => {
                    const count = result.current_epc_distribution?.[r] || 0
                    const max = Math.max(...Object.values(result.current_epc_distribution || {}).map(Number))
                    return count > 0 ? (
                      <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ width: 20, fontWeight: 700, fontSize: 13, color: EPC_COLORS[r] }}>{r}</span>
                        <div style={{ flex: 1, height: 18, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(count / max) * 100}%`, height: '100%', backgroundColor: EPC_COLORS[r], borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#666', width: 40, textAlign: 'right' }}>{count}</span>
                      </div>
                    ) : null
                  })}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>AFTER</div>
                  {EPC_RATINGS.map(r => {
                    const count = result.projected_epc_distribution?.[r] || 0
                    const max = Math.max(...Object.values(result.projected_epc_distribution || {}).map(Number), 1)
                    return count > 0 ? (
                      <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ width: 20, fontWeight: 700, fontSize: 13, color: EPC_COLORS[r] }}>{r}</span>
                        <div style={{ flex: 1, height: 18, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(count / max) * 100}%`, height: '100%', backgroundColor: EPC_COLORS[r], borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#666', width: 40, textAlign: 'right' }}>{count}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            </div>

            {/* Cost breakdown */}
            {result.cost_breakdown && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 12 }}>Cost Breakdown</h3>
                {Object.entries(result.cost_breakdown).map(([key, val]) => {
                  const totalCost = result.total_cost_estimate || 1
                  const pct = ((val as number) / totalCost) * 100
                  return (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{key}</span>
                        <span style={{ color: '#666' }}>£{((val as number) / 1000000).toFixed(2)}M ({pct.toFixed(0)}%)</span>
                      </div>
                      <div style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Top areas */}
            {result.top_areas && result.top_areas.length > 0 && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 12 }}>Top Areas by Investment</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Area', 'Properties', 'Est. Cost'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', borderBottom: '2px solid #e5e7eb', textAlign: 'left',
                          fontWeight: 600, color: '#374151' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.top_areas.map((a: any, i: number) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>{a.ward || a.local_authority || 'Unknown'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>{a.count?.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>
                          £{((a.cost || 0) / 1000).toFixed(0)}K
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {result?.error && (
          <div style={{ ...cardStyle, backgroundColor: '#fef2f2', borderColor: '#fca5a5' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Scenario Error</div>
            <div style={{ fontSize: 14, color: '#7f1d1d' }}>{result.error}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Navigation ─── */
/* ─── Search Bar (embedded in Navigation) ─── */
interface SearchSuggestion {
  id: number
  address: string
  postcode: string
  epc_rating: string | null
  property_type: string | null
}

function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Cmd+K shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(q)}&limit=8`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data)
        setShowDropdown(data.length > 0)
        setSelectedIdx(-1)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const handleInputChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200)
  }

  const handleSubmit = () => {
    if (query.trim().length >= 2) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      setShowDropdown(false)
      setQuery('')
    }
  }

  const handleSelectSuggestion = (s: SearchSuggestion) => {
    navigate(`/search?q=${encodeURIComponent(s.postcode || s.address)}&highlight=${s.id}`)
    setShowDropdown(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIdx])
      } else {
        handleSubmit()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const containerStyle: React.CSSProperties = {
    position: 'relative', flex: 1, maxWidth: 420, margin: '0 16px',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 40px 7px 36px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.12)',
    color: 'white', fontSize: 13, outline: 'none',
  }
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    backgroundColor: 'white', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 2000, overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
  }
  const itemStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
    backgroundColor: isSelected ? '#f0f4ff' : 'white',
    borderBottom: '1px solid #f0f0f0',
  })

  return (
    <div style={containerStyle}>
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search address, postcode, ward..."
          style={inputStyle}
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
          onKeyDown={handleKeyDown}
        />
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace',
          backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>
          {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}
        </span>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div ref={dropdownRef} style={dropdownStyle}>
          {suggestions.map((s, i) => (
            <div key={s.id} style={itemStyle(i === selectedIdx)}
              onClick={() => handleSelectSuggestion(s)}
              onMouseEnter={() => setSelectedIdx(i)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{s.postcode}</div>
              </div>
              {s.epc_rating && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'white',
                  backgroundColor: EPC_COLORS[s.epc_rating] || '#999',
                  padding: '2px 6px', borderRadius: 4 }}>{s.epc_rating}</span>
              )}
              {s.property_type && (
                <span style={{ fontSize: 10, color: '#888' }}>{s.property_type}</span>
              )}
            </div>
          ))}
          <div style={{ padding: '8px 14px', textAlign: 'center', borderTop: '1px solid #eee' }}>
            <button onClick={handleSubmit} style={{ background: 'none', border: 'none',
              color: '#1B4F72', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              View all results for "{query}" →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Search Results Page ─── */
function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') || ''
  const highlightId = searchParams.get('highlight')
  const [results, setResults] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState(q)
  const [page, setPage] = useState(0)
  const pageSize = 30

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); setTotal(0); return }
    setLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=${page * pageSize}`)
      .then(r => r.json())
      .then(data => { setResults(data.results || []); setTotal(data.total || 0) })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [q, page])

  useEffect(() => { setSearchInput(q); setPage(0) }, [q])

  const handleSearch = () => {
    if (searchInput.trim().length >= 2) {
      navigate(`/search?q=${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleViewOnMap = (id: number) => {
    // Navigate to map — the MapPage can pick up property ID from URL params
    navigate(`/?property=${id}`)
  }

  const totalPages = Math.ceil(total / pageSize)

  const containerStyle: React.CSSProperties = {
    maxWidth: 1000, margin: '0 auto', padding: '24px',
  }
  const searchBoxStyle: React.CSSProperties = {
    display: 'flex', gap: 8, marginBottom: 24,
  }
  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db',
    fontSize: 14, outline: 'none',
  }
  const btnStyle: React.CSSProperties = {
    padding: '10px 20px', backgroundColor: '#1B4F72', color: 'white', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }
  const cardStyle = (isHighlighted: boolean): React.CSSProperties => ({
    padding: '16px', borderRadius: 10, border: isHighlighted ? '2px solid #1B4F72' : '1px solid #e5e7eb',
    backgroundColor: isHighlighted ? '#f0f4ff' : 'white', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
    transition: 'box-shadow 0.15s',
  })
  const badgeStyle = (color: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, color: 'white', backgroundColor: color,
    padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
  })
  const matchBadge = (type: string): React.CSSProperties => ({
    fontSize: 10, color: '#666', backgroundColor: '#f0f0f0', padding: '2px 8px',
    borderRadius: 10, whiteSpace: 'nowrap',
  })

  return (
    <div style={containerStyle}>
      {/* Search input */}
      <div style={searchBoxStyle}>
        <input
          type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search address, postcode, ward, region..."
          style={inputStyle}
        />
        <button onClick={handleSearch} style={btnStyle}>Search</button>
      </div>

      {/* Results header */}
      {q && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>
            {loading ? 'Searching...' : `${total.toLocaleString()} results for "${q}"`}
          </h2>
          {total > pageSize && (
            <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 14 }}>Searching properties...</div>
        </div>
      )}

      {/* No results */}
      {!loading && q && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888', backgroundColor: '#f9f9f9',
          borderRadius: 10 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No properties found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Try a different address, postcode, ward name, or local authority.
          </div>
        </div>
      )}

      {/* Result cards */}
      {!loading && results.map((r: any) => (
        <div key={r.id} style={cardStyle(String(r.id) === highlightId)}
          onClick={() => handleViewOnMap(r.id)}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
          {/* Map pin icon */}
          <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#e8f0fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4F72" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>

          {/* Main info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.address}
            </div>
            <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{r.postcode}</span>
              {r.ward_name && <span>· {r.ward_name}</span>}
              {r.local_authority_name && <span>· {r.local_authority_name}</span>}
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {r.epc_rating && (
              <span style={badgeStyle(EPC_COLORS[r.epc_rating] || '#999')}>EPC {r.epc_rating}</span>
            )}
            {r.property_type && (
              <span style={badgeStyle('#6b7280')}>{r.property_type}</span>
            )}
            {r.bedrooms && (
              <span style={badgeStyle('#8b5cf6')}>{r.bedrooms} bed</span>
            )}
            <span style={matchBadge(r.match_type)}>{r.match_type}</span>
          </div>

          {/* View on map button */}
          <button onClick={e => { e.stopPropagation(); handleViewOnMap(r.id) }}
            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
              padding: '6px 10px', fontSize: 11, color: '#1B4F72', cursor: 'pointer',
              fontWeight: 600, whiteSpace: 'nowrap' }}>
            View on Map
          </button>
        </div>
      ))}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{ ...btnStyle, padding: '8px 16px', fontSize: 13,
              opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'default' : 'pointer' }}>
            ← Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 13, color: '#666' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            style={{ ...btnStyle, padding: '8px 16px', fontSize: 13,
              opacity: page >= totalPages - 1 ? 0.4 : 1,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Export Page ─── */
function ExportPage() {
  const [format, setFormat] = useState<'csv' | 'geojson' | 'retrofit'>('csv')
  const [epcFilter, setEpcFilter] = useState<string[]>([])
  const [propertyType, setPropertyType] = useState('')
  const [ward, setWard] = useState('')
  const [localAuthority, setLocalAuthority] = useState('')
  const [bedroomsMin, setBedroomsMin] = useState('')
  const [bedroomsMax, setBedroomsMax] = useState('')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [error, setError] = useState('')

  const toggleEpc = (r: string) => {
    setEpcFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  const buildQueryString = () => {
    const params = new URLSearchParams()
    if (epcFilter.length > 0) params.set('epc_filter', epcFilter.join(','))
    if (propertyType) params.set('property_type', propertyType)
    if (ward) params.set('ward', ward)
    if (localAuthority) params.set('local_authority', localAuthority)
    if (bedroomsMin) params.set('bedrooms_min', bedroomsMin)
    if (bedroomsMax) params.set('bedrooms_max', bedroomsMax)
    if (yearFrom) params.set('year_from', yearFrom)
    if (yearTo) params.set('year_to', yearTo)
    return params.toString()
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      const qs = buildQueryString()
      let url = ''
      if (format === 'csv') url = `/api/exports/properties/csv?${qs}`
      else if (format === 'geojson') url = `/api/exports/properties/geojson?${qs}`
      else if (format === 'retrofit') url = `/api/exports/retrofit-plan?${qs}`

      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Export failed' }))
        throw new Error(data.detail || 'Export failed')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const filenameMatch = disposition.match(/filename=(.+)/)
      const filename = filenameMatch ? filenameMatch[1] : `export.${format === 'geojson' ? 'geojson' : 'csv'}`

      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleReport = async () => {
    setExporting(true)
    setError('')
    setReportData(null)
    try {
      const qs = buildQueryString()
      const res = await fetch(`/api/exports/report?${qs}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Report failed' }))
        throw new Error(data.detail || 'Report generation failed')
      }
      const data = await res.json()
      setReportData(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const pageStyle: React.CSSProperties = { maxWidth: 960, margin: '0 auto', padding: '32px 24px' }
  const cardStyle: React.CSSProperties = { backgroundColor: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
  const btnPrimary: React.CSSProperties = { padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, backgroundColor: '#1B4F72', color: 'white' }
  const btnSecondary: React.CSSProperties = { ...btnPrimary, backgroundColor: '#e5e7eb', color: '#374151' }

  return (
    <div style={{ backgroundColor: '#f3f4f6', minHeight: 'calc(100vh - 56px)' }}>
      <div style={pageStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>Export Data</h1>
        <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Download filtered property data as CSV, GeoJSON, or generate a portfolio report.</p>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Format Selection */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Export Format</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            {([
              { key: 'csv', label: 'CSV', desc: 'Spreadsheet-compatible, all fields' },
              { key: 'geojson', label: 'GeoJSON', desc: 'Map data with coordinates' },
              { key: 'retrofit', label: 'Retrofit Plan', desc: 'Priority list with cost estimates' },
            ] as const).map(f => (
              <div
                key={f.key}
                onClick={() => setFormat(f.key)}
                style={{
                  flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer',
                  border: format === f.key ? '2px solid #1B4F72' : '2px solid #e5e7eb',
                  backgroundColor: format === f.key ? '#eff6ff' : 'white',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: format === f.key ? '#1B4F72' : '#374151' }}>{f.label}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Filters (Optional)</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>EPC Rating</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {EPC_RATINGS.map(r => (
                <button
                  key={r}
                  onClick={() => toggleEpc(r)}
                  style={{
                    padding: '6px 12px', borderRadius: 4, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
                    backgroundColor: epcFilter.includes(r) ? (EPC_COLORS[r] || '#1B4F72') : '#e5e7eb',
                    color: epcFilter.includes(r) ? 'white' : '#374151',
                  }}
                >{r}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Property Type</label>
              <select style={inputStyle} value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                <option value="">All Types</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Local Authority</label>
              <input style={inputStyle} placeholder="e.g. Westminster" value={localAuthority} onChange={e => setLocalAuthority(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Ward</label>
              <input style={inputStyle} placeholder="e.g. St James's" value={ward} onChange={e => setWard(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Bedrooms Min</label>
                <input type="number" style={inputStyle} placeholder="0" value={bedroomsMin} onChange={e => setBedroomsMin(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Bedrooms Max</label>
                <input type="number" style={inputStyle} placeholder="10" value={bedroomsMax} onChange={e => setBedroomsMax(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Year Built From</label>
              <input type="number" style={inputStyle} placeholder="1800" value={yearFrom} onChange={e => setYearFrom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Year Built To</label>
              <input type="number" style={inputStyle} placeholder="2026" value={yearTo} onChange={e => setYearTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button onClick={handleExport} disabled={exporting} style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }}>
            {exporting ? 'Exporting...' : `Download ${format.toUpperCase()}`}
          </button>
          <button onClick={handleReport} disabled={exporting} style={{ ...btnSecondary, opacity: exporting ? 0.6 : 1 }}>
            Generate Portfolio Report
          </button>
        </div>

        {/* Report Results */}
        {reportData && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Portfolio Report</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Total Properties', value: reportData.total_properties?.toLocaleString() },
                { label: 'Most Common EPC', value: reportData.average_epc || 'N/A' },
                { label: 'Need Retrofit (E-G)', value: reportData.properties_needing_retrofit?.toLocaleString() },
                { label: 'Est. Investment', value: `£${(reportData.estimated_total_investment / 1e6).toFixed(1)}M` },
              ].map((m, i) => (
                <div key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1B4F72' }}>{m.value}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* EPC Distribution */}
            {reportData.epc_distribution && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>EPC Distribution</h3>
                <div style={{ display: 'flex', gap: 4, height: 32 }}>
                  {Object.entries(reportData.epc_distribution).map(([band, count]: [string, any]) => {
                    const total = Object.values(reportData.epc_distribution as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
                    const pct = total > 0 ? (count / total) * 100 : 0
                    return pct > 0 ? (
                      <div key={band} style={{
                        flex: pct, backgroundColor: EPC_COLORS[band] || '#999',
                        borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 600, fontSize: 11, minWidth: pct > 3 ? 30 : 0,
                      }} title={`${band}: ${count} (${pct.toFixed(1)}%)`}>
                        {pct > 5 ? `${band} ${pct.toFixed(0)}%` : band}
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}

            {/* Property Type Breakdown */}
            {reportData.property_type_breakdown && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Property Types</h3>
                {Object.entries(reportData.property_type_breakdown).slice(0, 8).map(([type, count]: [string, any]) => {
                  const maxCount = Math.max(...Object.values(reportData.property_type_breakdown as Record<string, number>))
                  return (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 120, fontSize: 12, color: '#374151', textAlign: 'right' }}>{type}</span>
                      <div style={{ flex: 1, backgroundColor: '#e5e7eb', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                        <div style={{ width: `${(count / maxCount) * 100}%`, height: '100%', backgroundColor: '#1B4F72', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#6b7280', width: 60 }}>{count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Geographic Summary */}
            {reportData.geographic_summary && reportData.geographic_summary.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>By Local Authority</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Local Authority</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Properties</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Need Retrofit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.geographic_summary.map((row: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 12px' }}>{row.local_authority}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.count.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: row.retrofit_needed > 0 ? '#dc2626' : '#059669' }}>
                            {row.retrofit_needed.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── About / Platform Overview Page ─── */
function AboutPage() {
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    marginBottom: 20,
  }
  const headingStyle: React.CSSProperties = {
    fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8,
  }
  const bodyStyle: React.CSSProperties = {
    fontSize: 13, color: '#555', lineHeight: 1.75,
  }
  const badge = (label: string, color: string) => (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11,
      fontWeight: 600, color: 'white', backgroundColor: color, marginRight: 6, marginBottom: 4,
    }}>{label}</span>
  )
  const techBadge = (label: string) => (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: 8, fontSize: 12,
      fontWeight: 500, color: '#1B4F72', backgroundColor: '#EBF5FB', marginRight: 6, marginBottom: 6,
      border: '1px solid #D6EAF8',
    }}>{label}</span>
  )

  const featureCard = (icon: string, title: string, desc: string, tags: string[]) => (
    <div style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, backgroundColor: '#EBF5FB',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 6 }}>{title}</h4>
        <p style={{ ...bodyStyle, marginBottom: 8 }}>{desc}</p>
        <div>{tags.map(t => badge(t, '#1B4F72'))}</div>
      </div>
    </div>
  )

  return (
    <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%', overflowY: 'auto' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1B4F72 0%, #2980B9 50%, #1A5276 100%)',
        padding: '48px 32px 40px', color: 'white',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Social Housing Digital Twins</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>SHDT Platform</h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, maxWidth: 700 }}>
            A data-driven platform that brings together property, environmental, and operational data to create a complete digital representation of a social housing portfolio — enabling smarter investment, better tenant outcomes, and proactive asset management.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            {[
              ['20,781', 'Properties'],
              ['10', 'Data Sources'],
              ['120+', 'Data Points per Property'],
              ['3D', 'Digital Twin Viewer'],
            ].map(([val, label]) => (
              <div key={label} style={{
                backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 20px',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{val}</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* What is SHDT */}
        <div style={cardStyle}>
          <h3 style={headingStyle}>What is a Social Housing Digital Twin?</h3>
          <p style={bodyStyle}>
            A digital twin is a virtual representation of a physical asset — in this case, an entire portfolio of social housing properties. Rather than viewing property data in isolation, SHDT brings together building attributes, energy performance, environmental risk, neighbourhood deprivation, crime statistics, repair histories, and tenant complaint records into a single, integrated platform. Each property becomes a living data model that can be queried, visualised, and analysed from multiple angles.
          </p>
          <p style={{ ...bodyStyle, marginTop: 12 }}>
            The goal is to shift from reactive management — waiting for things to go wrong — to proactive, evidence-based decision-making. When you can see that a property has poor energy efficiency, sits in a flood-risk zone, has had repeated boiler repairs, and is in one of the most deprived wards in the country, the case for investment becomes clear and quantifiable.
          </p>
        </div>

        {/* Core Features */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>Platform Features</h3>

        {featureCard('🗺️', 'Interactive Map View',
          'A GIS-powered map displaying all 20,781 properties with real-time clustering at low zoom and individual markers at street level. Properties are colour-coded by EPC rating (green A through red G). A comprehensive filter sidebar lets you narrow the view by EPC band, property type, bedrooms, year built, and heating type. Clicking any property opens a detailed slide-out panel showing every data point we hold on that asset — from building basics to crime statistics to flood risk.',
          ['Leaflet', 'PostGIS', 'Clustering', 'EPC Colour Coding', 'Filters']
        )}

        {featureCard('📊', 'Analytics Dashboard',
          'A portfolio-level overview showing key performance indicators at a glance: total properties, average EPC rating, number of retrofit candidates, and average condition score. Drill down into EPC distribution across all seven bands, property age profiles, heating type breakdowns, and geographic summaries by local authority and region. An enrichment coverage tracker shows the completeness of data across all sources.',
          ['KPI Cards', 'Distribution Charts', 'Geographic Summaries', 'Enrichment Tracking']
        )}

        {featureCard('🔍', 'Strategic Insights',
          'The analytical engine of the platform, with seven dedicated analysis tabs. The Area Risk Heatmap calculates a composite 0-100 risk score per ward by combining crime (30%), flood risk (30%), and IoD 2025 deprivation (40%). The Fuel Poverty Indicators tab cross-references EPC ratings against deprivation data to identify the households most at risk. The Complaints Analysis tab surfaces complaint patterns by category and area. The Repairs & Contractors tab benchmarks contractor performance on cost, volume, on-time rates, and first-time fix. The Demographics & Connectivity tab shows Census 2021 age profiles, vulnerability indicators, broadband speeds, and electricity/gas network operators. The Understanding Your Data tab provides a comprehensive guide to every data source.',
          ['Composite Risk Scoring', 'Fuel Poverty Analysis', 'Complaint Patterns', 'Contractor Performance', 'Census Demographics', 'Broadband & Utilities', 'Data Guide']
        )}

        {featureCard('🏗️', '3D Digital Twin Viewer',
          'A full WebGL-powered 3D visualisation that generates a parametric building model from each property\'s attributes. The building geometry adapts to property type — terraced houses, semi-detached homes, apartment blocks, detached houses, and bungalows each render with type-appropriate features (pitched roofs, bay windows, chimneys, garages). Four toggleable data layers overlay intelligence onto the 3D model: an EPC thermal heatmap on the building walls, pulsing repair hotspot markers on areas needing attention (insulation, glazing, boilers, roofs), a flood risk water plane that rises based on flood zone classification, and floating data cards showing crime, EPC, condition, and deprivation scores. Users orbit, zoom, and pan around the building to inspect it from any angle.',
          ['Three.js', 'React Three Fiber', 'Parametric Geometry', 'EPC Thermal Layer', 'Flood Visualisation', 'Orbit Controls']
        )}

        {featureCard('🧠', 'Strategic Insights Engine',
          'Cross-correlates all available data sources — IoD 2025 deprivation (7 domain sub-scores), flood risk, Census 2021 demographics, broadband coverage, 88K+ repair orders, and 159 complaints — to surface the top strategic insights a social housing organisation needs to act on. Each insight is ranked by severity (critical, high, medium), provides specific recommended actions, and lists the data sources used. Covers deprivation profiling, repair cost drivers, vulnerable residents in flood zones, digital readiness, complaint patterns, contractor benchmarking, and compounding risk factors where deprivation meets flood exposure.',
          ['Cross-Correlation', 'Multi-Source Analysis', 'Actionable Intelligence', 'Priority Ranking', 'Vulnerability Mapping']
        )}

        {featureCard('📤', 'Data Upload & Import',
          'A drag-and-drop CSV upload pipeline with automatic column detection, preview of incoming data, and flexible column mapping. Supports both append and replace import modes. Postcodes are automatically extracted from addresses and batch-geocoded via the postcodes.io API to create spatial geometries, enabling any newly uploaded properties to appear on the map immediately.',
          ['CSV Upload', 'Column Mapping', 'Auto-Geocoding', 'Append/Replace']
        )}

        {featureCard('📁', 'Data Export',
          'Export your portfolio data in multiple formats: CSV for spreadsheet analysis, GeoJSON for GIS tools, a structured Portfolio Report with KPIs and distribution summaries, and a Retrofit Priority Plan ranking properties by investment need. All exports support the same filters as the map view, so you can export exactly the slice of data you need.',
          ['CSV', 'GeoJSON', 'Portfolio Report', 'Retrofit Plan']
        )}

        {featureCard('🔎', 'Global Search',
          'A search bar accessible from every page (Cmd+K / Ctrl+K) with real-time autocomplete. Search across addresses, postcodes, wards, LSOAs, local authorities, and regions. Results display as property cards with match-type badges and link directly to the map view.',
          ['Autocomplete', 'Multi-field', 'Keyboard Shortcut']
        )}

        {featureCard('🌊', 'Flood Intelligence',
          'A dedicated flood risk analysis page built on Environment Agency data. An interactive map overlays EA Web Map Service (WMS) layers — Flood Zone 2 (medium probability), Flood Zone 3 (high probability), surface water risk extents, reservoir flood extents, and historic flood outlines — directly onto the property map. Properties are colour-coded by flood zone classification, with a detailed breakdown showing how many sit in each zone. An overview panel summarises portfolio-wide flood exposure, an at-risk properties list lets you drill into individual assets, and a comprehensive Flood Guide explains each risk type and what it means for housing management.',
          ['EA WMS Layers', 'Flood Zones 2 & 3', 'Surface Water', 'Reservoir Risk', 'Historic Floods', 'Property Overlay']
        )}

        {featureCard('⚡', 'Predictive Flood Risk',
          'Goes beyond static flood zones by combining live weather forecast data with existing flood classifications to produce a dynamic Forecast Risk Score (0-100) for every property. Seven-day hourly rainfall predictions from the UK Met Office UKV 2km model (via Open-Meteo) are combined with Environment Agency active flood warnings, static flood zone data, and surface water and river risk ratings. Properties are scored as Critical (70-100), Elevated (40-69), Watch (15-39), or Normal (0-14). A five-day rainfall timeline shows how risk evolves day by day, alert banners highlight peak risk days, and the map switches to forecast-based colour coding so you can see at a glance where the risk is building.',
          ['Open-Meteo Forecast', 'EA Flood Warnings', 'Risk Scoring', '5-Day Timeline', 'Dynamic Map Markers', 'Alert System']
        )}

        {/* Data Sources */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>Data Sources & Enrichment</h3>

        <div style={cardStyle}>
          <p style={{ ...bodyStyle, marginBottom: 16 }}>
            Every property in the platform is enriched with data from multiple external sources, creating a comprehensive profile that spans building performance, environmental risk, neighbourhood context, and operational history.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Source', 'Data Provided', 'Update Frequency', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#555', fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ['postcodes.io', 'Geographic context: LSOA, ward, local authority, region, constituency, parish', 'On import', 'Live'],
                ['UK Police API', 'Crime risk score (1-10), 3-month counts by category: burglary, violence, ASB, robbery, criminal damage', 'Monthly', 'Live'],
                ['Environment Agency', 'Flood zone classification (1/2/3), river & sea risk, surface water risk, active warnings, WMS map layers (Zones 2/3, surface water, reservoir, historic)', 'Real-time warnings', 'Live'],
                ['Open-Meteo (UK Met Office)', '7-day hourly rainfall forecasts (UKV 2km model), precipitation intensity, peak rainfall day — combined with EA data for predictive risk scoring', 'Refreshed on demand', 'Live'],
                ['EPC Register', 'Energy rating (A-G), current & potential scores, CO₂ emissions, energy costs, wall/roof/window details, heating system', 'On lodgement', 'Ready'],
                ['IoD 2025 (MHCLG)', 'Deprivation rank & decile, 7 domain sub-scores: income, employment, health, education, crime, housing, living environment', 'October 2025', 'Live'],
                ['Complaints (Excel)', 'Case records: category, stage, area, response times, escalation tracking, UPRN linkage', 'Uploaded', 'Live'],
                ['Repairs (Excel)', '88,000+ repair orders: contractor, cost, priority, trade, on-time attendance, first-time fix rates', 'Uploaded', 'Live'],
                ['ONS Census 2021', 'LSOA-level demographics: age profiles (0-15, 16-64, 65+), single-person & overcrowded households, disability rates, no central heating, non-English speakers, deprivation dimensions', 'Static (2021)', 'Live'],
                ['Ofcom / DNO / GDN', 'Broadband speeds (max download/upload), superfast/ultrafast/FTTP availability, electricity Distribution Network Operator, gas network operator', 'Annual', 'Live'],
              ] as string[][]).map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1B4F72' }}>{row[0]}</td>
                  <td style={{ padding: '10px 12px', color: '#555', lineHeight: 1.5 }}>{row[1]}</td>
                  <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{row[2]}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      color: 'white', backgroundColor: row[3] === 'Live' ? '#10B981' : '#F59E0B',
                    }}>{row[3]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tech Stack */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>Technology Stack</h3>

        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Frontend</p>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {['React 18', 'TypeScript', 'Vite', 'Leaflet', 'Three.js', 'React Three Fiber'].map(t => techBadge(t))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Backend</p>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {['FastAPI', 'Python 3.9', 'SQLAlchemy', 'Pandas'].map(t => techBadge(t))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Database</p>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {['PostgreSQL 16', 'PostGIS 3.4'].map(t => techBadge(t))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Infrastructure</p>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {['Docker', 'Nginx', 'WebGL'].map(t => techBadge(t))}
              </div>
            </div>
          </div>
        </div>

        {/* Architecture */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>How It Works</h3>

        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {[
              { step: '1', title: 'Ingest', desc: 'Property data is uploaded via CSV or Excel. Addresses are parsed, postcodes extracted, and coordinates geocoded automatically.' },
              { step: '2', title: 'Enrich', desc: 'Each property is enriched with crime, flood, EPC, deprivation, and geographic data from external APIs and government datasets.' },
              { step: '3', title: 'Analyse', desc: 'Composite risk scores, fuel poverty indicators, repair trends, and contractor benchmarks are computed across the portfolio.' },
              { step: '4', title: 'Visualise', desc: 'Properties appear on an interactive map with filtering. Individual assets can be explored in 3D with all data overlaid.' },
              { step: '5', title: 'Decide', desc: 'Strategic insights cross-correlate all data sources to surface priorities. Exports feed into board papers and funding applications.' },
            ].map((s, i) => (
              <div key={s.step} style={{ flex: 1, textAlign: 'center', padding: '12px 10px', position: 'relative' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', backgroundColor: '#1B4F72', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  margin: '0 auto 10px',
                }}>
                  {s.step}
                </div>
                {i < 4 && (
                  <div style={{
                    position: 'absolute', top: 28, left: 'calc(50% + 16px)', width: 'calc(100% - 32px)',
                    height: 2, backgroundColor: '#D6EAF8',
                  }} />
                )}
                <p style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>{s.title}</p>
                <p style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>Use Cases</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {[
            { icon: '💰', title: 'Investment Prioritisation', desc: 'Identify which properties and areas need capital investment most urgently, backed by composite risk scores that combine building condition, environmental exposure, and neighbourhood deprivation.' },
            { icon: '🌱', title: 'Decarbonisation Planning', desc: 'Strategic insights identify the hardest-to-treat stock — pre-1945 properties with poor EPC and gas heating — and quantify the scale of the decarbonisation challenge. Cross-correlation with deprivation data highlights where energy efficiency investment delivers both compliance and social value.' },
            { icon: '🏠', title: 'Tenant Welfare', desc: 'Identify fuel poverty hotspots where poor energy efficiency meets high deprivation. Target support at the households and communities where it will have the greatest impact on quality of life.' },
            { icon: '📋', title: 'Regulatory Compliance', desc: 'Track progress toward government energy efficiency targets. Generate evidence for the Social Housing Decarbonisation Fund and other grant programmes with data-backed investment cases.' },
            { icon: '🔧', title: 'Contractor Management', desc: 'Benchmark contractor performance on cost, timeliness, and first-time fix rates. Use data to inform procurement decisions and service level agreements.' },
            { icon: '📢', title: 'Complaint Resolution', desc: 'Understand complaint patterns by category and area. Identify systemic issues (e.g. recurring damp complaints) that indicate underlying property problems rather than one-off service failures.' },
            { icon: '🌊', title: 'Climate Resilience', desc: 'Map flood risk across the portfolio with EA WMS layers and plan resilience measures for properties in Zone 2 and 3 areas. Predictive flood modelling combines live weather forecasts with flood zone data to flag properties at elevated risk days in advance, enabling proactive responses rather than reactive ones.' },
            { icon: '🏛️', title: 'Board Reporting', desc: 'Export portfolio reports, risk assessments, and investment plans in formats ready for board papers, committee reports, and regulator submissions.' },
          ].map(uc => (
            <div key={uc.title} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{uc.icon}</span>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{uc.title}</h4>
              </div>
              <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>{uc.desc}</p>
            </div>
          ))}
        </div>

        {/* Roadmap */}
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 16, marginTop: 32 }}>Roadmap</h3>

        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { phase: 'Delivered', color: '#10B981', items: ['Interactive GIS map with 20K+ properties', 'Multi-source data enrichment (postcodes, crime, flood, IoD 2025, census, broadband)', 'Portfolio analytics dashboard', 'Area risk heatmap with composite scoring', 'Fuel poverty identification', 'Complaints & repairs analytics from Excel data', '3D parametric digital twin viewer with data overlays', 'CSV/GeoJSON/Report export', 'Global search with autocomplete', 'Data upload with auto-geocoding', 'Flood Intelligence page with EA WMS layers', 'Predictive flood risk with weather forecast integration', 'Dynamic Forecast Risk Scoring (0-100) per property', '5-day rainfall timeline with alert system', 'IoD 2025 deprivation profiling with 7 domain sub-scores', 'Census 2021 demographic profiling per LSOA', 'Broadband & utilities connectivity analysis', 'Strategic Insights Engine — 10 cross-correlated intelligence cards'] },
              { phase: 'Next', color: '#F59E0B', items: ['EPC register integration (API key pending)', 'Matterport 3D scan integration for priority properties', 'Photorealistic 3D tiles via Google/OS data', 'Tenant management module', 'IoT sensor integration (temperature, humidity, air quality)', 'Predictive maintenance modelling'] },
              { phase: 'Future', color: '#3B82F6', items: ['Machine learning for repair prediction', 'Automated investment case generation', 'Land Registry integration for valuations', 'Mobile app for surveyors', 'Real-time dashboard with live sensor feeds', 'AR property inspection tool'] },
            ].map(p => (
              <div key={p.phase} style={{ display: 'flex', gap: 16, paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flexShrink: 0 }}>
                  <span style={{
                    display: 'inline-block', padding: '4px 14px', borderRadius: 8, fontSize: 12,
                    fontWeight: 700, color: 'white', backgroundColor: p.color, minWidth: 70, textAlign: 'center',
                  }}>{p.phase}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.items.map(item => (
                    <span key={item} style={{
                      display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 11,
                      color: '#555', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb',
                    }}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

function Navigation() {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path
  const linkStyle = (path: string): React.CSSProperties => ({
    color: isActive(path) ? 'white' : 'rgba(255,255,255,0.7)', textDecoration: 'none',
    padding: '8px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500,
    backgroundColor: isActive(path) ? 'rgba(255,255,255,0.15)' : 'transparent',
  })
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#1B4F72', display: 'flex', alignItems: 'center', padding: '0 24px', zIndex: 1000, gap: '8px' }}>
      <span style={{ color: 'white', fontWeight: 700, fontSize: '18px', marginRight: '32px' }}>SHDT</span>
      <Link to="/" style={linkStyle('/')}>Map</Link>
      <Link to="/dashboard" style={linkStyle('/dashboard')}>Dashboard</Link>
      <Link to="/insights" style={linkStyle('/insights')}>Insights</Link>
      <Link to="/flood" style={linkStyle('/flood')}>Flood Intelligence</Link>
      {/* Scenarios tab removed */}
      <Link to="/upload" style={linkStyle('/upload')}>Upload</Link>
      <Link to="/export" style={linkStyle('/export')}>Export</Link>
      <Link to="/about" style={linkStyle('/about')}>About</Link>
      <SearchBar />
    </nav>
  )
}

/* ─── App ─── */
function App() {
  return (
    <Router>
      <FilterProvider>
        <Navigation />
        <div style={{ paddingTop: '56px', height: '100vh', overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/dashboard" element={<AnalyticsDashboard />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/search" element={<SearchResultsPage />} />
            {/* Scenarios route removed */}
            <Route path="/upload" element={<DataUploadPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/flood" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><FloodIntelligencePage /></Suspense>} />
            <Route path="/digital-twin" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><DigitalTwinPage /></Suspense>} />
            <Route path="/about" element={<AboutPage />} />
            {/* Phase 3 — domain credibility */}
            <Route path="/compliance" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><CompliancePage /></Suspense>} />
            <Route path="/tsm" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><TenantSatisfactionPage /></Suspense>} />
            <Route path="/awaab" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><AwaabCasesPage /></Suspense>} />
            {/* Overview / landing page — accessible at /overview; "/" kept as Map for backwards compat */}
            <Route path="/overview" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><OverviewPage /></Suspense>} />
            {/* Phase 4 — scheduled enrichment audit */}
            <Route path="/enrichment" element={<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}><EnrichmentStatusPage /></Suspense>} />
          </Routes>
        </div>
      </FilterProvider>
    </Router>
  )
}

export default App
