import { X } from 'lucide-react'
import type { SetupSummary } from '../types/setup'
import { progressText, showBadge } from '../lib/setup'

interface Props {
  summary: SetupSummary
  onOpen: () => void
  onDismiss: () => void
}

// "Setup: N of M done" on the home page while anything is still open. The
// dismiss is remembered in setup.json; the Setup page itself stays in the nav.
export function SetupBadge({ summary, onOpen, onDismiss }: Props) {
  if (!showBadge(summary)) return null
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid rgba(0,255,255,0.35)',
        background: 'rgba(0,255,255,0.05)',
        boxShadow: '0 0 10px rgba(0,255,255,0.15)',
      }}
    >
      <style>{`
        .setup-badge-btn:hover { background: rgba(0,255,255,0.1); }
        .setup-badge-btn:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: -2px; }
      `}</style>
      <button
        className="setup-badge-btn"
        onClick={onOpen}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--neon-cyan)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: 2,
          textTransform: 'uppercase',
          padding: '8px 14px',
          cursor: 'pointer',
          transition: 'background 150ms ease',
        }}
      >
        {progressText(summary)}
      </button>
      <button
        className="setup-badge-btn"
        aria-label="Dismiss setup badge"
        title="Dismiss"
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          borderLeft: '1px solid rgba(0,255,255,0.2)',
          color: 'var(--text-dim)',
          padding: '8px 10px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'background 150ms ease',
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}
