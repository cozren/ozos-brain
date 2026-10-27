// Loadout Canvas — the shared, page-agnostic layout model used by both the
// Reporting page and the Data Hub page. Position is implied by array order:
// rows are ordered top→bottom, tiles within a row left→right. No x/y.

// One tile in a row. `refId` is what the page resolves to content
// (a Reporting source id, or a Data Hub dashboard id); null = empty tile
// still showing its picker.
export interface LoadoutTile {
  i: string
  refId: string | null
  w: number // width in columns (1–12)
  h: number // height in row-units (multiples of the 30px row unit)
}

export type RowAlign = 'left' | 'center' | 'right'

// A horizontally-scrolling row of tiles.
export interface LoadoutRow {
  id: string
  tiles: LoadoutTile[]
  // How the row's tiles sit when they don't fill the row width. Undefined =
  // 'center' (the historical default).
  align?: RowAlign
}

export interface LoadoutLayout {
  rows: LoadoutRow[]
}

// Defaults for a freshly-added tile.
export const DEFAULT_TILE_W = 6
export const DEFAULT_TILE_H = 10
