import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import type { DataPoint } from '../../types/datapoints'
import { DataHub } from '../DataHub'

vi.mock('../../api', () => ({
  api: {
    getDataHubLayout: vi.fn(),
    saveDataHubLayout: vi.fn(),
    getDataPoints: vi.fn(),
    addDataPoint: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

// Stub the canvas: report which tab it was handed and every mount (the page
// must remount it per tab so it reloads the saved layout).
const mounts: string[] = []
vi.mock('../../components/datahub/DashboardCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    DashboardCanvas: ({ tabId }: { tabId: string }) => {
      useEffect(() => {
        mounts.push(tabId)
      }, [tabId])
      return <div>canvas:{tabId}</div>
    },
  }
})

async function importApi() {
  const mod = await import('../../api')
  return vi.mocked(mod.api)
}

const POINT: DataPoint = {
  id: 'weekly-signups',
  name: 'Weekly signups',
  source: { kind: 'csv', path: 'data/signups.csv', column: null },
  display: 'number',
  refresh: 'manual',
  unit: '',
  created_at: '',
}

const points = (datapoints: DataPoint[]) => ({
  datapoints,
  connector: { configured: false, missing: ['METABASE_URL'] },
  kinds: [],
  displays: [],
  refreshes: [],
})

beforeEach(async () => {
  localStorage.clear()
  mounts.length = 0
  const api = await importApi()
  api.getDataPoints.mockReset().mockResolvedValue(points([]))
  api.saveDataHubLayout.mockReset()
  api.addDataPoint.mockReset()
})

describe('DataHub', () => {
  test('without data points: the empty state offers to define the first one', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({ tabs: {}, pickerFolders: {} })
    api.addDataPoint.mockResolvedValue(POINT)
    render(<DataHub />)
    expect(screen.getByRole('heading', { name: /data hub/i })).toBeInTheDocument()
    expect(await screen.findByText(/no data points yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Define your first data point' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'csv')
    await userEvent.type(screen.getByLabelText('File (relative to the vault)'), 'data/signups.csv')
    api.getDataPoints.mockResolvedValue(points([POINT]))
    await userEvent.click(screen.getByRole('button', { name: 'Define data point' }))
    expect(api.addDataPoint).toHaveBeenCalledTimes(1)
    // Reloaded: there is a point now but still no tab.
    expect(await screen.findByText('Add a tab to place your data points.')).toBeInTheDocument()
  })

  test('with data points but no tabs: Add tab creates and selects the tab', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({ tabs: {}, pickerFolders: {} })
    api.getDataPoints.mockResolvedValue(points([POINT]))
    api.saveDataHubLayout.mockResolvedValue({ tabs: { growth: { rows: [] } }, pickerFolders: {} })
    render(<DataHub />)
    expect(await screen.findByText('Add a tab to place your data points.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add tab' }))
    await userEvent.type(screen.getByLabelText('Tab name'), 'growth{Enter}')
    await waitFor(() => expect(api.saveDataHubLayout).toHaveBeenCalledTimes(1))
    expect(api.saveDataHubLayout.mock.calls[0][0]).toEqual({
      tabs: { growth: { rows: [] } },
      pickerFolders: {},
    })
    expect(await screen.findByRole('tab', { name: /^growth$/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('canvas:growth')).toBeInTheDocument()
  })

  test('renders one tab per saved tab, the canvas for the first, and an Add tab control', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({
      tabs: { growth: { rows: [] }, retention: { rows: [] } },
      pickerFolders: {},
    })
    render(<DataHub />)
    expect(await screen.findByRole('tab', { name: /^growth$/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: /^retention$/i })).toBeInTheDocument()
    expect(screen.getByText('canvas:growth')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tab' })).toBeInTheDocument()
  })

  test('a blank or duplicate tab name is ignored', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({ tabs: { growth: { rows: [] } }, pickerFolders: {} })
    render(<DataHub />)
    await screen.findByRole('tab', { name: /^growth$/i })
    await userEvent.click(screen.getByRole('button', { name: 'Add tab' }))
    await userEvent.type(screen.getByLabelText('Tab name'), '   {Enter}')
    await userEvent.type(screen.getByLabelText('Tab name'), 'growth{Enter}')
    expect(api.saveDataHubLayout).not.toHaveBeenCalled()
  })

  test('shows the empty state when the layout cannot be loaded', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockRejectedValue(new Error('boom'))
    render(<DataHub />)
    expect(await screen.findByText(/no data points yet/i)).toBeInTheDocument()
  })
})

test('Add tab re-reads the saved layout first, so a tile the canvas saved survives', async () => {
  const api = await importApi()
  const tile = { i: 't1', refId: 'weekly-signups', w: 6, h: 10 }
  api.getDataHubLayout
    .mockResolvedValueOnce({ tabs: { growth: { rows: [] } }, pickerFolders: {} })
    .mockResolvedValueOnce({
      tabs: { growth: { rows: [{ id: 'row-1', tiles: [tile] }] } },
      pickerFolders: { CSV: [] },
    })
  api.saveDataHubLayout.mockImplementation((l) => Promise.resolve(l))
  render(<DataHub />)
  await screen.findByRole('tab', { name: /^growth$/i })
  await userEvent.click(screen.getByRole('button', { name: 'Add tab' }))
  await userEvent.type(screen.getByLabelText('Tab name'), 'retention{Enter}')
  await waitFor(() => expect(api.saveDataHubLayout).toHaveBeenCalledTimes(1))
  expect(api.saveDataHubLayout.mock.calls[0][0]).toEqual({
    tabs: { growth: { rows: [{ id: 'row-1', tiles: [tile] }] }, retention: { rows: [] } },
    pickerFolders: { CSV: [] },
  })
  expect(await screen.findByRole('tab', { name: /^retention$/i })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

test('switching tabs remounts the canvas so it reloads the layout', async () => {
  const api = await importApi()
  api.getDataHubLayout.mockResolvedValue({
    tabs: { growth: { rows: [] }, retention: { rows: [] } },
    pickerFolders: {},
  })
  render(<DataHub />)
  await screen.findByText('canvas:growth')
  await userEvent.click(screen.getByRole('tab', { name: /^retention$/i }))
  await screen.findByText('canvas:retention')
  await userEvent.click(screen.getByRole('tab', { name: /^growth$/i }))
  await screen.findByText('canvas:growth')
  expect(mounts).toEqual(['growth', 'retention', 'growth'])
})
