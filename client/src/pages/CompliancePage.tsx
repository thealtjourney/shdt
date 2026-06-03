/**
 * CompliancePage — Statutory compliance dashboard.
 *
 * Five regimes: gas, electrical (EICR), Fire Risk Assessment, asbestos
 * register, water hygiene / Legionella. Top-of-page RAG tiles, then a
 * drill-down list of properties in breach.
 *
 * Backend: GET /api/compliance/summary, /api/compliance/breaches.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import axios from 'axios'
import DataSourceBanner from '../components/DataSourceBanner'

interface RegimeSummary {
  regime: string
  label: string
  icon: string
  cadence_months: number
  compliant: number
  due_soon: number
  overdue: number
  not_applicable: number
  rag_status: 'green' | 'amber' | 'red'
}

interface PortfolioSummary {
  regimes: RegimeSummary[]
  total_properties: number
  overall_compliance_pct: number
  open_breaches: number
}

interface Breach {
  certificate_id: string
  regime: string
  status: string
  expires_at: string | null
  certificate_ref: string | null
  issued_by: string | null
  property_id: string
  uprn: string | null
  address: string | null
  postcode: string | null
  ward_name: string | null
  local_authority_name: string | null
}

const RAG: Record<RegimeSummary['rag_status'], { bg: string; border: string; label: string; text: string }> = {
  green: { bg: '#ECFDF5', border: '#A7F3D0', label: 'On track', text: '#065F46' },
  amber: { bg: '#FFFBEB', border: '#FCD34D', label: 'At risk',  text: '#92400E' },
  red:   { bg: '#FEF2F2', border: '#FCA5A5', label: 'Breach',   text: '#991B1B' },
}

const PAGE: CSSProperties = {
  padding: '24px 32px',
  maxWidth: 1400,
  margin: '0 auto',
  color: '#111827',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const HEADER: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 24,
}

const KPI_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  marginBottom: 32,
}

const KPI_CARD: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: '20px 24px',
}

const TILES: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
  marginBottom: 32,
}

const REGIME_CARD = (rag: RegimeSummary['rag_status']): CSSProperties => ({
  backgroundColor: RAG[rag].bg,
  border: `1px solid ${RAG[rag].border}`,
  borderRadius: 12,
  padding: 20,
  cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s',
})

const TABLE_WRAP: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  overflow: 'hidden',
}

export default function CompliancePage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [breaches, setBreaches] = useState<Breach[]>([])
  const [selectedRegime, setSelectedRegime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sum, br] = await Promise.all([
          axios.get<PortfolioSummary>('/api/compliance/summary'),
          axios.get<Breach[]>('/api/compliance/breaches?limit=100'),
        ])
        if (cancelled) return
        setSummary(sum.data)
        setBreaches(br.data)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Re-fetch breaches when regime filter changes
  useEffect(() => {
    let cancelled = false
    const url = selectedRegime
      ? `/api/compliance/breaches?regime=${encodeURIComponent(selectedRegime)}&limit=100`
      : '/api/compliance/breaches?limit=100'
    axios.get<Breach[]>(url).then(r => {
      if (!cancelled) setBreaches(r.data)
    })
    return () => { cancelled = true }
  }, [selectedRegime])

  const regimes = summary?.regimes ?? []
  const filteredLabel = useMemo(
    () => (selectedRegime ? regimes.find(r => r.regime === selectedRegime)?.label : 'All regimes'),
    [selectedRegime, regimes],
  )

  if (loading) {
    return <div style={PAGE}>Loading compliance data…</div>
  }
  if (error) {
    return <div style={{ ...PAGE, color: '#991B1B' }}>Failed to load: {error}</div>
  }

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Compliance</h1>
          <p style={{ fontSize: 14, color: '#6B7280' }}>
            Statutory compliance regimes across the {summary?.total_properties.toLocaleString()} properties in the portfolio.
          </p>
        </div>
        <button
          onClick={() => alert('Compliance pack PDF — not yet implemented (Phase 5 deliverable)')}
          style={{
            padding: '10px 20px',
            border: '1px solid #1B4F72',
            backgroundColor: '#1B4F72',
            color: 'white',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Generate compliance pack
        </button>
      </header>

      <DataSourceBanner
        pageKey="compliance"
        mode="synthetic"
        summary="Every certificate on this page is fabricated by the Phase 3 seed migration so the dashboard has something to render. None of these certificates correspond to a real safety check."
        rules={[
          'One row per (property × regime) — five regimes (gas, electrical/EICR, FRA, asbestos, Legionella) generated for every property in the database.',
          'issued_at is a random date in the last 0–24 months. expires_at is issued_at plus the statutory cadence (12 months for gas and FRA, 24 for Legionella, 60 for EICR and asbestos — these cadences are real).',
          'Status is weighted random: ~75% compliant, ~15% due soon, ~10% overdue. The traffic-light totals are GROUP BYs over this distribution.',
          "certificate_ref is deterministic fake (CERT-<md5(uuid+regime) first 8 chars>); issued_by is a hard-coded placeholder per regime.",
        ]}
        productionSource="Your CAFM or property management system (Civica Cx Housing, MRI Living, Aareon QL, NEC Housing, etc.) — pushed via webhook on certificate renewal, or pulled in a daily ETL. As an interim path, certificates can be imported as a CSV via the Data Hub once a column-mapping schema is published."
      >
        <strong>What is real on this page:</strong> the regime list, the statutory cadences,
        the RAG thresholds (overdue triggers red), and the breach drill-down query. Swap the
        synthetic seed for a real feed and the dashboard works unchanged.
      </DataSourceBanner>

      <section style={KPI_GRID}>
        <div style={KPI_CARD}>
          <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
            Properties tracked
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
            {summary?.total_properties.toLocaleString()}
          </div>
        </div>
        <div style={KPI_CARD}>
          <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
            Overall compliance
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4, color: (summary?.overall_compliance_pct ?? 0) >= 95 ? '#065F46' : '#92400E' }}>
            {summary?.overall_compliance_pct.toFixed(1)}%
          </div>
        </div>
        <div style={KPI_CARD}>
          <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
            Open breaches
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4, color: (summary?.open_breaches ?? 0) > 0 ? '#991B1B' : '#065F46' }}>
            {summary?.open_breaches.toLocaleString()}
          </div>
        </div>
      </section>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Regime status</h2>
      <section style={TILES}>
        {regimes.map(r => (
          <div
            key={r.regime}
            onClick={() => setSelectedRegime(r.regime === selectedRegime ? null : r.regime)}
            style={{
              ...REGIME_CARD(r.rag_status),
              outline: selectedRegime === r.regime ? '2px solid #1B4F72' : 'none',
              outlineOffset: 2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{r.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</span>
            </div>
            <div style={{ fontSize: 12, color: RAG[r.rag_status].text, fontWeight: 600, marginBottom: 8 }}>
              {RAG[r.rag_status].label} · renewed every {r.cadence_months} months
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Stat label="Compliant" value={r.compliant} accent="#065F46" />
              <Stat label="Due soon" value={r.due_soon} accent="#92400E" />
              <Stat label="Overdue" value={r.overdue} accent="#991B1B" />
            </div>
          </div>
        ))}
      </section>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Breaches — {filteredLabel} ({breaches.length})
      </h2>
      <section style={TABLE_WRAP}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB', textAlign: 'left' }}>
              <th style={CELL_H}>Property</th>
              <th style={CELL_H}>Postcode</th>
              <th style={CELL_H}>Ward</th>
              <th style={CELL_H}>Regime</th>
              <th style={CELL_H}>Expired</th>
              <th style={CELL_H}>Certificate</th>
            </tr>
          </thead>
          <tbody>
            {breaches.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#6B7280' }}>
                No breaches found 🎉
              </td></tr>
            )}
            {breaches.map(b => (
              <tr key={b.certificate_id} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={CELL}>{b.address ?? '—'}</td>
                <td style={CELL}>{b.postcode ?? '—'}</td>
                <td style={CELL}>{b.ward_name ?? '—'}</td>
                <td style={CELL}>{regimes.find(r => r.regime === b.regime)?.label ?? b.regime}</td>
                <td style={CELL}>{b.expires_at ?? '—'}</td>
                <td style={CELL}>{b.certificate_ref ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent }}>{value.toLocaleString()}</div>
    </div>
  )
}

const CELL_H: CSSProperties = { padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase' }
const CELL: CSSProperties = { padding: '12px 16px', fontSize: 13, color: '#1F2937' }
