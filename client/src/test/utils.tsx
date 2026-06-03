/**
 * Test utilities — wrappers that provide the same React context the real app
 * has, so components can be rendered in isolation.
 */
import type { ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

function AllProviders({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export commonly used helpers so test files have one import path.
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
