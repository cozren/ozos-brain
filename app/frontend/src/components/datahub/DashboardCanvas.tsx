import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import type { LoadoutRow } from '../../types/loadout'
import type { DataPoint } from '../../types/datapoints'
import type { PickerFoldersConfig } from './dashboards/pickerFolders'
import { LoadoutCanvas } from '../loadout/LoadoutCanvas'
import { DashboardTile } from './DashboardTile'
import '../../styles/datahub.css'

interface DashboardCanvasProps {
  tabId: string
  // Rows to show when this tab has no saved layout yet (a "starter" loadout).
  // Display-only: they are not persisted until the user edits the canvas. Once a
  // tab exists in the saved layout — even as an empty row list — it wins, so a
  // user who clears the tab doesn't get the seed back on next load.
  defaultRows?: LoadoutRow[]
  // Reports the number of tiles on this tab (after load and on every change) so a
  // parent can show a live widget count. Called with 0 for an empty tab.
  onCountChange?: (count: number) => void
}

// Data Hub is a Loadout canvas per tab. The full per-tab map is held so saving
// one tab doesn't clobber the others. A tile's refId is a data point id;
// DashboardTile renders the data point picker when the tile is empty.
export function DashboardCanvas({ tabId, defaultRows, onCountChange }: DashboardCanvasProps) {
  const [tabsRows, setTabsRows] = useState<Record<string, LoadoutRow[]>>({})
  const [pickerFolders, setPickerFolders] = useState<PickerFoldersConfig>({})
  const [loaded, setLoaded] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [datapoints, setDatapoints] = useState<DataPoint[]>([])

  // Latest tabs/folders held in refs so a save of one never clobbers the other
  // with a stale closure value (tabs and picker folders share one PUT).
  const tabsRef = useRef<Record<string, LoadoutRow[]>>({})
  const foldersRef = useRef<PickerFoldersConfig>({})

  useEffect(() => {
    let alive = true
    api
      .getDataPoints()
      .then((d) => {
        if (alive) setDatapoints(d.datapoints)
      })
      .catch(() => {
        if (alive) setDatapoints([])
      })
    api.getDataHubLayout().then((layout) => {
      if (!alive) return
      const map: Record<string, LoadoutRow[]> = {}
      for (const [id, tab] of Object.entries(layout.tabs ?? {})) map[id] = tab.rows
      tabsRef.current = map
      foldersRef.current = layout.pickerFolders ?? {}
      setTabsRows(map)
      setPickerFolders(foldersRef.current)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Before the layout loads, render nothing (avoids a seed flash then swap). Once
  // loaded, a tab present in the saved layout wins (even if empty); only a truly
  // absent tab falls back to the seed rows.
  const rows = !loaded ? [] : tabId in tabsRows ? tabsRows[tabId] : (defaultRows ?? [])

  // Report the tile count up (for nav badges). Held in a ref so the effect can
  // depend only on the count — not the callback identity — avoiding render loops.
  const tileCount = useMemo(() => rows.reduce((n, r) => n + r.tiles.length, 0), [rows])
  const countCb = useRef(onCountChange)
  countCb.current = onCountChange
  useEffect(() => {
    if (loaded) countCb.current?.(tileCount)
  }, [loaded, tileCount])

  const save = useCallback(() => {
    const payload = {
      tabs: Object.fromEntries(Object.entries(tabsRef.current).map(([id, r]) => [id, { rows: r }])),
      pickerFolders: foldersRef.current,
    }
    // Surface failures: a silent catch here is exactly how a stale/down
    // backend loses the user's view with no warning.
    api.saveDataHubLayout(payload).then(
      () => setSaveFailed(false),
      () => setSaveFailed(true)
    )
  }, [])

  const persist = useCallback(
    (nextRows: LoadoutRow[]) => {
      const next = { ...tabsRef.current, [tabId]: nextRows }
      tabsRef.current = next
      setTabsRows(next)
      save()
    },
    [tabId, save]
  )

  const persistFolders = useCallback(
    (next: PickerFoldersConfig) => {
      foldersRef.current = next
      setPickerFolders(next)
      save()
    },
    [save]
  )

  return (
    <div className="datahub-canvas">
      {saveFailed && (
        <div className="datahub-canvas__toolbar">
          <span className="datahub-canvas__hint datahub-canvas__hint--error" role="alert">
            Couldn't save layout — your changes are not persisted. Is the backend running?
          </span>
        </div>
      )}
      <LoadoutCanvas
        rows={rows}
        onChange={persist}
        renderTile={(refId, { onPick, onRemove }) => (
          <DashboardTile
            refId={refId}
            datapoints={datapoints}
            onPick={onPick}
            onRemove={onRemove}
            pickerFolders={pickerFolders}
            onFoldersChange={persistFolders}
          />
        )}
      />
    </div>
  )
}
