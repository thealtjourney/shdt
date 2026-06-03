/**
 * Sample tests — confirms the test harness works end-to-end:
 *   - Vitest is configured
 *   - jsdom is set up
 *   - jest-dom matchers are loaded
 *   - React Testing Library renders components
 *   - Provider wrappers (BrowserRouter) plug in cleanly
 *
 * Replace these with real component tests as features stabilise.
 */
import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen } from '../../test/utils'

function Hello({ name }: { name: string }) {
  return <div role="heading">Hello, {name}!</div>
}

describe('test harness', () => {
  it('renders a trivial component', () => {
    renderWithProviders(<Hello name="SHDT" />)
    expect(screen.getByRole('heading')).toHaveTextContent('Hello, SHDT!')
  })

  it('jest-dom matchers work', () => {
    renderWithProviders(<button disabled>Submit</button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('arithmetic sanity', () => {
  it('two plus two equals four', () => {
    expect(2 + 2).toBe(4)
  })
})
