import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../../api'
import type { DataPoint, DataPointValue } from '../../types/datapoints'
import { fetchedAgo } from '../../lib/datapoints'
import { NumberDisplay } from './displays/NumberDisplay'
import { TableDisplay } from './displays/TableDisplay'
import { LineDisplay } from './displays/LineDisplay'
import '../../styles/datahub.css'

interface Props {
  dp: DataPoint
}

// One data point inside a Data Hub tile: its name, when it was last fetched,
// a Refresh button, and the cached value rendered by the point's display.
export function DataPointTile({ dp }: Props) {
  const [value, setValue] = useState<DataPointValue | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .getDataPointValue(dp.id)
      .then((v) => {
        setValue(v)
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
  }, [dp.id])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async () => {
    setBusy(true)
    try {
      setValue(await api.refreshDataPoint(dp.id))
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setBusy(false)
    }
  }

  let body: React.ReactNode
  if (loadError) body = <p className="dp-tile__error">Could not load value</p>
  else if (!value) body = <p className="dp-tile__hint">Loading…</p>
  else if (value.error) body = <p className="dp-tile__error">{value.error}</p>
  else if (value.fetched_at === null) body = <p className="dp-tile__hint">Not fetched yet.</p>
  else if (dp.display === 'table') body = <TableDisplay value={value} />
  else if (dp.display === 'line') body = <LineDisplay value={value} />
  else body = <NumberDisplay value={value} unit={dp.unit} />

  return (
    <div className="dp-tile">
      <div className="dp-tile__head">
        <span className="dp-tile__name">{dp.name}</span>
        <span className="dp-tile__age">{fetchedAgo(value?.fetched_at ?? null)}</span>
        <button
          className="datahub-tile__btn"
          onClick={refresh}
          disabled={busy}
          title="Fetch again"
          aria-label={`Refresh ${dp.name}`}
        >
          <RefreshCw size={13} className={busy ? 'dp-tile__spin' : undefined} />
        </button>
      </div>
      <div className="dp-tile__body">{body}</div>
    </div>
  )
}
