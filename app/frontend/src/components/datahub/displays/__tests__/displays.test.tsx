import { render, screen } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import type { DataPointValue } from '../../../../types/datapoints'
import { NumberDisplay } from '../NumberDisplay'
import { TableDisplay } from '../TableDisplay'
import { LineDisplay } from '../LineDisplay'

const value = (columns: string[], rows: unknown[][]): DataPointValue => ({
  id: 'x',
  fetched_at: '2026-01-01T00:00:00',
  columns,
  rows,
  error: null,
})

describe('NumberDisplay', () => {
  test('shows the formatted first cell with its unit and an upward delta', () => {
    render(<NumberDisplay value={value(['n'], [[1234], [1222]])} unit="users" />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText(/▲ \+12 · from 1,222/)).toBeInTheDocument()
  })
  test('downward delta and no delta', () => {
    const { rerender } = render(<NumberDisplay value={value(['n'], [[8], [10]])} unit="" />)
    expect(screen.getByText(/▼ -2 · from 10/)).toBeInTheDocument()
    rerender(<NumberDisplay value={value(['n'], [[8]])} unit="" />)
    expect(screen.queryByText(/from/)).not.toBeInTheDocument()
  })
})

describe('TableDisplay', () => {
  test('renders the header and the capped rows with a footer', () => {
    const rows = Array.from({ length: 60 }, (_, i) => [i, `r${i}`])
    render(<TableDisplay value={value(['n', 'label'], rows)} />)
    expect(screen.getByRole('columnheader', { name: 'label' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(51) // header + 50
    expect(screen.getByText('Showing 50 of 60 rows')).toBeInTheDocument()
  })
  test('no footer when everything fits', () => {
    render(<TableDisplay value={value(['n'], [[1], [2]])} />)
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })
})

describe('LineDisplay', () => {
  test('asks for two columns when there is one', () => {
    render(<LineDisplay value={value(['n'], [[1], [2]])} />)
    expect(screen.getByText('Need two columns (x, y)')).toBeInTheDocument()
  })
  test('renders a chart with one point per row', () => {
    const { container } = render(
      <LineDisplay
        value={value(
          ['week', 'n'],
          [
            ['w1', 1],
            ['w2', 2],
            ['w3', 3],
          ]
        )}
        width={300}
        height={120}
      />
    )
    expect(container.querySelector('svg.recharts-surface')).toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-line-dot')).toHaveLength(3)
  })
})
