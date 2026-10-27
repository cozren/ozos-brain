// Mirrors backend/services/datapoints.py and the /api/datapoints payloads.

export type DataPointKind = 'metabase' | 'sqlite' | 'csv'

export type DataPointSource =
  | { kind: 'metabase'; card_id: number }
  | { kind: 'sqlite'; path: string; query: string }
  | { kind: 'csv'; path: string; column: string | null }

export type DataPointDisplay = 'number' | 'table' | 'line'
export type DataPointRefresh = 'manual' | 'daily'

export interface DataPoint {
  id: string
  name: string
  source: DataPointSource
  display: DataPointDisplay
  refresh: DataPointRefresh
  unit: string
  created_at: string
}

// The cached value of one point. `fetched_at` null = never fetched; `error`
// set = the last fetch failed (rows are then empty).
export interface DataPointValue {
  id: string
  fetched_at: string | null
  columns: string[]
  rows: unknown[][]
  error: string | null
}

export interface DataPointsPayload {
  datapoints: DataPoint[]
  connector: { configured: boolean; missing: string[] }
  kinds: DataPointKind[]
  displays: DataPointDisplay[]
  refreshes: DataPointRefresh[]
}

export interface NewDataPointPayload {
  name: string
  source: DataPointSource
  display: DataPointDisplay
  refresh: DataPointRefresh
  unit: string
}

export type DataPointPatch = Partial<NewDataPointPayload>

export interface RefreshAllResult {
  refreshed: number
  failed: string[]
}
