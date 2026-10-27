import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, test, expect, beforeEach } from 'vitest'
import type { SetupItem } from '../../../types/setup'
import type { DataPoint, DataPointValue } from '../../../types/datapoints'

const getSetupEnv = vi.fn()
const setSetupEnv = vi.fn()
const getDataPoints = vi.fn()
const getDataPointValue = vi.fn()
const addDataPoint = vi.fn()
const deleteDataPoint = vi.fn()
const testMetabase = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getSetupEnv: (...a: unknown[]) => getSetupEnv(...a),
    setSetupEnv: (...a: unknown[]) => setSetupEnv(...a),
    getDataPoints: (...a: unknown[]) => getDataPoints(...a),
    getDataPointValue: (...a: unknown[]) => getDataPointValue(...a),
    addDataPoint: (...a: unknown[]) => addDataPoint(...a),
    deleteDataPoint: (...a: unknown[]) => deleteDataPoint(...a),
    testMetabase: (...a: unknown[]) => testMetabase(...a),
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

import { ApiError } from '../../../api'
import { DataPanel } from '../DataPanel'

const ENV = ['METABASE_URL', 'METABASE_API_KEY']

const item: SetupItem = {
  id: 'first-data-point',
  group: 'data',
  title: 'Data points',
  why: 'why',
  writes: '.ozos/datapoints.json, .env (METABASE_URL, METABASE_API_KEY)',
  kind: 'data',
  setup_doc: 'connectors/metabase/setup.md',
  vital: 'datapoints-refresh',
  env: ENV,
  mcp_match: null,
  default_folder: null,
  status: 'not_started',
  updated_at: null,
  notes: '',
  rows: [],
  derived: null,
}

const POINT: DataPoint = {
  id: 'weekly-signups',
  name: 'Weekly signups',
  source: { kind: 'metabase', card_id: 42 },
  display: 'number',
  refresh: 'daily',
  unit: 'users',
  created_at: '',
}

const payload = (configured: boolean, datapoints: DataPoint[] = []) => ({
  datapoints,
  connector: { configured, missing: configured ? [] : ENV },
  kinds: [],
  displays: [],
  refreshes: [],
})

const errored: DataPointValue = {
  id: 'weekly-signups',
  fetched_at: new Date().toISOString(),
  columns: [],
  rows: [],
  error: 'card 42: 403 Forbidden',
}

beforeEach(() => {
  getSetupEnv.mockReset().mockResolvedValue({})
  setSetupEnv.mockReset()
  getDataPoints.mockReset()
  getDataPointValue.mockReset()
  addDataPoint.mockReset()
  deleteDataPoint.mockReset()
  testMetabase.mockReset()
})

test('renders the two env inputs and a disabled Test connection when not configured', async () => {
  getDataPoints.mockResolvedValue(payload(false))
  render(<DataPanel item={item} onChanged={() => {}} />)
  for (const name of ENV) expect(screen.getByLabelText(name)).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
  )
  expect(await screen.findByText('No data points yet.')).toBeInTheDocument()
  expect(screen.getByText(/datapoints-refresh vital/i)).toBeInTheDocument()
})

test('Test connection reports the connected user, or the error', async () => {
  getDataPoints.mockResolvedValue(payload(true))
  testMetabase.mockResolvedValueOnce({ ok: true, message: 'Connected as pat@yourcompany.com' })
  render(<DataPanel item={item} onChanged={() => {}} />)
  const btn = await screen.findByRole('button', { name: 'Test connection' })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
  expect(await screen.findByText('Connected as pat@yourcompany.com')).toBeInTheDocument()
  testMetabase.mockRejectedValueOnce(new ApiError(502, 'Metabase request failed: 401'))
  fireEvent.click(btn)
  expect(await screen.findByText('Metabase request failed: 401')).toBeInTheDocument()
})

test('the form defines a point and notifies the page', async () => {
  getDataPoints.mockResolvedValue(payload(true))
  addDataPoint.mockResolvedValue(POINT)
  const onChanged = vi.fn()
  render(<DataPanel item={item} onChanged={onChanged} />)
  await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
  await userEvent.type(screen.getByLabelText('Card id'), '42')
  await userEvent.click(screen.getByRole('button', { name: 'Define data point' }))
  await waitFor(() =>
    expect(addDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Weekly signups', source: { kind: 'metabase', card_id: 42 } })
    )
  )
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

test('lists existing points with their last fetch or error, and deletes one', async () => {
  getDataPoints.mockResolvedValue(payload(true, [POINT]))
  getDataPointValue.mockResolvedValue(errored)
  deleteDataPoint.mockResolvedValue({ deleted: 'weekly-signups' })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const onChanged = vi.fn()
  render(<DataPanel item={item} onChanged={onChanged} />)
  expect(await screen.findByText('Weekly signups')).toBeInTheDocument()
  expect(screen.getByText('Metabase')).toBeInTheDocument()
  expect(screen.getByText('number · daily')).toBeInTheDocument()
  expect(await screen.findByText('card 42: 403 Forbidden')).toBeInTheDocument()
  expect(getDataPointValue).toHaveBeenCalledWith('weekly-signups')
  await userEvent.click(screen.getByRole('button', { name: 'Delete Weekly signups' }))
  expect(deleteDataPoint).toHaveBeenCalledWith('weekly-signups')
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
