import { useEffect, useRef, useState } from 'react'
import type { KnowledgeTree as Tree, SourceNode, TreeNode } from '../../types/knowledge'
import { sourceColor } from './sourceColors'
import { reorder } from './folderTools'

const CYAN = 'var(--neon-cyan)'
const AMBER = 'var(--neon-amber, #ffb648)'
const AMBER_HEX = '#ffb648'

// Width of the right-edge control slot (Favorites star, source colour square,
// file-row star). Each control is centered in a slot of this width, all
// right-aligned to the same column — so their centres line up vertically
// regardless of how wide the glyph/square itself is.
const CTRL_W = 26

// Translate a #RRGGBB hex into an rgba() string at the given alpha — used to
// build tinted backgrounds / glows from each source's solid neon colour.
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Shared "card" styling for a top-level folder/category header, tinted with its
// own neon colour so the sections stand out on the dark background.
function folderHeaderStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '0 6px',
    padding: '8px 11px',
    borderRadius: 7,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color,
    background: `linear-gradient(90deg, ${withAlpha(color, 0.16)}, ${withAlpha(color, 0.04)})`,
    borderLeft: `3px solid ${color}`,
    border: `1px solid ${withAlpha(color, 0.22)}`,
    borderLeftWidth: 3,
    boxShadow: `0 0 10px ${withAlpha(color, 0.1)}, inset 0 0 14px ${withAlpha(color, 0.05)}`,
    textShadow: `0 0 8px ${withAlpha(color, 0.55)}`,
  }
}

// Per-folder pagination: show this many files at a time.
const PAGE = 20

// Count markdown files under a node (or a source's children).
function countFiles(nodes: TreeNode[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.type === 'file') n++
    else if (node.children) n += countFiles(node.children)
  }
  return n
}

// Collect the starred files (path + name) within a source's subtree.
function collectStarred(nodes: TreeNode[], starred: Set<string>): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = []
  const walk = (ns: TreeNode[]) => {
    for (const node of ns) {
      if (node.type === 'file') {
        if (starred.has(node.path)) out.push({ path: node.path, name: node.name })
      } else if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

// Small clickable star toggle shown on file rows.
function StarToggle({
  path,
  starred,
  onToggleStar,
}: {
  path: string
  starred: boolean
  onToggleStar: (path: string, next: boolean) => void
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        onToggleStar(path, !starred)
      }}
      title={starred ? 'Unstar' : 'Star'}
      className="kh-star"
      style={{
        marginLeft: 'auto',
        // Right-align with the source cards' colour square: file rows only have
        // paddingRight 8, but the source headers are inset cards (~18px right
        // inset), so nudge the star ~10px left to share the same column.
        marginRight: 10,
        width: CTRL_W,
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 17,
        lineHeight: 1,
        cursor: 'pointer',
        flexShrink: 0,
        color: starred ? AMBER : 'rgba(148,163,184,0.55)',
        textShadow: starred ? `0 0 9px ${AMBER}, 0 0 4px ${AMBER}` : 'none',
        opacity: starred ? 1 : 0.5,
        transition: 'opacity 120ms, color 120ms, text-shadow 120ms',
      }}
    >
      {starred ? '★' : '☆'}
    </span>
  )
}

// Curated neon palette that reads well on the dark background. The last slot in
// the picker is a freeform OS colour picker for anything outside this set.
const RECOMMENDED_COLORS = [
  '#00ffff', // cyan
  '#00ff9c', // mint
  '#7cff00', // lime
  '#ffb000', // amber
  '#ff5c7c', // coral
  '#ff00ff', // magenta
  '#b57bff', // violet
  '#0080ff', // blue
]

