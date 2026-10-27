import { useState, type CSSProperties } from 'react'
import { GripVertical } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { remarkLineBreaks } from '../../lib/markdown'
import type { AnyTask, SubTask, TaskPlan } from '../../types/tasks'
import { isReviewGoal } from '../../types/tasks'
import { colorFor, chipStyle } from '../../lib/tasks'
import { Timeline, MonthsBar, ScrollRail, useSyncedScroll } from './Timeline'
import { RichTextEditor } from './RichTextEditor'

const CYAN = 'var(--neon-cyan)'
const GREEN = '#00ff88'

// Shared "section panel" look so the areas read as distinct, tidy blocks.
const PANEL: CSSProperties = {
  border: '1px solid #24384f',
  borderRadius: 9,
  padding: '13px 15px',
  background: 'rgba(14,26,42,0.6)',
}
const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 1.5,
  color: '#84acce',
  marginBottom: 9,
}

export interface TaskPatch {
  title?: string
  description?: string
  done?: boolean
  labels?: string[]
  subtasks?: SubTask[]
  plan?: TaskPlan | null
}

// Drag-to-reorder wiring, supplied only for own tasks (review goals are pinned).
// The grip handle is the drag source; the whole card is the drop target.
export interface DragProps {
  dragging: boolean // this card is the one being dragged
  dropTarget: boolean // this card is the current drop target
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}

interface Props {
  item: AnyTask
  allLabels: string[]
  labelColors: Record<string, string>
  onPatch: (fields: TaskPatch) => void
  onDelete?: () => void
  drag?: DragProps
}

function newSubId() {
  return 's_' + (crypto.randomUUID?.() ?? Math.abs(Math.sin(Date.now())).toString(36)).slice(0, 8)
}

