import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, Maximize2, Star, Copy, Check, Plus, X } from 'lucide-react'
import { api } from '../../api'
import type {
  IntelAgent,
  AgentPayload,
  AgentReportMeta,
  AgentReport,
  AgentPurpose,
  AgentVoice,
  IndustryPulseSnapshot,
  ResearchSnapshot,
} from '../../types/reporting'
import { IndustryPulse } from './IndustryPulse'
import { ResearchArticle } from './ResearchArticle'
import '../../styles/reporting.css'

interface IntelAgentsConsoleProps {
  /** How often to poll run status while an agent runs (ms). */
  pollIntervalMs?: number
  /** When provided, shows a remove (×) button that calls this. */
  onRemove?: () => void
}

const PURPOSES: AgentPurpose[] = ['linkedin', 'research']
const VOICES: AgentVoice[] = ['me', 'executive', 'research']

const BLANK_FORM: AgentPayload = {
  name: '',
  purpose: 'linkedin',
  voice: 'me',
  focus: '',
  keywords: [],
  sources_prefer: [],
  sources_avoid: [],
  searches_per_run: 6,
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Parse an agent report's content JSON into the right typed snapshot. */
function parseReport(report: AgentReport | null): {
  pulse?: IndustryPulseSnapshot
  research?: ResearchSnapshot
  error?: string
} {
  if (!report) return {}
  try {
    const parsed = JSON.parse(report.content)
    if (report.purpose === 'research') return { research: parsed as ResearchSnapshot }
    return { pulse: parsed as IndustryPulseSnapshot }
  } catch {
    return { error: 'Could not parse report data.' }
  }
}

function ReportView({ report }: { report: AgentReport | null }) {
  const { pulse, research, error } = parseReport(report)
  if (error) return <p className="report-feed__error">{error}</p>
  if (research) return <ResearchArticle data={research} />
  if (pulse) return <IndustryPulse data={pulse} />
  return <p className="report-feed__muted">Loading…</p>
}

export function IntelAgentsConsole({ pollIntervalMs = 1500, onRemove }: IntelAgentsConsoleProps) {
  const [agents, setAgents] = useState<IntelAgent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [reports, setReports] = useState<AgentReportMeta[]>([])
  const [report, setReport] = useState<AgentReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // History filters
  const [starredOnly, setStarredOnly] = useState(false)
  const [search, setSearch] = useState('')

  // New-agent form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AgentPayload>(BLANK_FORM)
  const [keywordsRaw, setKeywordsRaw] = useState('')
  const [preferRaw, setPreferRaw] = useState('')
  const [avoidRaw, setAvoidRaw] = useState('')

  // Expand modal
  const [expanded, setExpanded] = useState(false)

  // Copy feedback
  const [copied, setCopied] = useState(false)

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null

  // Load agents on mount; select the first.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await api.listAgents()
        if (!alive) return
        setAgents(list)
        if (list.length) setSelectedAgentId(list[0].id)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load agents')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Load an agent's reports + latest report whenever the selection changes.
  useEffect(() => {
    if (!selectedAgentId) return
    let alive = true
    ;(async () => {
      try {
        const list = await api.getAgentReports(selectedAgentId)
        if (!alive) return
        setReports(list)
        if (list.length) {
          const latest = await api.getAgentReport(selectedAgentId, list[0].id)
          if (!alive) return
          setReport(latest)
        } else {
          setReport(null)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load reports')
      }
    })()
    return () => {
      alive = false
    }
  }, [selectedAgentId])

  async function loadReport(instanceId: string) {
    const inst = await api.getAgentReport(selectedAgentId, instanceId)
    setReport(inst)
  }

  async function refreshReports() {
    const list = await api.getAgentReports(selectedAgentId)
    setReports(list)
    if (list.length) await loadReport(list[0].id)
  }

  function pollUntilDone(): Promise<void> {
    return new Promise((resolve) => {
      const tick = async () => {
        const status = await api.agentRunStatus(selectedAgentId)
        if (status.state === 'running') setTimeout(tick, pollIntervalMs)
        else resolve()
      }
      setTimeout(tick, pollIntervalMs)
    })
  }

  async function handleRun() {
    if (!selectedAgentId || running) return
    setRunning(true)
    setError(null)
    try {
      await api.runAgent(selectedAgentId)
      await pollUntilDone()
      await refreshReports()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  async function handleStar() {
    if (!report) return
    const next = !report.starred
    try {
      await api.setReportStar(selectedAgentId, report.id, next)
      setReport({ ...report, starred: next })
      setReports((rs) => rs.map((r) => (r.id === report.id ? { ...r, starred: next } : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Star failed')
    }
  }

  async function handleCopy() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const payload: AgentPayload = {
      ...form,
      keywords: parseList(keywordsRaw),
      sources_prefer: parseList(preferRaw),
      sources_avoid: parseList(avoidRaw),
    }
    try {
      const created = await api.createAgent(payload)
      setAgents((prev) => [...prev, created])
      setSelectedAgentId(created.id)
      setShowForm(false)
      setForm(BLANK_FORM)
      setKeywordsRaw('')
      setPreferRaw('')
      setAvoidRaw('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create agent failed')
    }
  }

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports.filter((r) => {
      if (starredOnly && !r.starred) return false
      if (q && !`${r.label} ${r.date}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [reports, starredOnly, search])

  return (
    <section className="report-feed intel-console">
      <header className="report-feed__head">
        <div className="report-feed__title">
          <span className="report-feed__name">Intel Agents</span>
          {report && <span className="report-feed__date">{report.label}</span>}
        </div>

        <div className="report-feed__controls">
          <select
            aria-label="Select agent"
            className="report-feed__select"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            disabled={agents.length === 0}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button
            className="report-feed__btn"
            onClick={() => setShowForm((v) => !v)}
            title="Create a new agent"
          >
            <Plus size={14} />
            New agent
          </button>

          {onRemove && (
            <button
              className="report-feed__btn report-feed__btn--icon"
              onClick={onRemove}
              title="Remove widget"
              aria-label="Remove widget"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {showForm && (
        <form className="intel-form" onSubmit={handleCreate}>
          <div className="intel-form__row">
            <label className="intel-form__field">
              <span>Name</span>
              <input
                aria-label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="intel-form__field">
              <span>Purpose</span>
              <select
                aria-label="Purpose"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value as AgentPurpose })}
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="intel-form__field">
              <span>Voice</span>
              <select
                aria-label="Voice"
                value={form.voice}
                onChange={(e) => setForm({ ...form, voice: e.target.value as AgentVoice })}
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="intel-form__field intel-form__field--num">
              <span>Searches/run</span>
              <input
                aria-label="Searches per run"
                type="number"
                min={1}
                max={12}
                value={form.searches_per_run}
                onChange={(e) =>
                  setForm({ ...form, searches_per_run: Number(e.target.value) || 1 })
                }
              />
            </label>
          </div>

          <label className="intel-form__field">
            <span>Focus</span>
            <textarea
              aria-label="Focus"
              rows={2}
              value={form.focus}
              onChange={(e) => setForm({ ...form, focus: e.target.value })}
            />
          </label>

          <label className="intel-form__field">
            <span>Keywords (comma-separated)</span>
            <input
              aria-label="Keywords"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              placeholder="Vinted, resale, C2C"
            />
          </label>

          <div className="intel-form__row">
            <label className="intel-form__field">
              <span>Sources prefer</span>
              <input
                aria-label="Sources prefer"
                value={preferRaw}
                onChange={(e) => setPreferRaw(e.target.value)}
                placeholder="TechCrunch, Reuters"
              />
            </label>
            <label className="intel-form__field">
              <span>Sources avoid</span>
              <input
                aria-label="Sources avoid"
                value={avoidRaw}
                onChange={(e) => setAvoidRaw(e.target.value)}
              />
            </label>
          </div>

          <div className="intel-form__actions">
            <button type="submit" className="report-feed__btn">
              Create agent
            </button>
            <button type="button" className="report-feed__btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {running && (
        <div className="report-feed__hint">
          Running {selectedAgent?.name ?? 'agent'}… this can take a few minutes. You can keep
          working — it updates here when it's done.
        </div>
      )}

      <div className="intel-console__controls">
        <button
          className="report-feed__btn"
          onClick={handleStar}
          disabled={!report}
          title={report?.starred ? 'Unstar report' : 'Star report'}
        >
          <Star size={14} fill={report?.starred ? 'currentColor' : 'none'} />
          {report?.starred ? 'Starred' : 'Star'}
        </button>

        <button className="report-feed__btn" onClick={handleRun} disabled={running}>
          <RefreshCw size={14} className={running ? 'spin' : ''} />
          {running ? 'Running…' : 'Run now'}
        </button>

        <button className="report-feed__btn" onClick={handleCopy} disabled={!report}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>

        <button
          className="report-feed__btn"
          disabled
          title="Direct posting coming in a later phase"
        >
          <Send size={14} />
          Post to LinkedIn
        </button>

        <button className="report-feed__btn" onClick={() => setExpanded(true)} disabled={!report}>
          <Maximize2 size={14} />
          Expand
        </button>
      </div>

      <div className="report-feed__body">
        {error ? <p className="report-feed__error">{error}</p> : <ReportView report={report} />}
      </div>

      <div className="intel-history" data-testid="agent-history">
        <div className="intel-history__bar">
          <span className="intel-history__label">History</span>
          <label className="intel-history__starred">
            <input
              type="checkbox"
              aria-label="Starred only"
              checked={starredOnly}
              onChange={(e) => setStarredOnly(e.target.checked)}
            />
            ⭐ starred only
          </label>
          <input
            className="report-feed__select"
            aria-label="Search history"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ul className="intel-history__list">
          {filteredReports.length === 0 ? (
            <li className="report-feed__muted">No reports.</li>
          ) : (
            filteredReports.map((r) => (
              <li key={r.id}>
                <button
                  className={`intel-history__item${report?.id === r.id ? ' is-active' : ''}`}
                  onClick={() => loadReport(r.id)}
                >
                  {r.starred && <Star size={12} fill="currentColor" />}
                  <span className="intel-history__item-label">{r.label}</span>
                  <span className="intel-history__item-age">{r.age}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {expanded && report && (
        <div
          className="intel-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Full report"
          onClick={() => setExpanded(false)}
        >
          <div className="intel-modal__panel" onClick={(e) => e.stopPropagation()}>
            <header className="intel-modal__head">
              <span className="report-feed__name">
                {selectedAgent?.name ?? 'Report'} · {report.label}
              </span>
              <button
                className="report-feed__btn report-feed__btn--icon"
                onClick={() => setExpanded(false)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </header>
            <div className="intel-modal__body">
              <ReportView report={report} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
