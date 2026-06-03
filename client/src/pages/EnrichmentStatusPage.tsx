/**
 * EnrichmentStatusPage — visibility into the scheduled-job audit trail.
 *
 * Per-source tiles showing latest run, success/failure counts in the
 * last 7 days, and a Run-now button. Below: a recent-runs table that
 * filters by source.
 *
 * Backend: GET /api/enrichment/status, /api/enrichment/runs,
 *          POST /api/enrichment/trigger.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import axios from 'axios'
import DataSourceBanner from '../components/DataSourceBanner'

type RunStatus = 'running' | 'success' | 'failed' | 'cancelled'

interface SourceLatestRun {
  source: string
  id: string | null
  status: RunStatus
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  triggered_by: string | null
  summary: Record<string, unknown> | null
  error: string | null
}

interface SourceTile {
  source: string
  label: string
  cadence: string
  latest: SourceLatestRun | null
  running_now: boolean
  success_7d: number
  failed_7d: number
}

interface StatusBundle {
  sources: SourceTile[]
  as_of: string
}

interface RunRow {
  source: string
  id: string
  status: RunStatus
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  triggered_by: string | null
  triggered_by_user: string | null
  summary: Record<string, unknown> | null
  error: string | null
  host: string | null
}

const PAGE: CSSProperties = {
  padding: '24px 32px',
  maxWidth: 1400,
  margin: '0 auto',
  color: '#111827',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const TILE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
  marginBottom: 24,
}

const STATUS_COLOUR: Record<RunStatus, { bg: string; text: string; label: string }> = {
  running:   { bg: '#DBEAFE', text: '#1E40AF', label: 'Running' },
  success:   { bg: '#ECFDF5', text: '#065F46', label: 'Success' },
  failed:    { bg: '#FEF2F2', text: '#991B1B', label: 'Failed' },
  cancelled: { bg: '#F3F4F6', text: '#374151', label: 'Cancelled' },
}

export default function EnrichmentStatusPage() {
  const [status, setStatus] = useState<StatusBundle | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busySource, setBusySource] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const r = await axios.get<StatusBundle>('/api/enrichment/status')
      setStatus(r.data)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const loadRuns = useCallback(async (source: string | null) => {
    try {
      const url = source
        ? `/api/enrichment/runs?source=${encodeURIComponent(source)}&limit=50`
        : '/api/enrichment/runs?limit=50'
      const r = await axios.get<{ runs: RunRow[] }>(url)
      setRuns(r.data.runs)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadStatus(), loadRuns(null)]).finally(() => setLoading(false))
    // Auto-refresh status every 30 seconds while the page is open
    const t = setInterval(loadStatus, 30000)
    return () => clearInterval(t)
  }, [loadStatus, loadRuns])

  useEffect(() => {
    loadRuns(filter)
  }, [filter, loadRuns])

  const triggerRun = useCallback(async (source: string) => {
    setBusySource(source)
    try {
      await axios.post('/api/enrichment/trigger', { source })
      // Give the runner a second to write its 'running' row, then refresh
      setTimeout(() => { loadStatus(); loadRuns(filter) }, 1500)
    } catch (e) {
      alert(`Failed to trigger ${source}: ${(e as Error).message}`)
    } finally {
      setBusySource(null)
    }
  }, [loadStatus, loadRuns, filter])

  const tilesByStatus = useMemo(() => {
    if (!status) return { failing: [], stale: [], healthy: [] }
    const failing: SourceTile[] = []
    const stale: SourceTile[] = []
    const healthy: SourceTile[] = []
    const now = Date.now()
    for (const t of status.sources) {
      if (t.failed_7d > 0 || t.latest?.status === 'failed') {
        failing.push(t)
      } else if (t.latest?.started_at && now - new Date(t.latest.started_at).getTime() > 1000 * 60 * 60 * 24 * 14) {
        stale.push(t)  // no run in 14 days
      } else {
        healthy.push(t)
      }
    }
    return { failing, stale, healthy }
  }, [status])

  if (loading) return <div style={PAGE}>Loading enrichment status…</div>
  if (error) return <div style={{ ...PAGE, color: '#991B1B' }}>Failed to load: {error}</div>
  if (!status) return null

  return (
    <div style={PAGE}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Data freshness &amp; enrichment runs
        </h1>
        <p style={{ fontSize: 14, color: '#6B7280' }}>
          Each external data source has its own scheduled enrichment job. Latest run, last
          7 days of success/failure counts, and on-demand triggers below. Auto-refresh every 30s.
        </p>
      </header>

      <DataSourceBanner
        pageKey="enrichment-status"
        mode="live"
        summary="This page reflects what the scheduled jobs actually did. Each enrichment runs as a Container Apps Job on a cron schedule and writes a row to the enrichment_runs table at start and finish."
        rules={[
          'Cron schedules: forecast every 4h, EPC and crime daily, postcodes and flood weekly, broadband and UPRN monthly. Times are UTC.',
          'Manual triggers via the Run-now button POST to /api/enrichment/trigger which spawns a runner subprocess.',
          'Distributed locking via Postgres advisory locks (pg_try_advisory_lock) so two runs of the same source can never overlap — the second one exits with code 2 and the row is marked as failed with reason "lock busy".',
          'Each run records: started_at, finished_at, status, duration_ms, summary JSON (records_updated etc.), host, git_commit, error + traceback if any.',
        ]}
        productionSource="The runs themselves are real. The schedule is configured in infra/bicep/main.bicep and provisioned by the CD pipeline. Add a new source by extending JOB_SOURCES in jobs/runner.py and adding a row to the jobSpecs array in the Bicep main file."
      />

      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 24, marginBottom: 8 }}>
        Sources ({status.sources.length})
      </h2>
      <div style={TILE_GRID}>
        {status.sources.map(tile => (
          <SourceTileCard
            key={tile.source}
            tile={tile}
            isFiltered={filter === tile.source}
            busy={busySource === tile.source}
            onFilter={() => setFilter(filter === tile.source ? null : tile.source)}
            onTrigger={() => triggerRun(tile.source)}
          />
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginTop: 32, marginBottom: 8 }}>
        Recent runs {filter ? <span style={{ fontWeight: 400, color: '#6B7280' }}>· filtered to <strong>{filter}</strong> · <button onClick={() => setFilter(null)} style={{ background: 'none', border: 'none', color: '#1B4F72', cursor: 'pointer', padding: 0 }}>clear</button></span> : null}
      </h2>
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB', textAlign: 'left' }}>
              <th style={CELL_H}>Source</th>
              <th style={CELL_H}>Status</th>
              <th style={CELL_H}>Started</th>
              <th style={CELL_H}>Duration</th>
              <th style={CELL_H}>Trigger</th>
              <th style={CELL_H}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9CA3AF' }}>
                No runs recorded{filter ? ` for ${filter}` : ''} yet.
              </td></tr>
            )}
            {runs.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                <td style={CELL}><strong>{r.source}</strong></td>
                <td style={CELL}>
                  <StatusPill status={r.status} />
                </td>
                <td style={CELL}>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                <td style={CELL}>{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td style={CELL}>{r.triggered_by ?? '—'}{r.triggered_by_user ? ` (${r.triggered_by_user})` : ''}</td>
                <td style={{ ...CELL, fontSize: 11, color: '#6B7280', maxWidth: 320 }}>
                  {r.error
                    ? <span style={{ color: '#991B1B' }}>{r.error}</span>
                    : r.summary
                      ? Object.entries(r.summary).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' · ')
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SourceTileCard({
  tile, isFiltered, busy, onFilter, onTrigger,
}: {
  tile: SourceTile
  isFiltered: boolean
  busy: boolean
  onFilter: () => void
  onTrigger: () => void
}) {
  const latest = tile.latest
  const meta = latest ? STATUS_COLOUR[latest.status] : null

  return (
    <div style={{
      backgroundColor: 'white',
      border: isFiltered ? '2px solid #1B4F72' : '1px solid #E5E7EB',
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div onClick={onFilter} style={{ cursor: 'pointer', flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{tile.label}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{tile.cadence}</div>
        </div>
        {meta && (
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color: meta.text, backgroundColor: meta.bg,
            padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}>
            {meta.label}
          </span>
        )}
      </div>

      <div style={{
        fontSize: 12, color: '#6B7280', marginTop: 8,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <div>
          <strong>Last run:</strong>{' '}
          {latest?.started_at ? new Date(latest.started_at).toLocaleString() : 'never'}
          {latest?.duration_ms ? ` · ${(latest.duration_ms / 1000).toFixed(1)}s` : ''}
        </div>
        <div>
          <strong>Last 7d:</strong>{' '}
          <span style={{ color: '#065F46' }}>{tile.success_7d} ok</span>
          {' · '}
          <span style={{ color: tile.failed_7d > 0 ? '#991B1B' : '#9CA3AF' }}>{tile.failed_7d} failed</span>
        </div>
        {latest?.error && (
          <div style={{ color: '#991B1B', fontStyle: 'italic', marginTop: 4 }}>
            {latest.error.slice(0, 140)}
          </div>
        )}
      </div>

      <button
        onClick={onTrigger}
        disabled={busy || tile.running_now}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #1B4F72',
          backgroundColor: tile.running_now ? '#F3F4F6' : 'white',
          color: '#1B4F72',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: busy || tile.running_now ? 'not-allowed' : 'pointer',
          opacity: busy || tile.running_now ? 0.6 : 1,
        }}
      >
        {busy ? '…' : tile.running_now ? 'Already running' : 'Run now'}
      </button>
    </div>
  )
}

function StatusPill({ status }: { status: RunStatus }) {
  const meta = STATUS_COLOUR[status]
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      color: meta.text,
      backgroundColor: meta.bg,
      padding: '3px 8px',
      borderRadius: 4,
      letterSpacing: 0.5,
    }}>
      {meta.label}
    </span>
  )
}

const CELL_H: CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  color: '#374151',
  textTransform: 'uppercase',
}
const CELL: CSSProperties = {
  padding: '10px 14px',
  fontSize: 13,
  color: '#1F2937',
}
