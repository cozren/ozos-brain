// The tile picker's item model. Items are data points (lib/datapoints.ts maps
// them); the category is the source kind, so the picker groups by where the
// numbers come from. pickerFolders.ts layers user sub-folders on top.
export interface PickerItem {
  id: string // the data point id a tile's refId points at
  label: string // shown in the tile picker
  category?: string // optional grouping in the picker
}

export interface PickerGroup {
  category: string
  items: PickerItem[]
}

// Source kinds come first in this order; any other category (including an
// item with no `category`, which falls back to DEFAULT_CATEGORY) follows in
// first-seen order.
export const CATEGORY_ORDER = ['Metabase', 'SQLite', 'CSV']
export const DEFAULT_CATEGORY = 'Other'

/** Group items by category for the picker menu. */
export function groupByCategory(items: PickerItem[]): PickerGroup[] {
  const byCategory = new Map<string, PickerItem[]>()
  for (const item of items) {
    const category = item.category ?? DEFAULT_CATEGORY
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(item)
    else byCategory.set(category, [item])
  }

  const groups: PickerGroup[] = []
  for (const category of CATEGORY_ORDER) {
    const bucket = byCategory.get(category)
    if (bucket) {
      groups.push({ category, items: bucket })
      byCategory.delete(category)
    }
  }
  for (const [category, bucket] of byCategory) {
    groups.push({ category, items: bucket })
  }
  return groups
}
