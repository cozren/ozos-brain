import type { Goal, GoalStatus } from '../types/goals'

export const STATUS_LABEL: Record<GoalStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  complete: 'Complete',
  cancelled: 'Cancelled',
  pending: 'Pending',
}

// Green / amber / red for the three live states, cyan for done, greys for the rest.
export const STATUS_COLOR: Record<GoalStatus, string> = {
  on_track: '#22C55E',
  at_risk: '#F59E0B',
  off_track: '#EF4444',
  complete: 'var(--neon-cyan)',
  cancelled: '#475569',
  pending: '#94A3B8',
}

// What needs attention floats to the top; finished and dropped goals sink.
export const STATUS_ORDER: GoalStatus[] = [
  'off_track',
  'at_risk',
  'pending',
  'on_track',
  'complete',
  'cancelled',
]

export function sortGoals(goals: Goal[]): Goal[] {
  const rank = (s: GoalStatus) => {
    const i = STATUS_ORDER.indexOf(s)
    return i === -1 ? STATUS_ORDER.length : i
  }
  return [...goals].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title)
  )
}

export function statusCounts(goals: Goal[]): Record<GoalStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<GoalStatus, number>
  for (const g of goals) counts[g.status] = (counts[g.status] ?? 0) + 1
  return counts
}
