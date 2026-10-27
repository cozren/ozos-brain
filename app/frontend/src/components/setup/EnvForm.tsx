import { useState } from 'react'
import { ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY } from './formStyles'

interface Props {
  names: string[]
  status: Record<string, boolean>
  onSave: (vars: Record<string, string>) => Promise<string[]>
}

const SECRET = /TOKEN|KEY|PASSWORD|SECRET/

// Writes named variables into the vault .env through the backend. Values are
// never read back: a set variable shows the placeholder "set", nothing more.
export function EnvForm({ names, status, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const filled = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v.trim() !== '')
  ) as Record<string, string>
  const canSave = Object.keys(filled).length > 0 && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    setMessage(null)
    try {
      const written = await onSave(filled)
      setMessage({ ok: true, text: `Saved ${written.join(', ')}.` })
      setValues({})
    } catch {
      setMessage({ ok: false, text: 'Could not write .env.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <p style={HINT}>Values go straight into the vault .env and are never shown again here.</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 10,
        }}
      >
        {names.map((name) => (
          <label key={name} style={LABEL}>
            {name}
            <input
              style={FIELD}
              type={SECRET.test(name) ? 'password' : 'text'}
              autoComplete="off"
              value={values[name] ?? ''}
              placeholder={status[name] ? 'set' : 'not set'}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={PRIMARY} disabled={!canSave} onClick={save}>
          Save to .env
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
    </div>
  )
}
