// Data Hub — per-tab dashboard layout. Each tab holds the shared Loadout
// layout model (rows of tiles); a tile's `refId` is a dashboard id.
// See types/loadout.ts.
import type { LoadoutLayout } from './loadout'
import type { PickerFoldersConfig } from '../components/datahub/dashboards/pickerFolders'

export interface DataHubLayout {
  tabs: Record<string, LoadoutLayout>
  // User-created sub-folders that organize the widget picker (global, not per-tab).
  pickerFolders?: PickerFoldersConfig
}
