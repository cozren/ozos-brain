import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect } from 'vitest'
import type { DataPoint } from '../../../types/datapoints'

vi.mock('../DataPointTile', () => ({
  DataPointTile: ({ dp }: { dp: DataPoint }) => <div>value-tile:{dp.id}</div>,
}))

import { DashboardTile } from '../DashboardTile'

const POINTS: DataPoint[] = [
  {
    id: 'weekly-signups',
    name: 'Weekly signups',
    source: { kind: 'metabase', card_id: 42 },
    display: 'number',
    refresh: 'daily',
    unit: '',
    created_at: '',
  },
  {
    id: 'churn',
    name: 'Churn',
    source: { kind: 'csv', path: 'data/churn.csv', column: null },
    display: 'line',
    refresh: 'manual',
    unit: '',
    created_at: '',
  },
]

describe('DashboardTile', () => {
  test('empty tile lists data points by source kind; picking one reports its id', async () => {
    const onPick = vi.fn()
    render(<DashboardTile refId={null} datapoints={POINTS} onPick={onPick} onRemove={() => {}} />)
    expect(screen.getByText('Choose a data point')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Weekly signups' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Metabase/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Weekly signups' }))
    expect(onPick).toHaveBeenCalledWith('weekly-signups')
    expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument()
  })

  test('a known id renders the data point tile without a duplicate chrome title', () => {
    render(
      <DashboardTile refId="churn" datapoints={POINTS} onPick={() => {}} onRemove={() => {}} />
    )
    expect(screen.getByText('value-tile:churn')).toBeInTheDocument()
    expect(screen.queryByText('Churn')).not.toBeInTheDocument()
  })

  test('an unknown id says the data point was removed and offers to remove the tile', async () => {
    const onRemove = vi.fn()
    render(
      <DashboardTile refId="ghost" datapoints={POINTS} onPick={() => {}} onRemove={onRemove} />
    )
    expect(screen.getAllByText('Data point removed').length).toBeGreaterThan(0)
    expect(screen.queryByText('ghost')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove this tile' }))
    expect(onRemove).toHaveBeenCalled()
  })

  test('the header remove button fires onRemove', async () => {
    const onRemove = vi.fn()
    render(
      <DashboardTile refId="churn" datapoints={POINTS} onPick={() => {}} onRemove={onRemove} />
    )
    await userEvent.click(screen.getByRole('button', { name: /remove tile/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
