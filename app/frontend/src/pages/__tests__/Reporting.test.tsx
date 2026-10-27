import { render, screen } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { Reporting } from '../Reporting'

// Stub the canvas so the page renders without touching the backend.
vi.mock('../../components/reporting/ReportingCanvas', () => ({
  ReportingCanvas: () => <div>canvas</div>,
}))

test('renders the page titled "Insights Hub" (renamed from Reporting)', () => {
  render(<Reporting />)
  expect(screen.getByRole('heading', { level: 1, name: 'Insights Hub' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /^Reporting$/ })).toBeNull()
})

test('shows a descriptive Insights Hub subtitle', () => {
  render(<Reporting />)
  expect(screen.getByText('Curated data, market intel and research reports')).toBeInTheDocument()
})