// A round check toggle, cyan→green when done.
function Check({
  done,
  onClick,
  size = 18,
}: {
  done: boolean
  onClick: () => void
  size?: number
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      role="checkbox"
      aria-checked={done}
      title={done ? 'Mark not done' : 'Mark done'}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        cursor: 'pointer',
        border: `1.5px solid ${done ? GREEN : '#3a5572'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: done ? 'rgba(0,255,136,0.12)' : 'transparent',
        color: GREEN,
        fontSize: size * 0.6,
        boxShadow: done ? '0 0 8px rgba(0,255,136,0.35)' : 'none',
        transition: 'all 160ms',
      }}
    >
      {done ? '✓' : ''}
    </span>
  )
}

function Chip({ text, color, onRemove }: { text: string; color: string; onRemove?: () => void }) {
  return (
    <span
      style={{
        fontSize: 11,
        borderRadius: 20,
        padding: '3px 10px',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...chipStyle(color),
      }}
    >
      {text}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="remove label"
          style={{ cursor: 'pointer', opacity: 0.7, fontSize: 13 }}
        >
          ×
        </span>
      )}
    </span>
  )
}

export function TaskItem({ item, allLabels, labelColors, onPatch, onDelete, drag }: Props) {
  const review = isReviewGoal(item)
  const [open, setOpen] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [subInput, setSubInput] = useState('')
  const subs = item.subtasks || []
  const doneSubs = subs.filter((s) => s.done).length
  const scroll = useSyncedScroll() // keep all planner strips in this card aligned while scrolling

  const openEditDesc = () => {
    setOpen(true)
    setEditingDesc(true)
  }

  const addLabel = (l: string) => {
    if (l && !item.labels.includes(l)) onPatch({ labels: [...item.labels, l] })
  }
  const removeLabel = (l: string) => onPatch({ labels: item.labels.filter((x) => x !== l) })

  const addSub = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    onPatch({ subtasks: [...subs, { id: newSubId(), title: t, done: false, weeks: [] }] })
    setSubInput('')
  }
  const toggleSub = (id: string) =>
    onPatch({ subtasks: subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) })
  const removeSub = (id: string) => onPatch({ subtasks: subs.filter((s) => s.id !== id) })
  const setSubWeeks = (id: string, weeks: string[]) =>
    onPatch({ subtasks: subs.map((s) => (s.id === id ? { ...s, weeks } : s)) })

  // Planner has a strip per subtask; with no subtasks it shows one whole-task strip
  // bound directly to the task's own plan.
  const hasSubs = subs.length > 0
  const wholeTaskWeeks = item.plan?.weeks ?? []
  const setWholeTaskWeeks = (weeks: string[]) => onPatch({ plan: { weeks, manual: true } })
  // shared grid rows: header, then one strip row per subtask (or a single whole-task
  // row), then a final row carrying the planner's single scroll rail.
  const stripRows = hasSubs ? subs.length : 1
  const rowCount = stripRows + 2

  const borderColor = drag?.dropTarget
    ? 'var(--neon-cyan)'
    : review
      ? 'rgba(245,185,66,0.3)'
      : item.done
        ? '#1d3346'
        : '#2a3a52'

  return (
    <div
      onDragOver={
        drag
          ? (e) => {
              e.preventDefault()
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
              drag.onDragOver()
            }
          : undefined
      }
      onDrop={
        drag
          ? (e) => {
              e.preventDefault()
              drag.onDrop()
            }
          : undefined
      }
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 11,
        marginBottom: 9,
        background: 'linear-gradient(180deg,#0b1422,#091120)',
        opacity: drag?.dragging ? 0.4 : item.done && !open ? 0.62 : 1,
        boxShadow: drag?.dropTarget
          ? '0 0 0 1px var(--neon-cyan), 0 0 12px rgba(45,212,255,0.35)'
          : 'none',
        transition: 'opacity 160ms, border-color 160ms, box-shadow 160ms',
      }}
    >
      {/* Header — always visible. Collapsed shows ONLY this (titles only). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px' }}>
        {/* drag handle — own tasks only; grab here to reorder */}
        {drag && (
          <span
            draggable
            onDragStart={(e) => {
              drag.onDragStart()
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', item.id)
              }
            }}
            onDragEnd={drag.onDragEnd}
            title="Drag to reorder"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'grab',
              color: '#3f5c78',
              flexShrink: 0,
              marginLeft: -5,
              userSelect: 'none',
              touchAction: 'none',
            }}
          >
            <GripVertical size={15} />
          </span>
        )}
        {/* expand sign — left */}
        <span
          onClick={() => setOpen((o) => !o)}
          title={open ? 'collapse' : 'expand'}
          style={{
            cursor: 'pointer',
            color: '#3f9ad4',
            fontSize: 11,
            flexShrink: 0,
            width: 12,
            textAlign: 'center',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms',
          }}
        >
          ▶
        </span>

        {/* title + tags sitting right beside it (left group); spacer pushes check right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={item.title}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== item.title) onPatch({ title: v })
                setEditingTitle(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${CYAN}`,
                outline: 'none',
                color: '#f2f9ff',
                fontSize: 15.5,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            />
          ) : (
            <span
              onClick={() => setOpen(true)}
              onDoubleClick={() => setEditingTitle(true)}
              title="click to expand · double-click to edit"
              style={{
                cursor: 'pointer',
                fontSize: 15.5,
                fontWeight: 700,
                color: '#f2f9ff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
                minWidth: 0,
                textDecoration: item.done ? 'line-through' : 'none',
                opacity: item.done ? 0.72 : 1,
              }}
            >
              {item.title || 'Untitled'}
            </span>
          )}
          {/* tags — immediately right of the title; add new ones with the + (own tasks) */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            {item.labels.map((l) => (
              <Chip
                key={l}
                text={l}
                color={colorFor(l, labelColors)}
                onRemove={review ? undefined : () => removeLabel(l)}
              />
            ))}
            {!review && <LabelAdder labels={item.labels} allLabels={allLabels} onAdd={addLabel} />}
            {subs.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  color: '#62b4e6',
                  border: '1px solid rgba(45,212,255,0.3)',
                  borderRadius: 10,
                  padding: '2px 9px',
                  whiteSpace: 'nowrap',
                }}
              >
                {doneSubs}/{subs.length}
              </span>
            )}
          </div>
        </div>

        {/* completion button — far right */}
        <Check done={item.done} onClick={() => onPatch({ done: !item.done })} />
      </div>

      {/* Open body — three aligned containers: Description · Sub-tasks · Planner.
          Sub-tasks and Planner share the same grid rows (subgrid) so each subtask sits
          on the same line as its planner strip; ratio 10:5:12 holds on resize. */}
      {open && (
        <div
          style={{ padding: '0 15px 14px 37px', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '10fr 5fr 12fr',
              columnGap: 12,
              rowGap: 8,
              alignItems: 'stretch',
            }}
          >
            {/* DESCRIPTION — spans every row */}
            <div style={{ ...PANEL, minWidth: 0, gridColumn: 1, gridRow: `1 / span ${rowCount}` }}>
              <div style={SECTION_LABEL}>DESCRIPTION</div>
              {editingDesc ? (
                <DescriptionEditor
                  value={item.description}
                  onDone={(d) => {
                    if (d !== item.description) onPatch({ description: d })
                    setEditingDesc(false)
                  }}
                />
              ) : (
                <DescriptionPreview
                  text={item.description}
                  onEdit={openEditDesc}
                  onClear={() => onPatch({ description: '' })}
                />
              )}
            </div>

            {/* SUB-TASKS — subgrid rows align with the planner column */}
            <div
              style={{
                ...PANEL,
                minWidth: 0,
                gridColumn: 2,
                gridRow: `1 / span ${rowCount}`,
                display: 'grid',
                gridTemplateRows: 'subgrid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                alignItems: 'start',
              }}
            >
              <div style={{ ...SECTION_LABEL, marginBottom: 0, alignSelf: 'start' }}>SUB-TASKS</div>
              {subs.map((s) => (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}
                >
                  <Check done={s.done} onClick={() => toggleSub(s.id)} size={17} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      lineHeight: 1.3,
                      color: s.done ? '#7e93a8' : '#dceaf7',
                      textDecoration: s.done ? 'line-through' : 'none',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {s.title}
                  </span>
                  <span
                    onClick={() => removeSub(s.id)}
                    title="delete subtask"
                    style={{
                      cursor: 'pointer',
                      color: '#7e93a8',
                      fontSize: 15,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
              <input
                value={subInput}
                placeholder="+ add subtask…"
                autoComplete="off"
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSub(subInput)
                }}
                style={{
                  background: 'transparent',
                  border: '1px dashed #2a3f57',
                  borderRadius: 8,
                  padding: '7px 10px',
                  color: '#dceaf7',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
              {/* pad so the column reaches the planner's rail row (no subtasks → one filler) */}
              {Array.from({ length: rowCount - subs.length - 2 }, (_, i) => (
                <div key={`pad${i}`} />
              ))}
            </div>

            {/* PLANNER — header (label + months), then a strip per subtask, or one whole-task strip */}
            <div
              style={{
                ...PANEL,
                minWidth: 0,
                gridColumn: 3,
                gridRow: `1 / span ${rowCount}`,
                display: 'grid',
                gridTemplateRows: 'subgrid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                alignItems: 'start',
              }}
            >
              <div style={{ alignSelf: 'start' }}>
                <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>PLANNER</div>
                <MonthsBar scroll={scroll} />
              </div>
              {hasSubs ? (
                subs.map((s) => (
                  <Timeline
                    key={s.id}
                    compact
                    testId="subtask-planner"
                    selected={s.weeks || []}
                    onChange={(ws) => setSubWeeks(s.id, ws)}
                    scroll={scroll}
                  />
                ))
              ) : (
                <Timeline
                  compact
                  testId="task-planner"
                  selected={wholeTaskWeeks}
                  onChange={setWholeTaskWeeks}
                  scroll={scroll}
                />
              )}
              {/* one scroll rail for the whole planner, pinned to the bottom row */}
              <div style={{ alignSelf: 'end' }}>
                <ScrollRail scroll={scroll} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            {review && (
              <span style={{ fontSize: 11, color: '#86a0b8' }}>
                ↳ from your performance review — edits sync back
              </span>
            )}
            {!review && onDelete && (
              <span
                onClick={onDelete}
                title="delete task"
                style={{
                  marginLeft: 'auto',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#e07089',
                  border: '1px solid rgba(224,112,137,0.5)',
                  borderRadius: 7,
                  padding: '5px 12px',
                }}
              >
                Delete
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Small "+" beside the last tag → inline field to add a label (new or pick an existing one).
function LabelAdder({
  labels,
  allLabels,
  onAdd,
}: {
  labels: string[]
  allLabels: string[]
  onAdd: (l: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const commit = (l: string) => {
    const t = l.trim()
    if (t) onAdd(t)
    setV('')
    setOpen(false)
  }
  const suggestions = allLabels.filter(
    (l) =>
      !labels.includes(l) && l !== 'performance review' && l.toLowerCase().includes(v.toLowerCase())
  )

  if (!open) {
    return (
      <span
        onClick={() => setOpen(true)}
        title="add label"
        style={{
          cursor: 'pointer',
          width: 19,
          height: 19,
          borderRadius: '50%',
          border: '1px dashed #3a5a7a',
          color: CYAN,
          fontSize: 13,
          lineHeight: '17px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        +
      </span>
    )
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <input
        autoFocus
        value={v}
        placeholder="label"
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(v)
          if (e.key === 'Escape') {
            setV('')
            setOpen(false)
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        style={{
          width: 96,
          background: 'transparent',
          border: `1px solid ${CYAN}`,
          borderRadius: 20,
          padding: '3px 11px',
          color: '#7fe3ff',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
        }}
      />
      {v && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '115%',
            left: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            background: '#0b1626',
            border: '1px solid #2a3f57',
            borderRadius: 8,
            padding: 5,
            minWidth: 120,
          }}
        >
          {suggestions.slice(0, 6).map((l) => (
            <span
              key={l}
              onMouseDown={() => commit(l)}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                color: '#b9cee0',
                padding: '3px 7px',
                borderRadius: 5,
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </span>
  )
}

// Blank lines a user types for spacing are paragraph separators in markdown and get
// collapsed; map each empty line to a non-breaking space so remarkLineBreaks renders
// it as a visible empty row — the description shows exactly as typed.
function keepBlankLines(text: string): string {
  return text
    .split('\n')
    .map((l) => (l.trim() === '' ? ' ' : l))
    .join('\n')
}

// Full-height markdown preview. Double-click to edit; hover reveals corner edit/clear icons.
function DescriptionPreview({
  text,
  onEdit,
  onClear,
}: {
  text: string
  onEdit: () => void
  onClear: () => void
}) {
  const [hover, setHover] = useState(false)
  const empty = !text.trim()
  return (
    <div
      onDoubleClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Double-click to edit"
      style={{
        position: 'relative',
        cursor: 'text',
        borderLeft: '2px solid rgba(45,212,255,0.3)',
        paddingLeft: 11,
        minHeight: 18,
      }}
    >
      {empty ? (
        <span style={{ fontSize: 13, color: 'rgba(170,186,205,0.7)', fontStyle: 'italic' }}>
          No description — double-click to add
        </span>
      ) : (
        <div className="goal-md" style={{ fontSize: 13, color: '#dceaf7', lineHeight: 1.35 }}>
          <ReactMarkdown remarkPlugins={[remarkLineBreaks]}>{keepBlankLines(text)}</ReactMarkdown>
        </div>
      )}
      {hover && !empty && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            display: 'flex',
            gap: 8,
            background: 'rgba(9,17,32,0.9)',
            borderRadius: 6,
            padding: '3px 7px',
          }}
        >
          <span
            onClick={onEdit}
            title="edit"
            style={{ cursor: 'pointer', color: CYAN, fontSize: 14 }}
          >
            ✎
          </span>
          <span
            onClick={onClear}
            title="clear description"
            style={{ cursor: 'pointer', color: '#e07089', fontSize: 14 }}
          >
            🗑
          </span>
        </div>
      )}
    </div>
  )
}

function DescriptionEditor({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <RichTextEditor value={v} onChange={setV} autofocus placeholder="add more detail…" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onDone(value)}
          style={{
            cursor: 'pointer',
            fontSize: 12,
            color: '#86a0b8',
            background: 'transparent',
            border: 'none',
            padding: '5px 12px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onDone(v)}
          style={{
            cursor: 'pointer',
            fontSize: 12,
            color: '#04131f',
            background: CYAN,
            border: 'none',
            borderRadius: 7,
            padding: '5px 14px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
