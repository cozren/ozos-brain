// Pure helpers for the Knowledge Hub folder reorder + create features.
// Kept free of React so they can be unit-tested directly.

import type { KnowledgeTree, TreeNode } from '../../types/knowledge'

// Mirror of the backend `_slugify`: lowercase, whitespace/underscores → '-',
// drop anything outside [a-z0-9-], collapse/strip repeated/edge hyphens. The
// backend is authoritative; this drives the live preview in the create dialog.
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Move `fromId` to just before/after `toId` within `ids`, returning a new
// array. No-op (a fresh copy) when either id is unknown or they're the same.
export function reorder(
  ids: string[],
  fromId: string,
  toId: string,
  pos: 'before' | 'after'
): string[] {
  if (fromId === toId) return ids.slice()
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids.slice()

  const without = ids.filter((id) => id !== fromId)
  const targetIdx = without.indexOf(toId)
  const insertAt = pos === 'before' ? targetIdx : targetIdx + 1
  without.splice(insertAt, 0, fromId)
  return without
}

export interface ParentOption {
  value: string // root-relative path under knowledge-hub/
  label: string // folder name (root shown as 'knowledge-hub')
  depth: number // 0 = hub root, 1 = source card, deeper = nested dirs
}

// Build the "Inside" dropdown options for the create dialog: the knowledge-hub
// root plus every folder/sub-folder beneath it (files excluded). Non-hub
// sources (e.g. docs) are excluded — new folders must live under knowledge-hub.
export function hubParentOptions(tree: KnowledgeTree): ParentOption[] {
  const out: ParentOption[] = [{ value: 'knowledge-hub', label: 'knowledge-hub', depth: 0 }]

  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (node.type !== 'dir') continue
      out.push({ value: node.path, label: node.name, depth })
      if (node.children) walk(node.children, depth + 1)
    }
  }

  for (const src of tree.sources) {
    if (!(src.path === 'knowledge-hub' || src.path.startsWith('knowledge-hub/'))) continue
    out.push({ value: src.path, label: src.label, depth: 1 })
    walk(src.children, 2)
  }
  return out
}
