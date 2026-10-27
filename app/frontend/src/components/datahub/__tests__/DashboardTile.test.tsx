import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { DashboardTile } from '../DashboardTile'
import { DASHBOARDS } from '../dashboards/registry'

// These tests drive a controlled registry. The real registry ships with
// dashboards registered (e.g. GAM Revenue Forecast), so clear it before each
// test to isolate from whatever is registered for real.
beforeEach(() => {
  DASHBOARDS.length = 0
})
afterEach(() => {
  DASHBOARDS.length = 0
})

describe('DashboardTile', () => {
  test('empty tile shows a collapsible picker; expanding a category reveals its boards', async () => {
    DASHBOARDS.push({ id: 'rev', label: 'Revenue', Component: () => <div>REV</div> })
    const onPick = vi.fn()
    render(<DashboardTile dashboardId={null} onPick={onPick} onRemove={() => {}} />)
    // Collapsed by default: the board is hidden until its category is expanded.
    expect(screen.queryByRole('button', { name: 'Revenue' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Other/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Revenue' }))
    expect(onPick).toHaveBeenCalledWith('rev')
  })

  test('picker lists category sections collapsed, in canonical order', () => {
    DASHBOARDS.push({ id: 'a', label: 'Ads Thing', category: 'Media Ads', Component: () => null })
    DASHBOARDS.push({ id: 'b', label: 'Widget Thing', category: 'Widget', Component: () => null })
    render(<DashboardTile dashboardId={null} onPick={() => {}} onRemove={() => {}} />)

    const mediaHeading = screen.getByRole('button', { name: /Media Ads/i })
    const widgetHeading = screen.getByRole('button', { name: /Widget/i })
    // Media Ads section is rendered before the Widget section.
    expect(
      mediaHeading.compareDocumentPosition(widgetHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // Collapsed by default: board buttons are not rendered yet.
    expect(screen.queryByRole('button', { name: 'Ads Thing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Widget Thing' })).not.toBeInTheDocument()
  })

  test('renders the dashboard component when one is selected', () => {
    DASHBOARDS.push({ id: 'rev', label: 'Revenue', Component: () => <div>REV BODY</div> })
    render(<DashboardTile dashboardId="rev" onPick={() => {}} onRemove={() => {}} />)
    expect(screen.getByText('REV BODY')).toBeInTheDocument()
  })

  test('renders an iframe for an embed dashboard', () => {
    DASHBOARDS.push({ id: 'mb', label: 'Metabase', embedUrl: 'https://example.com/d/1' })
    render(<DashboardTile dashboardId="mb" onPick={() => {}} onRemove={() => {}} />)
    const frame = screen.getByTitle('Metabase') as HTMLIFrameElement
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.src).toContain('example.com/d/1')
  })

  test('unknown dashboardId shows a placeholder, not a crash', () => {
    render(<DashboardTile dashboardId="ghost" onPick={() => {}} onRemove={() => {}} />)
    expect(
      screen.getByText(/unknown dashboard/i, { selector: '.datahub-tile__placeholder' })
    ).toBeInTheDocument()
    // header (outside the body placeholder) shows the generic label, not the raw id
    expect(screen.getByText('Unknown dashboard')).toBeInTheDocument()
    expect(screen.queryByText('ghost')).not.toBeInTheDocument()
  })

  test('remove button fires onRemove', async () => {
    DASHBOARDS.push({ id: 'rev', label: 'Revenue', Component: () => <div>REV</div> })
    const onRemove = vi.fn()
    render(<DashboardTile dashboardId="rev" onPick={() => {}} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
