import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RefreshCw, Send, Maximize2, X } from 'lucide-react'
import { api } from '../../api'
import type {
  ReportSource,
  ReportInstanceMeta,
  ReportInstance,
  RevenueSnapshot,
  IndustryPulseSnapshot,
} from '../../types/reporting'
import { RevenueChart } from './RevenueChart'
import { IndustryPulse } from './IndustryPulse'
import { IntelAgentsConsole } from './IntelAgentsConsole'
import '../../styles/reporting.css'

const PREVIEW_LINES = 16

interface ReportFeedProps {
  sourceId: string
  /** How often to poll run status while a generator runs (ms). */
  pollIntervalMs?: number
  /** When provided, shows a remove (×) button that calls this. */
  onRemove?: () => void
}

export function ReportFeed(props: ReportFeedProps) {
  // Intel Agents is a self-contained console (its own picker, form, history,
  // and /intel-agents/* endpoints), not a single-source feed.
  if (props.sourceId === 'intel-agents') {
    return <IntelAgentsConsole pollIntervalMs={props.pollIntervalMs} onRemove={props.onRemove} />
  }
  return <SingleSourceFeed {...props} />
}

function SingleSourceFeed({ sourceId, pollIntervalMs = 1500, onRemove }: ReportFeedProps) {
  const [source, setSource] = useState<ReportSource | null>(null)
  const [instances, setInstances] = useState<ReportInstanceMeta[]>([])
  const [instance, setInstance] = useState<ReportInstance | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [sources, list] = await Promise.all([
          api.getReportSources(),
          api.getReportInstances(sourceId),
        ])
        if (!alive) return
        setSource(sources.find((s) => s.id === sourceId) ?? null)
        setInstances(list)
        // A fresh vault has no instances yet: show an empty state instead of
        // asking the backend for a "latest" it would 404 on.
        if (list.length === 0) return
        const inst = await api.getReportInstance(sourceId, 'latest')
        if (!alive) return
        setInstance(inst)
        setSelectedId(inst.id)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load report')
      }
    })()
    return () => {
      alive = false
    }
  }, [sourceId])

  async function load(instanceId: string) {
    const inst = await api.getReportInstance(sourceId, instanceId)
    setInstance(inst)
    setSelectedId(inst.id)
  }

  async function reload() {
    const list = await api.getReportInstances(sourceId)
    setInstances(list)
    await load('latest')
  }

  function pollUntilDone(): Promise<void> {
    return new Promise((resolve) => {
      const tick = async () => {
        const status = await api.getReportRunStatus(sourceId)
        if (status.state === 'running') setTimeout(tick, pollIntervalMs)
        else resolve()
      }
      setTimeout(tick, pollIntervalMs)
    })
  }

  async function handleRun() {
    if (!source?.runnable || running) return
    setRunning(true)
    setError(null)
    try {
      await api.runReportSource(sourceId)
      await pollUntilDone()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  const isChart = instance?.body === 'chart'
  const isPulse = instance?.body === 'industry-pulse'
  const isCustom = isChart || isPulse // JSON-bodied widgets render in full, no preview toggle
  let snapshot: RevenueSnapshot | null = null
  let pulse: IndustryPulseSnapshot | null = null
  let parseError: string | null = null
  if (isChart && instance) {
    try {
      snapshot = JSON.parse(instance.content) as RevenueSnapshot
    } catch {
      parseError = 'Could not parse chart data.'
    }
  }
  if (isPulse && instance) {
    try {
      pulse = JSON.parse(instance.content) as IndustryPulseSnapshot
    } catch {
      parseError = 'Could not parse Industry Pulse data.'
    }
  }

  const lines = (instance?.content ?? '').split('\n')
  const isLong = !isCustom && lines.length > PREVIEW_LINES
  // The tile always shows a truncated preview; the full report opens in a modal.
  const preview = isLong ? lines.slice(0, PREVIEW_LINES).join('\n') : (instance?.content ?? '')

  return (
    <section className="report-feed">
      <header className="report-feed__head">
        <div className="report-feed__title">
          <span className="report-feed__name">{source?.label ?? sourceId}</span>
          {instance && <span className="report-feed__date">{instance.label}</span>}
        </div>

        <div className="report-feed__controls">
          <select
            aria-label="History"
            className="report-feed__select"
            value={selectedId}
            onChange={(e) => load(e.target.value)}
            disabled={instances.length === 0}
          >
            {instances.map((it) => (
              <option key={it.id} value={it.id}>
                {it.label} · {it.age}
              </option>
            ))}
          </select>

          {!isCustom && (
            <button
              className="report-feed__btn"
              onClick={() => setExpanded(true)}
              disabled={!instance}
              title="Expand full report"
            >
              <Maximize2 size={14} />
              Expand
            </button>
          )}

          {source?.runnable && (
            <button className="report-feed__btn" onClick={handleRun} disabled={running}>
              <RefreshCw size={14} className={running ? 'spin' : ''} />
              {running ? 'Running…' : 'Run now'}
            </button>
          )}

          <button className="report-feed__btn" disabled title="Slack sharing coming soon">
            <Send size={14} />
            Share
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

      {!running && !error && source && instances.length === 0 && (
        <div className="report-feed__hint">No {source.label} yet</div>
      )}

      {running && (
        <div className="report-feed__hint">
          Generating a fresh report… this can take a few minutes. You can keep working — it updates
          here when it's done.
        </div>
      )}

      <div className={`report-feed__body ${isLong ? 'is-preview' : ''}`}>
        {error ? (
          <p className="report-feed__error">{error}</p>
        ) : isChart ? (
          snapshot ? (
            <RevenueChart data={snapshot} />
          ) : (
            <p className="report-feed__error">{parseError ?? 'No chart data.'}</p>
          )
        ) : isPulse ? (
          pulse ? (
            <IndustryPulse data={pulse} />
          ) : (
            <p className="report-feed__error">{parseError ?? 'No Industry Pulse data.'}</p>
          )
        ) : instance ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
        ) : (
          <p className="report-feed__muted">Loading…</p>
        )}
      </div>

      {expanded && instance && (
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
                {source?.label ?? sourceId} · {instance.label}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{instance.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
