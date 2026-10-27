import type { CSSProperties, ReactNode } from 'react'
import type { SetupItem, SetupStatus } from '../../types/setup'
import { StatusChip } from './StatusChip'

interface Props {
  item: SetupItem
  onStatus?: (id: string, status: SetupStatus) => void
  first?: boolean
  children?: ReactNode
}

// Kinds whose "done" is derived by the backend (config present, MCP connected);
// a manual Mark done would be overwritten on the next read, so it is not offered.
const DERIVED_KINDS = new Set(['profile', 'mcp'])

const BTN: CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(0,255,255,0.35)',
  color: 'var(--neon-cyan)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '4px 10px',
  cursor: 'pointer',
  transition: 'background 150ms ease, border-color 150ms ease',
}
const BTN_QUIET: CSSProperties = {
  ...BTN,
  border: '1px solid rgba(148,163,184,0.3)',
  color: 'var(--text-dim)',
}

export function SetupControls({
  item,
  onStatus,
}: {
  item: SetupItem
  onStatus: (id: string, status: SetupStatus) => void
}) {
  const closed = item.status === 'done' || item.status === 'skipped'
  const derived = DERIVED_KINDS.has(item.kind)
  return (
    <div className="setup-controls" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <style>{`
        .setup-controls button:hover { background: rgba(0,255,255,0.08); }
        .setup-controls button:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }
      `}</style>
      {closed ? (
        (!derived || item.status === 'skipped') && (
          <button style={BTN_QUIET} onClick={() => onStatus(item.id, 'not_started')}>
            Reopen
          </button>
        )
      ) : (
        <>
          {!derived && (
            <button style={BTN} onClick={() => onStatus(item.id, 'done')}>
              Mark done
            </button>
          )}
          <button style={BTN_QUIET} onClick={() => onStatus(item.id, 'skipped')}>
            Skip
          </button>
        </>
      )}
    </div>
  )
}

// One checklist line: title, the one-line "why", what it writes, the status chip
// and (when `onStatus` is given) the Mark done / Skip / Reopen controls.
// `children` is the item's form slot (empty for read-only rows).
export function SetupItemRow({ item, onStatus, first = false, children }: Props) {
  return (
    <div
      data-item={item.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid rgba(0,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: 0.5,
            }}
          >
            {item.title}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-dim)' }}>
            {item.why}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(148,163,184,0.6)',
              letterSpacing: 0.5,
            }}
          >
            writes {item.writes}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {onStatus && <SetupControls item={item} onStatus={onStatus} />}
          <StatusChip status={item.status} />
        </div>
      </div>
      {children}
    </div>
  )
}
