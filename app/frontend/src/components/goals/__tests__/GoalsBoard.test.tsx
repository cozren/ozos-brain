import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'
import type { Goal, GoalsPayload } from '../../../types/goals'

const getGoals = vi.fn()
const syncGoals = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getGoals: (...a: unknown[]) => getGoals(...a),
    syncGoals: (...a: unknown[]) => syncGoals(...a),
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

beforeEach(() => {
  getGoals.mockReset()
  syncGoals.mockReset()
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
