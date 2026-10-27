import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { DashboardCanvas } from '../DashboardCanvas'
import type { DataHubLayout } from '../../../types/datahub'

// Stub the tile so we test canvas wiring, not registry/rendering. It exposes
// the bound dashboard id, a pick control, and the remove control.
vi.mock('../DashboardTile', () => ({
  DashboardTile: ({
    refId,
    datapoints,
    onPick,
    onRemove,
  }: {
    refId: string | null
    datapoints: { id: string }[]
    onPick: (id: string) => void
    onRemove: () => void
  }) => (
    <div>
      <span>tile:{refId ?? 'empty'}</span>
      <span>points:{datapoints.length}</span>
      <button onClick={() => onPick('rev')}>pick</button>
      <button onClick={onRemove}>remove-tile</button>
    </div>
  ),
}))

vi.mock('../../../api', () => ({
  api: { getDataHubLayout: vi.fn(), saveDataHubLayout: vi.fn(), getDataPoints: vi.fn() },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const EMPTY: DataHubLayout = { tabs: { 'media-ads': { rows: [] } } }

beforeEach(async () => {
  vi.clearAllMocks()
  const api = await importApi()
  api.getDataPoints.mockResolvedValue({
    datapoints: [{ id: 'rev' }, { id: 'clk' }] as never,
    connector: { configured: false, missing: [] },
    kinds: [],
    displays: [],
    refreshes: [],
  })
})

describe('DashboardCanvas (Loadout)', () => {
  test('empty tab shows one big + that adds a row/tile and persists', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue(EMPTY)
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(<DashboardCanvas tabId="media-ads" />)
    await waitFor(() => expect(api.getDataHubLayout).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: /add first tile/i }))

    expect(screen.getAllByText(/^tile:/)).toHaveLength(1)
    // The tile is handed the data points the canvas loaded.
    await waitFor(() => expect(screen.getByText('points:2')).toBeInTheDocument())
    const saved = api.saveDataHubLayout.mock.calls.at(-1)![0] as DataHubLayout
    expect(saved.tabs['media-ads'].rows).toHaveLength(1)
    expect(saved.tabs['media-ads'].rows[0].tiles).toHaveLength(1)
  })

  test('the row + adds another tile to that row', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({
      tabs: {
        'media-ads': { rows: [{ id: 'row-1', tiles: [{ i: 't1', refId: 'rev', w: 6, h: 10 }] }] },
      },
    })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(<DashboardCanvas tabId="media-ads" />)
    await waitFor(() => expect(screen.getByText('tile:rev')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /add tile to row/i }))
    const saved = api.saveDataHubLayout.mock.calls.at(-1)![0] as DataHubLayout
    expect(saved.tabs['media-ads'].rows[0].tiles).toHaveLength(2)
  })

  test('picking a dashboard sets the tile refId and persists', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({
      tabs: {
        'media-ads': { rows: [{ id: 'row-1', tiles: [{ i: 't1', refId: null, w: 12, h: 10 }] }] },
      },
    })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(<DashboardCanvas tabId="media-ads" />)
    await waitFor(() => expect(screen.getByText('tile:empty')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'pick' }))
    await waitFor(() => expect(screen.getByText('tile:rev')).toBeInTheDocument())
    const saved = api.saveDataHubLayout.mock.calls.at(-1)![0] as DataHubLayout
    expect(saved.tabs['media-ads'].rows[0].tiles[0].refId).toBe('rev')
  })

  test('removing a tile persists the removal', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({
      tabs: {
        'media-ads': { rows: [{ id: 'row-1', tiles: [{ i: 't1', refId: 'rev', w: 12, h: 10 }] }] },
      },
    })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(<DashboardCanvas tabId="media-ads" />)
    await waitFor(() => expect(screen.getByText('tile:rev')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'remove-tile' }))
    await waitFor(() => expect(screen.queryByText('tile:rev')).not.toBeInTheDocument())
    const saved = api.saveDataHubLayout.mock.calls.at(-1)![0] as DataHubLayout
    // Removing the row's last tile removes the row too — no empty shells.
    expect(saved.tabs['media-ads'].rows).toHaveLength(0)
  })

  test('surfaces an error when saving the layout fails', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue(EMPTY)
    api.saveDataHubLayout.mockRejectedValue(new Error('backend down'))

    render(<DashboardCanvas tabId="media-ads" />)
    await waitFor(() => expect(api.getDataHubLayout).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: /add first tile/i }))

    // The save failed — the user must see it, not lose work silently.
    await waitFor(() =>
      expect(screen.getByText(/couldn.t save|not saved|not persisted/i)).toBeInTheDocument()
    )
  })

  test('seeds defaultRows when the tab is absent from the saved layout', async () => {
    const api = await importApi()
    // Saved layout has other tabs but not this one.
    api.getDataHubLayout.mockResolvedValue({ tabs: { 'media-ads': { rows: [] } } })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(
      <DashboardCanvas
        tabId="media-native-performance"
        defaultRows={[{ id: 'seed', tiles: [{ i: 's1', refId: 'nvm-demand', w: 12, h: 18 }] }]}
      />
    )
    await waitFor(() => expect(screen.getByText('tile:nvm-demand')).toBeInTheDocument())
    // Seeds are display-only until the user edits — nothing persisted yet.
    expect(api.saveDataHubLayout).not.toHaveBeenCalled()
  })

  test('a saved (even empty) tab overrides defaultRows — no seed re-appears', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({ tabs: { 'media-native-performance': { rows: [] } } })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)

    render(
      <DashboardCanvas
        tabId="media-native-performance"
        defaultRows={[{ id: 'seed', tiles: [{ i: 's1', refId: 'nvm-demand', w: 12, h: 18 }] }]}
      />
    )
    await waitFor(() => expect(api.getDataHubLayout).toHaveBeenCalled())
    expect(screen.queryByText('tile:nvm-demand')).not.toBeInTheDocument()
  })

  test('only renders tiles for the given tab', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({
      tabs: {
        'media-ads': { rows: [{ id: 'row-1', tiles: [{ i: 'a', refId: 'rev', w: 6, h: 8 }] }] },
        widget: { rows: [{ id: 'row-1', tiles: [{ i: 'b', refId: 'clk', w: 6, h: 8 }] }] },
      },
    })
    api.saveDataHubLayout.mockResolvedValue(EMPTY)
    render(<DashboardCanvas tabId="widget" />)
    await waitFor(() => expect(screen.getByText('tile:clk')).toBeInTheDocument())
    expect(screen.queryByText('tile:rev')).not.toBeInTheDocument()
  })
})
