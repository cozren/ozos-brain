import { useMemo, useState } from 'react'
import { api } from '../../api'
import type { KnowledgeTree } from '../../types/knowledge'
import { slugify, hubParentOptions } from './folderTools'

const CYAN = 'var(--neon-cyan)'

// Modal for creating a new folder under knowledge-hub/. The user types a
// display name (slugified to a safe dir name) and picks a parent from the
// existing knowledge-hub folders. On success the new root-relative path is
// handed back via onCreated (the page reloads the tree); errors surface inline.
export function NewFolderDialog({
  tree,
  onClose,
  onCreated,
}: {
  tree: KnowledgeTree
  onClose: () => void
  onCreated: (path: string) => void
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('knowledge-hub')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const options = useMemo(() => hubParentOptions(tree), [tree])
  const slug = slugify(name)
  const canCreate = slug.length > 0 && !busy

  const submit = async () => {
    if (!canCreate) return
    setBusy(true)
    setError(null)
    try {
      const { path } = await api.createKnowledgeFolder(name, parent)
      onCreated(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder')
      setBusy(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    padding: '7px 9px',
    borderRadius: 6,
    border: '1px solid rgba(0,255,255,0.25)',
    background: 'rgba(8,12,20,0.9)',
    color: 'var(--text)',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    marginBottom: 5,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New folder"
        style={{
          width: 360,
          maxWidth: '90vw',
          padding: 18,
          borderRadius: 11,
          background: '#05080f',
          border: `1px solid ${'rgba(0,255,255,0.28)'}`,
          boxShadow: '0 14px 40px rgba(0,0,0,0.6), 0 0 20px rgba(0,255,255,0.08)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: CYAN,
            marginBottom: 14,
          }}
        >
          New folder
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="nf-name" style={labelStyle}>
            Name
          </label>
          <input
            id="nf-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onClose()
            }}
            placeholder="e.g. Team Retros"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="nf-parent" style={labelStyle}>
            Inside
          </label>
          <select
            id="nf-parent"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            style={fieldStyle}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {'  '.repeat(Math.max(0, o.depth - 1)) + (o.depth > 0 ? '└ ' : '') + o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Live preview of the resolved on-disk path. */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: slug ? 'var(--text-dim)' : 'rgba(148,163,184,0.35)',
            marginBottom: error ? 8 : 16,
            wordBreak: 'break-all',
          }}
        >
          → {parent}/{slug || '…'}
        </div>

        {error && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--neon-magenta)',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnStyle(false)}>
            Cancel
          </button>
          <button onClick={submit} disabled={!canCreate} style={btnStyle(true, !canCreate)}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(primary: boolean, disabled = false): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${primary ? 'rgba(0,255,255,0.4)' : 'rgba(148,163,184,0.25)'}`,
    background: primary && !disabled ? 'rgba(0,255,255,0.12)' : 'transparent',
    color: primary ? (disabled ? 'rgba(0,255,255,0.35)' : CYAN) : 'var(--text-dim)',
    opacity: disabled ? 0.6 : 1,
    transition: 'all 120ms',
  }
}
