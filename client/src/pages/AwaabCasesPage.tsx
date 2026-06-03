/**
 * AwaabCasesPage — Kanban view of the damp & mould caseload.
 *
 * Five lanes (Reported → Investigated → Repair scheduled → Repaired → Closed).
 * Each card shows the property, severity, channel of report, SLA timer
 * and a breach badge if applicable.
 *
 * Backend: GET /api/awaab/kanban, PATCH /api/awaab/cases/{id}/stage
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import axios from 'axios'
import DataSourceBanner from '../components/DataSourceBanner'

type Stage = 'reported' | 'investigated' | 'repair_scheduled' | 'repaired' | 'closed'

interface Case {
  id: string
  property_id: string
  address: string | null
  postcode: string | null
  ward_name: string | null
  reported_at: string
  severity: 'emergency' | 'urgent' | 'standard'
  reporter_channel: string | null
  description: string | null
  assigned_to: string | null
  investigation_due_at: string | null
  repair_due_at: string | null
  investigated_at: string | null
  repair_scheduled_at: string | null
  repaired_at: string | null
  sla_breached: boolean
  hours_remaining_investigation: number | null
  hours_remaining_repair: number | null
}

interface Kanban {
  lanes: Record<Stage, Case[]>
  totals: Record<Stage, number>
  open_breaches: number
  total_cases: number
}

const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: 'reported',         label: 'Reported',         color: '#6B7280' },
  { key: 'investigated',     label: 'Investigated',     color: '#3B82F6' },
  { key: 'repair_scheduled', label: 'Repair scheduled', color: '#8B5CF6' },
  { key: 'repaired',         label: 'Repaired',         color: '#10B981' },
  { key: 'closed',           label: 'Closed',           color: '#9CA3AF' },
]

const NEXT_STAGE: Record<Stage, Stage | null> = {
  reported: 'investigated',
  investigated: 'repair_scheduled',
  repair_scheduled: 'repaired',
  repaired: 'closed',
  closed: null,
}

const SEVERITY_COLOUR: Record<Case['severity'], string> = {
  emergency: '#991B1B',
  urgent: '#B45309',
  standard: '#3B82F6',
}

const PAGE: CSSProperties = {
  padding: '24px 32px',
  maxWidth: '100%',
  color: '#111827',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

export default function AwaabCasesPage() {
  const [kanban, setKanban] = useState<Kanban | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await axios.get<Kanban>('/api/awaab/kanban')
      setKanban(r.data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const advance = useCallback(async (caseId: string, currentStage: Stage) => {
    const next = NEXT_STAGE[currentStage]
    if (!next) return
    setBusyId(caseId)
    try {
      await axios.patch(`/api/awaab/cases/${caseId}/stage`, {
        to_stage: next, actor: 'web-ui',
      })
      await load()
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }, [load])

  const rangeLabel = useMemo(() => {
    if (!kanban) return ''
    return `${kanban.total_cases.toLocaleString()} total cases · ${kanban.open_breaches.toLocaleString()} breaching SLA`
  }, [kanban])

  if (loading) return <div style={PAGE}>Loading Awaab’s Law caseload…</div>
  if (error) return <div style={{ ...PAGE, color: '#991B1B' }}>Failed to load: {error}</div>
  if (!kanban) return null

  return (
    <div style={PAGE}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Awaab’s Law caseload</h1>
        <p style={{ fontSize: 14, color: '#6B7280' }}>
          Damp &amp; mould cases tracked against the statutory 14-day investigation
          and 7-day emergency repair SLAs. {rangeLabel}
        </p>
      </header>

      <DataSourceBanner
        pageKey="awaab"
        mode="synthetic"
        summary="Every case on this Kanban was fabricated by the Phase 3 seed migration — no real tenant has reported any of these. The SLA timers, breach rules and stage-transition workflow are real and will work unchanged once cases come from real sources."
        rules={[
          "Roughly 1% of properties are seeded with a case, weighted toward those with high damp/mould risk scores so the demo hangs together.",
          "Stage distribution: ~30% reported, ~25% investigated, ~25% repair_scheduled, ~15% repaired, ~5% closed. Stages roughly older than the 'reported' point have synthetic timestamps interpolated for investigated_at, repair_scheduled_at and repaired_at.",
          "Severity distribution: ~5% emergency, ~25% urgent, ~70% standard. Emergency cases get tighter SLAs (24h investigation, 7-day repair); standard cases follow Awaab's Law defaults (14-day investigation, 21-day repair).",
          "~12% of open cases have the sla_breached flag set so the breach badge UI is exercised in the demo.",
          "Description text is hard-coded per severity level (e.g. 'Tenant reports widespread black mould…'). Reporter channel is sampled from {phone, portal, email, inspection, sensor}.",
        ]}
        productionSource="Real cases would be created from four sources: (1) the existing tenant complaints stream (phone, portal, email); (2) housing officer inspection write-ups; (3) Phase 4 IoT humidity sensors automatically opening cases when humidity > 65% for >12h alongside low temperature; (4) bulk import from your existing damp/mould tracking spreadsheet via the Data Hub."
      >
        <strong>What is real:</strong> the five-stage Kanban, the statutory SLA constants
        (Awaab's Law: 14 days to investigate, 7 days emergency repair, 21 days standard
        repair), the breach-detection logic, the audit-event log, and the stage transition
        endpoint. Connect a real complaint stream and this works unchanged.
      </DataSourceBanner>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STAGES.length}, minmax(260px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
      }}>
        {STAGES.map(({ key, label, color }) => {
          const cases = kanban.lanes[key] ?? []
          return (
            <div key={key} style={{
              backgroundColor: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: 12,
              minHeight: 400,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: `2px solid ${color}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
                <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                  {cases.length}
                </span>
              </div>
              {cases.length === 0 && (
                <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '40px 0' }}>
                  No cases
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cases.map(c => (
                  <CaseCard
                    key={c.id}
                    c={c}
                    busy={busyId === c.id}
                    onAdvance={() => advance(c.id, key)}
                    canAdvance={NEXT_STAGE[key] !== null}
                    nextLabel={STAGES.find(s => s.key === NEXT_STAGE[key])?.label ?? ''}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CaseCard({
  c, busy, onAdvance, canAdvance, nextLabel,
}: {
  c: Case
  busy: boolean
  onAdvance: () => void
  canAdvance: boolean
  nextLabel: string
}) {
  const slaText =
    c.hours_remaining_investigation != null ? formatHours(c.hours_remaining_investigation, 'investigation')
    : c.hours_remaining_repair != null ? formatHours(c.hours_remaining_repair, 'repair')
    : null

  return (
    <div style={{
      backgroundColor: 'white',
      border: c.sla_breached ? '2px solid #991B1B' : '1px solid #E5E7EB',
      borderRadius: 8,
      padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: SEVERITY_COLOUR[c.severity],
          backgroundColor: SEVERITY_COLOUR[c.severity] + '14',
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: 0.5,
        }}>
          {c.severity}
        </span>
        {c.sla_breached && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#991B1B',
            backgroundColor: '#FEF2F2',
            padding: '2px 8px',
            borderRadius: 4,
            letterSpacing: 0.5,
          }}>
            SLA breach
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
        {c.address ?? 'Unknown address'}
      </div>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
        {c.postcode ?? ''} {c.ward_name && `· ${c.ward_name}`}
      </div>
      {c.description && (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, lineHeight: 1.4 }}>
          {c.description}
        </div>
      )}
      <div style={{
        fontSize: 11,
        color: '#6B7280',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginBottom: canAdvance ? 8 : 0,
      }}>
        <div>Reported: {new Date(c.reported_at).toLocaleDateString()}</div>
        {c.reporter_channel && <div>Channel: {c.reporter_channel}</div>}
        {slaText && <div style={{ fontWeight: 600, color: c.sla_breached ? '#991B1B' : '#374151' }}>{slaText}</div>}
      </div>
      {canAdvance && (
        <button
          onClick={onAdvance}
          disabled={busy}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #1B4F72',
            backgroundColor: 'white',
            color: '#1B4F72',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? '…' : `Move to ${nextLabel} →`}
        </button>
      )}
    </div>
  )
}

function formatHours(h: number, label: 'investigation' | 'repair'): string {
  if (h <= 0) return `${label} SLA breached by ${Math.abs(Math.round(h))}h`
  if (h < 24) return `${Math.round(h)}h until ${label} SLA`
  const days = Math.floor(h / 24)
  return `${days}d until ${label} SLA`
}
