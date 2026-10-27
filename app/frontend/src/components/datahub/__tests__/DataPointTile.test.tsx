import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import type { DataPoint, DataPointValue } from '../../../types/datapoints'

const getDataPointValue = vi.fn()
const refreshDataPoint = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getDataPointValue: (...a: unknown[]) => getDataPointValue(...a),
    refreshDataPoint: (...a: unknown[]) => refreshDataPoint(...a),
  },
}))

import { DataPointTile } from '../DataPointTile'

const dp: DataPoint = {
  id: 'weekly-signups',
  name: 'Weekly signups',
  source: { kind: 'metabase', card_id: 42 },
  display: 'number',
  refresh: 'daily',
  unit: 'users',
  created_at: '',
}

const empty: DataPointValue = {
  id: 'weekly-signups',
  fetched_at: null,
  columns: [],
  rows: [],
  error: null,
}
const filled: DataPointValue = {
  ...empty,
  fetched_at: new Date().toISOString(),
  columns: ['n'],
  rows: [[1234]],
}

beforeEach(() => {
  getDataPointValue.mockReset()
  refreshDataPoint.mockReset()
})

describe('DataPointTile', () => {
  test('loads the value by id and shows "Not fetched yet" until refreshed', async () => {
    getDataPointValue.mockResolvedValue(empty)
    refreshDataPoint.mockResolvedValue(filled)
    render(<DataPointTile dp={dp} />)
    expect(await screen.findByText('Not fetched yet.')).toBeInTheDocument()
    expect(getDataPointValue).toHaveBeenCalledWith('weekly-signups')
    expect(screen.getByText('Weekly signups')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Weekly signups' }))
    expect(refreshDataPoint).toHaveBeenCalledWith('weekly-signups')
    expect(await screen.findByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('just now')).toBeInTheDocument()
  })

  test('shows the cached error', async () => {
    getDataPointValue.mockResolvedValue({ ...filled, rows: [], columns: [], error: 'card 42: 403' })
    render(<DataPointTile dp={dp} />)
    expect(await screen.findByText('card 42: 403')).toBeInTheDocument()
    expect(screen.queryByText('1,234')).not.toBeInTheDocument()
  })

  test('a failed load is reported, not swallowed', async () => {
    getDataPointValue.mockRejectedValue(new Error('down'))
    render(<DataPointTile dp={dp} />)
    expect(await screen.findByText('Could not load value')).toBeInTheDocument()
  })

  test('picks the display from the data point', async () => {
    getDataPointValue.mockResolvedValue({ ...filled, columns: ['n', 'label'], rows: [[1, 'a']] })
    render(<DataPointTile dp={{ ...dp, display: 'table' }} />)
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'label' })).toBeInTheDocument()
    )
  })
})
