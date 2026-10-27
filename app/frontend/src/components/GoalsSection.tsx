import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Goal, GoalLike } from '../types'
import { remarkLineBreaks } from '../lib/markdown'
import { TrophyIcon } from './TrophyIcon'
import { SectionHeader } from './SectionHeader'

interface Props {
  goals: GoalLike[]
  onChange: (goals: Goal[]) => void
  label?: string
  placeholder?: string
  // Achievements are "already done": each row shows a static trophy (right-
  // aligned) instead of a done toggle, and is never struck through.
  achievement?: boolean
}

// Tolerate legacy goals stored as bare strings / without a done flag.
const normalize = (g: GoalLike): Goal =>
  typeof g === 'string'
    ? { title: g, description: '', done: false }
    : // Preserve subtasks/plan (added by the Personal Tasks view) so they survive a round-trip here.
      {
        title: g.title,
        description: g.description ?? '',
        done: g.done ?? false,
        ...(g.subtasks ? { subtasks: g.subtasks } : {}),
        ...(g.plan ? { plan: g.plan } : {}),
      }

const GREEN_GLOW = '0 0 12px rgba(0,255,136,0.22), 0 0 30px rgba(0,255,136,0.10)'

export function GoalsSection({
  goals = [],
  onChange,
  label = 'KEY GOALS',
  placeholder = 'Add goal...',
  achievement = false,
}: Props) {
  const items = goals.map(normalize)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // The open editor uses local draft state so the caret is never reset by the
  // async persistence round-trip (onChange → fetch → re-render).
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const toggleExpand = (i: number) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(i) ? n.delete(i) : n.add(i)
      return n
    })

  const openEditor = (i: number) => {
    setEditIndex(i)
    setEditTitle(items[i].title)
    setEditDesc(items[i].description)
  }

  const addGoal = () => {
    if (draft.trim()) {
      onChange([...items, { title: draft.trim(), description: '', done: false }])
      setDraft('')
    }
  }
  const removeGoal = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i))
    setEditIndex(null)
  }
  const patchGoal = (i: number, patch: Partial<Goal>) =>
    onChange(items.map((g, idx) => (idx === i ? { ...g, ...patch } : g)))

  const editDescription = (i: number, value: string) => {
    setEditDesc(value)
    patchGoal(i, { description: value })
  }
  const editTitleText = (i: number, value: string) => {
    setEditTitle(value)
    patchGoal(i, { title: value })
  }

  // Move a goal from one position to another. Numbers are positional, so the
  // labels (1, 2, 3…) stay put top-down while the goals slide between them.
  const reorder = (from: number | null, to: number) => {
    if (from === null || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }
  const endDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  // ⌘/Ctrl+B bolds the selection. Bullets (- ) and new rows are typed straight in.
  const onDescKey = (i: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      const ta = e.currentTarget
      const { selectionStart: s, selectionEnd: en, value } = ta
      editDescription(i, value.slice(0, s) + `**${value.slice(s, en)}**` + value.slice(en))
    }
  }

  return (
    <div>
      <SectionHeader label={label} right={items.length || undefined} />
      {items.map((g, i) => {
        const isOpen = expanded.has(i)
        const editing = editIndex === i
        // Achievements are never shown as "done" (no green/strikethrough).
        const isDone = !achievement && g.done
        return (
          <div
            key={i}
            data-testid={`goal-row-${i}`}
            className="goal-row"
            onDragOver={(e) => {
              e.preventDefault()
              if (dragIndex !== null) setOverIndex(i)
            }}
            onDrop={() => {
              reorder(dragIndex, i)
              endDrag()
            }}
            style={{
              marginBottom: 6,
              padding: '4px 8px',
              borderRadius: 4,
              border: isDone
                ? '1px solid rgba(0,255,136,0.45)'
                : '1px solid rgba(255,255,255,0.07)',
              borderTop:
                overIndex === i && dragIndex !== null && dragIndex !== i
                  ? '2px solid var(--neon-cyan)'
                  : undefined,
              background: isDone ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.015)',
              boxShadow: isDone ? GREEN_GLOW : 'none',
              opacity: dragIndex === i ? 0.4 : 1,
              transition: 'border 300ms, box-shadow 300ms, background 300ms, opacity 150ms',
            }}
          >
            {/* Header: [drag handle → chevron · number] · title · check */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                draggable
                data-testid={`goal-drag-${i}`}
                onDragStart={(e) => {
                  setDragIndex(i)
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(i))
                  }
                }}
                onDragEnd={endDrag}
                title="Drag to reorder"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 0,
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <button
                  onClick={() => toggleExpand(i)}
                  className="goal-chevron"
                  title="Toggle description"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    flexShrink: 0,
                    color: 'rgba(148,163,184,0.4)',
                    fontSize: 8,
                    lineHeight: 1,
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform 150ms ease, color 150ms ease',
                  }}
                >
                  ▶
                </button>
                <span
                  style={{
                    minWidth: 14,
                    textAlign: 'right',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: isDone ? 'rgba(0,255,136,0.7)' : 'var(--text-dim)',
                  }}
                >
                  <span data-testid={`goal-number-${i}`}>{i + 1}</span>.
                </span>
              </span>
              <span
                onClick={() => toggleExpand(i)}
                onDoubleClick={() => openEditor(i)}
                title="Double-click to edit"
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  cursor: 'pointer',
                  color: isDone ? 'rgba(0,255,136,0.85)' : 'var(--text)',
                  textDecoration: isDone ? 'line-through' : 'none',
                  textDecorationColor: 'rgba(0,255,136,0.5)',
                }}
              >
                {g.title}
              </span>
              {achievement ? (
                <span
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: 'var(--neon-cyan)',
                  }}
                >
                  <TrophyIcon size={20} />
                </span>
              ) : (
                <button
                  onClick={() => patchGoal(i, { done: !g.done })}
                  className="goal-check"
                  title={g.done ? 'Mark as not done' : 'Mark as done'}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 13,
                    lineHeight: 1,
                    flexShrink: 0,
                    color: g.done ? '#00ff88' : 'rgba(0,255,136,0.3)',
                    textShadow: g.done ? '0 0 8px #00ff88' : 'none',
                  }}
                >
                  ✓
                </button>
              )}
            </div>

            {/* Expanded read view — double-click to edit */}
            {isOpen && !editing && (
              <div
                onDoubleClick={() => openEditor(i)}
                title="Double-click to edit"
                style={{
                  margin: '4px 0 2px 19px',
                  paddingLeft: 8,
                  borderLeft: '2px solid rgba(0,255,255,0.25)',
                  cursor: 'text',
                }}
              >
                {g.description.trim() ? (
                  <div
                    className="goal-md"
                    style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.5 }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkLineBreaks]}>
                      {g.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div
                    style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', fontStyle: 'italic' }}
                  >
                    No description — double-click to add
                  </div>
                )}
              </div>
            )}

            {/* Editor — keyboard-driven markdown, local draft state */}
            {editing && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  margin: '6px 0 4px 19px',
                  padding: 8,
                  background: 'rgba(0,255,255,0.04)',
                  border: 'var(--border)',
                  borderRadius: 4,
                }}
              >
                <input
                  value={editTitle}
                  onChange={(e) => editTitleText(i, e.target.value)}
                  placeholder="Title"
                  style={{
                    background: 'rgba(0,255,255,0.06)',
                    border: 'var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 8px',
                  }}
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => editDescription(i, e.target.value)}
                  onKeyDown={(e) => onDescKey(i, e)}
                  placeholder="Description — ⌘B bold · “- ” bullet · enter for new line"
                  rows={4}
                  style={{
                    background: 'rgba(0,255,255,0.06)',
                    border: 'var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    padding: '4px 8px',
                    resize: 'vertical',
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => removeGoal(i)}
                    className="btn-neon"
                    style={{ fontSize: 11, color: 'var(--text-dim)' }}
                  >
                    DELETE
                  </button>
                  <button
                    onClick={() => {
                      setEditIndex(null)
                      setExpanded((p) => new Set(p).add(i))
                    }}
                    className="btn-neon"
                    style={{ fontSize: 11 }}
                  >
                    DONE
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGoal()}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '5px 9px',
            transition: 'border 140ms, box-shadow 140ms',
          }}
          onFocus={(e) => {
            e.currentTarget.style.border = '1px solid rgba(0,255,255,0.55)'
            e.currentTarget.style.boxShadow = '0 0 8px rgba(0,255,255,0.25)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        <button
          onClick={addGoal}
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            padding: '5px 11px',
            borderRadius: 4,
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid rgba(0,255,255,0.25)',
            color: 'rgba(0,255,255,0.7)',
          }}
        >
          + ADD
        </button>
      </div>
    </div>
  )
}
