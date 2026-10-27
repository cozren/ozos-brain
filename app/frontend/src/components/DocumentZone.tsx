import { useRef, useState } from 'react'
import type { Document } from '../types'
import { SectionHeader } from './SectionHeader'

interface Props {
  documents: Document[]
  onUpload: (file: File, label: string) => void
  onView: (filename: string) => void
  onDelete: (filename: string) => void
}

export function DocumentZone({ documents, onUpload, onView, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onUpload(file, file.name.replace(/\.[^.]+$/, ''))
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files[0]
    if (file) onUpload(file, file.name.replace(/\.[^.]+$/, ''))
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file, file.name.replace(/\.[^.]+$/, ''))
  }

  return (
    <div>
      <SectionHeader label="DOCUMENTS" right={documents.length || undefined} />
      <div
        onDrop={handleDrop}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragOver ? 'var(--neon-cyan)' : 'rgba(0,255,255,0.3)'}`,
          padding: '10px 12px',
          marginBottom: 8,
          cursor: 'pointer',
          textAlign: 'center',
          background: dragOver ? 'rgba(0,255,255,0.08)' : 'transparent',
          boxShadow: dragOver ? 'var(--glow)' : 'none',
          fontSize: 11,
          color: 'var(--text-dim)',
          letterSpacing: 1,
          transition: 'var(--transition)',
        }}
      >
        ⬇ DROP FILES HERE / CMD+V TO PASTE
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
      {documents.map((doc) => (
        <div
          key={doc.file}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}
        >
          <span style={{ color: 'var(--neon-cyan)' }}>›</span>
          <span style={{ flex: 1 }}>{doc.label}</span>
          <span style={{ color: 'var(--text-dim)' }}>{doc.ingested_at}</span>
          <button
            onClick={() => onView(doc.file)}
            className="btn-neon"
            style={{ fontSize: 10, padding: '2px 6px' }}
          >
            VIEW ↗
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${doc.label}"?`)) onDelete(doc.file)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.18)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 4px',
              lineHeight: 1,
              transition: 'color 140ms',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#ff3030'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.18)'
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
