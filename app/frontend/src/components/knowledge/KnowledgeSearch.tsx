import type { SearchResult } from '../../types/knowledge'
import { sourceColor } from './sourceColors'

const CYAN = 'var(--neon-cyan)'

// ── Search input (lives in the page header) ──────────────────────────

export function SearchInput({
  value,
  onChange,
  onClear,
  resultCount,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  onClear: () => void
  resultCount: number | null
  loading: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 480 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          border: '1px solid rgba(0,255,255,0.25)',
          borderRadius: 8,
          padding: '6px 10px',
          background: 'rgba(0,255,255,0.04)',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>🔍</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClear()
          }}
          placeholder="Search all documents…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        />
        {value && (
          <span
            onClick={onClear}
            title="Clear (Esc)"
            style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13 }}
          >
            ✕
          </span>
        )}
      </div>
      {value.trim() && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '…' : `${resultCount ?? 0} result${resultCount === 1 ? '' : 's'}`}
        </span>
      )}
    </div>
  )
}

// ── Highlight query words within a snippet ───────────────────────────

function Highlighted({ text, words }: { text: string; words: string[] }) {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean)
  if (escaped.length === 0) return <>{text}</>
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const wordSet = new Set(words.map((w) => w.toLowerCase()))
  return (
    <>
      {text.split(re).map((part, i) =>
        wordSet.has(part.toLowerCase()) ? (
          <mark
            key={i}
            style={{
              background: 'rgba(0,255,255,0.22)',
              color: CYAN,
              borderRadius: 2,
              padding: '0 1px',
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// ── Results list (replaces the tree pane while searching) ────────────

export function SearchResults({
  results,
  query,
  selectedPath,
  onSelect,
}: {
  results: SearchResult[]
  query: string
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  if (results.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'rgba(148,163,184,0.5)',
          fontStyle: 'italic',
        }}
      >
        no matches
      </div>
    )
  }

  return (
    <div>
      {results.map((r) => {
        const active = r.path === selectedPath
        const color = sourceColor(r.source_id)
        return (
          <div
            key={r.path}
            onClick={() => onSelect(r.path)}
            style={{
              padding: '9px 12px',
              cursor: 'pointer',
              borderLeft: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              background: active ? 'rgba(0,255,255,0.07)' : 'transparent',
              borderBottom: '1px solid rgba(148,163,184,0.07)',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'rgba(148,163,184,0.05)'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: color,
                  flexShrink: 0,
                  boxShadow: `0 0 5px ${color}`,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  color: active ? CYAN : 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name.replace(/\.md$/, '')}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 10.5,
                color: 'var(--text-dim)',
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              <Highlighted text={r.snippet} words={words} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
