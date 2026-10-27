import { render, screen } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import { RevenueChart } from '../RevenueChart'
import type { RevenueSnapshot } from '../../../types/reporting'

const DATA: RevenueSnapshot = {
  metric: 'Sample Revenue (Monthly)',
  currency: 'EUR',
  year: 2026,
  generated_at: '2026-06-25',
  series: [
    { month: '2026-01', revenue: 201468.36 },
    { month: '2026-02', revenue: 189321.63 },
  ],
  ytd_total: 390789.99,
}

describe('RevenueChart', () => {
  test('shows the metric, year and YTD total', () => {
    render(<RevenueChart data={DATA} width={400} height={240} />)
    expect(screen.getByText(/Sample Revenue/)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    // YTD formatted as currency with thousands separators (rounded)
    expect(screen.getByText(/390,790/)).toBeInTheDocument()
  })

  test('renders one bar per month in the series', () => {
    const { container } = render(<RevenueChart data={DATA} width={400} height={240} />)
    const bars = container.querySelectorAll('.recharts-bar-rectangle')
    expect(bars.length).toBe(2)
  })
})
