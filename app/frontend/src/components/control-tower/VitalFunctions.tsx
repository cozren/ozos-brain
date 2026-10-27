// frontend/src/components/control-tower/VitalFunctions.tsx
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { VitalFunction, VitalDetail } from '../../types/control-tower'
import { api } from '../../api'
import { VitalDetailPopover } from './VitalDetailPopover'

interface Props {
  vitals: VitalFunction[]
  /** Called after a manual run finishes, so the parent can refresh vitals. */
  onRefresh?: () => void
  /** How often to poll run status while a vital syncs (ms). */
  pollIntervalMs?: number
}

// Per-vital UI state for a manual re-trigger.
type RunUiState =
  | { phase: 'running' }
  | { phase: 'done'; ok: boolean; exit: number | null; error?: string | null }

const STATUS_COLOR = { ok: '#22C55E', warn: '#F59E0B', fail: '#EF4444' } as const

export function VitalFunctions({ vitals, onRefresh, pollIntervalMs = 1500 }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VitalDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [runs, setRuns] = useState<Record<string, RunUiState>>({})

  // Esc closes the open popover.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  const handleRowClick = (id: string) => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    setDetail(null)
    setLoading(true)
    api
      .getVitalDetail(id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }

  const pollUntilDone = (id: string): Promise<void> =>
    new Promise((resolve) => {
      const tick = async () => {
        try {
          const status = await api.getVitalRunStatus(id)
          if (status.state === 'running') {
            setTimeout(tick, pollIntervalMs)
          } else {
            setRuns((r) => ({
              ...r,
              [id]: {
                phase: 'done',
                ok: status.state !== 'error',
                exit: status.last_exit,
                error: status.error,
              },
            }))
            resolve()
          }
        } catch {
          setRuns((r) => ({ ...r, [id]: { phase: 'done', ok: false, exit: null } }))
          resolve()
        }
      }
      setTimeout(tick, pollIntervalMs)
    })

  const handleSync = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation() // don't toggle the detail popover
    if (runs[id]?.phase === 'running') return
    setRuns((r) => ({ ...r, [id]: { phase: 'running' } }))
    try {
      await api.runVital(id)
      await pollUntilDone(id)
      onRefresh?.()
    } catch {
      setRuns((r) => ({ ...r, [id]: { phase: 'done', ok: false, exit: null } }))
    }
  }

  const renderStatusLine = (id: string) => {
    const run = runs[id]
    if (!run) return null
    if (run.phase === 'running') {
      return (
        <div style={{ ...statusLineStyle, color: '#4ADE80' }}>
          <RefreshCw size={9} style={{ animation: 'ct-spin 0.9s linear infinite' }} />
          syncing…
        </div>
      )
    }
    return run.ok ? (
      <div style={{ ...statusLineStyle, color: '#4ADE80' }}>✓ synced · just now</div>
    ) : (
      <div style={{ ...statusLineStyle, color: '#F87171' }} title={run.error ?? undefined}>
        <span style={{ whiteSpace: 'nowrap' }}>
          ✕ sync failed{run.exit != null ? ` (exit ${run.exit})` : ''}
        </span>
        {run.error ? (
          <span
            style={{
              color: '#94A3B8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            — {run.error}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(34,197,94,0.18)',
        padding: '14px 15px',
      }}
    >
      <style>{`
        @keyframes ct-warn-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes ct-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#22C55E',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 6px #22C55E55',
          }}
        >
          Vital Functions
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#4ADE80',
            background: '#080e1c',
            border: '1px solid #22C55E22',
            padding: '2px 7px',
          }}
        >
          {vitals.filter((v) => v.status === 'ok').length} / {vitals.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vitals.map((v) => {
          const running = runs[v.id]?.phase === 'running'
          return (
            <div key={v.id} style={{ position: 'relative' }}>
              <div
                onClick={() => handleRowClick(v.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '8px 1fr auto auto auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  border: `1px solid ${STATUS_COLOR[v.status]}${v.status === 'ok' ? '1A' : '1F'}`,
                  background:
                    openId === v.id
                      ? 'rgba(34,197,94,0.08)'
                      : v.status !== 'ok'
                        ? `${STATUS_COLOR[v.status]}06`
                        : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: STATUS_COLOR[v.status],
                    boxShadow: `0 0 5px ${STATUS_COLOR[v.status]}`,
                    animation:
                      v.status === 'warn' ? 'ct-warn-pulse 1.4s ease-in-out infinite' : 'none',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#CBD5E1' }}>
                  {v.name}
                </span>
                {v.delta ? (
                  <span
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4ADE80' }}
                    title="items added last run"
                  >
                    {v.delta}
                  </span>
                ) : (
                  <span />
                )}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#64748B',
                    textAlign: 'right',
                  }}
                >
                  {v.lastRunHuman}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleSync(e, v.id)}
                  disabled={running}
                  aria-label={`Sync ${v.name}`}
                  title={`Re-run ${v.name} now`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 3,
                    background: 'transparent',
                    border: '1px solid #22C55E22',
                    borderRadius: 3,
                    color: running ? '#4ADE80' : '#64748B',
                    cursor: running ? 'default' : 'pointer',
                    lineHeight: 0,
                  }}
                >
                  <RefreshCw
                    size={11}
                    style={{ animation: running ? 'ct-spin 0.9s linear infinite' : 'none' }}
                  />
                </button>
              </div>

              {renderStatusLine(v.id)}

              {openId === v.id && (
                <div
                  style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4 }}
                >
                  <VitalDetailPopover
                    detail={detail}
                    loading={loading}
                    onClose={() => setOpenId(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
        <div style={{ borderTop: '1px dashed #1E293B', margin: '4px 0' }} />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#1E293B',
            letterSpacing: '1px',
            padding: '5px 8px',
            cursor: 'pointer',
          }}
        >
          + add vital function
        </div>
      </div>
    </div>
  )
}

const statusLineStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px 3px 23px',
}
