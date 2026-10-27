import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ReportingCanvas } from '../ReportingCanvas'
import type { ReportLayout } from '../../../types/reporting'

// Stub the feed widget so we test canvas wiring, not data fetching. It exposes
// the bound source id and a remove control (the LoadoutCanvas onRemove helper).
vi.mock('../ReportFeed', () => ({
  ReportFeed: ({ sourceId, onRemove }: { sourceId: string; onRemove?: () => void }) => (
    <div>
      <span>feed:{sourceId}</span>
      <button onClick={onRemove}>remove-widget</button>
    </div>
  ),
}))

vi.mock('../../../api', () => ({
  api: { getReportLayout: vi.fn(), saveReportLayout: vi.fn(), getReportSources: vi.fn() },
}))

const SOURCES = [
  { id: 'daily-digest', label: 'Daily Digest', kind: 'script', body: 'markdown', runnable: true },
  {
    id: 'meeting-notes',
    label: 'Meeting Notes',
    kind: 'archive',
    body: 'markdown',
    runnable: false,
  },
]

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const ONE: ReportLayout = {
  rows: [{ id: 'row-1', tiles: [{ i: 'w1', refId: 'daily-digest', w: 6, h: 10 }] }],
}
const EMPTY: ReportLayout = { rows: [] }
const EMPTY_TILE: ReportLayout = {
  rows: [{ id: 'row-1', tiles: [{ i: 'e1', refId: null, w: 6, h: 10 }] }],
}

async function mount(layout: ReportLayout) {
  const api = await importApi()
  api.getReportLayout.mockResolvedValue(layout)
  api.saveReportLayout.mockResolvedValue(layout)
  api.getReportSources.mockResolvedValue(SOURCES)
  render(<ReportingCanvas />)
  return api
}

beforeEach(() => vi.clearAllMocks())

describe('ReportingCanvas (Loadout)', () => {
  test('renders a feed for each source-bound tile', async () => {
    await mount(ONE)
    expect(await screen.findByText('feed:daily-digest')).toBeInTheDocument()
  })

  test('empty canvas shows one big + that adds the first row and saves', async () => {
    const api = await mount(EMPTY)
    const add = await screen.findByRole('button', { name: /add first tile/i })
    await userEvent.click(add)

    await waitFor(() => expect(api.saveReportLayout).toHaveBeenCalled())
    const saved = api.saveReportLayout.mock.calls.at(-1)![0]
    expect(saved.rows).toHaveLength(1)
    expect(saved.rows[0].tiles).toHaveLength(1)
    expect(saved.rows[0].tiles[0].refId).toBeNull()
  })

  test('an empty tile shows the source picker; choosing one binds it and saves', async () => {
    const api = await mount(EMPTY_TILE)
    await userEvent.click(await screen.findByRole('button', { name: /meeting notes/i }))

    await waitFor(() => expect(api.saveReportLayout).toHaveBeenCalled())
    const saved = api.saveReportLayout.mock.calls.at(-1)![0]
    expect(saved.rows[0].tiles[0].refId).toBe('meeting-notes')
  })

  test('the row + adds another (empty) tile to that row and saves', async () => {
    const api = await mount(ONE)
    await screen.findByText('feed:daily-digest')
    await userEvent.click(screen.getByRole('button', { name: /add tile to row/i }))

    await waitFor(() => expect(api.saveReportLayout).toHaveBeenCalled())
    const saved = api.saveReportLayout.mock.calls.at(-1)![0]
    expect(saved.rows[0].tiles).toHaveLength(2)
    expect(saved.rows[0].tiles.at(-1)!.refId).toBeNull()
  })

  test('Add row appends a new row and saves', async () => {
    const api = await mount(ONE)
    await screen.findByText('feed:daily-digest')
    await userEvent.click(screen.getByRole('button', { name: /add row/i }))

    await waitFor(() => expect(api.saveReportLayout).toHaveBeenCalled())
    const saved = api.saveReportLayout.mock.calls.at(-1)![0]
    expect(saved.rows).toHaveLength(2)
  })

  test('removing the last tile drops its row from the saved layout', async () => {
    const api = await mount(ONE)
    await screen.findByText('feed:daily-digest')
    await userEvent.click(screen.getByRole('button', { name: /remove-widget/i }))

    await waitFor(() => expect(api.saveReportLayout).toHaveBeenCalled())
    const saved = api.saveReportLayout.mock.calls.at(-1)![0]
    // Removing the row's last tile removes the row too — no empty shells.
    expect(saved.rows).toHaveLength(0)
  })
})
