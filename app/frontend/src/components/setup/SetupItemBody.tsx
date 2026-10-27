import type { SetupItem } from '../../types/setup'
import { api } from '../../api'
import { StakeholderForm } from './StakeholderForm'
import { HINT } from './formStyles'

interface Props {
  item: SetupItem
  onChanged: () => void
}

// Sub-rows for repeatable items (one line per person added).
function Rows({ item }: { item: SetupItem }) {
  if (item.rows.length === 0) return null
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {item.rows.map((row) => (
        <li
          key={row.id}
          style={{
            display: 'flex',
            gap: 12,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-dim)',
            paddingLeft: 10,
            borderLeft: '2px solid rgba(34,197,94,0.5)',
          }}
        >
          <span style={{ color: 'var(--text)' }}>{row.display_name}</span>
          <span>{row.id}</span>
          {row.added_at && <span>{row.added_at.slice(0, 10)}</span>}
        </li>
      ))}
    </ul>
  )
}

// The per-kind form slot under an item row. Kinds without a form render nothing.
export function SetupItemBody({ item, onChanged }: Props) {
  switch (item.kind) {
    case 'people':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Rows item={item} />
          <StakeholderForm
            onSubmit={async (payload) => {
              const result = await api.addStakeholder(payload)
              onChanged()
              return result
            }}
          />
        </div>
      )
    case 'manual':
      return (
        <p style={HINT}>
          In a Claude Code session run <code>/sync-notes</code>; it fetches Granola meetings and
          feeds them to the notes pipeline. Mark this done once the first run succeeds.
        </p>
      )
    default:
      return null
  }
}
