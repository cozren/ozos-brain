import { X } from 'lucide-react'
import type { DataPoint } from '../../types/datapoints'
import type { PickerFoldersConfig } from './dashboards/pickerFolders'
import { toPickerItems } from '../../lib/datapoints'
import { DashboardPicker } from './DashboardPicker'
import { DataPointTile } from './DataPointTile'
import '../../styles/datahub.css'

interface DashboardTileProps {
  refId: string | null
  datapoints: DataPoint[]
  onPick: (id: string) => void
  onRemove: () => void
  pickerFolders?: PickerFoldersConfig
  onFoldersChange?: (next: PickerFoldersConfig) => void
}

// A Data Hub tile: empty → the data point picker; a known refId → that data
// point's value; an unknown refId → "Data point removed" with a remove action.
export function DashboardTile({
  refId,
  datapoints,
  onPick,
  onRemove,
  pickerFolders = {},
  onFoldersChange,
}: DashboardTileProps) {
  const dp = refId ? datapoints.find((d) => d.id === refId) : undefined

  // A data point tile shows its own name in the body, so the chrome stays blank.
  const title = dp ? '' : refId ? 'Data point removed' : 'Choose a data point'

  return (
    <div className="datahub-tile">
      <div className="datahub-tile__head">
        <span>{title}</span>
        <button
          className="datahub-tile__btn"
          onClick={onRemove}
          title="Remove tile"
          aria-label="Remove tile"
        >
          <X size={14} />
        </button>
      </div>
      <div className="datahub-tile__body">
        {refId === null ? (
          <DashboardPicker
            items={toPickerItems(datapoints)}
            folders={pickerFolders}
            onFoldersChange={onFoldersChange ?? (() => {})}
            onPick={onPick}
          />
        ) : dp ? (
          <DataPointTile dp={dp} />
        ) : (
          <div className="datahub-tile__placeholder datahub-tile__placeholder--column">
            <span>Data point removed</span>
            <button className="datahub-tile__picker-item" onClick={onRemove}>
              Remove this tile
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
