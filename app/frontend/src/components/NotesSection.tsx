import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { remarkLineBreaks } from '../lib/markdown'
import { SectionHeader } from './SectionHeader'

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
}

export function NotesSection({ value = '', onChange, label = 'PERSONAL NOTES' }: Props) {
  const [editing, setEditing] = useState(false)
  // Local draft keeps the caret stable through the async persistence round-trip.
  const [draft, setDraft] = useState('')

  const open = () => {
    setDraft(value)
    setEditing(true)
  }
  const edit = (v: string) => {
    setDraft(v)
    onChange(v)
  }

  // ⌘/Ctrl+B bolds the selection. Bullets (- ) and new rows are typed straight in.
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      const ta = e.currentTarget
      const { selectionStart: s, selectionEnd: en, value: v } = ta
      edit(v.slice(0, s) + `**${v.slice(s, en)}**` + v.slice(en))
    }
  }

  return (
    <div>
      <SectionHeader
        label={label}
        right={
          !editing && (
            <button
              onClick={open}
              aria-label="Edit notes"
              title="Edit (or double-click the note)"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 0.5,
                color: 'rgba(0,255,255,0.55)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                transition: 'color 120ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#00ffff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(0,255,255,0.55)'
              }}
            >
              ✎ edit
            </button>
          )
        }
      />
      {editing ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            background: 'rgba(0,255,255,0.04)',
            border: 'var(--border)',
            borderRadius: 4,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKey}
            autoFocus
            placeholder="Personal note or learning — ⌘B bold · “- ” bullet · enter for new line"
            rows={6}
            style={{
              background: 'rgba(0,255,255,0.06)',
              border: 'var(--border)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 8px',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} className="btn-neon" style={{ fontSize: 11 }}>
              DONE
            </button>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={open}
          title="Double-click to edit"
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            cursor: 'text',
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.015)',
            borderLeft: '2px solid rgba(0,255,255,0.25)',
          }}
        >
          {value.trim() ? (
            <div
              className="goal-md"
              style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.5 }}
            >
              <ReactMarkdown remarkPlugins={[remarkLineBreaks]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', fontStyle: 'italic' }}>
              No notes yet — double-click to add a personal note or learning
            </div>
          )}
        </div>
      )}
    </div>
  )
}
