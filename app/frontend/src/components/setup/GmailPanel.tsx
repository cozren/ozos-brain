import { useState } from 'react'
import type { GmailStatus } from '../../types/setup'
import { CODE, ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY } from './formStyles'

interface Props {
  status: GmailStatus | null
  onSaveDrive: (folderId: string) => Promise<unknown>
}

function Check({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span
        aria-hidden
        style={{ color: ok ? '#22C55E' : '#F59E0B', fontFamily: 'var(--font-mono)', width: 12 }}
      >
        {ok ? '✓' : '○'}
      </span>
      <span
        data-ok={ok}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}
      >
        {label}
      </span>
      {detail && <span style={{ ...HINT, fontSize: 11 }}>{detail}</span>}
    </li>
  )
}

// Gemini notes via Gmail: three checks, the one-time auth command, and the
// optional Drive mirror folder (writes drive_parent_folder_id in routing).
export function GmailPanel({ status, onSaveDrive }: Props) {
  const [folderId, setFolderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  if (!status) return <p style={HINT}>Checking Gmail setup…</p>

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await onSaveDrive(folderId.trim())
      setMessage({ ok: true, text: 'Drive folder saved.' })
    } catch {
      setMessage({ ok: false, text: 'Could not save the Drive folder.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <Check
          label="OAuth client file"
          ok={status.credentials_file}
          detail="~/.gdrive-credentials.json (Desktop app client from Google Cloud)"
        />
        <Check
          label="Gmail token"
          ok={status.token_file}
          detail="written by the auth command below"
        />
        <Check
          label="Drive mirror folder"
          ok={Boolean(status.drive_parent_folder_id)}
          detail={status.drive_parent_folder_id ? status.drive_parent_folder_id : 'optional'}
        />
      </ul>
      <code style={CODE}>{status.auth_command}</code>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...LABEL, minWidth: 260 }}>
          Drive folder id (optional)
          <input
            style={FIELD}
            value={folderId}
            placeholder="leave empty for local-only notes"
            onChange={(e) => setFolderId(e.target.value)}
          />
        </label>
        <button style={PRIMARY} disabled={busy} onClick={save}>
          Save Drive folder
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
    </div>
  )
}
