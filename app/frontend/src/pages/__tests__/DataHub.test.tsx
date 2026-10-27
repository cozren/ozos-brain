import { render, screen } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { DataHub } from '../DataHub'

vi.mock('../../api', () => ({
  api: {
    getDataHubLayout: vi.fn(),
  },
}))

// Stub the canvas: report which tab it was handed.
vi.mock('../../components/datahub/DashboardCanvas', () => ({
  DashboardCanvas: ({ tabId }: { tabId: string }) => <div>canvas:{tabId}</div>,
}))

async function importApi() {
  const mod = await import('../../api')
  return vi.mocked(mod.api)
}

beforeEach(() => {
  localStorage.clear()
})

describe('DataHub', () => {
  test('renders the empty state when the layout has no tabs', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockResolvedValue({ tabs: {}, pickerFolders: {} })
    render(<DataHub />)
    expect(screen.getByRole('heading', { name: /data hub/i })).toBeInTheDocument()
    expect(await screen.findByText(/no data points yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  test('renders one tab per saved tab and the canvas for the first', async () => {
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
  })

  test('shows the empty state when the layout cannot be loaded', async () => {
    const api = await importApi()
    api.getDataHubLayout.mockRejectedValue(new Error('boom'))
    render(<DataHub />)
    expect(await screen.findByText(/no data points yet/i)).toBeInTheDocument()
  })
})
