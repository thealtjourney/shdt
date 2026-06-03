# Splitting App.tsx — refactor pattern

`client/src/App.tsx` is currently 4,100 lines. It contains:

- The Insights page with eight tabs (Strategic, Risk, EPC, Fuel, Complaints,
  Repairs, Demographics, Hotspots, Guide)
- The About page
- The Strategic Insights renderer
- Routing setup

This document describes the pattern for splitting it without breaking the
running app. **Do not attempt the full split until the test suite has at
least one snapshot test per affected tab** — see
`client/vitest.config.ts` and the `__tests__/` folders.

## Target structure

```
client/src/pages/
  Insights.tsx                       # Top-level page with tab list
  insights/
    StrategicTab.tsx                 # Tab: Strategic Insights
    RiskHeatmapTab.tsx               # Tab: Area Risk Heatmap
    EpcOverviewTab.tsx               # Tab: EPC Overview
    FuelPovertyTab.tsx               # Tab: Fuel Poverty
    ComplaintsTab.tsx                # Tab: Complaints Analysis
    RepairsTab.tsx                   # Tab: Repairs & Contractors
    DemographicsTab.tsx              # Tab: Demographics & Connectivity
    HotspotsTab.tsx                  # Tab: Operational Hotspots
    GuideTab.tsx                     # Tab: Understanding Your Data
    strategic/
      cards/
        FloodRiskCard.tsx
        DeprivationCard.tsx
        ...one file per card
        index.ts                     # Re-exports + registry
```

## Step-by-step (one tab at a time)

For each tab, in order:

### 1. Create the tab file

```tsx
// client/src/pages/insights/StrategicTab.tsx
import type { StrategicInsight } from '../../types/insights'

interface Props {
  loading: boolean
  insights: StrategicInsight[] | null
}

export function StrategicTab({ loading, insights }: Props) {
  if (loading) return <div>Loading…</div>
  if (!insights?.length) return <div>No insights available.</div>
  return (
    <div>
      {insights.map(i => (
        <InsightCard key={i.key} insight={i} />
      ))}
    </div>
  )
}
```

### 2. Move the JSX

Cut the relevant `{activeTab === 'strategic' && (...)}` block out of
`App.tsx` and paste it as the body of the new component. Lift the styles
that are local to the tab; leave shared styles in App.tsx for now.

### 3. Wire it back in

```tsx
// In App.tsx
import { StrategicTab } from './pages/insights/StrategicTab'

// Replace:
{activeTab === 'strategic' && ( /* 130 lines of JSX */ )}
// With:
{activeTab === 'strategic' && (
  <StrategicTab loading={strategicLoading} insights={strategicInsights} />
)}
```

### 4. Add a snapshot test

```tsx
// client/src/pages/insights/__tests__/StrategicTab.test.tsx
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../../../test/utils'
import { StrategicTab } from '../StrategicTab'

describe('StrategicTab', () => {
  it('shows loading state', () => {
    renderWithProviders(<StrategicTab loading={true} insights={null} />)
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })
})
```

### 5. Run tests, commit, repeat

`npm test` should pass. Commit the tab as a self-contained PR. Then move
to the next tab.

## Strategic tab cards

The Strategic tab itself contains ten cards. Apply the same pattern to it:
extract each card into `pages/insights/strategic/cards/` with one file per
card, and a small `cards/index.ts` that exports them as a registry the
parent walks.

This mirrors the backend `services/insights/` pattern exactly — same shape,
same trade-offs, same testability gain.

## Why incrementally

A single 4,100-line replacement is high risk: subtle behaviour drift
(loading states, prop shapes, side-effect timing) is hard to catch without
tests. One tab at a time, one PR each, with tests, makes the migration
auditable and reversible.
