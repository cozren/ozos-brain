import { useState } from 'react'
import type { PluginEntry, SkillEntry } from '../../types/control-tower'

interface Props {
  plugins: PluginEntry[]
  externalSkills: SkillEntry[]
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 17,
        borderRadius: 9,
        flexShrink: 0,
        background: on ? 'rgba(34,197,94,0.2)' : '#1E293B',
        border: `1px solid ${on ? '#22C55E66' : '#334155'}`,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 'calc(100% - 13px)' : 2,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: on ? '#22C55E' : '#475569',
          boxShadow: on ? '0 0 7px #22C55E' : 'none',
          transition: 'left 200ms ease',
        }}
      />
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: '#475569',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        borderBottom: '1px solid #1E293B',
        paddingBottom: 5,
        marginBottom: 5,
      }}
    >
      {label}
    </div>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: '#334155',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#94A3B8' }}>
        {value}
      </span>
    </div>
  )
}

function tokenColor(n: number) {
  if (n < 500) return '#22C55E'
  if (n < 2000) return '#F59E0B'
  return '#EF4444'
}

// Group external skills by 2-segment prefix (peon-ping-* → peon-ping)
function groupSkills(skills: SkillEntry[]) {
  const prefixCount: Record<string, number> = {}
  for (const s of skills) {
    const parts = s.name.split('-')
    if (parts.length >= 3) {
      const prefix = parts.slice(0, 2).join('-')
      prefixCount[prefix] = (prefixCount[prefix] || 0) + 1
    }
  }

  type GroupRow = {
    key: string
    label: string
    isGroup: boolean
    groupSkills?: SkillEntry[]
    skill?: SkillEntry
    enabled: boolean
  }
  const result: GroupRow[] = []
  const handled = new Set<string>()

  for (const s of skills) {
    if (handled.has(s.name)) continue
    const parts = s.name.split('-')
    if (parts.length >= 3) {
      const prefix = parts.slice(0, 2).join('-')
      if ((prefixCount[prefix] ?? 0) >= 2) {
        const group = skills.filter((sk) => sk.name.startsWith(prefix + '-'))
        group.forEach((gs) => handled.add(gs.name))
        result.push({
          key: prefix,
          label: prefix,
          isGroup: true,
          groupSkills: group,
          enabled: true,
        })
        continue
      }
    }
    handled.add(s.name)
    result.push({ key: s.name, label: s.name, isGroup: false, skill: s, enabled: true })
  }

  return result
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#334155"
      strokeWidth="2.5"
      style={{
        flexShrink: 0,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 150ms',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function PluginsCard({ plugins, externalSkills }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const toggle = (key: string) => setExpandedKey((prev) => (prev === key ? null : key))

  const sortedPlugins = [...plugins].sort((a, b) => {
    const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
    const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
    return bDate - aDate
  })

  const grouped = groupSkills(externalSkills).sort((a, b) => {
    const aUsage = a.isGroup
      ? (a.groupSkills ?? []).reduce((s, sk) => s + sk.usageCount, 0)
      : (a.skill?.usageCount ?? 0)
    const bUsage = b.isGroup
      ? (b.groupSkills ?? []).reduce((s, sk) => s + sk.usageCount, 0)
      : (b.skill?.usageCount ?? 0)
    return bUsage - aUsage
  })

  const totalEnabled = sortedPlugins.filter((p) => p.enabled).length + grouped.length

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(255,0,255,0.18)',
        padding: '13px 13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F0ABFC"
          strokeWidth="2"
        >
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <line x1="16" y1="8" x2="2" y2="22" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#F0ABFC',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 5px #FF00FF33',
          }}
        >
          Plugins
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#F0ABFC',
            background: '#080e1c',
            border: '1px solid #FF00FF22',
            padding: '2px 7px',
          }}
        >
          {totalEnabled}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="ct-scroll" style={{ maxHeight: 390 }}>
        {/* ── Packages ── */}
        <SectionLabel label="Packages" />
        {sortedPlugins.map((p) => {
          const isOpen = expandedKey === p.name
          return (
            <div key={p.name} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggle(p.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  background: isOpen ? '#0d1830' : '#080e1c',
                  border: `1px solid ${isOpen ? '#1E3A5A' : '#1E293B'}`,
                  cursor: 'pointer',
                  opacity: p.enabled ? 1 : 0.4,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: '#CBD5E1',
                  }}
                >
                  {p.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#475569' }}>
                  {p.version}
                </span>
                <Toggle on={p.enabled} />
                <ChevronIcon open={isOpen} />
              </div>
              {isOpen && (
                <div
                  style={{
                    padding: '9px 10px 10px',
                    background: '#080e1c',
                    border: '1px solid #1E3A5A',
                    borderTop: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      flexWrap: 'wrap',
                      marginBottom: p.gitCommitSha ? 8 : 0,
                    }}
                  >
                    <DetailStat label="installed" value={fmtDate(p.installedAt)} />
                    <DetailStat label="updated" value={fmtDate(p.lastUpdated)} />
                    {p.publisher && <DetailStat label="source" value={p.publisher} />}
                  </div>
                  {p.gitCommitSha && (
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: '#334155',
                          letterSpacing: '1.5px',
                          textTransform: 'uppercase',
                        }}
                      >
                        sha
                      </span>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: '#1E3A5A',
                          background: '#040810',
                          border: '1px solid #1E293B',
                          padding: '3px 7px',
                          marginTop: 3,
                          letterSpacing: '1px',
                        }}
                      >
                        {p.gitCommitSha.slice(0, 12)}…
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* ── External Skills ── */}
        {grouped.length > 0 && (
          <>
            <div style={{ marginTop: 10, marginBottom: 5 }}>
              <SectionLabel label="External Skills" />
            </div>
            {grouped.map((row) => {
              const isOpen = expandedKey === row.key
              const totalTokens = row.isGroup
                ? (row.groupSkills ?? []).reduce((s, sk) => s + sk.contextTokens, 0)
                : (row.skill?.contextTokens ?? 0)
              const totalUsage = row.isGroup
                ? (row.groupSkills ?? []).reduce((s, sk) => s + sk.usageCount, 0)
                : (row.skill?.usageCount ?? 0)

              return (
                <div key={row.key} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggle(row.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 8px',
                      background: isOpen ? '#0d1830' : '#080e1c',
                      border: `1px solid ${isOpen ? '#1E3A5A' : '#1E293B'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: '#CBD5E1',
                      }}
                    >
                      {row.label}
                    </span>
                    {row.isGroup && (
                      <span
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569' }}
                      >
                        {row.groupSkills?.length} skills
                      </span>
                    )}
                    <Toggle on={row.enabled} />
                    <ChevronIcon open={isOpen} />
                  </div>

                  {isOpen && (
                    <div
                      style={{
                        padding: '9px 10px 10px',
                        background: '#080e1c',
                        border: '1px solid #1E3A5A',
                        borderTop: 'none',
                      }}
                    >
                      {/* Single skill: description + stats */}
                      {!row.isGroup && row.skill?.description && (
                        <p
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: '#64748B',
                            margin: '0 0 8px',
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {row.skill.description}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {totalUsage > 0 && <DetailStat label="used" value={`${totalUsage}×`} />}
                        {!row.isGroup && row.skill?.lastUsed && (
                          <DetailStat label="last used" value={row.skill.lastUsed} />
                        )}
                        <DetailStat
                          label="context"
                          value={`~${totalTokens.toLocaleString()} tokens`}
                        />
                        {!row.isGroup && row.skill?.version && (
                          <DetailStat label="version" value={row.skill.version} />
                        )}
                      </div>
                      {/* Group: list individual skills */}
                      {row.isGroup && (
                        <div style={{ marginTop: 8 }}>
                          {(row.groupSkills ?? []).map((sk) => (
                            <div
                              key={sk.name}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '3px 0',
                                borderBottom: '1px solid #0d1525',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  color: '#475569',
                                }}
                              >
                                {sk.name}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 10,
                                  color: tokenColor(sk.contextTokens),
                                }}
                              >
                                ~{sk.contextTokens} tok
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
      {/* end ct-scroll */}
    </div>
  )
}
