/**
 * DataSourceBanner — explains where the data on a page comes from.
 *
 * Pages backed by synthetic seed data (compliance, TSMs, Awaab cases,
 * damp/mould inputs) need to make it obvious to users that the numbers
 * are illustrative rather than pulled from a live system. This banner
 * surfaces three things on every page that uses it:
 *
 *   * What you're looking at right now (synthetic / computed / live)
 *   * How that data is generated, with the actual rules
 *   * What would replace it in production
 *
 * The banner remembers a per-page "dismissed" state in localStorage so
 * power users can collapse it.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Info, ChevronDown, ChevronUp, FlaskConical, Database, Zap } from 'lucide-react'

export type DataMode = 'synthetic' | 'computed' | 'live'

interface DataSourceBannerProps {
  /** Stable id used as the localStorage key for "is collapsed" state. */
  pageKey: string
  /** Headline label on the chip. */
  mode: DataMode
  /** Lead paragraph — what this page is showing right now. */
  summary: string
  /** Bullet list — exactly how the data is generated/computed. */
  rules: string[]
  /** What real production sources would replace it. */
  productionSource: string
  /** Optional extra context — e.g. a list of caveats. */
  children?: ReactNode
}

const MODE_META: Record<DataMode, { label: string; bg: string; border: string; text: string; Icon: typeof Info }> = {
  synthetic: {
    label: 'Synthetic data',
    bg: '#FFFBEB',
    border: '#FCD34D',
    text: '#92400E',
    Icon: FlaskConical,
  },
  computed: {
    label: 'Computed from your data',
    bg: '#EFF6FF',
    border: '#93C5FD',
    text: '#1E40AF',
    Icon: Database,
  },
  live: {
    label: 'Live data',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    text: '#065F46',
    Icon: Zap,
  },
}

const STORAGE_PREFIX = 'shdt.dataSourceBanner.'

const CONTAINER: CSSProperties = {
  borderRadius: 12,
  padding: '14px 18px',
  marginBottom: 24,
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

export function DataSourceBanner({
  pageKey,
  mode,
  summary,
  rules,
  productionSource,
  children,
}: DataSourceBannerProps) {
  const meta = MODE_META[mode]
  const Icon = meta.Icon

  const [collapsed, setCollapsed] = useState(false)

  // Pull the collapsed state out of localStorage once on mount
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_PREFIX + pageKey)
      if (v === '1') setCollapsed(true)
    } catch {
      // SSR / private mode / disabled storage — fail safe
    }
  }, [pageKey])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_PREFIX + pageKey, next ? '1' : '0')
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        ...CONTAINER,
        backgroundColor: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
      data-testid="data-source-banner"
    >
      {/* Header row — chip + summary + collapse button */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
      }} onClick={toggle}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: meta.text,
          backgroundColor: 'white',
          padding: '4px 10px',
          borderRadius: 4,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          border: `1px solid ${meta.border}`,
        }}>
          <Icon style={{ width: 12, height: 12 }} />
          {meta.label}
        </div>

        <div style={{ flex: 1, fontSize: 13, color: meta.text, lineHeight: 1.5 }}>
          {summary}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); toggle() }}
          aria-label={collapsed ? 'Show details' : 'Hide details'}
          style={{
            background: 'transparent',
            border: 'none',
            color: meta.text,
            cursor: 'pointer',
            padding: 2,
            flexShrink: 0,
          }}
        >
          {collapsed
            ? <ChevronDown style={{ width: 18, height: 18 }} />
            : <ChevronUp style={{ width: 18, height: 18 }} />
          }
        </button>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${meta.border}` }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: meta.text,
              marginBottom: 6,
              letterSpacing: 0.5,
            }}>
              How this is generated today
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              color: '#374151',
              lineHeight: 1.6,
            }}>
              {rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>

          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: meta.text,
              marginBottom: 6,
              letterSpacing: 0.5,
            }}>
              In production this would come from
            </div>
            <p style={{
              margin: 0,
              fontSize: 13,
              color: '#374151',
              lineHeight: 1.6,
            }}>
              {productionSource}
            </p>
          </div>

          {children && (
            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px dashed ${meta.border}`,
              fontSize: 13,
              color: '#374151',
              lineHeight: 1.6,
            }}>
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DataSourceBanner
