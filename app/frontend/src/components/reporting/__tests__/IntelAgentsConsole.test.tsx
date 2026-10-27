import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { IntelAgentsConsole } from '../IntelAgentsConsole'
import type { IntelAgent, AgentReportMeta, AgentReport } from '../../../types/reporting'

vi.mock('../../../api', () => ({
  api: {
    listAgents: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    getAgentReports: vi.fn(),
    getAgentReport: vi.fn(),
    runAgent: vi.fn(),
    agentRunStatus: vi.fn(),
    setReportStar: vi.fn(),
  },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const LINKEDIN_AGENT: IntelAgent = {
  id: 'shopping-marketplace-pulse',
  name: 'Shopping & Marketplace Pulse',
  purpose: 'linkedin',
  voice: 'me',
  focus: 'C2C commerce',
  keywords: ['Vinted', 'resale'],
  sources_prefer: ['TechCrunch'],
  sources_avoid: [],
  searches_per_run: 6,
  enabled: true,
  created_at: '2026-07-01',
}

const RESEARCH_AGENT: IntelAgent = {
  id: 'agentic-shopping-brief',
  name: 'Agentic Shopping Brief',
  purpose: 'research',
  voice: 'research',
  focus: 'agentic shopping',
  keywords: ['agents'],
  sources_prefer: [],
  sources_avoid: [],
  searches_per_run: 5,
  enabled: true,
  created_at: '2026-07-01',
}

const LINKEDIN_REPORTS: AgentReportMeta[] = [
  {
    id: 'shopping-marketplace-pulse-2026-07-01.json',
    date: '2026-07-01',
    label: 'Jul 1, 2026',
    age: 'today',
    starred: false,
  },
  {
    id: 'shopping-marketplace-pulse-2026-06-30.json',
    date: '2026-06-30',
    label: 'Jun 30, 2026',
    age: 'yesterday',
    starred: true,
  },
]

const LINKEDIN_CONTENT = JSON.stringify({
  generated_at: '2026-07-01',
  purpose: 'linkedin',
  summary: {
    searched: 'Vinted (24h)',
    found: 5,
    dropped: 1,
    strongest_signal: 'LINKEDIN_SIGNAL_MARKER',
    clusters_represented: ['C2C platforms'],
    gaps: '',
    confession: [],
  },
  posts: ['A', 'B', 'C', 'D'].map((template, i) => ({
    n: i + 1,
    template,
    template_name: `Template ${template}`,
    cluster: 'C2C platforms',
    source_outlet: 'TechCrunch',
    source_date: '2d ago',
    source_url: 'https://techcrunch.com/x',
    url_verified: true,
    text: `Post ${i + 1} body text goes here and is long enough to count as prose content.`,
    scoring: { confidence: 'High', post_worthiness: 'Strong', freshness: 'Breaking' },
  })),
})

const LINKEDIN_LATEST: AgentReport = {
  id: 'shopping-marketplace-pulse-2026-07-01.json',
  date: '2026-07-01',
  label: 'Jul 1, 2026',
  purpose: 'linkedin',
  starred: false,
  content: LINKEDIN_CONTENT,
}

const RESEARCH_REPORTS: AgentReportMeta[] = [
  {
    id: 'agentic-shopping-brief-2026-07-01.json',
    date: '2026-07-01',
    label: 'Jul 1, 2026',
    age: 'today',
    starred: false,
  },
]

const RESEARCH_CONTENT = JSON.stringify({
  generated_at: '2026-07-01',
  purpose: 'research',
  summary: {
    searched: 'agentic shopping',
    found: 4,
    dropped: 1,
    strongest_signal: 'RESEARCH_SIGNAL_MARKER',
    clusters_represented: ['AI & shopping'],
    gaps: '',
    confession: [],
  },
  article: {
    title: 'The Agentic Shopping Shift',
    tldr: 'A one-paragraph summary.',
    sections: [{ heading: 'RESEARCH_SECTION_MARKER', body: 'Body text.' }],
    sources: [
      { outlet: 'Reuters', date: '2d ago', url: 'https://reuters.com/x', url_verified: true },
    ],
  },
})

const RESEARCH_LATEST: AgentReport = {
  id: 'agentic-shopping-brief-2026-07-01.json',
  date: '2026-07-01',
  label: 'Jul 1, 2026',
  purpose: 'research',
  starred: false,
  content: RESEARCH_CONTENT,
}

/** Default: two agents, linkedin selected first, its latest report loaded. */
async function mountDefault() {
  const api = await importApi()
  api.listAgents.mockResolvedValue([LINKEDIN_AGENT, RESEARCH_AGENT])
  api.getAgentReports.mockResolvedValue(LINKEDIN_REPORTS)
  api.getAgentReport.mockResolvedValue(LINKEDIN_LATEST)
  api.agentRunStatus.mockResolvedValue({ state: 'idle', last_run: null, last_exit: 0 })
  return api
}

beforeEach(() => vi.clearAllMocks())

describe('IntelAgentsConsole', () => {
  test('loads agents and renders the first agent latest report (4 linkedin post cards)', async () => {
    await mountDefault()
    render(<IntelAgentsConsole />)

    expect(await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByTestId('pulse-post')).toHaveLength(4))
  })

  test('switching the agent picker loads the other agent report', async () => {
    const api = await mountDefault()
    // second agent returns research report set
    api.getAgentReports
      .mockResolvedValueOnce(LINKEDIN_REPORTS)
      .mockResolvedValueOnce(RESEARCH_REPORTS)
    api.getAgentReport.mockResolvedValueOnce(LINKEDIN_LATEST).mockResolvedValueOnce(RESEARCH_LATEST)

    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    await userEvent.selectOptions(screen.getByLabelText(/select agent/i), 'agentic-shopping-brief')

    expect(await screen.findByText('RESEARCH_SECTION_MARKER')).toBeInTheDocument()
  })

  test('new-agent form submits the correct payload to createAgent', async () => {
    const api = await mountDefault()
    api.createAgent.mockResolvedValue({
      ...RESEARCH_AGENT,
      id: 'new-topic',
      name: 'New Topic',
    })

    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    await userEvent.click(screen.getByRole('button', { name: /new agent/i }))

    await userEvent.type(screen.getByLabelText(/^name/i), 'New Topic')
    await userEvent.selectOptions(screen.getByLabelText(/purpose/i), 'research')
    await userEvent.selectOptions(screen.getByLabelText(/voice/i), 'executive')
    await userEvent.type(screen.getByLabelText(/focus/i), 'quantum retail')
    await userEvent.type(screen.getByLabelText(/keywords/i), 'foo, bar')

    await userEvent.click(screen.getByRole('button', { name: /create agent/i }))

    await waitFor(() => expect(api.createAgent).toHaveBeenCalledTimes(1))
    const payload = api.createAgent.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'New Topic',
      purpose: 'research',
      voice: 'executive',
      focus: 'quantum retail',
      keywords: ['foo', 'bar'],
    })
  })

  test('toggling a star calls setReportStar', async () => {
    const api = await mountDefault()
    api.setReportStar.mockResolvedValue({ starred: true })

    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    await userEvent.click(screen.getByRole('button', { name: /star/i }))

    await waitFor(() =>
      expect(api.setReportStar).toHaveBeenCalledWith(
        'shopping-marketplace-pulse',
        'shopping-marketplace-pulse-2026-07-01.json',
        true
      )
    )
  })

  test('starred-only filter narrows the history list', async () => {
    await mountDefault()
    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    const history = screen.getByTestId('agent-history')
    // both reports visible before filtering
    expect(within(history).getByText('Jul 1, 2026')).toBeInTheDocument()
    expect(within(history).getByText('Jun 30, 2026')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/starred only/i))

    // only the starred (Jun 30) report remains
    await waitFor(() => expect(within(history).queryByText('Jul 1, 2026')).not.toBeInTheDocument())
    expect(within(history).getByText('Jun 30, 2026')).toBeInTheDocument()
  })

  test('search box filters the history by label', async () => {
    await mountDefault()
    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    const history = screen.getByTestId('agent-history')
    await userEvent.type(screen.getByLabelText(/search history/i), 'Jun 30')

    await waitFor(() => expect(within(history).queryByText('Jul 1, 2026')).not.toBeInTheDocument())
    expect(within(history).getByText('Jun 30, 2026')).toBeInTheDocument()
  })

  test('Run now calls runAgent and begins polling', async () => {
    const api = await mountDefault()
    api.runAgent.mockResolvedValue({ state: 'started' })
    api.agentRunStatus.mockResolvedValue({ state: 'idle', last_run: null, last_exit: 0 })

    render(<IntelAgentsConsole pollIntervalMs={5} />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    await userEvent.click(screen.getByRole('button', { name: /run now/i }))

    await waitFor(() => expect(api.runAgent).toHaveBeenCalledWith('shopping-marketplace-pulse'))
    await waitFor(() => expect(api.agentRunStatus).toHaveBeenCalled())
  })

  test('Expand opens a full-size read-only modal of the report', async () => {
    await mountDefault()
    render(<IntelAgentsConsole />)
    await screen.findByText(/LINKEDIN_SIGNAL_MARKER/)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))

    const modal = await screen.findByRole('dialog')
    expect(within(modal).getByText(/LINKEDIN_SIGNAL_MARKER/)).toBeInTheDocument()
  })

  test('renders a research report via the research renderer', async () => {
    const api = await importApi()
    api.listAgents.mockResolvedValue([RESEARCH_AGENT])
    api.getAgentReports.mockResolvedValue(RESEARCH_REPORTS)
    api.getAgentReport.mockResolvedValue(RESEARCH_LATEST)
    api.agentRunStatus.mockResolvedValue({ state: 'idle', last_run: null, last_exit: 0 })

    render(<IntelAgentsConsole />)

    expect(await screen.findByText('RESEARCH_SECTION_MARKER')).toBeInTheDocument()
    expect(screen.getByText('The Agentic Shopping Shift')).toBeInTheDocument()
  })
})
