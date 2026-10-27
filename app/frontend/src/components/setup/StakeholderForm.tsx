import { useState } from 'react'
import type { StakeholderPayload, StakeholderResult } from '../../types/setup'
import { ERR, FIELD, FORM_CSS, LABEL, OK, PRIMARY, slugify } from './formStyles'

interface Props {
  onSubmit: (payload: StakeholderPayload) => Promise<StakeholderResult>
}

const EMPTY = { display_name: '', person_id: '', email: '', team_folder: '', manager: '' }

// Add one stakeholder: person folder, routing entry, optional leadership
// membership — in a single backend call (POST /api/setup/people).
export function StakeholderForm({ onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [idEdited, setIdEdited] = useState(false)
  const [leadership, setLeadership] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const setName = (display_name: string) =>
    setForm((f) => ({
      ...f,
      display_name,
      person_id: idEdited ? f.person_id : slugify(display_name),
    }))

  const canSubmit = form.display_name.trim() !== '' && form.person_id.trim() !== '' && !busy

  const submit = async () => {
    if (!canSubmit) return
    const payload: StakeholderPayload = {
      person_id: form.person_id.trim(),
      display_name: form.display_name.trim(),
      email: form.email.trim(),
      team_folder: form.team_folder.trim(),
      leadership,
      manager: form.manager.trim(),
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await onSubmit(payload)
      setMessage({
        ok: true,
        text: `Added ${payload.display_name}.${result.removed_example ? ' Example person removed.' : ''}`,
      })
      setForm(EMPTY)
      setIdEdited(false)
      setLeadership(false)
    } catch (e) {
      const conflict = e instanceof Error && e.message.includes('409')
      setMessage({
        ok: false,
        text: conflict
          ? `A person with id "${payload.person_id}" already exists.`
          : 'Could not add the person.',
      })
    } finally {
      setBusy(false)
    }
  }

  const field = (
    label: string,
    key: keyof typeof EMPTY,
    placeholder: string,
    onChange?: (v: string) => void
  ) => (
    <label style={LABEL}>
      {label}
      <input
        style={FIELD}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) =>
          onChange ? onChange(e.target.value) : setForm((f) => ({ ...f, [key]: e.target.value }))
        }
      />
    </label>
  )

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {field('Name', 'display_name', 'Pat Example', setName)}
        {field('Person id', 'person_id', 'pat-example', (v) => {
          setIdEdited(true)
          setForm((f) => ({ ...f, person_id: v }))
        })}
        {field('Email', 'email', 'pat@yourcompany.com')}
        {field('Team folder', 'team_folder', 'Growth')}
        {field('Manager', 'manager', 'who they report to')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={leadership}
            onChange={(e) => setLeadership(e.target.checked)}
            style={{ accentColor: '#22C55E', cursor: 'pointer' }}
          />
          Member of leadership group
        </label>
        <button style={PRIMARY} disabled={!canSubmit} onClick={submit}>
          Add person
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
    </div>
  )
}
