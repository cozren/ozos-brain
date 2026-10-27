import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'
import type { Goal, GoalsPayload } from '../../../types/goals'

const getGoals = vi.fn()
const syncGoals = vi.fn()
const addGoal = vi.fn()
const updateGoal = vi.fn()
const deleteGoal = vi.fn()
const getDataPoints = vi.fn()
const getDataPointValue = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getGoals: (...a: unknown[]) => getGoals(...a),
    syncGoals: (...a: unknown[]) => syncGoals(...a),
    addGoal: (...a: unknown[]) => addGoal(...a),
    updateGoal: (...a: unknown[]) => updateGoal(...a),
    deleteGoal: (...a: unknown[]) => deleteGoal(...a),
    getDataPoints: (...a: unknown[]) => getDataPoints(...a),
    getDataPointValue: (...a: unknown[]) => getDataPointValue(...a),
  },
  ApiError: class ApiError extends Error {
    status: number
    detail: string | null
    constructor(status: number, detail: string | null) {
      super(detail ?? String(status))
      this.status = status
      this.detail = detail
    }
  },
}))

import { GoalsBoard } from '../GoalsBoard'

const goal = (id: string, status: Goal['status'], title: string): Goal => ({
  id,
  title,
  description: '',
  owner: '',
  status,
  progress: null,
  target_date: '',
  source: 'manual',
  external_id: null,
  data_point_id: null,
  updated_at: null,
  synced_at: null,
})

const empty: GoalsPayload = {
  goals: [],
  sync: null,
  connector: { configured: false, missing: ['ATLASSIAN_EMAIL'] },
  statuses: ['on_track', 'at_risk', 'off_track', 'complete', 'cancelled', 'pending'],
}

const NO_POINTS = {
  datapoints: [],
  connector: { configured: false, missing: [] },
  kinds: [],
  displays: [],
  refreshes: [],
}

beforeEach(() => {
  getGoals.mockReset()
  syncGoals.mockReset()
  addGoal.mockReset()
  updateGoal.mockReset()
  deleteGoal.mockReset()
  getDataPoints.mockReset().mockResolvedValue(NO_POINTS)
  getDataPointValue.mockReset()
})

test('empty state copy, and no sync button when the connector is not configured', async () => {
  getGoals.mockResolvedValue(empty)
  render(<GoalsBoard />)
  expect(
    await screen.findByText('No goals yet. Add one below, or connect Atlassian Goals in Setup.')
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sync Atlassian' })).toBeNull()
})

test('lists goals sorted with off track first and shows the count strip', async () => {
  getGoals.mockResolvedValue({
    ...empty,
    goals: [goal('a', 'on_track', 'Alpha'), goal('o', 'off_track', 'Omega')],
  })
  render(<GoalsBoard />)
  await screen.findByText('Alpha')
  const cards = document.querySelectorAll('[data-goal]')
  expect(Array.from(cards).map((c) => c.getAttribute('data-goal'))).toEqual(['o', 'a'])
  expect(screen.getByTestId('goal-count-off_track')).toHaveTextContent('1')
  expect(screen.getByTestId('goal-count-on_track')).toHaveTextContent('1')
  expect(screen.queryByTestId('goal-count-at_risk')).toBeNull()
})

test('sync button appears when configured, syncs, reports and reloads', async () => {
  const configured: GoalsPayload = {
    ...empty,
    connector: { configured: true, missing: [] },
    sync: { last_run: '2027-01-02T03:04:05', status: 'ok', message: '', count: 2 },
  }
  getGoals.mockResolvedValue(configured)
  syncGoals.mockResolvedValue({ synced: 2, sync: configured.sync })
  render(<GoalsBoard />)
  const btn = await screen.findByRole('button', { name: 'Sync Atlassian' })
  expect(screen.getByText(/Last sync: 2027-01-02/)).toBeInTheDocument()
  fireEvent.click(btn)
  await waitFor(() => expect(screen.getByText('Synced 2 goals.')).toBeInTheDocument())
  expect(getGoals).toHaveBeenCalledTimes(2)
})

test('a failed sync shows the backend detail', async () => {
  getGoals.mockResolvedValue({ ...empty, connector: { configured: true, missing: [] } })
  const { ApiError } = await import('../../../api')
  syncGoals.mockRejectedValue(new ApiError(502, 'Error: Authentication failed', 'Sync'))
  render(<GoalsBoard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sync Atlassian' }))
  await waitFor(() => expect(screen.getByText('Error: Authentication failed')).toBeInTheDocument())
})

test('adding a goal posts it and reloads the list', async () => {
  getGoals.mockResolvedValue(empty)
  addGoal.mockResolvedValue(goal('new-one', 'pending', 'New one'))
  render(<GoalsBoard />)
  fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'New one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
  await waitFor(() =>
    expect(addGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'New one' }))
  )
  await waitFor(() => expect(getGoals).toHaveBeenCalledTimes(2))
})

test('changing a status patches the goal and keeps the response', async () => {
  const g = goal('a', 'on_track', 'Alpha')
  getGoals.mockResolvedValue({ ...empty, goals: [g] })
  updateGoal.mockResolvedValue({ ...g, status: 'at_risk' })
  render(<GoalsBoard />)
  const card = (await screen.findByText('Alpha')).closest('[data-goal]') as HTMLElement
  fireEvent.change(within(card).getByLabelText('Status'), { target: { value: 'at_risk' } })
  await waitFor(() => expect(updateGoal).toHaveBeenCalledWith('a', { status: 'at_risk' }))
  await waitFor(() => expect(screen.getByTestId('goal-count-at_risk')).toHaveTextContent('1'))
})

test('deleting a goal removes it from the list', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  getGoals.mockResolvedValue({ ...empty, goals: [goal('a', 'on_track', 'Alpha')] })
  deleteGoal.mockResolvedValue({ deleted: 'a' })
  render(<GoalsBoard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }))
  await waitFor(() => expect(deleteGoal).toHaveBeenCalledWith('a'))
  await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull())
})

test('bound goals load their data point value once and show the measure', async () => {
  const point = {
    id: 'weekly-signups',
    name: 'Weekly signups',
    source: { kind: 'metabase', card_id: 42 },
    display: 'number',
    refresh: 'daily',
    unit: 'users',
    created_at: '',
  }
  getGoals.mockResolvedValue({
    ...empty,
    goals: [
      { ...goal('a', 'on_track', 'Alpha'), data_point_id: 'weekly-signups' },
      { ...goal('b', 'on_track', 'Beta'), data_point_id: 'weekly-signups' },
      { ...goal('c', 'on_track', 'Gamma'), data_point_id: 'gone' },
    ],
  })
  getDataPoints.mockResolvedValue({ ...NO_POINTS, datapoints: [point] })
  getDataPointValue.mockResolvedValue({
    id: 'weekly-signups',
    fetched_at: '2026-01-01T00:00:00',
    columns: ['n'],
    rows: [[1234]],
    error: null,
  })
  render(<GoalsBoard />)
  await screen.findByText('Alpha')
  await waitFor(() => expect(screen.getAllByText('1,234 users · Weekly signups')).toHaveLength(2))
  expect(getDataPointValue).toHaveBeenCalledTimes(1)
  expect(getDataPointValue).toHaveBeenCalledWith('weekly-signups')
  // Gamma is bound to a deleted point: it says so; the select is back on "No data point".
  const gamma = screen.getByText('Gamma').closest('[data-goal]') as HTMLElement
  expect(within(gamma).getByTestId('goal-measure')).toHaveTextContent(
    'no value · removed data point'
  )
  expect(within(gamma).getByLabelText('Data point')).toHaveValue('')
})
