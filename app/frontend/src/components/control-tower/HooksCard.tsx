import { useState } from 'react'
import type { HookEntry } from '../../types/control-tower'

interface Props {
  hooks: HookEntry[]
}

const EVENT_LABEL: Record<string, string> = {
  SessionStart: 'session-start',
  SessionEnd: 'session-end',
  Stop: 'stop',
  PreCompact: 'compact',
  PreToolUse: 'pre-tool',
  PostToolUse: 'post-tool',
  PostToolUseFailure: 'tool-fail',
  UserPromptSubmit: 'prompt',
  Notification: 'notify',
  PermissionRequest: 'permission',
  SubagentStart: 'sub-start',
  SubagentStop: 'sub-stop',
}

// Firing frequency rank — lower = fires more often in a typical session
const EVENT_FREQUENCY: Record<string, number> = {
  UserPromptSubmit: 0,
  PreToolUse: 1,
  PostToolUse: 2,
  Stop: 3,
  SessionStart: 4,
  PostToolUseFailure: 5,
  SubagentStart: 6,
  SubagentStop: 7,
  SessionEnd: 8,
  PreCompact: 9,
  Notification: 10,
  PermissionRequest: 11,
}

// These are ambient/infrastructure targets — real everywhere, but not the point
const NOISE_TARGETS = new Set(['peon'])

const TARGET_DESCRIPTIONS: Record<string, string> = {
  Glass: 'Plays the macOS Glass chime when Claude finishes a response',
  sync_gemini_notes:
    'Fetches unread "Notes by Gemini" emails from Gmail, categorises them with Claude, and saves each note to the correct Google Drive subfolder',
  'hook-handle-use':
    'Switches the peon-ping voice pack for this session instantly without spending any tokens',
  'hook-handle-rename':
    'Renames the terminal tab title for this session and persists it across /clear',
  graphify:
    'Injects a reminder to read the knowledge graph report instead of scanning raw files — faster and more accurate',
}

const EVENT_DESCRIPTIONS: Record<string, string> = {
  SessionStart: 'Fires when a new Claude Code session opens',
  SessionEnd: 'Fires when a session closes',
  Stop: 'Fires when Claude finishes its response',
  PreCompact: 'Fires just before the context window is compacted',
  PreToolUse: 'Runs before a tool call executes — can inject context or block the call',
  PostToolUse: 'Runs after a tool call completes',
  PostToolUseFailure: 'Runs after a tool call fails',
  UserPromptSubmit:
    'Fires before each user message reaches the LLM — can intercept slash commands or inject context',
  Notification: 'Fires when Claude sends a notification event',
  PermissionRequest: 'Fires when Claude requests user permission for an action',
  SubagentStart: 'Fires when a subagent task starts',
  SubagentStop: 'Fires when a subagent task completes',
}

interface EventGroup {
  event: string
  targets: { name: string; command: string; scope: string; isNoise: boolean }[]
  status: string
}

function groupByEvent(hooks: HookEntry[]): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const h of hooks) {
    const group = map.get(h.event) ?? { event: h.event, targets: [], status: 'ok' }
    const alreadyAdded = group.targets.some((t) => t.name === h.target)
    if (!alreadyAdded) {
      group.targets.push({
        name: h.target,
        command: h.command ?? '',
        scope: h.scope,
        isNoise: NOISE_TARGETS.has(h.target),
      })
    }
    if (h.status !== 'ok') group.status = h.status
    map.set(h.event, group)
  }

  return [...map.values()].sort((a, b) => {
    // Primary: groups with meaningful (non-noise) targets first
    const aMeaningful = a.targets.filter((t) => !NOISE_TARGETS.has(t.name)).length
    const bMeaningful = b.targets.filter((t) => !NOISE_TARGETS.has(t.name)).length
    if (bMeaningful !== aMeaningful) return bMeaningful - aMeaningful
    // Secondary: by how frequently the event fires
    return (EVENT_FREQUENCY[a.event] ?? 99) - (EVENT_FREQUENCY[b.event] ?? 99)
  })
}

