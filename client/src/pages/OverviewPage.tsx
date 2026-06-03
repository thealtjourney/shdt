/**
 * OverviewPage — landing page / launchpad.
 *
 * Three jobs:
 *   1. Headline KPIs from backend (portfolio size, compliance %, Awaab caseload, damp/mould risk)
 *   2. Visual tile grid grouped by category — every working route reachable here
 *   3. Single "where am I, what can I do" view for new users
 *
 * Backend hits: /api/analytics/overview, /api/compliance/summary,
 *               /api/awaab/kanban, /api/damp-mould/heatmap.
 * All four are wrapped so a missing/erroring endpoint never breaks the page.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Map as MapIcon,
  LayoutGrid,
  Lightbulb,
  Search,
  Droplets,
  ShieldCheck,
  ClipboardList,
  Box,
  Upload,
  Download,
  Info,
  CloudRain,
} from 'lucide-react'

interface PortfolioOverview {
  total_properties?: number
  total_with_epc?: number
  avg_epc_score?: number
}

interface ComplianceSummary {
  overall_compliance_pct?: number
  open_breaches?: number
}

interface AwaabKanban {
  open_breaches?: number
  total_cases?: number
  totals?: Record<string, number>
}

interface DampMouldHeatmap {
  wards?: Array<{ at_risk: number; properties: number; avg_score: number }>
}

const PAGE: CSSProperties = {
  padding: '32px 32px 48px',
  maxWidth: 1400,
  margin: '0 auto',
  color: '#111827',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const HERO: CSSProperties = {
  marginBottom: 32,
}

const KPI_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  marginBottom: 40,
}

const KPI_CARD: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: '20px 24px',
}

const SECTION_TITLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 12,
  marginTop: 32,
}

const TILE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 16,
}

interface Tile {
  href: string
  label: string
  description: string
  Icon: typeof MapIcon
  accent: string  // background tint for the icon chip
  badge?: string  // optional small badge text (e.g. "11 insights")
}

interface Section {
  title: string
  tiles: Tile[]
}

export default function OverviewPage() {
  const [portfolio, setPortfolio] = useState<PortfolioOverview | null>(null)
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null)
  const [awaab, setAwaab] = useState<AwaabKanban | null>(null)
  const [dampMould, setDampMould] = useState<DampMouldHeatmap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fan out — each is wrapped so a single failure doesn't break the page
    Promise.allSettled([
      axios.get('/api/analytics/overview'),
      axios.get('/api/compliance/summary'),
      axios.get('/api/awaab/kanban'),
      axios.get('/api/damp-mould/heatmap'),
    ]).then(([ov, comp, aw, dm]) => {
      if (cancelled) return
      if (ov.status === 'fulfilled')   setPortfolio(ov.value.data)
      if (comp.status === 'fulfilled') setCompliance(comp.value.data)
      if (aw.status === 'fulfilled')   setAwaab(aw.value.data)
      if (dm.status === 'fulfilled')   setDampMould(dm.value.data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const totalProperties = portfolio?.total_properties ?? 0
  const compliancePct = compliance?.overall_compliance_pct
  const complianceBreaches = compliance?.open_breaches ?? 0
  const openAwaabCases =
    (awaab?.totals?.reported ?? 0) +
    (awaab?.totals?.investigated ?? 0) +
    (awaab?.totals?.repair_scheduled ?? 0)
  const slaBreaches = awaab?.open_breaches ?? 0
  const propertiesAtRisk = (dampMould?.wards ?? []).reduce(
    (sum, w) => sum + (w.at_risk ?? 0), 0,
  )

  const sections: Section[] = [
    {
      title: 'Insights',
      tiles: [
        { href: '/insights', label: 'Strategic Insights', description: '11 cross-correlated insight cards across deprivation, flood, repairs, demographics and damp/mould.', Icon: Lightbulb, accent: '#FEF3C7', badge: '11 cards' },
        { href: '/dashboard', label: 'Dashboard', description: 'Portfolio overview KPIs, EPC distribution, retrofit priorities and geographic summaries.', Icon: LayoutGrid, accent: '#DBEAFE' },
        { href: '/flood', label: 'Flood Intelligence', description: 'EA WMS layers, 5-day rainfall timeline, dynamic forecast risk per property.', Icon: CloudRain, accent: '#E0F2FE' },
      ],
    },
    {
      title: 'Compliance & Regulatory',
      tiles: [
        { href: '/compliance', label: 'Compliance', description: 'Five statutory regimes (gas, EICR, FRA, asbestos, Legionella) with RAG status and breach drill-down.', Icon: ShieldCheck, accent: '#DCFCE7', badge: complianceBreaches > 0 ? `${complianceBreaches} breaches` : 'On track' },
        { href: '/tsm', label: 'Tenant Satisfaction', description: '22 regulator-defined Tenant Satisfaction Measures with year-on-year trend and CSV export.', Icon: ClipboardList, accent: '#EDE9FE' },
        { href: '/awaab', label: "Awaab's Law", description: 'Damp & mould caseload Kanban with 14-day investigation and 7-day repair SLA timers.', Icon: Droplets, accent: '#FEE2E2', badge: openAwaabCases > 0 ? `${openAwaabCases} open` : 'Clear' },
      ],
    },
    {
      title: 'Asset Operations',
      tiles: [
        { href: '/', label: 'Map view', description: 'Interactive Leaflet map with all properties, layered filters, and live property detail.', Icon: MapIcon, accent: '#DBEAFE' },
        { href: '/digital-twin', label: '3D Digital Twin', description: 'Photo-realistic 3D building viewer with EPC thermal overlay, flood plane and repair hotspots.', Icon: Box, accent: '#E0E7FF' },
        { href: '/search', label: 'Search', description: 'Global search across address, postcode, ward, LSOA and local authority.', Icon: Search, accent: '#F3F4F6' },
      ],
    },
    {
      title: 'Data',
      tiles: [
        { href: '/upload', label: 'Data Hub', description: 'Upload CSV/Excel, map columns, preview and import into the portfolio database.', Icon: Upload, accent: '#FEF3C7' },
        { href: '/export', label: 'Export', description: 'Download filtered properties as CSV, GeoJSON or a printable Retrofit Plan.', Icon: Download, accent: '#FCE7F3' },
        { href: '/about', label: 'About', description: 'Documentation, data sources, methodology and roadmap.', Icon: Info, accent: '#F3F4F6' },
      ],
    },
  ]

  return (
    <div style={PAGE}>
      <header style={HERO}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1B4F72', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          SHDT — Social Housing Digital Twin
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Portfolio overview
        </h1>
        <p style={{ fontSize: 15, color: '#6B7280', maxWidth: 720 }}>
          Single-pane view of the {totalProperties.toLocaleString() || '—'} properties under management,
          with statutory compliance, Tenant Satisfaction Measures, Awaab&rsquo;s Law caseload
          and damp &amp; mould risk modelling all running off the same data fabric.
        </p>
      </header>

      <section style={KPI_GRID}>
        <Kpi
          title="Properties"
          value={totalProperties.toLocaleString()}
          subtitle={loading ? 'loading…' : `${(portfolio?.total_with_epc ?? 0).toLocaleString()} with EPC data`}
        />
        <Kpi
          title="Compliance"
          value={compliancePct == null ? '—' : `${compliancePct.toFixed(1)}%`}
          subtitle={complianceBreaches > 0 ? `${complianceBreaches.toLocaleString()} open breaches` : 'No open breaches'}
          accent={compliancePct == null ? undefined : compliancePct >= 95 ? '#065F46' : '#92400E'}
        />
        <Kpi
          title="Open Awaab cases"
          value={openAwaabCases.toLocaleString()}
          subtitle={slaBreaches > 0 ? `${slaBreaches} breaching SLA` : 'All within SLA'}
          accent={slaBreaches > 0 ? '#991B1B' : '#065F46'}
        />
        <Kpi
          title="Properties at damp/mould risk"
          value={propertiesAtRisk.toLocaleString()}
          subtitle="High + Critical band"
          accent={propertiesAtRisk > 0 ? '#9A3412' : '#065F46'}
        />
      </section>

      {sections.map(section => (
        <div key={section.title}>
          <h2 style={SECTION_TITLE}>{section.title}</h2>
          <div style={TILE_GRID}>
            {section.tiles.map(tile => <TileCard key={tile.href} tile={tile} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function Kpi({
  title, value, subtitle, accent,
}: { title: string; value: string; subtitle?: string; accent?: string }) {
  return (
    <div style={KPI_CARD}>
      <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4, color: accent ?? '#111827' }}>{value}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{subtitle}</div>}
    </div>
  )
}

function TileCard({ tile }: { tile: Tile }) {
  const { Icon } = tile
  return (
    <Link
      to={tile.href}
      style={{
        display: 'block',
        backgroundColor: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 20,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'
        ;(e.currentTarget as HTMLElement).style.borderColor = '#1B4F72'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.transform = ''
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
        ;(e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          backgroundColor: tile.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 22, height: 22, color: '#1B4F72' }} />
        </div>
        {tile.badge && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            backgroundColor: '#F3F4F6',
            color: '#374151',
            padding: '4px 10px',
            borderRadius: 12,
          }}>
            {tile.badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{tile.label}</div>
      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>{tile.description}</div>
    </Link>
  )
}
