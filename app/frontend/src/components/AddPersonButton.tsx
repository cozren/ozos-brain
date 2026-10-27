import { useState } from 'react'
import type { PersonMeta } from '../types'

interface Props {
  onAdd: (p: PersonMeta) => Promise<void>
}

export function AddPersonButton({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    display_name: '',
    role: '',
    start_date: '',
    manager: '',
  })

  const submit = async () => {
    if (!form.name || !form.display_name) return
    await onAdd({ ...form })
    setForm({ name: '', display_name: '', role: '', start_date: '', manager: '' })
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Add person"
        style={{
          width: 40,
          alignSelf: 'stretch',
          background: 'transparent',
          border: 'var(--border)',
          color: 'var(--neon-cyan)',
          fontSize: 20,
          cursor: 'pointer',
          boxShadow: 'var(--glow)',
          transition: 'var(--transition)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,255,255,0.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        +
      </button>
    )
  }

  return (
    <div className="card" style={{ width: 200, padding: 12, flexShrink: 0 }}>
      <div className="section-label" style={{ marginBottom: 8 }}>
        NEW PERSON
      </div>
      {(['display_name', 'name', 'role', 'start_date'] as const).map((field) => (
        <input
          key={field}
          placeholder={field.replace('_', ' ')}
          value={form[field]}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
          style={{
            width: '100%',
            marginBottom: 6,
            background: 'rgba(0,255,255,0.06)',
            border: 'var(--border)',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '4px 8px',
          }}
        />
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} className="btn-neon" style={{ flex: 1, fontSize: 10 }}>
          CONFIRM
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            flex: 1,
            fontSize: 10,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}
