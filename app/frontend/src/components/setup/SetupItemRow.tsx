import type { ReactNode } from 'react'
import type { SetupItem, SetupStatus } from '../../types/setup'
import { StatusChip } from './StatusChip'

interface Props {
  item: SetupItem
  onStatus?: (id: string, status: SetupStatus) => void
  first?: boolean
  children?: ReactNode
}

// One checklist line: title, the one-line "why", what it writes, and the status
// chip. `children` is the item's form slot (empty for read-only rows).
export function SetupItemRow({ item, first = false, children }: Props) {
  return (
    <div
      data-item={item.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid rgba(0,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: 0.5,
            }}
          >
            {item.title}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-dim)' }}>
            {item.why}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(148,163,184,0.6)',
              letterSpacing: 0.5,
            }}
          >
            writes {item.writes}
          </span>
        </div>
        <StatusChip status={item.status} />
      </div>
      {children}
    </div>
  )
}
