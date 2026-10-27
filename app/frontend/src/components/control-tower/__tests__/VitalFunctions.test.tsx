import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VitalFunctions } from '../VitalFunctions'
import { api } from '../../../api'
import type { VitalFunction } from '../../../types/control-tower'

vi.mock('../../../api', () => ({
  api: { getVitalDetail: vi.fn(), runVital: vi.fn(), getVitalRunStatus: vi.fn() },
}))

const mockApi = api as unknown as {
  getVitalDetail: ReturnType<typeof vi.fn>
  runVital: ReturnType<typeof vi.fn>
  getVitalRunStatus: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.runVital.mockResolvedValue({ state: 'started' })
  mockApi.getVitalRunStatus.mockResolvedValue({ state: 'idle', last_run: null, last_exit: 0 })
})

const vital = (over: Partial<VitalFunction> = {}): VitalFunction => ({
  id: 'meeting-notes',
  name: 'meeting-notes',
  status: 'ok',
  metric: '2 new',
  lastRunHuman: '3h ago',
  lastRunIso: '2026-06-17T10:00:00+00:00',
  delta: '+2',
  badge: 'SYNCED',
  ...over,
})

test('renders each vital row', () => {
  render(<VitalFunctions vitals={[vital(), vital({ id: 'daily-digest', name: 'daily-digest' })]} />)
  expect(screen.getByText('meeting-notes')).toBeInTheDocument()
  expect(screen.getByText('daily-digest')).toBeInTheDocument()
})

test('clicking a row fetches its detail and opens the popover', async () => {
  ;(api.getVitalDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'meeting-notes',
    lastRunIso: '2026-06-17T10:00:00+00:00',
    lastRunHuman: '3h ago',
    delta: '+2',
    items: ['Robin weekly'],
  })

  render(<VitalFunctions vitals={[vital()]} />)
  fireEvent.click(screen.getByText('meeting-notes'))

  await waitFor(() => expect(api.getVitalDetail).toHaveBeenCalledWith('meeting-notes'))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('renders a sync button for each vital row', () => {
  render(<VitalFunctions vitals={[vital(), vital({ id: 'daily-digest', name: 'daily-digest' })]} />)
  expect(screen.getByRole('button', { name: /sync meeting-notes/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /sync daily-digest/i })).toBeInTheDocument()
})

test('clicking sync triggers the run and shows a synced status line', async () => {
  const onRefresh = vi.fn()
  render(<VitalFunctions vitals={[vital()]} pollIntervalMs={1} onRefresh={onRefresh} />)

  fireEvent.click(screen.getByRole('button', { name: /sync meeting-notes/i }))

  await waitFor(() => expect(api.runVital).toHaveBeenCalledWith('meeting-notes'))
  expect(await screen.findByText(/synced/i)).toBeInTheDocument()
  await waitFor(() => expect(onRefresh).toHaveBeenCalled())
})

test('a failed run shows the failure reason', async () => {
  mockApi.getVitalRunStatus.mockResolvedValue({
    state: 'error',
    last_run: null,
    last_exit: 2,
    error: 'TimeoutError: timed out',
  })
  render(<VitalFunctions vitals={[vital()]} pollIntervalMs={1} />)

  fireEvent.click(screen.getByRole('button', { name: /sync meeting-notes/i }))

  expect(await screen.findByText(/failed/i)).toBeInTheDocument()
  expect(screen.getByText(/TimeoutError: timed out/)).toBeInTheDocument()
})

test('clicking sync does not open the detail popover', async () => {
  render(<VitalFunctions vitals={[vital()]} pollIntervalMs={1} />)

  fireEvent.click(screen.getByRole('button', { name: /sync meeting-notes/i }))

  await waitFor(() => expect(api.runVital).toHaveBeenCalled())
  expect(api.getVitalDetail).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
