import { useState } from 'react'
import type { SkillEntry } from '../../types/control-tower'

interface Props {
  skills: SkillEntry[]
}

const ORIGIN = {
  mine: {
    text: '#C9A86C',
    border: 'rgba(201,168,108,0.3)',
    bg: 'rgba(201,168,108,0.06)',
    activeBorder: 'rgba(201,168,108,0.7)',
    activeBg: 'rgba(201,168,108,0.12)',
    dot: '#B07D3A',
    glow: true,
  },
  external: {
    text: '#94A3B8',
    border: '#1E293B',
    bg: 'transparent',
    activeBorder: '#475569',
    activeBg: 'rgba(148,163,184,0.08)',
    dot: '#475569',
    glow: false,
  },
  plugin: {
    text: '#64748B',
    border: '#162032',
    bg: 'transparent',
    activeBorder: '#64748B',
    activeBg: 'rgba(100,116,139,0.07)',
    dot: '#64748B',
    glow: false,
  },
}

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

function BrickSection({
  title,
  skills,
  selected,
  onSelect,
}: {
  title: string
  skills: SkillEntry[]
  selected: SkillEntry | null
  onSelect: (s: SkillEntry) => void
}) {
  if (skills.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: '#64748B',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          borderBottom: '1px solid #1E293B',
          paddingBottom: 4,
          marginBottom: 7,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{title}</span>
        <span>{skills.length}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {skills.map((s) => {
          const c = ORIGIN[s.origin]
          const isActive = selected?.name === s.name
          return (
            <div
              key={s.name}
              onClick={() => onSelect(s)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: c.text,
                background: isActive ? c.activeBg : c.bg,
                border: `1px solid ${isActive ? c.activeBorder : c.border}`,
                padding: '3px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isActive && c.glow ? `0 0 6px ${c.dot}44` : 'none',
                transition: 'background 120ms, border-color 120ms',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {s.usageCount > 0 && (
                <span style={{ fontSize: 9, color: isActive ? c.text : '#64748B', opacity: 0.8 }}>
                  {s.usageCount}×
                </span>
              )}
              {s.name}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SkillsCard({ skills }: Props) {
  const [selected, setSelected] = useState<SkillEntry | null>(null)

  const handleSelect = (s: SkillEntry) => setSelected((prev) => (prev?.name === s.name ? null : s))

  const sorted = [...skills].sort((a, b) => b.usageCount - a.usageCount)
  const pluginSkills = sorted.filter((s) => s.origin === 'plugin')
  const standaloneSkills = sorted.filter((s) => s.origin !== 'plugin')

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(34,197,94,0.12)',
        padding: '13px 13px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4ADE80"
          strokeWidth="2"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#4ADE80',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 5px #22C55E33',
          }}
        >
          Skills
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
          {skills.length}
        </span>
      </div>

      {/* Brick sections + detail panel — scrollable */}
      <div className="ct-scroll" style={{ maxHeight: 390, flex: 1 }}>
        <BrickSection
          title="Standalone"
          skills={standaloneSkills}
          selected={selected}
          onSelect={handleSelect}
        />
        <BrickSection
          title="Plugin Skills"
          skills={pluginSkills}
          selected={selected}
          onSelect={handleSelect}
        />

        {/* Detail panel — shown when a brick is selected */}
        {selected &&
          (() => {
            const c = ORIGIN[selected.origin]
            return (
              <div
                style={{
                  marginTop: 10,
                  padding: '9px 11px',
                  background: '#080e1c',
                  border: `1px solid ${c.activeBorder}`,
                  borderLeft: `3px solid ${c.dot}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: c.text,
                    }}
                  >
                    {selected.name}
                  </span>
                  {selected.source && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: '#64748B',
                        background: '#0d1525',
                        border: '1px solid #1E293B',
                        padding: '1px 5px',
                      }}
                    >
                      {selected.source}
                    </span>
                  )}
                </div>
                {selected.description && (
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: '#475569',
                      margin: '0 0 8px',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
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
                  {selected.version && <Stat label="version" value={selected.version} />}
                  {selected.usageCount > 0 && (
                    <Stat label="used" value={`${selected.usageCount}×`} />
                  )}
                </div>
              </div>
            )
          })()}
      </div>
      {/* end ct-scroll */}

      {/* Legend */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 7,
          borderTop: '1px solid #1E293B',
          display: 'flex',
          gap: 12,
        }}
      >
        {(['mine', 'external', 'plugin'] as const).map((o) => (
          <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: ORIGIN[o].dot,
                boxShadow: ORIGIN[o].glow ? `0 0 4px ${ORIGIN[o].dot}` : 'none',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: '#64748B',
                letterSpacing: '1px',
              }}
            >
              {o}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
