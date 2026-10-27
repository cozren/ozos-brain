// frontend/src/components/control-tower/VitalDetailPopover.tsx
import { useState } from 'react'
import type { VitalDetail } from '../../types/control-tower'

interface Props {
  detail: VitalDetail | null
  loading: boolean
  onClose: () => void
}

const MONO = 'var(--font-mono)'

function formatExact(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VitalDetailPopover({ detail, loading, onClose }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      role="dialog"
      style={{
        background: '#0A1120',
        border: '1px solid rgba(34,197,94,0.35)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
        padding: '10px 12px',
        minWidth: 240,
        fontFamily: MONO,
      }}
    >
      {loading || !detail ? (
        <div style={{ fontSize: 11, color: '#64748B' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#CBD5E1' }}>Last run</span>
            <span style={{ fontSize: 12, color: '#4ADE80' }}>{detail.lastRunHuman}</span>
            <button
              onClick={onClose}
              aria-label="close"
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                color: '#475569',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>

          {formatExact(detail.lastRunIso) && (
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
              {formatExact(detail.lastRunIso)}
            </div>
          )}

          {detail.delta && (
            <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 6 }}>
              <span style={{ color: '#4ADE80' }}>{detail.delta}</span> added just now
            </div>
          )}

          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 8,
              background: 'none',
              border: '1px solid #1E293B',
              color: '#94A3B8',
              fontFamily: MONO,
              fontSize: 10,
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'less ▴' : 'more ▾'}
          </button>

          {expanded && (
            <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
              <div
                style={{
                  fontSize: 10,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: 4,
                }}
              >
                Added today ({detail.todayCount})
              </div>
              {detail.items.length === 0 ? (
                <div style={{ fontSize: 10, color: '#475569' }}>Nothing added today.</div>
              ) : (
                detail.items.map((title, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      color: '#CBD5E1',
                      padding: '2px 0',
                      borderTop: i === 0 ? 'none' : '1px dashed #16202F',
                    }}
                  >
                    <span style={{ color: '#475569' }}>• </span>
                    <span>{title}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
