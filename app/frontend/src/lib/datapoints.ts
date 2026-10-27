import type { PickerItem } from '../components/datahub/dashboards/registry'
import type { DataPoint, DataPointKind, DataPointValue } from '../types/datapoints'

export const KIND_LABEL: Record<DataPointKind, string> = {
  metabase: 'Metabase',
  sqlite: 'SQLite',
  csv: 'CSV',
}

// Data points feed the tile picker; the category is the source kind.
export function toPickerItems(points: DataPoint[]): PickerItem[] {
  return points.map((p) => ({ id: p.id, label: p.name, category: KIND_LABEL[p.source.kind] }))
}

export function formatNumber(v: unknown, unit: string): string {
  if (v === null || v === undefined) return '–'
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v)
  const text = v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return unit ? `${text} ${unit}` : text
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// The "number" display: first cell of the first row; the second row, when it
// is numeric too, is the previous value the delta is taken against.
export function numberOf(value: DataPointValue): {
  current: unknown
  previous: number | null
  delta: number | null
} {
  const current = value.rows[0]?.[0] ?? null
  const previous = value.rows.length >= 2 ? value.rows[1]?.[0] : null
  if (isNum(current) && isNum(previous)) {
    return { current, previous, delta: current - previous }
  }
  return { current, previous: null, delta: null }
}

// The "line" display: first column is x, second is y; rows without a numeric y drop.
export function lineSeries(value: DataPointValue): { x: string; y: number }[] {
  if (value.columns.length < 2) return []
  const out: { x: string; y: number }[] = []
  for (const row of value.rows) {
    const y = row[1]
    if (isNum(y)) out.push({ x: String(row[0] ?? ''), y })
  }
  return out
}

export const TABLE_CAP = 50

export function tableRows(value: DataPointValue): unknown[][] {
  return value.rows.slice(0, TABLE_CAP)
}

export function fetchedAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'never'
  if (ms < 120_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}
