import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'
import type { SetupItem } from '../../../types/setup'

const getSetupEnv = vi.fn()
const setSetupEnv = vi.fn()
const getGoals = vi.fn()
const syncGoals = vi.fn()
const addGoal = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getSetupEnv: (...a: unknown[]) => getSetupEnv(...a),
    setSetupEnv: (...a: unknown[]) => setSetupEnv(...a),
    getGoals: (...a: unknown[]) => getGoals(...a),
    syncGoals: (...a: unknown[]) => syncGoals(...a),
    addGoal: (...a: unknown[]) => addGoal(...a),
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

import { GoalsPanel } from '../GoalsPanel'

const ENV = ['ATLASSIAN_EMAIL', 'ATLASSIAN_TOKEN', 'ATLASSIAN_SUBDOMAIN', 'ATLASSIAN_CLOUD_ID']

const item: SetupItem = {
  id: 'define-goals',
  group: 'goals',
  title: 'Goals',
  why: 'why',
  writes: '.ozos/goals.json, .env (ATLASSIAN_*)',
  kind: 'goals',
  setup_doc: 'connectors/atlassian-goals/setup.md',
  vital: 'goals-sync',
  env: ENV,
  mcp_match: null,
  default_folder: null,
  status: 'not_started',
  updated_at: null,
  notes: '',
  rows: [],
  derived: null,
}

const payload = (configured: boolean) => ({
  goals: [],
  sync: null,
  connector: { configured, missing: configured ? [] : ENV },
  statuses: [],
})

beforeEach(() => {
  getSetupEnv.mockReset().mockResolvedValue({})
  getGoals.mockReset()
  syncGoals.mockReset()
  addGoal.mockReset()
})

test('renders the four env inputs and a disabled Sync now when not configured', async () => {
  getGoals.mockResolvedValue(payload(false))
  render(<GoalsPanel item={item} onChanged={() => {}} />)
  for (const name of ENV) expect(screen.getByLabelText(name)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled())
  expect(screen.getByText(/each goal can bind to a data point/i)).toBeInTheDocument()
})

test('Sync now runs the sync, reports the count and notifies the page', async () => {
  getGoals.mockResolvedValue(payload(true))
  syncGoals.mockResolvedValue({ synced: 3, sync: null })
  const onChanged = vi.fn()
  render(<GoalsPanel item={item} onChanged={onChanged} />)
  const btn = await screen.findByRole('button', { name: 'Sync now' })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
  await waitFor(() => expect(screen.getByText('Synced 3 goals.')).toBeInTheDocument())
  expect(onChanged).toHaveBeenCalled()
})

test('the add form posts a goal and notifies the page', async () => {
  getGoals.mockResolvedValue(payload(false))
  addGoal.mockResolvedValue({ id: 'first' })
  const onChanged = vi.fn()
  render(<GoalsPanel item={item} onChanged={onChanged} />)
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'First' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
  await waitFor(() =>
    expect(addGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'First' }))
  )
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
