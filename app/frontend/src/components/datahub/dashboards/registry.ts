import type { FC } from 'react'

// Dashboard registry. Data points (a later phase) register their tiles here;
// the engine ships with none, so a fresh vault shows the Data Hub empty state.
export interface DashboardDef {
  id: string // stable slug
  label: string // shown in the tile picker
  category?: string // optional grouping in the picker
  Component?: FC // in-app dashboard component
  embedUrl?: string // external iframe URL (mutually exclusive with Component)
}

export const DASHBOARDS: DashboardDef[] = []

export function getDashboard(id: string): DashboardDef | undefined {
  return DASHBOARDS.find((d) => d.id === id)
}

export interface DashboardGroup {
  category: string
  dashboards: DashboardDef[]
}

// Categories listed here come first in the "+" widget picker, in this order; any
// other category (including a dashboard with no `category`, which falls back to
// DEFAULT_CATEGORY) is appended after these, in first-seen order.
export const CATEGORY_ORDER = ['Other']
export const DEFAULT_CATEGORY = 'Other'

/** Group dashboards by category for the picker menu. */
export function groupByCategory(dashboards: DashboardDef[] = DASHBOARDS): DashboardGroup[] {
  const byCategory = new Map<string, DashboardDef[]>()
  for (const def of dashboards) {
    const category = def.category ?? DEFAULT_CATEGORY
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(def)
    else byCategory.set(category, [def])
  }

  const groups: DashboardGroup[] = []
  for (const category of CATEGORY_ORDER) {
    const dashboards = byCategory.get(category)
    if (dashboards) {
      groups.push({ category, dashboards })
      byCategory.delete(category)
    }
  }
  for (const [category, dashboards] of byCategory) {
    groups.push({ category, dashboards })
  }
  return groups
}
