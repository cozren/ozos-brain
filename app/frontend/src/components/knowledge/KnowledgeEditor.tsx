import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { KnowledgeFile } from '../../types/knowledge'
import { KnowledgeMarkdownBody } from './KnowledgePreview'

interface KnowledgeEditorProps {
  file: KnowledgeFile
  onSaved: (updated: KnowledgeFile) => void
  folderOptions?: string[]
}

export function KnowledgeEditor({ file, onSaved, folderOptions = [] }: KnowledgeEditorProps) {
  // Strip .md suffix for display in the title input
  const initialTitle = file.name.replace(/\.md$/, '')

  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(file.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tags state
  const [tags, setTags] = useState<string[]>(file.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])

  // Folders state
  const [folders, setFolders] = useState<string[]>(file.folders ?? [])

  // Links state
  const [links, setLinks] = useState<{ label: string; url: string }[]>(file.links ?? [])
  const [linkError, setLinkError] = useState<string | null>(null)

  // Fetch available tags on mount
  useEffect(() => {
    api
      .getKnowledgeTags()
      .then((r) => setTagSuggestions(r.tags))
      .catch(() => {})
  }, [])

  const titleChanged = title !== initialTitle
  const contentChanged = content !== file.content
  const metaChanged =
    JSON.stringify(tags) !== JSON.stringify(file.tags ?? []) ||
    JSON.stringify(folders) !== JSON.stringify(file.folders ?? []) ||
    JSON.stringify(links) !== JSON.stringify(file.links ?? [])

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const toggleFolder = (name: string) => {
    setFolders((prev) => (prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]))
  }

  const addLink = () => {
    setLinks([...links, { label: '', url: '' }])
  }

  const updateLink = (idx: number, field: 'label' | 'url', value: string) => {
    setLinks(links.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  const removeLink = (idx: number) => {
    setLinks(links.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    // Validate links
    const validLinks = links.filter((l) => l.url.trim())
    for (const link of validLinks) {
      try {
        new URL(link.url)
      } catch {
        const msg = `Invalid URL: ${link.url}`
        setLinkError(msg)
        setError(msg)
        return
      }
    }

    if (!titleChanged && !contentChanged && !metaChanged) return

    setSaving(true)
    setError(null)
    setLinkError(null)
    try {
      let updated: KnowledgeFile = file

      // Save body first if changed
      if (contentChanged) {
        updated = await api.putKnowledgeFile(file.path, content)
      }

      // Update meta if changed
      if (metaChanged) {
        updated = await api.updateKnowledgeMeta(file.path, {
          tags,
          folders,
          links: validLinks,
        })
      }

      // Then rename if needed (use original path even if content was saved,
      // since putKnowledgeFile returns the same path)
      if (titleChanged) {
        const newName = title.endsWith('.md') ? title : `${title}.md`
        updated = await api.renameKnowledgeFile(file.path, newName)
      }

      onSaved(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Filtered tag suggestions based on current input
  const filteredSuggestions =
    tagInput.trim().length > 0
      ? tagSuggestions.filter(
          (s) => s.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(s)
        )
      : []

  return (
    <div
      className="knowledge-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label
          htmlFor="ke-title"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Title
        </label>
        <input
          id="ke-title"
          aria-label="Title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            background: 'rgba(148,163,184,0.06)',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 4,
            padding: '6px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text)',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tags section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Tags
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 4,
                padding: '2px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  padding: 0,
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
          {(file.folder_tags ?? []).map((tag) => (
            <span
              key={`ft-${tag}`}
              title="From folder — auto-applied"
              style={{
                background: 'rgba(148,163,184,0.10)',
                border: '1px dashed rgba(148,163,184,0.35)',
                borderRadius: 4,
                padding: '2px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-dim)',
              }}
            >
              {tag}
            </span>
          ))}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Add tag..."
              list="ke-tag-suggestions"
              style={{
                background: 'rgba(148,163,184,0.06)',
                border: '1px solid rgba(148,163,184,0.18)',
                borderRadius: 4,
                padding: '3px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text)',
                outline: 'none',
                width: 120,
              }}
            />
            <datalist id="ke-tag-suggestions">
              {filteredSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* Folders section */}
      {folderOptions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Folders
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {folderOptions.map((name) => (
              <label
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  aria-label={name}
                  checked={folders.includes(name)}
                  onChange={() => toggleFolder(name)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Links section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Links
          </label>
          <button
            onClick={addLink}
            aria-label="Add link"
            style={{
              background: 'rgba(148,163,184,0.08)',
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: 4,
              padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-dim)',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            + Add link
          </button>
        </div>
        {links.map((link, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={link.label}
              onChange={(e) => updateLink(idx, 'label', e.target.value)}
              placeholder="Label"
              style={{
                background: 'rgba(148,163,184,0.06)',
                border: '1px solid rgba(148,163,184,0.18)',
                borderRadius: 4,
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text)',
                outline: 'none',
                flex: 1,
              }}
            />
            <input
              type="text"
              value={link.url}
              onChange={(e) => updateLink(idx, 'url', e.target.value)}
              placeholder="URL"
              style={{
                background: 'rgba(148,163,184,0.06)',
                border: '1px solid rgba(148,163,184,0.18)',
                borderRadius: 4,
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text)',
                outline: 'none',
                flex: 2,
              }}
            />
            <button
              onClick={() => removeLink(idx)}
              aria-label={`Remove link ${idx}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-dim)',
                fontSize: 14,
                padding: '0 4px',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Body editor + live preview side by side */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Textarea column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0 }}>
          <label
            htmlFor="ke-body"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}
          >
            Body
          </label>
          <textarea
            id="ke-body"
            aria-label="Body"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(148,163,184,0.06)',
              border: '1px solid rgba(148,163,184,0.18)',
              borderRadius: 4,
              padding: '8px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text)',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              width: '100%',
            }}
          />
        </div>

        {/* Live preview column */}
        <div
          data-testid="ke-preview"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            borderLeft: '1px solid rgba(148,163,184,0.12)',
            paddingLeft: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              marginBottom: 4,
            }}
          >
            Preview
          </div>
          <KnowledgeMarkdownBody content={content} filePath={file.path} />
        </div>
      </div>

      {/* Error */}
      {(error || linkError) && (
        <div
          role="alert"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--neon-magenta, #f472b6)',
            padding: '6px 10px',
            background: 'rgba(244,114,182,0.08)',
            borderRadius: 4,
            border: '1px solid rgba(244,114,182,0.2)',
          }}
        >
          {error || linkError}
        </div>
      )}

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          aria-label={saving ? 'Saving…' : 'Save'}
          style={{
            background: saving ? 'rgba(148,163,184,0.15)' : 'rgba(99,102,241,0.15)',
            border: `1px solid ${saving ? 'rgba(148,163,184,0.3)' : 'rgba(99,102,241,0.4)'}`,
            borderRadius: 4,
            padding: '6px 18px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: saving ? 'var(--text-dim)' : 'var(--text)',
            cursor: saving ? 'not-allowed' : 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
