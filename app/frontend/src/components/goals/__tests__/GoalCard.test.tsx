import { render, screen, fireEvent } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import { GoalCard } from '../GoalCard'
import type { Goal } from '../../../types/goals'

const base: Goal = {
  id: 'grow-activation',
  title: 'Grow activation',
  description: '',
  owner: 'Pat',
  status: 'on_track',
  progress: 42,
  target_date: '2027-03-31',
  source: 'manual',
  external_id: null,
  data_point_id: null,
  updated_at: null,
  synced_at: null,
}

test('shows title, status chip, progress bar, owner and target date', () => {
  render(<GoalCard goal={base} />)
  expect(screen.getByText('Grow activation')).toBeInTheDocument()
  expect(screen.getByText('On track')).toHaveAttribute('data-status', 'on_track')
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  expect(screen.getByText(/Pat/)).toBeInTheDocument()
  expect(screen.getByText(/2027-03-31/)).toBeInTheDocument()
  expect(screen.queryByText('Atlassian')).toBeNull()
})

test('a synced goal carries an Atlassian badge; no progress bar without progress', () => {
  render(
    <GoalCard
      goal={{
        ...base,
        id: 'atlassian-1',
        source: 'atlassian',
        external_id: 'ari:1',
        progress: null,
      }}
    />
  )
  expect(screen.getByText('Atlassian')).toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).toBeNull()
})

test('a manual goal with handlers exposes a status select, a progress input and delete', () => {
  const onPatch = vi.fn()
  const onDelete = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<GoalCard goal={base} onPatch={onPatch} onDelete={onDelete} />)
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'at_risk' } })
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { status: 'at_risk' })
  const progress = screen.getByLabelText('Progress')
  fireEvent.change(progress, { target: { value: '55' } })
  fireEvent.blur(progress)
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { progress: 55 })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Grow activation' }))
  expect(onDelete).toHaveBeenCalledWith('grow-activation')
})

test('a synced goal never exposes edit controls even with handlers', () => {
  render(
    <GoalCard
      goal={{ ...base, id: 'atlassian-1', source: 'atlassian', external_id: 'ari:1' }}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
    />
  )
  expect(screen.queryByLabelText('Status')).toBeNull()
  expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  expect(screen.getByText('On track')).toBeInTheDocument()
})

// ── Phase 4: data point binding ───────────────────────────────────────────

import type { DataPoint, DataPointValue } from '../../../types/datapoints'

const POINT: DataPoint = {
  id: 'weekly-signups',
  name: 'Weekly signups',
  source: { kind: 'metabase', card_id: 42 },
  display: 'number',
  refresh: 'daily',
  unit: 'users',
  created_at: '',
}

const VALUE: DataPointValue = {
  id: 'weekly-signups',
  fetched_at: '2026-01-01T00:00:00',
  columns: ['n'],
  rows: [[1234]],
  error: null,
}

test('with data points, the card offers a Data point select that writes data_point_id', () => {
  const onPatch = vi.fn()
  render(<GoalCard goal={base} onPatch={onPatch} onDelete={vi.fn()} datapoints={[POINT]} />)
  const select = screen.getByLabelText('Data point')
  expect(screen.getByRole('option', { name: 'No data point' })).toBeInTheDocument()
  fireEvent.change(select, { target: { value: 'weekly-signups' } })
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { data_point_id: 'weekly-signups' })
  fireEvent.change(select, { target: { value: '' } })
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { data_point_id: null })
})

test('a synced goal also gets the Data point select (binding is the one field it accepts)', () => {
  const onPatch = vi.fn()
  render(
    <GoalCard
      goal={{ ...base, id: 'atlassian-1', source: 'atlassian', external_id: 'ari:1' }}
      onPatch={onPatch}
      onDelete={vi.fn()}
      datapoints={[POINT]}
    />
  )
  fireEvent.change(screen.getByLabelText('Data point'), { target: { value: 'weekly-signups' } })
  expect(onPatch).toHaveBeenCalledWith('atlassian-1', { data_point_id: 'weekly-signups' })
  expect(screen.queryByLabelText('Status')).toBeNull()
})

test('a bound goal shows the measured value beside its progress, never writing progress', () => {
  const onPatch = vi.fn()
  render(
    <GoalCard
      goal={{ ...base, data_point_id: 'weekly-signups' }}
      onPatch={onPatch}
      onDelete={vi.fn()}
      datapoints={[POINT]}
      measure={{ dp: POINT, value: VALUE }}
    />
  )
  expect(screen.getByTestId('goal-measure')).toHaveTextContent('1,234 users · Weekly signups')
  expect(screen.getByLabelText('Data point')).toHaveValue('weekly-signups')
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  expect(onPatch).not.toHaveBeenCalled()
})

test('an errored or never-fetched measure reads "no value"', () => {
  const { rerender } = render(
    <GoalCard
      goal={{ ...base, data_point_id: 'weekly-signups' }}
      measure={{ dp: POINT, value: { ...VALUE, rows: [], error: 'boom' } }}
    />
  )
  expect(screen.getByTestId('goal-measure')).toHaveTextContent('no value · Weekly signups')
  rerender(
    <GoalCard
      goal={{ ...base, data_point_id: 'weekly-signups' }}
      measure={{ dp: POINT, value: { ...VALUE, rows: [], fetched_at: null } }}
    />
  )
  expect(screen.getByTestId('goal-measure')).toHaveTextContent('no value')
})
