// Pure helpers for the Personal Tasks view. No React, no I/O — unit-tested in isolation.
import type { AnyTask, Task, ReviewGoalTask } from '../types/tasks'

export const PR_LABEL = 'performance review'

// On-theme neon swatches, mirroring the backend PALETTE. Used by the recolor popover.
export const LABEL_PALETTE = [
  '#2dd4ff',
  '#00e5c0',
  '#9bff5b',
  '#ffce6a',
  '#ff6ad5',
  '#b06cff',
  '#ff6a6a',
  '#5b9bff',
]
export const DEFAULT_LABEL_COLOR = '#2dd4ff' // cyan — labels with no stored color
export const PR_LABEL_COLOR = '#ffce6a' // amber — fixed for "performance review"

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Resolve a label's display color from the stored map. PR defaults to amber
 *  (and normal labels to cyan) when no color has been picked yet, but a stored
 *  color always wins — every label, including PR, is recolorable. */
export function colorFor(label: string, colors: Record<string, string>): string {
  const fallback = label === PR_LABEL ? PR_LABEL_COLOR : DEFAULT_LABEL_COLOR
  return colors[label] ?? fallback
}

/** Chip styling derived from a single hex: solid text, translucent border + fill. */
export function chipStyle(color: string): { color: string; border: string; background: string } {
  return {
    color,
    border: `1px solid ${hexToRgba(color, 0.55)}`,
    background: hexToRgba(color, 0.1),
  }
}

/** Distinct labels in use across own tasks (order-preserving). The
 *  "performance review" label is surfaced whenever review goals exist. */
export function labelUnion(tasks: Task[], reviewGoals: ReviewGoalTask[]): string[] {
  const seen: string[] = []
  for (const t of tasks) {
    for (const l of t.labels) if (!seen.includes(l)) seen.push(l)
  }
  if (reviewGoals.length && !seen.includes(PR_LABEL)) seen.push(PR_LABEL)
  return seen
}

/** Keep only items carrying `label`; null shows everything. */
export function filterByLabel<T extends AnyTask>(items: T[], label: string | null): T[] {
  if (label === null) return items
  return items.filter((i) => i.labels.includes(label))
}

/** Partition items into active (not done) and completed (done), each keeping
 *  its incoming order. Drives the active list vs the Completed backlog. */
export function splitByDone<T extends { done: boolean }>(
  items: T[]
): { active: T[]; completed: T[] } {
  const active: T[] = []
  const completed: T[] = []
  for (const i of items) (i.done ? completed : active).push(i)
  return { active, completed }
}

/** Newest-completed first; items without a `completedAt` (legacy/pre-feature)
 *  sort last. Pure — returns a new array, input untouched. */
export function sortByCompletedDesc<T extends { completedAt?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const av = a.completedAt ?? ''
    const bv = b.completedAt ?? ''
    if (av === bv) return 0
    if (!av) return 1 // a undated → after b
    if (!bv) return -1 // b undated → after a
    return av < bv ? 1 : -1 // larger ISO string = more recent = first
  })
}

/** Move the item with `fromId` to the position currently held by `toId`,
 *  returning a NEW array. Returns the input array unchanged (same reference)
 *  when the ids match or either is absent — callers can identity-check for a
 *  no-op. Used by drag-to-reorder on the Personal Tasks list. */
export function reorderById<T extends { id: string }>(
  items: T[],
  fromId: string,
  toId: string
): T[] {
  if (fromId === toId) return items
  const from = items.findIndex((i) => i.id === fromId)
  const to = items.findIndex((i) => i.id === toId)
  if (from < 0 || to < 0) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
