// frontend/src/components/control-tower/SessionCard.tsx
import type { SessionStatus } from '../../types/control-tower'

interface Props {
  session: SessionStatus
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function SessionCard({ session }: Props) {
  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(0,255,255,0.15)',
        padding: '10px 15px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#00FFFF"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#00FFFF',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 6px #00FFFF44',
          }}
        >
          Session
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          paddingBottom: 8,
          borderBottom: '1px solid #0f172a',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 26,
            fontWeight: 700,
            color: '#00FFFF',
            textShadow: '0 0 14px #00FFFF',
            lineHeight: 1,
          }}
        >
          {formatDuration(session.durationSeconds)}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#64748B',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          active
        </div>
      </div>

      <div style={{ paddingTop: 6 }}>
        {[
          { k: 'today', v: `${session.sessionsToday} sessions`, vColor: '#94A3B8' },
          { k: 'model', v: session.model, vColor: '#94A3B8' },
        ].map((row) => (
          <div
            key={row.k}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '3px 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            <span style={{ color: '#64748B' }}>{row.k}</span>
            <span style={{ color: row.vColor, fontSize: row.k === 'model' ? 10 : 11 }}>
              {row.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
