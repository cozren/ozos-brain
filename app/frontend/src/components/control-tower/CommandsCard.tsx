import { useState } from 'react'
import type { CommandEntry } from '../../types/control-tower'

interface Props {
  commands: CommandEntry[]
}

const ACCENT = '#A78BFA'

function tokenColor(n: number) {
  if (n < 500) return '#22C55E'
  if (n < 2000) return '#F59E0B'
  return '#EF4444'
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: '#64748B',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: valueColor ?? '#94A3B8' }}
      >
        {value}
      </span>
    </div>
  )
}

export function CommandsCard({ commands }: Props) {
  const [selected, setSelected] = useState<CommandEntry | null>(null)
  const handleSelect = (c: CommandEntry) =>
    setSelected((prev) => (prev?.name === c.name ? null : c))

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(167,139,250,0.18)',
        padding: '13px 13px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: ACCENT,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 5px #8B5CF633',
          }}
        >
          Commands
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: ACCENT,
            background: '#080e1c',
            border: '1px solid #8B5CF622',
            padding: '2px 7px',
          }}
        >
          {commands.length}
        </span>
      </div>

      {/* Command bricks + detail panel — scrollable */}
      <div className="ct-scroll" style={{ maxHeight: 390, flex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {commands.map((c) => {
            const isActive = selected?.name === c.name
            return (
              <div
                key={c.name}
                onClick={() => handleSelect(c)}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: ACCENT,
                  background: isActive ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.06)',
                  border: `1px solid ${isActive ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.3)'}`,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: isActive ? '0 0 6px #8B5CF644' : 'none',
                  transition: 'background 120ms, border-color 120ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {c.usageCount > 0 && (
                  <span style={{ fontSize: 9, color: isActive ? ACCENT : '#64748B', opacity: 0.8 }}>
                    {c.usageCount}×
                  </span>
                )}
                <span style={{ opacity: 0.55 }}>/</span>
                {c.name}
              </div>
            )
          })}
        </div>

        {/* Detail panel — shown when a command is selected */}
        {selected && (
          <div
            style={{
              marginTop: 10,
              padding: '9px 11px',
              background: '#080e1c',
              border: '1px solid rgba(167,139,250,0.7)',
              borderLeft: `3px solid ${ACCENT}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: ACCENT,
                }}
              >
                /{selected.name}
              </span>
            </div>
            {selected.description && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: '#94A3B8',
                  margin: '0 0 8px',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {selected.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Stat label="last used" value={selected.lastUsed ?? '—'} />
              <Stat
                label="context"
                value={`~${selected.contextTokens.toLocaleString()} tokens`}
                valueColor={tokenColor(selected.contextTokens)}
              />
              {selected.usageCount > 0 && <Stat label="used" value={`${selected.usageCount}×`} />}
            </div>
          </div>
        )}
      </div>
      {/* end ct-scroll */}
    </div>
  )
}
