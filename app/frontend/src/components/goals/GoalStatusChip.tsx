import type { GoalStatus } from '../../types/goals'
import { STATUS_COLOR, STATUS_LABEL } from '../../lib/goals'

// Same geometry as the Setup page's StatusChip: the colour at 40% alpha as a
// border on a transparent fill, so it reads on the dark card without shouting.
export function GoalStatusChip({ status }: { status: GoalStatus }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.pending
  return (
    <span
      data-status={status}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        lineHeight: 1.4,
        transition: 'color 200ms ease, border-color 200ms ease',
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
