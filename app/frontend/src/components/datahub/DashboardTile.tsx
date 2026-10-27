import { X } from 'lucide-react'
import { getDashboard } from './dashboards/registry'
import type { PickerFoldersConfig } from './dashboards/pickerFolders'
import { DashboardPicker } from './DashboardPicker'
import '../../styles/datahub.css'

interface DashboardTileProps {
  dashboardId: string | null
  onPick: (id: string) => void
  onRemove: () => void
  pickerFolders?: PickerFoldersConfig
  onFoldersChange?: (next: PickerFoldersConfig) => void
}

export function DashboardTile({
  dashboardId,
  onPick,
  onRemove,
  pickerFolders = {},
  onFoldersChange,
}: DashboardTileProps) {
  const def = dashboardId ? getDashboard(dashboardId) : undefined

  const title = def?.label ?? (dashboardId ? 'Unknown dashboard' : 'Choose a dashboard')

  return (
    <div className="datahub-tile">
      <div className="datahub-tile__head">
        {/* Component tiles render their own bold title inside the body, so the
            chrome title is suppressed to avoid a duplicate. Embeds / unknown /
            empty tiles have no inner title, so they keep the chrome label. */}
        <span>{def?.Component ? '' : title}</span>
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
        {dashboardId === null ? (
          <DashboardPicker
            folders={pickerFolders}
            onFoldersChange={onFoldersChange ?? (() => {})}
            onPick={onPick}
          />
        ) : def?.Component ? (
          <def.Component />
        ) : def?.embedUrl ? (
          <iframe src={def.embedUrl} title={def.label} />
        ) : (
          <div className="datahub-tile__placeholder">Unknown dashboard: {dashboardId}</div>
        )}
      </div>
    </div>
  )
}
