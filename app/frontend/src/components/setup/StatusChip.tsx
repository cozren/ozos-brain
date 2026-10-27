import type { SetupStatus } from '../../types/setup'
import { statusLabel } from '../../lib/setup'

// One colour per state; borders are the colour at 40% alpha on a transparent fill
// so chips read on the dark card without competing with the title.
export const STATUS_COLOR: Record<SetupStatus, string> = {
  done: '#22C55E',
  needs_attention: '#EF4444',
  in_progress: '#F59E0B',
  skipped: '#64748B',
  not_started: '#94A3B8',
}

export function StatusChip({ status }: { status: SetupStatus }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.not_started
  return (
    <span
      data-status={status}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color,
        border: `1px solid ${color}66`,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: 1.4,
        transition: 'color 200ms ease, border-color 200ms ease',
      }}
    >
      {statusLabel(status)}
    </span>
  )
}