// Minimalist colour control on a source header: a small square (same footprint
// as the expand arrow) tinted with the source's current colour. Clicking it
// opens a compact popover of recommended swatch circles plus a freeform picker.
// stopPropagation keeps clicks from also toggling the folder open/closed.
function ColorPicker({
  sourceId,
  color,
  onSetColor,
}: {
  sourceId: string
  color: string
  onSetColor: (sourceId: string, color: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)
  const current = color.toLowerCase()

  // Close the popover on any outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (c: string) => {
    onSetColor(sourceId, c)
    setOpen(false)
  }

  return (
    <span
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        marginLeft: 'auto',
        position: 'relative',
        display: 'inline-flex',
        justifyContent: 'center',
        width: CTRL_W,
        flexShrink: 0,
      }}
    >
      {/* Trigger square — matches the arrow's 12px footprint. */}
      <span
        onClick={() => setOpen((o) => !o)}
        title="Folder colour"
        style={{
          width: 6,
          height: 6,
          borderRadius: 2,
          background: current,
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow: `0 0 5px ${withAlpha(current, 0.6)}`,
          cursor: 'pointer',
          opacity: 0.9,
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 0,
            zIndex: 200,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 15px)',
            gap: 8,
            padding: 9,
            borderRadius: 9,
            background: '#000000',
            border: '1px solid rgba(0,255,255,0.22)',
            boxShadow: '0 8px 22px rgba(0,0,0,0.6)',
          }}
        >
          {RECOMMENDED_COLORS.map((c) => {
            const sel = c === current
            return (
              <span
                key={c}
                onClick={() => pick(c)}
                title={c}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.18)',
                  boxShadow: sel
                    ? `0 0 0 2px #000000, 0 0 0 3px ${c}, 0 0 7px ${c}`
                    : `0 0 4px ${withAlpha(c, 0.7)}`,
                }}
              />
            )
          })}
          {/* Freeform picker: rainbow circle wrapping a transparent OS input. */}
          <span
            title="Custom colour…"
            style={{
              position: 'relative',
              width: 15,
              height: 15,
              borderRadius: '50%',
              background: 'conic-gradient(red, #ffb000, lime, cyan, blue, magenta, red)',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.35)',
              overflow: 'hidden',
              display: 'inline-block',
            }}
          >
            <input
              type="color"
              value={current}
              onChange={(e) => pick(e.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                padding: 0,
                border: 'none',
                cursor: 'pointer',
              }}
            />
          </span>
        </div>
      )}
    </span>
  )
}

// Small dim file-count shown right next to a folder/source title.
function CountBadge({ count }: { count: number }) {
  return (
    <span style={{ marginLeft: 6, fontSize: 9.5, opacity: 0.45, fontWeight: 600 }}>{count}</span>
  )
}

// Barely-visible vertical-dots drag handle on a top-level card, sitting after
// the colour square. Only this handle is draggable (native HTML5 DnD), so a
// plain click on the card still toggles it open and the colour picker still
// works. Brightens on hover/while dragging.
function DragHandle({
  onDragStart,
  onDragEnd,
}: {
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        // A payload is required for Firefox to start a native drag.
        e.dataTransfer.setData('text/plain', 'kh-card')
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => e.stopPropagation()}
      className="kh-drag"
      title="Drag to reorder"
      aria-label="Drag to reorder"
      style={{
        marginLeft: 6,
        width: 14,
        flexShrink: 0,
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 13,
        lineHeight: 1,
        cursor: 'grab',
        opacity: 0.32,
        transition: 'opacity 120ms',
      }}
    >
      ⋮
    </span>
  )
}

interface RowProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  expanded: Set<string>
  toggle: (path: string) => void
  onSelect: (path: string) => void
  starred: Set<string>
  onToggleStar: (path: string, next: boolean) => void
  // Drag-and-drop move (omitted → dragging disabled)
  moveEnabled: boolean
  moveTarget: string | null
  onMoveOver: (dest: string | null) => void
  onMoveDrop: (dest: string, filePath: string) => void
}

