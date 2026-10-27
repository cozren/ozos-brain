import { useState } from 'react'
import type { CyclePayload, CycleStage, SetupCadence } from '../../types/setup'
import { ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY, SECONDARY } from './formStyles'

interface Props {
  onSubmit: (payload: CyclePayload) => Promise<unknown>
  cadence?: SetupCadence | null
}

type Mode = 'choose' | 'company'

const blankStage = (): CycleStage => ({ label: '', start: '', end: '' })

// Either the company's review cycle (stages with dates → cycles.yaml) or the
// default manager cadence (monthly 1:1 note check + quarterly written
// reflection → reminders on Home).
export function CycleForm({ onSubmit, cadence }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [name, setName] = useState('')
  const [type, setType] = useState('deep-dive')
  const [stages, setStages] = useState<CycleStage[]>([blankStage()])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (payload: CyclePayload, okText: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await onSubmit(payload)
      setMessage({ ok: true, text: okText })
    } catch {
      setMessage({ ok: false, text: 'Could not save.' })
    } finally {
      setBusy(false)
    }
  }

  const validStages = stages.filter((s) => s.label.trim() !== '')
  const canSave = name.trim() !== '' && validStages.length > 0 && !busy

  const setStage = (i: number, patch: Partial<CycleStage>) =>
    setStages((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      {cadence && (
        <p style={{ ...HINT, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          Current:{' '}
          {cadence.mode === 'company' ? `company cycle ${cadence.cycle_id}` : 'default cadence'}
        </p>
      )}
      <p style={HINT}>
        No company cycle? The default cadence is a monthly 1:1 note check and a quarterly written
        reflection per report; it becomes a reminder list on Home.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          style={PRIMARY}
          disabled={busy}
          onClick={() => run({ mode: 'default' }, 'Default cadence set.')}
        >
          Use default cadence
        </button>
        <button
          style={mode === 'company' ? PRIMARY : SECONDARY}
          disabled={busy}
          onClick={() => setMode('company')}
        >
          Company cycle
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>

      {mode === 'company' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <label style={LABEL}>
              Cycle name
              <input
                style={FIELD}
                value={name}
                placeholder="Annual Review"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label style={LABEL}>
              Type
              <select style={FIELD} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="deep-dive">deep-dive</option>
                <option value="light-touch">light-touch</option>
              </select>
            </label>
          </div>
          {stages.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <label style={LABEL}>
                Stage label
                <input
                  style={FIELD}
                  value={s.label}
                  placeholder="Self Assessment"
                  onChange={(e) => setStage(i, { label: e.target.value })}
                />
              </label>
              <label style={LABEL}>
                Start
                <input
                  style={FIELD}
                  type="date"
                  value={s.start}
                  onChange={(e) => setStage(i, { start: e.target.value })}
                />
              </label>
              <label style={LABEL}>
                End
                <input
                  style={FIELD}
                  type="date"
                  value={s.end}
                  onChange={(e) => setStage(i, { end: e.target.value })}
                />
              </label>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={SECONDARY} onClick={() => setStages((all) => [...all, blankStage()])}>
              Add stage
            </button>
            <button
              style={PRIMARY}
              disabled={!canSave}
              onClick={() =>
                run(
                  { mode: 'company', name: name.trim(), type, stages: validStages },
                  'Cycle saved.'
                )
              }
            >
              Save cycle
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
