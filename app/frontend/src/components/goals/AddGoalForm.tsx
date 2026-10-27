import { useState } from 'react'
import { ApiError } from '../../api'
import type { Goal, GoalStatus, NewGoalPayload } from '../../types/goals'
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/goals'
import { ERR, FIELD, FORM_CSS, LABEL, OK, PRIMARY } from '../setup/formStyles'

interface Props {
  onSubmit: (payload: NewGoalPayload) => Promise<Goal | unknown>
}

// A manual goal in one line: title, owner, target date, status and progress.
// Used on the Goals page and inside the Setup item's panel.
export function AddGoalForm({ onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<GoalStatus>('pending')
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const canSave = title.trim() !== '' && !busy

  const submit = async () => {
    if (!canSave) return
    setBusy(true)
    setMessage(null)
    const payload: NewGoalPayload = {
      title: title.trim(),
      owner: owner.trim(),
      target_date: targetDate,
      status,
      progress: progress.trim() === '' ? null : Number(progress),
    }
    try {
      await onSubmit(payload)
      setMessage({ ok: true, text: `Added ${payload.title}.` })
      setTitle('')
      setOwner('')
      setTargetDate('')
      setStatus('pending')
      setProgress('')
    } catch (e) {
      const text =
        e instanceof ApiError && e.status === 409
          ? 'A goal with that name already exists.'
          : e instanceof ApiError && e.detail
            ? e.detail
            : 'Could not save.'
      setMessage({ ok: false, text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <label style={LABEL}>
          Title
          <input
            style={FIELD}
            value={title}
            placeholder="Grow activation"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        <label style={LABEL}>
          Owner
          <input style={FIELD} value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <label style={LABEL}>
          Target date
          <input
            style={FIELD}
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
        <label style={LABEL}>
          Status
          <select
            style={FIELD}
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={LABEL}>
          Progress
          <input
            style={FIELD}
            type="number"
            min={0}
            max={100}
            value={progress}
            placeholder="%"
            onChange={(e) => setProgress(e.target.value)}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={PRIMARY} disabled={!canSave} onClick={submit}>
          Add goal
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
    </div>
  )
}
