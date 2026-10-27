import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../../api'
import type { KnowledgeGraph as Graph, GraphNode } from '../../types/knowledge'

// Stable-ish color per community (null → muted grey).
function communityColor(c: number | null): string {
  if (c == null) return '#64748b'
  const hue = (c * 47) % 360
  return `hsl(${hue}, 70%, 62%)`
}

export function KnowledgeGraph({ onOpenNode }: { onOpenNode: (sourceFile: string) => void }) {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [docsOnly, setDocsOnly] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    api
      .getKnowledgeGraph()
      .then(setGraph)
      .catch((e) => setError(e.message))
  }, [])

  // Track container size so the canvas fills the pane.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Node degree (for sizing). Computed from raw string ids before the force
  // engine mutates source/target into node objects.
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const l of graph?.links ?? []) {
      d.set(l.source, (d.get(l.source) ?? 0) + 1)
      d.set(l.target, (d.get(l.target) ?? 0) + 1)
    }
    return d
  }, [graph])

  // ForceGraph mutates its graphData; give it a fresh shallow copy. When
  // "docs only" is on, keep document nodes and the links between them.
  const data = useMemo(() => {
    let nodes = graph?.nodes ?? []
    let links = graph?.links ?? []
    if (docsOnly) {
      nodes = nodes.filter((n) => n.file_type === 'document')
      const visible = new Set(nodes.map((n) => n.id))
      links = links.filter((l) => visible.has(l.source) && visible.has(l.target))
    }
    return { nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }
  }, [graph, docsOnly])

  const ql = q.trim().toLowerCase()
  const matches = (n: GraphNode) => ql !== '' && n.label.toLowerCase().includes(ql)
  const matchCount = ql ? data.nodes.filter((n) => matches(n as GraphNode)).length : null

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--neon-magenta)',
        }}
      >
        {error}
      </div>
    )
  }
  if (!graph) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-dim)',
        }}
      >
        loading graph…
      </div>
    )
  }
  if (graph.nodes.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-dim)',
        }}
      >
        No graph data. Run <code>graphify update . --wiki --no-viz</code> to build it.
      </div>
    )
  }

  const inputStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '5px 9px',
    borderRadius: 5,
    border: '1px solid rgba(0,255,255,0.25)',
    background: 'rgba(0,0,0,0.5)',
    color: 'var(--text)',
    outline: 'none',
    width: 180,
  } as const

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {/* Graph toolbar overlay */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="highlight nodes…"
          style={inputStyle}
        />
        {matchCount != null && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--neon-amber, #ffb648)',
            }}
          >
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
        )}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: docsOnly ? 'var(--neon-cyan)' : 'var(--text-dim)',
          }}
        >
          <input
            type="checkbox"
            checked={docsOnly}
            onChange={(e) => setDocsOnly(e.target.checked)}
          />
          Docs only
        </label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {data.nodes.length} nodes
        </span>
      </div>

      <ForceGraph2D
        graphData={data}
        width={size.width || undefined}
        height={size.height || undefined}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        nodeVal={(n: object) => {
          const base = 1 + Math.min(8, (degree.get((n as GraphNode).id) ?? 0) * 0.4)
          return matches(n as GraphNode) ? base * 2.2 : base
        }}
        nodeColor={(n: object) => {
          const node = n as GraphNode
          if (!ql) return communityColor(node.community)
          return matches(node) ? '#ffb648' : 'rgba(100,116,139,0.18)'
        }}
        nodeLabel={(n: object) => (n as GraphNode).label}
        linkColor={() => 'rgba(148,163,184,0.18)'}
        linkWidth={0.5}
        linkDirectionalParticles={0}
        onNodeClick={(n: object) => {
          const node = n as GraphNode
          if (node.source_file) onOpenNode(node.source_file)
        }}
        cooldownTicks={120}
      />
    </div>
  )
}
