import { Children, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Element } from 'hast'
import { api } from '../../api'
import { remarkLineBreaks, rehypeCollapsibleSections } from '../../lib/markdown'
import { extractOutline } from '../../lib/outline'
import { stripFrontmatter } from '../../lib/frontmatter'
import { detectCalloutType, stripCalloutMarker, CALLOUT_ICONS } from '../../lib/knowledge-callouts'
import type { KnowledgeFile } from '../../types/knowledge'
import { sourceColor } from './sourceColors'
import { KnowledgeEditor } from './KnowledgeEditor'
import { ImageLightbox } from './ImageLightbox'
import '../../styles/knowledge-preview.css'

function resolveAssetSrc(filePath: string, src: string): string {
  if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src
  const base = filePath.split('/').slice(0, -1)
  for (const seg of src.replace(/^\.\//, '').split('/')) {
    if (seg === '..') base.pop()
    else if (seg === '.' || seg === '') continue
    else base.push(seg)
  }
  return api.knowledgeAssetUrl(base.join('/'))
}

function formatDate(mtime: number): string {
  return new Date(mtime * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// A heading section produced by rehypeCollapsibleSections: its children are
// [heading, <div class="km-section-body">…]]. Clicking the heading bar folds the
// body away. Each section owns its own state; expanded by default.
function CollapsibleSection({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const kids = Children.toArray(children)
  const [head, ...body] = kids
  return (
    <section className="km-section">
      <div className="km-section-head" onClick={() => setOpen((o) => !o)}>
        <span className="km-section-chevron" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
          ▸
        </span>
        <div className="km-section-head-title">{head}</div>
      </div>
      {open && body}
    </section>
  )
}

// Stable component definitions (no per-file closure needed).
const codeBlockComponents = {
  section: CollapsibleSection,
  pre({ children }: React.PropsWithChildren) {
    const codeEl = Array.isArray(children) ? children[0] : children
    const className: string = (codeEl as React.ReactElement)?.props?.className ?? ''
    const lang = className.match(/\blanguage-(\w+)/)?.[1] ?? ''
    return (
      <div className="km-code-wrap">
        {lang && <div className="km-code-header">{lang}</div>}
        <pre>{children}</pre>
      </div>
    )
  },
  blockquote({ node, children }: { node?: Element; children?: React.ReactNode }) {
    if (node) {
      const type = detectCalloutType(node)
      if (type) {
        return (
          <div className={`km-callout km-callout-${type.toLowerCase()}`}>
            <span className="km-callout-icon">{CALLOUT_ICONS[type]}</span>
            <div className="km-callout-body">
              <div className="km-callout-label">{type}</div>
              {stripCalloutMarker(children)}
            </div>
          </div>
        )
      }
    }
    return <blockquote className="km-bq">{children}</blockquote>
  },
}

/**
 * Shared markdown renderer used by KnowledgePreview (full view) and
 * KnowledgeEditor (live preview pane). Accepts raw markdown `content` and an
 * optional `filePath` used to resolve relative image URLs (omit in contexts
 * where image resolution is not needed).
 */
export function KnowledgeMarkdownBody({
  content,
  filePath,
  bodyRef,
  onZoomImage,
}: {
  content: string
  filePath?: string
  bodyRef?: React.RefObject<HTMLDivElement>
  // When provided, clicking an image opens it in the zoom viewer. Omitted in
  // the editor's live preview, where clicks should stay out of the way.
  onZoomImage?: (src: string, alt: string) => void
}) {
  const components = {
    ...codeBlockComponents,
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      const resolved = filePath ? resolveAssetSrc(filePath, String(src ?? '')) : String(src ?? '')
      return (
        <img
          src={resolved}
          alt={alt ?? ''}
          loading="lazy"
          onClick={onZoomImage ? () => onZoomImage(resolved, alt ?? '') : undefined}
          className={onZoomImage ? 'km-zoomable' : undefined}
          title={onZoomImage ? 'Click to zoom' : undefined}
        />
      )
    },
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
  }

  return (
    <div className="km-body" ref={bodyRef}>
      <ReactMarkdown
        remarkPlugins={[remarkLineBreaks, remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeCollapsibleSections]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function KnowledgePreview({
  path,
  sourceLabels,
  starred,
  onToggleStar,
  onFileSaved,
  folderOptions,
}: {
  path: string | null
  sourceLabels: Record<string, string>
  starred: boolean
  onToggleStar: (path: string, next: boolean) => void
  onFileSaved?: (oldPath: string, updated: KnowledgeFile) => void
  folderOptions?: string[]
}) {
  const [file, setFile] = useState<KnowledgeFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  // Outline (table-of-contents) toggle — the preference sticks across docs/sessions.
  const [showOutline, setShowOutline] = useState(
    () => localStorage.getItem('kh-outline-open') === '1'
  )
  // Image currently open in the zoom viewer, or null when it is closed.
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('kh-outline-open', showOutline ? '1' : '0')
  }, [showOutline])

  useEffect(() => {
    setZoomed(null)
    if (!path) {
      setFile(null)
      setError(null)
      setEditing(false)
      return
    }
    setLoading(true)
    setError(null)
    setEditing(false)
    let cancelled = false
    api
      .getKnowledgeFile(path)
      .then((f) => {
        if (!cancelled) setFile(f)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!path) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'rgba(148,163,184,0.45)',
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          Select a document
        </span>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        loading…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neon-magenta)' }}>
        {error}
      </div>
    )
  }

  if (!file) return null

  const color = sourceColor(file.source_id)
  const label = sourceLabels[file.source_id] ?? file.source_id
  const isImage = file.kind === 'image'
  const isHtml = file.kind === 'html'
  // Frontmatter is metadata, not prose — it is surfaced as tag chips and the
  // Confluence link instead of being rendered into the body.
  const body = isImage || isHtml ? file.content : stripFrontmatter(file.content)
  // HTML docs render in a sandboxed iframe; images/html have no markdown outline.
  const outline = isImage || isHtml ? [] : extractOutline(body)

  const handleSaved = (updated: KnowledgeFile) => {
    setFile(updated)
    setEditing(false)
    if (path) onFileSaved?.(path, updated)
  }

  // Outline items map 1:1 to the rendered <h1>/<h2> in document order, so the
  // Nth item scrolls to the Nth heading — no fragile id matching needed.
  const scrollToHeading = (index: number) => {
    const headings = bodyRef.current?.querySelectorAll('h1, h2')
    headings?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const outlineOpen = showOutline && !isImage && outline.length > 0

  return (
    <div className={`knowledge-md km${outlineOpen ? ' has-outline' : ''}`}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          paddingBottom: 12,
          marginBottom: 18,
          borderBottom: '1px solid rgba(148,163,184,0.12)',
        }}
      >
        <button
          onClick={() => onToggleStar(file.path, !starred)}
          title={starred ? 'Unstar' : 'Star'}
          aria-label={starred ? 'Unstar' : 'Star'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            fontSize: 18,
            color: starred ? 'var(--neon-amber, #ffb648)' : 'rgba(148,163,184,0.5)',
            textShadow: starred ? '0 0 8px rgba(255,182,72,0.6)' : 'none',
            transition: 'color 120ms, text-shadow 120ms',
          }}
          onMouseEnter={(e) => {
            if (!starred) e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            if (!starred) e.currentTarget.style.color = 'rgba(148,163,184,0.5)'
          }}
        >
          {starred ? '★' : '☆'}
        </button>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text)',
          }}
        >
          {isImage || isHtml ? file.name : file.name.replace(/\.md$/, '')}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color,
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '2px 7px',
            boxShadow: `0 0 6px ${color}40`,
          }}
        >
          {label}
        </span>
        {/* Everything after this spacer is pinned to the header's right edge. */}
        <div style={{ flex: 1 }} />
        {file.confluence_url && (
          <a
            className="km-outline-toggle"
            href={file.confluence_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the source page in Confluence"
            style={{ textDecoration: 'none' }}
          >
            Confluence ↗
          </a>
        )}
        {!isImage && outline.length > 0 && (
          <button
            className="km-outline-toggle"
            onClick={() => setShowOutline((o) => !o)}
            aria-pressed={showOutline}
            title={showOutline ? 'Hide outline' : 'Show outline'}
          >
            ≡ Outline
          </button>
        )}
        {!isImage && !isHtml && (
          <button
            className="km-outline-toggle"
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            title={editing ? 'Close editor' : 'Edit document'}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        )}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--text-dim)',
          }}
        >
          {formatDate(file.mtime)}
        </span>
      </div>

      {editing && !isImage && !isHtml ? (
        <KnowledgeEditor file={file} onSaved={handleSaved} folderOptions={folderOptions} />
      ) : (
        <>
          {((file.folder_tags && file.folder_tags.length > 0) ||
            (file.tags && file.tags.length > 0)) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 16,
              }}
            >
              {(file.tags ?? []).map((tag) => (
                <span
                  key={`t-${tag}`}
                  style={{
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text)',
                  }}
                >
                  {tag}
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
            </div>
          )}
          {file.links && file.links.length > 0 && (
            <section
              aria-label="Related"
              style={{
                marginBottom: 16,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(148,163,184,0.06)',
                border: '1px solid rgba(148,163,184,0.12)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: 'var(--text-dim)',
                  marginBottom: 6,
                }}
              >
                Related
              </div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {file.links.map((link, i) => (
                  <li key={i}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--neon-cyan, #67e8f9)',
                        textDecoration: 'none',
                        borderBottom: '1px solid currentColor',
                      }}
                    >
                      {link.label || link.url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="km-body-row">
            {isImage ? (
              <div className="km-body" ref={bodyRef}>
                <img
                  className="km-standalone-img km-zoomable"
                  src={api.knowledgeAssetUrl(file.path)}
                  alt={file.name}
                  loading="lazy"
                  title="Click to zoom"
                  onClick={() =>
                    setZoomed({ src: api.knowledgeAssetUrl(file.path), alt: file.name })
                  }
                />
              </div>
            ) : isHtml ? (
              <div className="km-body" ref={bodyRef}>
                {/* Sandboxed: the page's own scripts run (charts stay interactive)
                    but it is origin-isolated — no access to the app DOM/cookies. */}
                <iframe
                  className="km-html-frame"
                  title={file.name}
                  srcDoc={file.content}
                  sandbox="allow-scripts"
                  loading="lazy"
                />
              </div>
            ) : (
              <KnowledgeMarkdownBody
                content={body}
                filePath={file.path}
                bodyRef={bodyRef}
                onZoomImage={(src, alt) => setZoomed({ src, alt })}
              />
            )}

            {showOutline && !isImage && outline.length > 0 && (
              <nav className="km-outline" aria-label="Document outline">
                <div className="km-outline-title">Outline</div>
                <ul className="km-outline-list">
                  {outline.map((item, i) => (
                    <li key={i}>
                      <button
                        className={`km-outline-item km-outline-d${item.depth}`}
                        onClick={() => scrollToHeading(i)}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </>
      )}
      {zoomed && (
        <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} />
      )}
    </div>
  )
}
