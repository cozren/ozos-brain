import { useState } from 'react'
import type { RoutingPayload } from '../../types/setup'
import { ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY } from './formStyles'

interface Props {
  onSave: (payload: RoutingPayload) => Promise<unknown>
}

// The folders a meeting note may be routed to, plus the free-text tagging guide
// appended to the categorisation prompt. Writes .ozos/meeting-routing.json.
export function RoutingForm({ onSave }: Props) {
  const [foldersText, setFoldersText] = useState('')
  const [defaultFolder, setDefaultFolder] = useState('Other')
  const [guide, setGuide] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const folders = foldersText
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
  const canSave = folders.length > 0 && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    setMessage(null)
    try {
      await onSave({
        folders,
        default_folder: defaultFolder.trim() || 'Other',
        tagging_guide: guide,
      })
      setMessage({ ok: true, text: 'Routing saved.' })
    } catch {
      setMessage({ ok: false, text: 'Could not save routing.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={LABEL}>
          Folders (one per line)
          <textarea
            style={{ ...FIELD, minHeight: 88, resize: 'vertical' }}
            value={foldersText}
            placeholder={'Growth\nPlatform\nLeadership'}
            onChange={(e) => setFoldersText(e.target.value)}
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={LABEL}>
            Default folder
            <input
              style={FIELD}
              value={defaultFolder}
              onChange={(e) => setDefaultFolder(e.target.value)}
            />
          </label>
          <label style={LABEL}>
            Tagging guide
            <input
              style={FIELD}
              value={guide}
              placeholder="Tag product talk as <Product>/<topic>."
              onChange={(e) => setGuide(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={PRIMARY} disabled={!canSave} onClick={save}>
          Save routing
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
      <p style={HINT}>
        Adding a stakeholder adds their team folder here for you; this form is for the rest.
      </p>
    </div>
  )
}
