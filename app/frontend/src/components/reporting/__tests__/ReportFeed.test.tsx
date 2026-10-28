import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ReportFeed } from '../ReportFeed'
import type { ReportSource, ReportInstanceMeta, ReportInstance } from '../../../types/reporting'

vi.mock('../../../api', () => ({
  api: {
    getReportSources: vi.fn(),
    getReportInstances: vi.fn(),
    getReportInstance: vi.fn(),
    runReportSource: vi.fn(),
    getReportRunStatus: vi.fn(),
  },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const SOURCE: ReportSource = {
  id: 'daily-digest',
  label: 'Daily Digest',
  kind: 'script',
  body: 'markdown',
  runnable: true,
}

const INSTANCES: ReportInstanceMeta[] = [
  { id: 'digest-2026-06-17.md', date: '2026-06-17', label: 'Jun 17, 2026', age: 'today' },
  { id: 'digest-2026-06-16.md', date: '2026-06-16', label: 'Jun 16, 2026', age: 'yesterday' },
]

const longBody =
  '## Digest Heading\n\n' +
  Array.from({ length: 14 }, (_, i) => `- item ${i}`).join('\n') +
  '\n\nDEEP_MARKER_TEXT'

const LATEST: ReportInstance = {
  id: 'digest-2026-06-17.md',
  date: '2026-06-17',
  label: 'Jun 17, 2026',
  body: 'markdown',
  content: longBody,
}

const OLDER: ReportInstance = {
  id: 'digest-2026-06-16.md',
  date: '2026-06-16',
  label: 'Jun 16, 2026',
  body: 'markdown',
  content: '## Older digest\n\nOLDER_MARKER_TEXT',
}

beforeEach(() => vi.clearAllMocks())

describe('ReportFeed', () => {
  test('renders the latest report by default', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValue(LATEST)

    render(<ReportFeed sourceId="daily-digest" />)

    expect(await screen.findByText('Daily Digest')).toBeInTheDocument()
    expect(await screen.findByText('item 0')).toBeInTheDocument()
    expect(api.getReportInstance).toHaveBeenCalledWith('daily-digest', 'latest')
  })

  test('the tile shows a truncated preview; Expand opens a modal with the full report', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValue(LATEST)

    render(<ReportFeed sourceId="daily-digest" />)
    await screen.findByText('item 0')

    // In the tile the deep marker is truncated out of the preview, and the old
    // in-tile "Full report" toggle is gone — expanding is a modal now.
    expect(screen.queryByText('DEEP_MARKER_TEXT')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /full report/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('DEEP_MARKER_TEXT')).toBeInTheDocument()
  })

  test('the expand modal can be closed', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValue(LATEST)

    render(<ReportFeed sourceId="daily-digest" />)
    await screen.findByText('item 0')

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('selecting an older report from history loads it', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValueOnce(LATEST).mockResolvedValueOnce(OLDER)

    render(<ReportFeed sourceId="daily-digest" />)
    await screen.findByText('item 0')

    await userEvent.selectOptions(screen.getByLabelText(/history/i), 'digest-2026-06-16.md')

    expect(await screen.findByText('OLDER_MARKER_TEXT')).toBeInTheDocument()
    expect(api.getReportInstance).toHaveBeenLastCalledWith('daily-digest', 'digest-2026-06-16.md')
  })

  test('Run now triggers a run and reloads when finished', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValue(LATEST)
    api.runReportSource.mockResolvedValue({ state: 'started' })
    api.getReportRunStatus.mockResolvedValue({ state: 'idle', last_run: null, last_exit: 0 })

    render(<ReportFeed sourceId="daily-digest" pollIntervalMs={5} />)
    await screen.findByText('item 0')

    await userEvent.click(screen.getByRole('button', { name: /run now/i }))

    await waitFor(() => expect(api.runReportSource).toHaveBeenCalledWith('daily-digest'))
    await waitFor(() => expect(api.getReportRunStatus).toHaveBeenCalled())
    // instances re-fetched after completion (once on mount + once after run)
    await waitFor(() => expect(api.getReportInstances.mock.calls.length).toBeGreaterThan(1))
  })

  test('renders a chart instead of markdown when the body is "chart"', async () => {
    const api = await importApi()
    const chartSource: ReportSource = {
      id: 'sample-report',
      label: 'Sample Revenue (Monthly)',
      kind: 'script',
      body: 'chart',
      runnable: true,
    }
    const chartInstance: ReportInstance = {
      id: 'sample-report-2026-06-25.json',
      date: '2026-06-25',
      label: 'Jun 25, 2026',
      body: 'chart',
      content: JSON.stringify({
        metric: 'Sample Revenue (Monthly)',
        currency: 'EUR',
        year: 2026,
        generated_at: '2026-06-25',
        series: [{ month: '2026-01', revenue: 201468.36 }],
        ytd_total: 201468.36,
      }),
    }
    api.getReportSources.mockResolvedValue([chartSource])
    api.getReportInstances.mockResolvedValue([
      { id: chartInstance.id, date: '2026-06-25', label: 'Jun 25, 2026', age: 'today' },
    ])
    api.getReportInstance.mockResolvedValue(chartInstance)

    render(<ReportFeed sourceId="sample-report" />)

    expect(await screen.findByTestId('revenue-chart')).toBeInTheDocument()
    expect(screen.getByText(/YTD/)).toBeInTheDocument()
  })

  test('renders the Industry Pulse widget when the body is "industry-pulse"', async () => {
    const api = await importApi()
    const pulseSource: ReportSource = {
      id: 'industry-pulse',
      label: 'Industry Pulse',
      kind: 'archive',
      body: 'industry-pulse',
      runnable: false,
    }
    const pulseInstance: ReportInstance = {
      id: 'industry-pulse-2026-06-28.json',
      date: '2026-06-28',
      label: 'Jun 28, 2026',
      body: 'industry-pulse',
      content: JSON.stringify({
        generated_at: '2026-06-28',
        summary: {
          searched: 'Vinted, Depop (24-48h)',
          found: 5,
          dropped: 1,
          strongest_signal: 'PULSE_SIGNAL_MARKER',
          clusters_represented: ['C2C platforms'],
          gaps: '',
          confession: [],
        },
        posts: [
          {
            n: 1,
            template: 'A',
            template_name: 'The sharp take',
            cluster: 'C2C platforms',
            source_outlet: 'TechCrunch',
            source_date: '2d ago',
            source_url: 'https://techcrunch.com/x',
            url_verified: true,
            text: 'A post.',
            scoring: { confidence: 'High', post_worthiness: 'Strong', freshness: 'Breaking' },
          },
        ],
      }),
    }
    api.getReportSources.mockResolvedValue([pulseSource])
    api.getReportInstances.mockResolvedValue([
      { id: pulseInstance.id, date: '2026-06-28', label: 'Jun 28, 2026', age: 'today' },
    ])
    api.getReportInstance.mockResolvedValue(pulseInstance)

    render(<ReportFeed sourceId="industry-pulse" />)

    expect(await screen.findByText(/PULSE_SIGNAL_MARKER/)).toBeInTheDocument()
    expect(screen.getByTestId('pulse-post')).toBeInTheDocument()
  })

  test('Share button is present but disabled', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue(INSTANCES)
    api.getReportInstance.mockResolvedValue(LATEST)

    render(<ReportFeed sourceId="daily-digest" />)
    await screen.findByText('item 0')

    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled()
  })
})

describe('ReportFeed on a fresh vault', () => {
  test('shows an empty state and never asks for "latest" when a source has no instances', async () => {
    const api = await importApi()
    api.getReportSources.mockResolvedValue([SOURCE])
    api.getReportInstances.mockResolvedValue([])
    api.getReportInstance.mockRejectedValue(new Error('Load report failed: 404'))

    render(<ReportFeed sourceId="daily-digest" />)

    expect(await screen.findByText('No Daily Digest yet')).toBeInTheDocument()
    expect(api.getReportInstance).not.toHaveBeenCalled()
    expect(screen.queryByText(/Load report failed/)).toBeNull()
  })
})
