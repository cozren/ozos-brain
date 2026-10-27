import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Network } from 'lucide-react'
import { api } from '../api'
import type { KnowledgeTree as Tree, SearchResult } from '../types/knowledge'
import { PageHeader } from '../components/PageHeader'
import { KnowledgeTree } from '../components/knowledge/KnowledgeTree'
import { NewFolderDialog } from '../components/knowledge/NewFolderDialog'
import { KnowledgePreview } from '../components/knowledge/KnowledgePreview'
import { SearchInput, SearchResults } from '../components/knowledge/KnowledgeSearch'
import { KnowledgeGraph } from '../components/knowledge/KnowledgeGraph'
import { clampSidebarWidth, SIDEBAR_DEFAULT } from '../lib/sidebar-width'

const SIDEBAR_WIDTH_KEY = 'kh-sidebar-width'

export function KnowledgeHub() {
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [colors, setColors] = useState<Record<string, string>>({})
  const [view, setView] = useState<'browse' | 'graph'>('browse')
  const [refreshing, setRefreshing] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)

  // Resizable left pane: drag its right edge to widen (to read long doc names)
  // or narrow it. Clamped so the preview always keeps room; persisted locally.
  const asideRef = useRef<HTMLElement | null>(null)
  // Any scroll inside the page (tree pane or preview pane) collapses the header,
  // matching the disappear-on-scroll effect on the app-shell pages.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return stored ? clampSidebarWidth(stored) : SIDEBAR_DEFAULT
  })

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (ev: MouseEvent) => setSidebarWidth(clampSidebarWidth(ev.clientX - left))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setSidebarWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
        return w
      })
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Re-read the folder tree + stars from disk. Runs on mount and whenever the
  // user hits the ↻ button. KnowledgeTree stays mounted across a reload, so its
  // expansion state (keyed by path) survives — new folders just appear.
  const reload = useCallback(() => {
    setRefreshing(true)
    const tree = api
      .getKnowledgeTree()
      .then(setTree)
      .catch((e) => setError(e.message))
    const stars = api
      .getKnowledgeStars()
      .then((r) => setStarred(new Set(r.starred)))
      .catch(() => {})
    const cols = api
      .getKnowledgeColors()
      .then((r) => setColors(r.colors))
      .catch(() => {})
    Promise.all([tree, stars, cols]).finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Optimistic toggle; reconcile with the server's authoritative list.
  const toggleStar = (path: string, next: boolean) => {
    setStarred((prev) => {
      const s = new Set(prev)
      next ? s.add(path) : s.delete(path)
      return s
    })
    api
      .setKnowledgeStar(path, next)
      .then((r) => setStarred(new Set(r.starred)))
      .catch(() => {
        // revert on failure
        setStarred((prev) => {
          const s = new Set(prev)
          next ? s.delete(path) : s.add(path)
          return s
        })
      })
  }

  // Set (hex string) or clear (null) a source's custom colour. Optimistic;
  // reconcile with the server's authoritative map.
  const setSourceColor = (sourceId: string, color: string | null) => {
    const prev = colors
    setColors((c) => {
      const next = { ...c }
      if (color) next[sourceId] = color
      else delete next[sourceId]
      return next
    })
    api
      .setKnowledgeColor(sourceId, color)
      .then((r) => setColors(r.colors))
      .catch(() => setColors(prev))
  }

  // Persist a new top-level card order. Optimistically reorder the local tree
  // (the server returns sources already ordered, so we just rearrange in place),
  // then save. On failure, reload to fall back to the server's truth.
  const reorderSources = (orderedIds: string[]) => {
    setTree((prev) => {
      if (!prev) return prev
      const byId = new Map(prev.sources.map((s) => [s.id, s]))
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
      return { ...prev, sources: next }
    })
    api.setKnowledgeOrder(orderedIds).catch(() => reload())
  }

  // Move a file into another folder (physical move within its source). On
  // success reload the tree and keep the moved file selected at its new path.
  const moveFile = (filePath: string, destDir: string) => {
    api
      .moveKnowledgeFile(filePath, destDir)
      .then((moved) => {
        setError(null)
        reload()
        setSelectedPath(moved.path)
      })
      .catch((e) => setError(e.message))
  }

  // Debounced full-text search; empty query restores the tree.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const t = setTimeout(() => {
      api
        .searchKnowledge(q)
        .then((r) => {
          if (!cancelled) setResults(r.results)
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const sourceLabels: Record<string, string> = Object.fromEntries(
    (tree?.sources ?? []).map((s) => [s.id, s.label])
  )

  // Flat deduplicated list of folder names (one level deep under each source)
  const folderOptions = useMemo(() => {
    if (!tree) return []
    const names = new Set<string>()
    for (const source of tree.sources) {
      for (const child of source.children) {
        if (child.type === 'dir') names.add(child.name)
      }
    }
    return Array.from(names).sort()
  }, [tree])

  const clearSearch = () => {
    setQuery('')
    setResults(null)
  }
  const isSearching = query.trim().length > 0

  // A graph node maps to a previewable doc only if its source_file is a markdown
  // file under one of the registered knowledge sources. Clicking opens it.
  const sourcePaths = (tree?.sources ?? []).map((s) => s.path)
  const openDocFromGraph = (sourceFile: string) => {
    if (!sourceFile.endsWith('.md')) return
    const inSource = sourcePaths.some((p) => sourceFile === p || sourceFile.startsWith(p + '/'))
    if (!inSource) return
    setSelectedPath(sourceFile)
    setView('browse')
  }

  const toggleBtn = (mode: 'browse' | 'graph', label: string) => (
    <button
      onClick={() => setView(mode)}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: 1,
        textTransform: 'uppercase',
        padding: '4px 12px',
        cursor: 'pointer',
        borderRadius: 5,
        border: `1px solid ${view === mode ? 'var(--neon-cyan)' : 'rgba(148,163,184,0.25)'}`,
        background: view === mode ? 'rgba(0,255,255,0.1)' : 'transparent',
        color: view === mode ? 'var(--neon-cyan)' : 'var(--text-dim)',
        transition: 'all 120ms',
      }}
    >
      {label}
    </button>
  )

  // Refresh + view switch. Rendered at the top-right of the content pane
  // (preview or graph), with no row chrome so it blends into the pane.
  const controls = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        padding: '10px 16px 0',
        flexShrink: 0,
      }}
    >
      <button
        onClick={reload}
        disabled={refreshing}
        title="Refresh"
        aria-label="Refresh"
        style={{
          fontSize: 13,
          lineHeight: 1,
          padding: '4px 9px',
          cursor: refreshing ? 'default' : 'pointer',
          borderRadius: 5,
          border: '1px solid rgba(148,163,184,0.25)',
          background: 'transparent',
          color: refreshing ? 'var(--neon-cyan)' : 'var(--text-dim)',
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'color 120ms',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            animation: refreshing ? 'kh-spin 0.7s linear infinite' : 'none',
          }}
        >
          ↻
        </span>
      </button>
      {toggleBtn('browse', 'Browse')}
      {toggleBtn('graph', 'Graph')}
    </div>
  )

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <style>{`@keyframes kh-spin { to { transform: rotate(360deg); } }`}</style>
      {/* Page header — same clean title line + subtitle as the other pages */}
      <PageHeader
        title="Knowledge Hub"
        subtitle="Browse and search the knowledge graph."
        icon={<Network size={44} strokeWidth={1.5} />}
        sticky={false}
        collapseScrollRef={rootRef}
      />

      {view === 'graph' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {controls}
          <div style={{ flex: 1, minHeight: 0 }}>
            <KnowledgeGraph onOpenNode={openDocFromGraph} />
          </div>
        </div>
      ) : (
        /* Two-pane body */
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left pane: tree, or search results while searching */}
          <aside
            ref={asideRef}
            style={{
              width: sidebarWidth,
              flexShrink: 0,
              overflowY: 'auto',
              overflowX: 'auto',
              borderRight: '1px solid rgba(0,255,255,0.12)',
              padding: '6px 0',
            }}
            className="planner-strip--bar"
          >
            {/* Search lives on top of the navigation section */}
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                padding: '4px 10px 8px',
                background: 'rgba(8,12,20,0.95)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <SearchInput
                value={query}
                onChange={setQuery}
                onClear={clearSearch}
                resultCount={results?.length ?? null}
                loading={searching}
              />
            </div>
            {error && (
              <div
                style={{
                  padding: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--neon-magenta)',
                }}
              >
                {error}
              </div>
            )}
            {isSearching ? (
              searching && !results ? (
                <div
                  style={{
                    padding: 14,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-dim)',
                  }}
                >
                  searching…
                </div>
              ) : (
                <SearchResults
                  results={results ?? []}
                  query={query}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                />
              )
            ) : (
              <>
                {!tree && !error && (
                  <div
                    style={{
                      padding: 14,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-dim)',
                    }}
                  >
                    loading…
                  </div>
                )}
                {tree && (
                  <KnowledgeTree
                    tree={tree}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    starred={starred}
                    onToggleStar={toggleStar}
                    colors={colors}
                    onSetColor={setSourceColor}
                    onReorder={reorderSources}
                    onMoveFile={moveFile}
                  />
                )}
                {/* Create a new folder under knowledge-hub/ — sits below the last card. */}
                {tree && (
                  <div style={{ padding: '8px 6px 4px' }}>
                    <button
                      onClick={() => setShowNewFolder(true)}
                      title="Create a new folder under knowledge-hub/"
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10.5,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        padding: '7px 10px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        border: '1px dashed rgba(0,255,255,0.25)',
                        background: 'transparent',
                        color: 'var(--text-dim)',
                        transition: 'all 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--neon-cyan)'
                        e.currentTarget.style.borderColor = 'rgba(0,255,255,0.5)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-dim)'
                        e.currentTarget.style.borderColor = 'rgba(0,255,255,0.25)'
                      }}
                    >
                      + New folder
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>

          {/* Drag handle: resize the left pane by dragging its right edge. */}
          <div
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize document list"
            title="Drag to resize"
            style={{
              width: 6,
              flexShrink: 0,
              cursor: 'col-resize',
              marginLeft: -3,
              marginRight: -3,
              zIndex: 2,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,255,255,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          />

          {/* Preview pane — controls sit in its top-right corner, chrome-free */}
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {controls}
            <div
              style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '8px 32px 24px' }}
              className="planner-strip--bar"
            >
              <KnowledgePreview
                path={selectedPath}
                sourceLabels={sourceLabels}
                starred={selectedPath ? starred.has(selectedPath) : false}
                onToggleStar={toggleStar}
                folderOptions={folderOptions}
                onFileSaved={(oldPath, updated) => {
                  reload()
                  if (updated.path !== oldPath) setSelectedPath(updated.path)
                }}
              />
            </div>
          </section>
        </div>
      )}

      {showNewFolder && tree && (
        <NewFolderDialog
          tree={tree}
          onClose={() => setShowNewFolder(false)}
          onCreated={() => {
            setShowNewFolder(false)
            reload()
          }}
        />
      )}
    </div>
  )
}
