import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { LoadoutRow } from '../../types/loadout'
import type { ReportSource } from '../../types/reporting'
import { LoadoutCanvas } from '../loadout/LoadoutCanvas'
import { ReportFeed } from './ReportFeed'
import '../../styles/reporting.css'

// The Reporting page is a Loadout canvas: rows of tiles the user arranges with
// edge "+" buttons, drag, and resize. A tile bound to a source renders a
// ReportFeed; an empty tile shows a picker of the available sources.
export function ReportingCanvas() {
  const [rows, setRows] = useState<LoadoutRow[]>([])
  const [sources, setSources] = useState<ReportSource[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([api.getReportLayout(), api.getReportSources()]).then(([layout, srcs]) => {
      if (!alive) return
      setRows(layout.rows)
      setSources(srcs)
    })
    return () => {
      alive = false
    }
  }, [])

  const persist = useCallback((next: LoadoutRow[]) => {
    setRows(next)
    api.saveReportLayout({ rows: next }).catch(() => {})
  }, [])

  return (
    <div className="reporting-canvas">
      <LoadoutCanvas
        rows={rows}
        onChange={persist}
        renderTile={(refId, { onPick, onRemove }) =>
          refId ? (
            <ReportFeed sourceId={refId} onRemove={onRemove} />
          ) : (
            <div className="reporting-canvas__picker" role="menu">
              <div className="reporting-canvas__picker-label">Track…</div>
              {sources.map((s) => (
                <button
                  key={s.id}
                  className="reporting-canvas__picker-item"
                  onClick={() => onPick(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )
        }
      />
    </div>
  )
}
