import { useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { colorFor, chipStyle } from '../../lib/tasks'

const CYAN = 'var(--neon-cyan)'

interface Props {
  allLabels: string[]
  labelColors: Record<string, string>
  onCreate: (title: string, description: string, labels: string[]) => void
}

// Click + → type a title, Tab/Enter to description, add labels. Esc cancels.
export function AddTask({ allLabels, labelColors, onCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')

  const reset = () => {
    setTitle('')
    setDescription('')
    setLabels([])
    setLabelInput('')
    setOpen(false)
  }
  const submit = () => {
    if (!title.trim()) {
      reset()
      return
    }
    onCreate(title.trim(), description.trim(), labels)
    reset()
  }
  const addLabel = (raw: string) => {
    const l = raw.trim()
    if (l && !labels.includes(l)) setLabels([...labels, l])
    setLabelInput('')
  }
  const suggestions = allLabels.filter(
    (l) =>
      !labels.includes(l) &&
      l !== 'performance review' &&
      l.toLowerCase().includes(labelInput.toLowerCase())
  )

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          textAlign: 'left',
          border: '1px dashed #2a3f57',
          borderRadius: 11,
          background: 'transparent',
          cursor: 'pointer',
          padding: '14px 17px',
          color: '#9fb6cc',
          fontSize: 14.5,
          fontFamily: 'var(--font-mono)',
          marginBottom: 14,
        }}
      >
        <span style={{ color: CYAN, fontSize: 20, lineHeight: 1 }}>+</span> Add a task
      </button>
    )
  }

  return (
    <div
      style={{
        border: `1px solid rgba(45,212,255,0.4)`,
        borderRadius: 11,
        marginBottom: 14,
        padding: '14px 16px',
        background: 'linear-gradient(180deg,#0a1a2c,#08131f)',
        boxShadow: '0 0 18px rgba(45,212,255,0.08)',
      }}
    >
      <input
        autoFocus
        value={title}
        placeholder="Task title…"
        autoComplete="off"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault()
          if (e.key === 'Escape') reset()
        }}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#f2f9ff',
          fontSize: 16.5,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
        }}
      />

      <div style={{ marginTop: 10 }}>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Description — add more detail (optional)"
        />
      </div>

      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}
      >
        {labels.map((l) => (
          <span
            key={l}
            style={{
              fontSize: 11,
              borderRadius: 20,
              padding: '3px 10px',
              display: 'inline-flex',
              gap: 6,
              ...chipStyle(colorFor(l, labelColors)),
            }}
          >
            {l}
            <span
              onClick={() => setLabels(labels.filter((x) => x !== l))}
              style={{ cursor: 'pointer', opacity: 0.7 }}
            >
              ×
            </span>
          </span>
        ))}
        <input
          value={labelInput}
          placeholder="+ label"
          autoComplete="off"
          onChange={(e) => setLabelInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLabel(labelInput)
            }
          }}
          style={{
            background: 'transparent',
            border: '1px dashed #2a3f57',
            borderRadius: 20,
            padding: '3px 11px',
            color: '#7fe3ff',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            width: 92,
          }}
        />
      </div>
      {labelInput && suggestions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {suggestions.map((l) => (
            <span
              key={l}
              onClick={() => addLabel(l)}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                color: '#b9cee0',
                border: '1px solid #2a3f57',
                borderRadius: 20,
                padding: '3px 10px',
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          onClick={submit}
          disabled={!title.trim()}
          style={{
            fontSize: 13,
            color: title.trim() ? '#04131f' : '#7e93a8',
            background: title.trim() ? CYAN : 'transparent',
            border: `1px solid ${title.trim() ? CYAN : '#2a3f57'}`,
            borderRadius: 8,
            padding: '8px 18px',
            cursor: title.trim() ? 'pointer' : 'default',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
          }}
        >
          Add task
        </button>
        <button
          onClick={reset}
          style={{
            fontSize: 13,
            color: '#9fb6cc',
            background: 'transparent',
            border: '1px solid #243a52',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