function getEventDescription(event: string, group: EventGroup): string {
  const meaningful = group.targets.filter((t) => !t.isNoise)
  if (meaningful.length === 1) {
    const key = Object.keys(TARGET_DESCRIPTIONS).find(
      (k) => meaningful[0].name.toLowerCase() === k.toLowerCase()
    )
    if (key) return TARGET_DESCRIPTIONS[key]
  }
  return EVENT_DESCRIPTIONS[event] ?? `Triggered on ${event}`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="7"
      height="7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748B"
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

export function HooksCard({ hooks }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const toggle = (key: string) => setExpandedKey((prev) => (prev === key ? null : key))
  const groups = groupByEvent(hooks)

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(255,107,53,0.18)',
        padding: '13px 13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FB923C"
          strokeWidth="2"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#FB923C',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 5px #FF6B3533',
          }}
        >
          Hooks
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#FB923C',
            background: '#080e1c',
            border: '1px solid #FF6B3522',
            padding: '2px 7px',
          }}
        >
          {groups.length}
        </span>
      </div>

      <div className="ct-scroll" style={{ maxHeight: 390 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map((g) => {
            const isOpen = expandedKey === g.event
            const statusColor = g.status === 'ok' ? '#22C55E' : '#F59E0B'
            const meaningfulTargets = g.targets.filter((t) => !t.isNoise)
            const noiseCount = g.targets.filter((t) => t.isNoise).length

            return (
              <div key={g.event}>
                <div
                  onClick={() => toggle(g.event)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    background: isOpen ? '#0d1830' : 'transparent',
                    border: `1px solid ${isOpen ? '#1E3A5A' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 10, flexShrink: 0, color: statusColor, lineHeight: 1 }}>
                    {g.status === 'ok' ? '✓' : '~'}
                  </span>

                  {/* Event name — the primary label */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: '#E2E8F0',
                      flexShrink: 0,
                      minWidth: 100,
                    }}
                  >
                    {EVENT_LABEL[g.event] ?? g.event}
                  </span>

                  {/* Meaningful targets in accent color */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 3,
                      flex: 1,
                      flexWrap: 'wrap',
                      alignContent: 'center',
                    }}
                  >
                    {meaningfulTargets.map((t) => (
                      <span
                        key={t.name}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          color: '#60A5FA',
                          background: '#0a1525',
                          border: '1px solid #1E3A5A',
                          padding: '1px 5px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                    {/* Noise targets collapsed to a single dim indicator */}
                    {noiseCount > 0 && meaningfulTargets.length === 0 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          color: '#334155',
                          background: 'transparent',
                          border: '1px solid #1E293B',
                          padding: '1px 5px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        peon
                      </span>
                    )}
                  </div>

                  <ChevronIcon open={isOpen} />
                </div>

                {isOpen && (
                  <div
                    style={{
                      padding: '8px 9px 9px',
                      background: '#080e1c',
                      border: '1px solid #1E3A5A',
                      borderTop: 'none',
                    }}
                  >
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: '#94A3B8',
                        margin: '0 0 8px',
                        lineHeight: 1.5,
                        borderLeft: '2px solid #FB923C44',
                        paddingLeft: 7,
                      }}
                    >
                      {getEventDescription(g.event, g)}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {g.targets.map((t) => (
                        <div
                          key={t.name}
                          style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: t.isNoise ? '#334155' : '#60A5FA',
                              flexShrink: 0,
                              minWidth: 100,
                            }}
                          >
                            {t.name}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              color: t.scope === 'global' ? '#A78BFA55' : '#60A5FA55',
                            }}
                          >
                            {t.scope}
                          </span>
                          {t.command && (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 9,
                                color: '#334155',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t.command.split('/').pop()}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {/* end ct-scroll */}
    </div>
  )
}