function NodeRow({
  node,
  depth,
  selectedPath,
  expanded,
  toggle,
  onSelect,
  starred,
  onToggleStar,
  moveEnabled,
  moveTarget,
  onMoveOver,
  onMoveDrop,
}: RowProps) {
  const pad = 10 + depth * 14
  if (node.type === 'file') {
    const active = node.path === selectedPath
    const isStarred = starred.has(node.path)
    return (
      <div
        onClick={() => onSelect(node.path)}
        title={node.name}
        className="kh-file-row"
        draggable={moveEnabled}
        onDragStart={
          moveEnabled
            ? (e) => {
                e.dataTransfer.setData('application/x-kh-file', node.path)
                e.dataTransfer.effectAllowed = 'move'
              }
            : undefined
        }
        style={{
          paddingLeft: pad,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          color: active ? CYAN : 'var(--text)',
          background: active ? 'rgba(0,255,255,0.08)' : 'transparent',
          borderLeft: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'rgba(148,163,184,0.06)'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <span style={{ opacity: 0.5, marginRight: 6 }}>·</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.name.replace(/\.md$/, '')}
        </span>
        <StarToggle path={node.path} starred={isStarred} onToggleStar={onToggleStar} />
      </div>
    )
  }

  const open = expanded.has(node.path)
  const count = node.children ? countFiles(node.children) : 0

  // Per-folder pagination: show PAGE files at a time; "Show more" reveals the rest.
  // Reset pageExpanded whenever the folder is collapsed so reopening always starts
  // from the first page.
  const [pageExpanded, setPageExpanded] = useState(false)
  useEffect(() => {
    if (!open) setPageExpanded(false)
  }, [open])

  const allChildren = node.children ?? []
  const fileChildren = allChildren.filter((c) => c.type === 'file')
  const dirChildren = allChildren.filter((c) => c.type === 'dir')
  const visibleFiles = pageExpanded ? fileChildren : fileChildren.slice(0, PAGE)
  const hiddenFileCount = fileChildren.length - PAGE
  const showMoreBtn = !pageExpanded && hiddenFileCount > 0
  const visibleChildren = [...dirChildren, ...visibleFiles]

  const isDropTarget = moveEnabled && !node.path.includes('#label/')
  const isMoveHover = moveTarget === node.path

  return (
    <div>
      <div
        onClick={() => toggle(node.path)}
        onDragOver={
          isDropTarget
            ? (e) => {
                if (!e.dataTransfer.types.includes('application/x-kh-file')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                onMoveOver(node.path)
              }
            : undefined
        }
        onDragLeave={isDropTarget ? () => onMoveOver(null) : undefined}
        onDrop={
          isDropTarget
            ? (e) => {
                if (!e.dataTransfer.types.includes('application/x-kh-file')) return
                e.preventDefault()
                const p = e.dataTransfer.getData('application/x-kh-file')
                if (p) onMoveDrop(node.path, p)
                onMoveOver(null)
              }
            : undefined
        }
        style={{
          paddingLeft: pad,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          background: isMoveHover ? 'rgba(0,255,255,0.10)' : undefined,
          boxShadow: isMoveHover ? 'inset 0 0 0 1px var(--neon-cyan)' : undefined,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--neon-cyan)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text)'
        }}
      >
        <span
          style={{
            fontSize: 14,
            width: 12,
            display: 'inline-block',
            transition: 'transform 120ms',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▸
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
        <CountBadge count={count} />
      </div>
      {open && (
        <>
          {visibleChildren.map((c) => (
            <NodeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              starred={starred}
              onToggleStar={onToggleStar}
              moveEnabled={moveEnabled}
              moveTarget={moveTarget}
              onMoveOver={onMoveOver}
              onMoveDrop={onMoveDrop}
            />
          ))}
          {showMoreBtn && (
            <div
              onClick={(e) => {
                e.stopPropagation()
                setPageExpanded(true)
              }}
              style={{
                paddingLeft: pad + 14,
                paddingRight: 8,
                paddingTop: 4,
                paddingBottom: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                color: 'rgba(148,163,184,0.55)',
                opacity: 0.8,
              }}
            >
              Show more ({hiddenFileCount})
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SourceSection({
  source,
  color,
  selectedPath,
  expanded,
  toggle,
  onSelect,
  starred,
  onToggleStar,
  onSetColor,
  reordering,
  dropHint,
  onHandleDragStart,
  onCardDragOver,
  onCardDrop,
  onDragEnd,
  moveEnabled,
  moveTarget,
  onMoveOver,
  onMoveDrop,
}: {
  source: SourceNode
  color: string
  selectedPath: string | null
  expanded: Set<string>
  toggle: (path: string) => void
  onSelect: (path: string) => void
  starred: Set<string>
  onToggleStar: (path: string, next: boolean) => void
  onSetColor: (sourceId: string, color: string | null) => void
  reordering: boolean // a card drag is in progress (any card)
  dropHint: 'before' | 'after' | null // show a drop line on this card
  onHandleDragStart: () => void
  onCardDragOver: (pos: 'before' | 'after') => void
  onCardDrop: () => void
  onDragEnd: () => void
  moveEnabled: boolean
  moveTarget: string | null
  onMoveOver: (dest: string | null) => void
  onMoveDrop: (dest: string, filePath: string) => void
}) {
  const key = `src:${source.id}`
  const open = expanded.has(key)
  const count = countFiles(source.children)
  // A cyan insertion line is drawn (via inset box-shadow) on the edge we'd drop
  // against, so it's clear where the dragged card will land.
  const base = folderHeaderStyle(color)
  const headerStyle: React.CSSProperties = {
    ...base,
    boxShadow:
      dropHint === 'before'
        ? 'inset 0 3px 0 0 var(--neon-cyan)'
        : dropHint === 'after'
          ? 'inset 0 -3px 0 0 var(--neon-cyan)'
          : base.boxShadow,
  }
  if (moveTarget === source.path) {
    headerStyle.boxShadow = 'inset 0 0 0 1px var(--neon-cyan)'
    headerStyle.background = `linear-gradient(90deg, rgba(0,255,255,0.14), ${withAlpha(color, 0.04)})`
  }
  return (
    <div style={{ marginBottom: 7 }}>
      <div
        className="kh-folder"
        onClick={() => toggle(key)}
        style={headerStyle}
        onDragOver={(e) => {
          if (
            moveEnabled &&
            source.mode !== 'labels' &&
            e.dataTransfer.types.includes('application/x-kh-file')
          ) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            onMoveOver(source.path)
          } else if (reordering) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const r = e.currentTarget.getBoundingClientRect()
            onCardDragOver(e.clientY < r.top + r.height / 2 ? 'before' : 'after')
          }
        }}
        onDragLeave={() => onMoveOver(null)}
        onDrop={(e) => {
          if (
            moveEnabled &&
            source.mode !== 'labels' &&
            e.dataTransfer.types.includes('application/x-kh-file')
          ) {
            e.preventDefault()
            const p = e.dataTransfer.getData('application/x-kh-file')
            if (p) onMoveDrop(source.path, p)
            onMoveOver(null)
          } else if (reordering) {
            e.preventDefault()
            onCardDrop()
          }
        }}
      >
        <span
          style={{
            fontSize: 14,
            width: 12,
            display: 'inline-block',
            transition: 'transform 120ms',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▸
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {source.label}
        </span>
        <CountBadge count={count} />
        <ColorPicker sourceId={source.id} color={color} onSetColor={onSetColor} />
        <DragHandle onDragStart={onHandleDragStart} onDragEnd={onDragEnd} />
      </div>
      {open &&
        (source.children.length === 0 ? (
          <div
            style={{
              paddingLeft: 28,
              fontSize: 10.5,
              color: 'rgba(148,163,184,0.4)',
              fontStyle: 'italic',
              padding: '4px 10px 4px 28px',
            }}
          >
            empty
          </div>
        ) : (
          source.children.map((c) => (
            <NodeRow
              key={c.path}
              node={c}
              depth={1}
              selectedPath={selectedPath}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              starred={starred}
              onToggleStar={onToggleStar}
              moveEnabled={moveEnabled}
              moveTarget={moveTarget}
              onMoveOver={onMoveOver}
              onMoveDrop={onMoveDrop}
            />
          ))
        ))}
    </div>
  )
}

// A starred file, with the colour of the source it came from (for the dot).
interface FavoriteFile {
  path: string
  name: string
  color: string
}

// The single "★ Favorites" category pinned at the top of the whole tree. Lists
// every starred doc across all sources for quick access. Collapsible; open by
// default. Hidden entirely when nothing is starred.
function FavoritesSection({
  files,
  selectedPath,
  expanded,
  toggle,
  onSelect,
  onToggleStar,
}: {
  files: FavoriteFile[]
  selectedPath: string | null
  expanded: Set<string>
  toggle: (path: string) => void
  onSelect: (path: string) => void
  onToggleStar: (path: string, next: boolean) => void
}) {
  const key = 'fav:root'
  const open = !expanded.has(key) // default-open; presence of key = collapsed
  return (
    <div style={{ marginBottom: 7 }}>
      <div
        className="kh-folder"
        onClick={() => toggle(key)}
        style={{ ...folderHeaderStyle(AMBER_HEX), color: AMBER }}
      >
        <span
          style={{
            fontSize: 14,
            width: 12,
            display: 'inline-block',
            transition: 'transform 120ms',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▸
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Favorites
        </span>
        <CountBadge count={files.length} />
        {/* Decorative outline star at the right edge — shares the colour-picker
            column of the source cards, but glowing/hollow to flag Favorites. */}
        <span
          style={{
            marginLeft: 'auto',
            width: CTRL_W,
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: 26,
            lineHeight: 1,
            color: AMBER,
            textShadow: `0 0 12px ${AMBER}, 0 0 6px ${AMBER}`,
            pointerEvents: 'none',
          }}
        >
          ☆
        </span>
      </div>
      {open &&
        files.map((f) => {
          const active = f.path === selectedPath
          return (
            <div
              key={f.path}
              onClick={() => onSelect(f.path)}
              title={f.name}
              className="kh-file-row"
              style={{
                paddingLeft: 24,
                paddingRight: 8,
                paddingTop: 4,
                paddingBottom: 4,
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                color: active ? CYAN : 'var(--text)',
                background: active ? 'rgba(0,255,255,0.08)' : 'transparent',
                borderLeft: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'rgba(148,163,184,0.06)'
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2,
                  background: f.color,
                  flexShrink: 0,
                  marginRight: 7,
                  opacity: 0.7,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name.replace(/\.md$/, '')}
              </span>
              <StarToggle path={f.path} starred={true} onToggleStar={onToggleStar} />
            </div>
          )
        })}
    </div>
  )
}

// Resolve a source's effective colour: a user-picked override if present,
// otherwise its default palette colour.
function effectiveColor(colors: Record<string, string>, id: string, index: number): string {
  return colors[id] ?? sourceColor(id, index)
}

export function KnowledgeTree({
  tree,
  selectedPath,
  onSelect,
  starred,
  onToggleStar,
  colors,
  onSetColor,
  onReorder,
  onMoveFile,
}: {
  tree: Tree
  selectedPath: string | null
  onSelect: (path: string) => void
  starred: Set<string>
  onToggleStar: (path: string, next: boolean) => void
  colors: Record<string, string>
  onSetColor: (sourceId: string, color: string | null) => void
  // Persist a new top-level card order (list of source ids). Omitted → no DnD.
  onReorder?: (orderedIds: string[]) => void
  // Move a file into another folder (physical). Omitted → dragging disabled.
  onMoveFile?: (filePath: string, destDir: string) => void
}) {
  // The top "Favorites" group is expanded by default (keyed fav:root).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

  // Top-level card drag-to-reorder. `dragId` is the card being dragged;
  // `dropHint` marks which card edge we'd drop against right now.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const commitDrop = () => {
    if (dragId && dropHint && onReorder) {
      const ids = tree.sources.map((s) => s.id)
      const next = reorder(ids, dragId, dropHint.id, dropHint.pos)
      if (next.join(' ') !== ids.join(' ')) onReorder(next)
    }
    setDragId(null)
    setDropHint(null)
  }
  const endDrag = () => {
    setDragId(null)
    setDropHint(null)
  }

  // File-move drag-and-drop: highlight the current drop target while dragging.
  const [moveTarget, setMoveTarget] = useState<string | null>(null)
  const moveEnabled = !!onMoveFile
  const handleMoveDrop = (dest: string, filePath: string) => {
    if (onMoveFile) onMoveFile(filePath, dest)
    setMoveTarget(null)
  }

  // Gather every starred doc across all sources into one list, tagging each with
  // its source colour for the dot. Sorted by name.
  const favorites: FavoriteFile[] = tree.sources
    .flatMap((s, idx) => {
      const color = effectiveColor(colors, s.id, idx)
      return collectStarred(s.children, starred).map((f) => ({ ...f, color }))
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <style>{`
        .kh-file-row:hover .kh-star { opacity: 1; }
        .kh-folder { transition: filter 140ms ease, transform 140ms ease; }
        .kh-folder:hover { filter: brightness(1.25); transform: translateX(1px); }
        .kh-folder:hover .kh-drag { opacity: 0.85; }
        .kh-drag:hover { opacity: 1 !important; }
        .kh-drag:active { cursor: grabbing; }
      `}</style>
      {favorites.length > 0 && (
        <FavoritesSection
          files={favorites}
          selectedPath={selectedPath}
          expanded={expanded}
          toggle={toggle}
          onSelect={onSelect}
          onToggleStar={onToggleStar}
        />
      )}
      {tree.sources.map((s, idx) => (
        <SourceSection
          key={s.id}
          source={s}
          color={effectiveColor(colors, s.id, idx)}
          selectedPath={selectedPath}
          expanded={expanded}
          toggle={toggle}
          onSelect={onSelect}
          starred={starred}
          onToggleStar={onToggleStar}
          onSetColor={onSetColor}
          reordering={!!onReorder && dragId !== null}
          dropHint={dropHint?.id === s.id ? dropHint.pos : null}
          onHandleDragStart={() => setDragId(s.id)}
          onCardDragOver={(pos) =>
            setDropHint((prev) =>
              prev?.id === s.id && prev.pos === pos ? prev : { id: s.id, pos }
            )
          }
          onCardDrop={commitDrop}
          onDragEnd={endDrag}
          moveEnabled={moveEnabled}
          moveTarget={moveTarget}
          onMoveOver={setMoveTarget}
          onMoveDrop={handleMoveDrop}
        />
      ))}
    </div>
  )
}
