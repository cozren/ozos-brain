import { describe, it, expect } from 'vitest'
import type { DashboardDef } from '../registry'
import {
  organizePicker,
  createFolder,
  renameFolder,
  deleteFolder,
  moveDashboard,
  type PickerFoldersConfig,
} from '../pickerFolders'

// Minimal fake registry — organizePicker must not depend on real components.
const DASHBOARDS: DashboardDef[] = [
  { id: 'a1', label: 'Ads One', category: 'Media Ads' },
  { id: 'a2', label: 'Ads Two', category: 'Media Ads' },
  { id: 'c1', label: 'Widget One', category: 'Widget' },
  { id: 'c2', label: 'Widget Two', category: 'Widget' },
  { id: 'x1', label: 'Loose One' }, // no category -> 'Other'
]

describe('organizePicker', () => {
  it('puts every dashboard loose (in registry order) when no folders exist', () => {
    const org = organizePicker(DASHBOARDS, {})
    const media = org.find((c) => c.category === 'Media Ads')!
    expect(media.folders).toEqual([])
    expect(media.loose.map((d) => d.id)).toEqual(['a1', 'a2'])
    const other = org.find((c) => c.category === 'Other')!
    expect(other.loose.map((d) => d.id)).toEqual(['x1'])
  })

  it('keeps CATEGORY_ORDER categories first, then the rest in first-seen order', () => {
    const org = organizePicker(DASHBOARDS, {})
    expect(org.map((c) => c.category)).toEqual(['Other', 'Media Ads', 'Widget'])
  })

  it('places assigned dashboards into their folder and leaves the rest loose', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c2'] }],
    }
    const widget = organizePicker(DASHBOARDS, config).find((c) => c.category === 'Widget')!
    expect(widget.folders).toHaveLength(1)
    expect(widget.folders[0].dashboards.map((d) => d.id)).toEqual(['c2'])
    expect(widget.loose.map((d) => d.id)).toEqual(['c1'])
  })

  it('preserves the folder-defined dashboard order (not registry order)', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c2', 'c1'] }],
    }
    const widget = organizePicker(DASHBOARDS, config).find((c) => c.category === 'Widget')!
    expect(widget.folders[0].dashboards.map((d) => d.id)).toEqual(['c2', 'c1'])
  })

  it('prunes ids that no longer exist in the registry', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1', 'ghost'] }],
    }
    const widget = organizePicker(DASHBOARDS, config).find((c) => c.category === 'Widget')!
    expect(widget.folders[0].dashboards.map((d) => d.id)).toEqual(['c1'])
  })

  it('prunes an id whose category no longer matches the folder category', () => {
    // a1 is Media Ads but referenced under a Widget folder -> dropped (stays loose in Media Ads)
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Mistake', dashboardIds: ['a1', 'c1'] }],
    }
    const org = organizePicker(DASHBOARDS, config)
    const widget = org.find((c) => c.category === 'Widget')!
    expect(widget.folders[0].dashboards.map((d) => d.id)).toEqual(['c1'])
    const media = org.find((c) => c.category === 'Media Ads')!
    expect(media.loose.map((d) => d.id)).toEqual(['a1', 'a2'])
  })
})

describe('folder mutations', () => {
  it('createFolder adds an empty folder under a category', () => {
    const next = createFolder({}, 'Widget', 'Revenue', 'f-new')
    expect(next.Widget).toEqual([{ id: 'f-new', name: 'Revenue', dashboardIds: [] }])
  })

  it('renameFolder changes only the target folder name', () => {
    const config: PickerFoldersConfig = {
      Widget: [
        { id: 'f1', name: 'Revenue', dashboardIds: [] },
        { id: 'f2', name: 'Traffic', dashboardIds: [] },
      ],
    }
    const next = renameFolder(config, 'Widget', 'f2', 'Traffic & Networks')
    expect(next.Widget.map((f) => f.name)).toEqual(['Revenue', 'Traffic & Networks'])
  })

  it('deleteFolder removes the folder (its dashboards become loose again)', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1'] }],
    }
    const next = deleteFolder(config, 'Widget', 'f1')
    expect(next.Widget).toEqual([])
  })

  it('moveDashboard into a folder removes it from any other folder in the category', () => {
    const config: PickerFoldersConfig = {
      Widget: [
        { id: 'f1', name: 'Revenue', dashboardIds: ['c1'] },
        { id: 'f2', name: 'Traffic', dashboardIds: [] },
      ],
    }
    const next = moveDashboard(config, 'Widget', 'c1', 'f2', 0)
    expect(next.Widget[0].dashboardIds).toEqual([])
    expect(next.Widget[1].dashboardIds).toEqual(['c1'])
  })

  it('moveDashboard to loose (null folder) removes it from all folders', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1', 'c2'] }],
    }
    const next = moveDashboard(config, 'Widget', 'c1', null, 0)
    expect(next.Widget[0].dashboardIds).toEqual(['c2'])
  })

  it('moveDashboard reorders within the same folder at the target index', () => {
    const config: PickerFoldersConfig = {
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1', 'c2'] }],
    }
    const next = moveDashboard(config, 'Widget', 'c1', 'f1', 1)
    expect(next.Widget[0].dashboardIds).toEqual(['c2', 'c1'])
  })
})
