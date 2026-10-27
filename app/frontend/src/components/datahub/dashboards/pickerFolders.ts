// Picker organization layer: user-created sub-folders that sit *inside* the
// fixed code categories (registry `category`, default Other). The registry stays the
// source of truth for what dashboards exist and their category; this layer only
// records how the user grouped them in the "+" widget picker.
//
// Persisted (in .ozos/datahub.json under `pickerFolders`) as a map of
// category -> ordered folders, each folder holding an ordered list of dashboard
// ids. A dashboard not named by any folder in its category is "loose".
import type { DashboardDef } from './registry'
import { CATEGORY_ORDER, DEFAULT_CATEGORY, groupByCategory } from './registry'

export interface PickerFolder {
  id: string
  name: string
  dashboardIds: string[]
}

/** category -> ordered sub-folders. Categories absent here have no folders. */
export type PickerFoldersConfig = Record<string, PickerFolder[]>

export interface OrganizedFolder {
  id: string
  name: string
  dashboards: DashboardDef[]
}

export interface OrganizedCategory {
  category: string
  folders: OrganizedFolder[]
  loose: DashboardDef[]
}

function categoryOf(def: DashboardDef): string {
  return def.category ?? DEFAULT_CATEGORY
}

/**
 * Merge the registry with the saved folder config into a render-ready tree.
 *
 * Reconciles against the registry so the config never drifts out of sync:
 * - a folder id that no longer exists, or whose category no longer matches the
 *   folder's category, is dropped from that folder;
 * - any dashboard not placed in a folder falls to `loose` in registry order.
 * Categories follow the registry's own order (groupByCategory).
 */
export function organizePicker(
  dashboards: DashboardDef[],
  config: PickerFoldersConfig
): OrganizedCategory[] {
  const byId = new Map(dashboards.map((d) => [d.id, d]))

  return groupByCategory(dashboards).map((group) => {
    const { category } = group
    const savedFolders = config[category] ?? []

    const assigned = new Set<string>()
    const folders: OrganizedFolder[] = savedFolders.map((folder) => {
      const defs: DashboardDef[] = []
      for (const id of folder.dashboardIds) {
        const def = byId.get(id)
        // Prune unknown ids and ids that belong to a different category.
        if (!def || categoryOf(def) !== category) continue
        if (assigned.has(id)) continue // guard against the same id in two folders
        assigned.add(id)
        defs.push(def)
      }
      return { id: folder.id, name: folder.name, dashboards: defs }
    })

    const loose = group.dashboards.filter((d) => !assigned.has(d.id))
    return { category, folders, loose }
  })
}

// ── Pure mutations (each returns a new config) ────────────────────────────────

function cloneFolders(folders: PickerFolder[]): PickerFolder[] {
  return folders.map((f) => ({ ...f, dashboardIds: [...f.dashboardIds] }))
}

export function createFolder(
  config: PickerFoldersConfig,
  category: string,
  name: string,
  id: string
): PickerFoldersConfig {
  const existing = config[category] ?? []
  return {
    ...config,
    [category]: [...cloneFolders(existing), { id, name, dashboardIds: [] }],
  }
}

export function renameFolder(
  config: PickerFoldersConfig,
  category: string,
  folderId: string,
  name: string
): PickerFoldersConfig {
  const existing = config[category] ?? []
  return {
    ...config,
    [category]: existing.map((f) => (f.id === folderId ? { ...f, name } : f)),
  }
}

export function deleteFolder(
  config: PickerFoldersConfig,
  category: string,
  folderId: string
): PickerFoldersConfig {
  const existing = config[category] ?? []
  return { ...config, [category]: existing.filter((f) => f.id !== folderId) }
}

/**
 * Move a dashboard within a category to `targetFolderId` (or `null` for loose)
 * at `targetIndex`. Removing it from every folder first keeps a dashboard in at
 * most one folder; moving to loose is simply "remove from all folders".
 */
export function moveDashboard(
  config: PickerFoldersConfig,
  category: string,
  dashboardId: string,
  targetFolderId: string | null,
  targetIndex: number
): PickerFoldersConfig {
  const folders = cloneFolders(config[category] ?? [])
  for (const f of folders) {
    const at = f.dashboardIds.indexOf(dashboardId)
    if (at !== -1) f.dashboardIds.splice(at, 1)
  }
  if (targetFolderId !== null) {
    const target = folders.find((f) => f.id === targetFolderId)
    if (target) {
      const clamped = Math.max(0, Math.min(targetIndex, target.dashboardIds.length))
      target.dashboardIds.splice(clamped, 0, dashboardId)
    }
  }
  return { ...config, [category]: folders }
}
