import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import type { SetupItem } from '../../types/setup'
import type { DataPoint, DataPointValue, DataPointsPayload } from '../../types/datapoints'
import { KIND_LABEL, fetchedAgo } from '../../lib/datapoints'
import { DataPointForm } from '../datahub/DataPointForm'
import { EnvForm } from './EnvForm'
import { CAPTION, ERR, HINT, OK, PRIMARY } from './formStyles'

interface Props {
  item: SetupItem
  onChanged: () => void
}

const ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 2fr auto',
  gap: 12,
  alignItems: 'center',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-dim)',
  padding: '6px 0',
  borderTop: '1px solid rgba(0,255,255,0.08)',
}

const DELETE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#EF4444',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '3px 8px',
  cursor: 'pointer',
}

// The Data points setup item: Metabase credentials with a connection test, the
// data point form, and the list of points with their last fetch or error.
export function DataPanel({ item, onChanged }: Props) {
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const [data, setData] = useState<DataPointsPayload | null>(null)
  const [values, setValues] = useState<Record<string, DataPointValue>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = useCallback(() => {
    api
      .getSetupEnv()
      .then(setEnvStatus)
      .catch(() => setEnvStatus({}))
    api
      .getDataPoints()
      .then((d) => {
        setData(d)
        for (const dp of d.datapoints) {
          api
            .getDataPointValue(dp.id)
            .then((v) => setValues((prev) => ({ ...prev, [dp.id]: v })))
            .catch(() => {})
        }
      })
      .catch(() => setData(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const test = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.testMetabase()
      setMessage({ ok: true, text: result.message })
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof ApiError && e.detail ? e.detail : 'Connection test failed.',
      })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (dp: DataPoint) => {
    if (
      !window.confirm(`Delete data point "${dp.name}"? Tiles showing it will say it was removed.`)
    )
      return
    await api.deleteDataPoint(dp.id)
    refresh()
    onChanged()
  }

  const configured = data?.connector.configured ?? false
  const points = data?.datapoints ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={CAPTION}>Connect Metabase (optional)</p>
        <EnvForm
          names={item.env}
          status={envStatus}
          onSave={async (vars) => {
            const written = await api.setSetupEnv(vars)
            refresh()
            onChanged()
            return written
          }}
        />
        <div className="setup-form" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            style={PRIMARY}
            disabled={busy || !configured}
            onClick={test}
            title={configured ? 'One authenticated request' : 'Save both variables first'}
          >
            Test connection
          </button>
          {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={CAPTION}>Define a data point</p>
        <DataPointForm
          connectorConfigured={configured}
          onSubmit={async (payload) => {
            const created = await api.addDataPoint(payload)
            refresh()
            onChanged()
            return created
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={CAPTION}>Your data points</p>
        {points.length === 0 ? (
          <p style={HINT}>No data points yet.</p>
        ) : (
          <div>
            {points.map((dp) => {
              const v = values[dp.id]
              return (
                <div key={dp.id} style={ROW} data-datapoint={dp.id}>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{dp.name}</span>
                  <span>{KIND_LABEL[dp.source.kind]}</span>
                  <span>
                    {dp.display} · {dp.refresh}
                  </span>
                  <span style={v?.error ? { color: '#EF4444' } : undefined}>
                    {v?.error ? v.error : `fetched ${fetchedAgo(v?.fetched_at ?? null)}`}
                  </span>
                  <button
                    className="dp-delete"
                    style={DELETE}
                    aria-label={`Delete ${dp.name}`}
                    onClick={() => remove(dp)}
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p style={HINT}>
        Tiles on the Data Hub and goal measures show data points; daily points refresh through the
        datapoints-refresh vital on the Control Tower.
      </p>
    </div>
  )
}
