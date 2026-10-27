import { describe, test, expect } from 'vitest'
import type { DataPoint, DataPointValue } from '../../types/datapoints'
import {
  KIND_LABEL,
  TABLE_CAP,
  fetchedAgo,
  formatNumber,
  lineSeries,
  numberOf,
  tableRows,
  toPickerItems,
} from '../datapoints'

const value = (columns: string[], rows: unknown[][]): DataPointValue => ({
  id: 'x',
  fetched_at: '2026-01-01T00:00:00',
  columns,
  rows,
  error: null,
})

describe('formatNumber', () => {
  test('groups thousands, keeps two decimals and appends the unit', () => {
    expect(formatNumber(1234.5, 'users')).toBe('1,234.5 users')
    expect(formatNumber(1234567, '')).toBe('1,234,567')
    expect(formatNumber(0.12345, '%')).toBe('0.12 %')
  })
  test('non-numbers are shown as text and null as a dash', () => {
    expect(formatNumber('2026-W01', 'x')).toBe('2026-W01')
    expect(formatNumber(null, 'x')).toBe('–')
  })
})

describe('numberOf', () => {
  test('first cell of the first row, delta against the second row', () => {
    expect(numberOf(value(['n'], [[12], [10]]))).toEqual({ current: 12, previous: 10, delta: 2 })
  })
  test('no delta with one row or a non-numeric previous', () => {
    expect(numberOf(value(['n'], [[12]]))).toEqual({ current: 12, previous: null, delta: null })
    expect(numberOf(value(['n'], [[12], ['x']]))).toEqual({
      current: 12,
      previous: null,
      delta: null,
    })
    expect(numberOf(value([], []))).toEqual({ current: null, previous: null, delta: null })
  })
})

describe('lineSeries', () => {
  test('first column is x, second is y, non-numeric y dropped', () => {
    const series = lineSeries(
      value(
        ['week', 'n'],
        [
          ['w1', 1],
          ['w2', 'n/a'],
          ['w3', 3.5],
        ]
      )
    )
    expect(series).toEqual([
      { x: 'w1', y: 1 },
      { x: 'w3', y: 3.5 },
    ])
  })
  test('needs two columns', () => {
    expect(lineSeries(value(['n'], [[1]]))).toEqual([])
  })
})

describe('tableRows', () => {
  test('caps at 50 rows', () => {
    const rows = Array.from({ length: 60 }, (_, i) => [i])
    expect(TABLE_CAP).toBe(50)
    expect(tableRows(value(['i'], rows))).toHaveLength(50)
  })
})

describe('toPickerItems', () => {
  test('one item per data point, categorised by source kind', () => {
    const points: DataPoint[] = [
      {
        id: 'a',
        name: 'Weekly signups',
        source: { kind: 'metabase', card_id: 42 },
        display: 'number',
        refresh: 'daily',
        unit: '',
        created_at: '',
      },
      {
        id: 'b',
        name: 'Churn',
        source: { kind: 'csv', path: 'data/churn.csv', column: null },
        display: 'line',
        refresh: 'manual',
        unit: '',
        created_at: '',
      },
    ]
    expect(toPickerItems(points)).toEqual([
      { id: 'a', label: 'Weekly signups', category: 'Metabase' },
      { id: 'b', label: 'Churn', category: 'CSV' },
    ])
    expect(KIND_LABEL.sqlite).toBe('SQLite')
  })
})

describe('fetchedAgo', () => {
  test('never without a timestamp, otherwise a coarse age', () => {
    expect(fetchedAgo(null)).toBe('never')
    const now = Date.now()
    expect(fetchedAgo(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(fetchedAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago')
    expect(fetchedAgo(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago')
    expect(fetchedAgo(new Date(now - 10_000).toISOString())).toBe('just now')
  })
})
