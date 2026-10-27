// frontend/src/components/control-tower/QuickGoals.tsx
import { useState, useEffect, useRef, useCallback } from 'react'

interface Goal {
  id: string
  title: string
  description: string
  done: boolean
  createdAt: number
}

const STORAGE_KEY = 'ct-quick-goals'

function load(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(goals: Goal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function QuickGoals() {
  const [goals, setGoals] = useState<Goal[]>(load)
  const [draft, setDraft] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    save(goals)
  }, [goals])

  const addGoal = useCallback(() => {
    const title = draft.trim()
    if (!title) return
    setGoals((prev) => [
      { id: uid(), title, description: '', done: false, createdAt: Date.now() },
      ...prev,
    ])
    setDraft('')
  }, [draft])

  const deleteGoal = useCallback(
    (id: string) => {
      if (openId === id) setOpenId(null)
      setGoals((prev) => prev.filter((g) => g.id !== id))
    },
    [openId]
  )

  const toggleDone = useCallback((id: string) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, done: !g.done } : g)))
  }, [])

  const openDetail = useCallback((goal: Goal) => {
    setEditTitle(goal.title)
    setEditDesc(goal.description)
    setOpenId((prev) => (prev === goal.id ? null : goal.id))
  }, [])

  const saveDetail = useCallback(
    (id: string) => {
      const title = editTitle.trim()
      if (!title) return
      setGoals((prev) =>
        prev.map((g) => (g.id === id ? { ...g, title, description: editDesc } : g))
      )
      setOpenId(null)
    },
    [editTitle, editDesc]
  )

  // Close popup when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = goals.filter((g) => !g.done)
  const done = goals.filter((g) => g.done)

  return (
    <div
      ref={containerRef}
      style={{
        background: '#0E1628',
        border: '1px solid rgba(168,85,247,0.25)',
        padding: '14px 15px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#A855F7',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 6px #A855F755',
          }}
        >
          Quick Goals
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#C084FC',
            background: '#080e1c',
            border: '1px solid #A855F722',
            padding: '2px 7px',
          }}
        >
          {done.length} / {goals.length}
        </span>
      </div>

      {/* Add input */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGoal()}
          placeholder="new goal…"
          style={{
            flex: 1,
            background: '#060d1a',
            border: '1px solid rgba(168,85,247,0.2)',
            color: '#CBD5E1',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '5px 8px',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(168,85,247,0.5)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(168,85,247,0.2)')}
        />
        <button
          onClick={addGoal}
          style={{
            background: 'rgba(168,85,247,0.12)',
            border: '1px solid rgba(168,85,247,0.3)',
            color: '#A855F7',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '5px 10px',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>

      {/* Goal list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {active.map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            isOpen={openId === g.id}
            editTitle={editTitle}
            editDesc={editDesc}
            onOpen={openDetail}
            onToggle={toggleDone}
            onDelete={deleteGoal}
            onSave={saveDetail}
            onTitleChange={setEditTitle}
            onDescChange={setEditDesc}
          />
        ))}

        {done.length > 0 && (
          <>
            <div style={{ borderTop: '1px dashed #1E293B', margin: '6px 0' }} />
            {done.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                isOpen={openId === g.id}
                editTitle={editTitle}
                editDesc={editDesc}
                onOpen={openDetail}
                onToggle={toggleDone}
                onDelete={deleteGoal}
                onSave={saveDetail}
                onTitleChange={setEditTitle}
                onDescChange={setEditDesc}
              />
            ))}
          </>
        )}

        {goals.length === 0 && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: '#1E293B',
              padding: '8px',
              textAlign: 'center',
            }}
          >
            no goals yet
          </div>
        )}
      </div>
    </div>
  )
}

interface RowProps {
  goal: Goal
  isOpen: boolean
  editTitle: string
  editDesc: string
  onOpen: (g: Goal) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onSave: (id: string) => void
  onTitleChange: (v: string) => void
  onDescChange: (v: string) => void
}

function GoalRow({
  goal,
  isOpen,
  editTitle,
  editDesc,
  onOpen,
  onToggle,
  onDelete,
  onSave,
  onTitleChange,
  onDescChange,
}: RowProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ position: 'relative', marginBottom: 2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 8px',
          border: `1px solid ${hovered ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.08)'}`,
          transition: 'border-color 120ms',
          opacity: goal.done ? (hovered ? 0.7 : 0.5) : 1,
        }}
      >
        {/* Checkbox */}
        <div
          onClick={() => onToggle(goal.id)}
          style={{
            width: 11,
            height: 11,
            minWidth: 11,
            border: `1px solid ${goal.done ? '#A855F7' : 'rgba(168,85,247,0.4)'}`,
            background: goal.done ? 'rgba(168,85,247,0.2)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 7,
            color: '#A855F7',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {goal.done ? '✓' : ''}
        </div>

        {/* Title */}
        <span
          onClick={() => onOpen(goal)}
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: hovered ? '#CBD5E1' : '#94A3B8',
            cursor: 'pointer',
            textDecoration: goal.done ? 'line-through' : 'none',
            userSelect: 'none',
            transition: 'color 120ms',
          }}
        >
          {goal.title}
        </span>

        {/* Delete — centered in row, visible on hover */}
        <span
          onClick={() => onDelete(goal.id)}
          style={{
            fontSize: 13,
            color: '#EF4444',
            cursor: 'pointer',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 120ms',
            flexShrink: 0,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ✕
        </span>
      </div>

      {/* Detail popup */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 2px)',
            zIndex: 50,
            background: '#080f20',
            border: '1px solid rgba(168,85,247,0.3)',
            padding: '10px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
          }}
        >
          <input
            value={editTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Goal title…"
            autoFocus
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(168,85,247,0.25)',
              color: '#CBD5E1',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 0 6px',
              outline: 'none',
              marginBottom: 8,
              letterSpacing: '0.3px',
            }}
          />
          <textarea
            value={editDesc}
            onChange={(e) => onDescChange(e.target.value)}
            placeholder="Description…"
            rows={3}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              lineHeight: 1.7,
              padding: 0,
              outline: 'none',
              resize: 'vertical',
              minHeight: 56,
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px solid #0f1f33',
            }}
          >
            <button
              onClick={() => onSave(goal.id)}
              style={{
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.3)',
                color: '#A855F7',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                padding: '3px 10px',
                cursor: 'pointer',
                letterSpacing: '1px',
              }}
            >
              save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
