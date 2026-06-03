/**
 * DampMouldTab — new Insights tab for the Phase 3 damp & mould risk model.
 *
 * Three sections:
 *   1. Headline distribution (Critical / High / Medium / Low)
 *   2. Top wards by average risk score
 *   3. Top 25 highest-risk individual properties
 *
 * Per-property explanation is linked to the property detail panel
 * (calls /api/damp-mould/properties/{id}/explain).
 *
 * Backend: GET /api/damp-mould/heatmap, /api/damp-mould/top-at-risk
 */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import axios from 'axios'
import DataSourceBanner from '../../components/DataSourceBanner'

interface WardRow {
  ward_code: string
  ward_name: string
  local_authority_name: string | null
  properties: number
  avg_score: number
  at_risk: number
}

interface PropertyRow {
  id: string
  address: string | null
  postcode: string | null
  ward_name: string | null
  score: number
  band: 'Critical' | 'High' | 'Medium' | 'Low'
}

const BAND_COLORS: Record<PropertyRow['band'], { bg: string; text: string }> = {
  Critical: { bg: '#FEF2F2', text: '#991B1B' },
  High:     { bg: '#FFF7ED', text: '#9A3412' },
  Medium:   { bg: '#FFFBEB', text: '#92400E' },
  Low:      { bg: '#ECFDF5', text: '#065F46' },
}

const CARD: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
  padding: 20,
  marginBottom: 16,
}

export function DampMouldTab() {
  const [wards, setWards] = useState<WardRow[]>([])
  const [props, setProps] = useState<PropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      axios.get<{ wards: WardRow[] }>('/api/damp-mould/heatmap'),
      axios.get<{ properties: PropertyRow[] }>('/api/damp-mould/top-at-risk?limit=25'),
    ]).then(([w, p]) => {
      if (!cancelled) {
        setWards(w.data.wards)
        setProps(p.data.properties)
      }
    }).catch(e => {
      if (!cancelled) setError((e as Error).message)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div style={{ padding: 20 }}>Loading damp & mould data…</div>
  if (error) return <div style={{ padding: 20, color: '#991B1B' }}>Failed to load: {error}</div>

  const totalProperties = wards.reduce((s, w) => s + w.properties, 0)
  const totalAtRisk = wards.reduce((s, w) => s + w.at_risk, 0)
  const avgScore = totalProperties > 0
    ? wards.reduce((s, w) => s + w.avg_score * w.properties, 0) / totalProperties
    : 0

  return (
    <div data-testid="damp-mould-tab">
      <DataSourceBanner
        pageKey="damp-mould-tab"
        mode="computed"
        summary="The damp & mould score for every property is computed live from data already in the database — it is not made up. The formula is glass-box: every component contribution is reconstructable per property."
        rules={[
          "Score = base 15 + EPC penalty (G=40, F=30, E=20, D=10) + overcrowding penalty (>6% LSOA) + no-central-heating penalty (>5% LSOA) + age penalty (pre-1945=10, pre-1980=5) + flood-zone penalty (High=8, Medium=4) − broadband bonus (FTTP+superfast=−3) + ±2 random jitter, clamped to 0–100.",
          "Bands: Critical ≥ 70, High 50–69, Medium 30–49, Low < 30.",
          "Inputs that ARE real in your data: EPC rating, year_built, EA flood risk classification, Ofcom broadband (FTTP / superfast), and the property's LSOA → Census linkage.",
          "Inputs that are currently synthetic (flagged in the Insights guide): the Census 2021 overcrowding and no-central-heating percentages — both are derived from IMD decile correlations until the real Nomis LSOA bulk download is ingested.",
        ]}
        productionSource="The formula does not change in production — only the Census inputs become real, via a Nomis LSOA bulk download. In Phase 4, IoT sensor humidity readings will override the Census proxy when fresh sensor data is present, so the score becomes a live signal rather than a one-shot snapshot."
      >
        <strong>How to read this tab:</strong> the headline KPI is the portfolio-wide
        average. The wards table identifies geographical concentration of risk; the
        property table identifies individual high-priority units for inspection. Open
        Awaab&rsquo;s Law cases linked to a property can be tracked from the dedicated
        Awaab&rsquo;s Law page.
      </DataSourceBanner>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        <Kpi title="Average risk score" value={`${avgScore.toFixed(1)} / 100`} />
        <Kpi title="Properties at risk (High + Critical)" value={totalAtRisk.toLocaleString()} />
        <Kpi title="Wards covered" value={wards.length.toLocaleString()} />
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Top wards by average risk score
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={CELL_H}>Ward</th>
              <th style={CELL_H}>Local authority</th>
              <th style={CELL_H}>Properties</th>
              <th style={CELL_H}>At risk</th>
              <th style={CELL_H}>Avg score</th>
            </tr>
          </thead>
          <tbody>
            {wards.slice(0, 10).map(w => (
              <tr key={w.ward_code} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={CELL}>{w.ward_name}</td>
                <td style={CELL}>{w.local_authority_name ?? '—'}</td>
                <td style={CELL}>{w.properties.toLocaleString()}</td>
                <td style={CELL}>{w.at_risk.toLocaleString()}</td>
                <td style={{ ...CELL, fontWeight: 600 }}>{w.avg_score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={CARD}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Top 25 highest-risk individual properties
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={CELL_H}>Address</th>
              <th style={CELL_H}>Postcode</th>
              <th style={CELL_H}>Ward</th>
              <th style={CELL_H}>Score</th>
              <th style={CELL_H}>Band</th>
            </tr>
          </thead>
          <tbody>
            {props.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={CELL}>{p.address ?? '—'}</td>
                <td style={CELL}>{p.postcode ?? '—'}</td>
                <td style={CELL}>{p.ward_name ?? '—'}</td>
                <td style={{ ...CELL, fontWeight: 600 }}>{p.score.toFixed(1)}</td>
                <td style={CELL}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: BAND_COLORS[p.band].text,
                    backgroundColor: BAND_COLORS[p.band].bg,
                    padding: '2px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}>
                    {p.band}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}

const CELL_H: CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase' }
const CELL: CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#1F2937' }

export default DampMouldTab
