import { useState } from 'react'
import { ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY } from './formStyles'

interface Props {
  defaultFolder: string
  existing?: string | null
  onCreate: (folder: string) => Promise<{ path: string }>
}

// A drop folder under <vault>/knowledge-hub/ that the Knowledge Hub picks up.
export function FolderForm({ defaultFolder, existing, onCreate }: Props) {
  const [folder, setFolder] = useState(defaultFolder)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const create = async () => {
    if (!folder.trim() || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const entry = await onCreate(folder.trim())
      setMessage({ ok: true, text: `Created ${entry.path}.` })
    } catch {
      setMessage({ ok: false, text: 'Could not create the folder.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      {existing && (
        <p style={{ ...HINT, fontFamily: 'var(--font-mono)', fontSize: 11 }}>Folder: {existing}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...LABEL, minWidth: 220 }}>
          Folder name
          <input style={FIELD} value={folder} onChange={(e) => setFolder(e.target.value)} />
        </label>
        <button style={PRIMARY} disabled={!folder.trim() || busy} onClick={create}>
          Create folder
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
      <p style={HINT}>
        Drop Markdown or PDF files into knowledge-hub/{folder.trim() || defaultFolder}/ and they
        appear in the Knowledge Hub.
      </p>
    </div>
  )
}
