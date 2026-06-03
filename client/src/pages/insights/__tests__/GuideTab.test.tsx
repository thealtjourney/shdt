/**
 * Snapshot tests for GuideTab.
 *
 * Verifies the static content tab renders without crashing and contains
 * the expected section headings. Acts as the regression net for any
 * future edits to GuideTab.tsx.
 */
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../../../test/utils'
import { GuideTab } from '../GuideTab'

describe('GuideTab', () => {
  it('renders without crashing', () => {
    renderWithProviders(<GuideTab />)
    expect(screen.getByTestId('guide-tab')).toBeInTheDocument()
  })

  it('shows the About section', () => {
    renderWithProviders(<GuideTab />)
    expect(screen.getByText(/About This Page/i)).toBeInTheDocument()
  })

  it('lists all expected data-source headings', () => {
    renderWithProviders(<GuideTab />)
    const expected = [
      /Crime Risk Data/i,
      /Flood Risk Data/i,
      /Index of Multiple Deprivation/i,
      /Composite Area Risk Score/i,
      /Energy Performance Certificates/i,
      /Fuel Poverty Analysis/i,
      /Census 2021 Demographics/i,
      /Broadband.*Utilities/i,
      /Complaints.*Repairs Data/i,
    ]
    for (const pattern of expected) {
      expect(screen.getByText(pattern)).toBeInTheDocument()
    }
  })
})
