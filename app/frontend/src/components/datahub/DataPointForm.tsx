import { useState } from 'react'
import { ApiError } from '../../api'
import type {
  DataPoint,
  DataPointDisplay,
  DataPointKind,
  DataPointRefresh,
  DataPointSource,
  NewDataPointPayload,
} from '../../types/datapoints'
import { KIND_LABEL } from '../../lib/datapoints'
import { ERR, FIELD, FORM_CSS, HINT, LABEL, OK, PRIMARY } from '../setup/formStyles'

interface Props {
  onSubmit: (payload: NewDataPointPayload) => Promise<DataPoint | unknown>
  // Whether METABASE_URL / METABASE_API_KEY are saved; the Metabase kind shows a hint otherwise.
  connectorConfigured: boolean
}

const KINDS: DataPointKind[] = ['metabase', 'sqlite', 'csv']
const KIND_OPTION: Record<DataPointKind, string> = {
  metabase: 'Metabase card',
  sqlite: 'SQLite query',
  csv: 'CSV file',
}
const DISPLAYS: DataPointDisplay[] = ['number', 'table', 'line']
const REFRESHES: DataPointRefresh[] = ['manual', 'daily']

export const METABASE_HINT = 'Save METABASE_URL and METABASE_API_KEY in Setup → Data points first.'

// Define one data point: a name, a source (one of three kinds), a display, a
// refresh cadence and a unit. Used on the Data Hub empty state and in Setup.
export function DataPointForm({ onSubmit, connectorConfigured }: Props) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DataPointKind>('metabase')
  const [cardId, setCardId] = useState('')
  const [path, setPath] = useState('')
  const [query, setQuery] = useState('')
  const [column, setColumn] = useState('')
  const [display, setDisplay] = useState<DataPointDisplay>('number')
  const [refresh, setRefresh] = useState<DataPointRefresh>('manual')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const source = (): DataPointSource | null => {
    if (kind === 'metabase') {
      const n = Number(cardId)
      return Number.isInteger(n) && n > 0 ? { kind, card_id: n } : null
    }
    if (!path.trim()) return null
    if (kind === 'sqlite')
      return query.trim() ? { kind, path: path.trim(), query: query.trim() } : null
    return { kind, path: path.trim(), column: column.trim() || null }
  }

  const canSave = name.trim() !== '' && source() !== null && !busy

  const submit = async () => {
    const src = source()
    if (!canSave || !src) return
    setBusy(true)
    setMessage(null)
    const payload: NewDataPointPayload = {
      name: name.trim(),
      source: src,
      display,
      refresh,
      unit: unit.trim(),
    }
    try {
      await onSubmit(payload)
      setMessage({ ok: true, text: `Defined ${payload.name}.` })
      setName('')
      setCardId('')
      setPath('')
      setQuery('')
      setColumn('')
      setUnit('')
    } catch (e) {
      const text =
        e instanceof ApiError && e.status === 409
          ? 'A data point with that name already exists.'
          : e instanceof ApiError && e.detail
            ? e.detail
            : 'Could not save.'
      setMessage({ ok: false, text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{FORM_CSS}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <label style={LABEL}>
          Name
          <input
            style={FIELD}
            value={name}
            placeholder="Weekly signups"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label style={LABEL}>
          Source
          <select
            style={FIELD}
            value={kind}
            onChange={(e) => setKind(e.target.value as DataPointKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_OPTION[k]}
              </option>
            ))}
          </select>
        </label>
        <label style={LABEL}>
          Display
          <select
            style={FIELD}
            value={display}
            onChange={(e) => setDisplay(e.target.value as DataPointDisplay)}
          >
            {DISPLAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={LABEL}>
          Refresh
          <select
            style={FIELD}
            value={refresh}
            onChange={(e) => setRefresh(e.target.value as DataPointRefresh)}
          >
            {REFRESHES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={LABEL}>
          Unit
          <input
            style={FIELD}
            value={unit}
            placeholder="users, €, %"
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
      </div>

      {kind === 'metabase' ? (
        <div
          style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, alignItems: 'end' }}
        >
          <label style={LABEL}>
            Card id
            <input
              style={FIELD}
              type="number"
              min={1}
              value={cardId}
              placeholder="42"
              onChange={(e) => setCardId(e.target.value)}
            />
          </label>
          {!connectorConfigured && <p style={{ ...HINT, color: '#F59E0B' }}>{METABASE_HINT}</p>}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: kind === 'sqlite' ? '1fr 2fr' : '1fr 1fr',
            gap: 10,
            alignItems: 'start',
          }}
        >
          <label style={LABEL}>
            File (relative to the vault)
            <input
              style={FIELD}
              value={path}
              placeholder={kind === 'sqlite' ? 'data/app.db' : 'data/signups.csv'}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          {kind === 'sqlite' ? (
            <label style={LABEL}>
              Query
              <textarea
                style={{ ...FIELD, minHeight: 56, resize: 'vertical' }}
                value={query}
                placeholder="select week, count(*) from signups group by week"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          ) : (
            <label style={LABEL}>
              Column (optional)
              <input
                style={FIELD}
                value={column}
                placeholder="leave blank for every column"
                onChange={(e) => setColumn(e.target.value)}
              />
            </label>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={PRIMARY} disabled={!canSave} onClick={submit}>
          Define data point
        </button>
        {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
      </div>
      <p style={HINT}>
        {KIND_LABEL[kind]}
        {kind === 'metabase'
          ? ' runs the saved question with its default filters; the first column is the value.'
          : kind === 'sqlite'
            ? ' is opened read-only; the file must sit inside the vault.'
            : ' needs a header row; numbers are parsed, the file must sit inside the vault.'}
      </p>
    </div>
  )
}
