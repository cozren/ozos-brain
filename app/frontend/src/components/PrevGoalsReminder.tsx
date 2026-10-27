import type { GoalLike } from '../types'
import { SectionHeader } from './SectionHeader'

const title = (g: GoalLike): string => (typeof g === 'string' ? g : g.title)

/**
 * Read-only reminder of the growth goals defined in the previous cycle, carried
 * forward when this cycle was created. Purely informational — the cycle's own
 * editable goals live in the GROWTH GOALS section below. Renders nothing when
 * there is nothing to carry.
 */
export function PrevGoalsReminder({ goals }: { goals: GoalLike[] }) {
  if (!goals?.length) return null

  return (
    <div style={{ opacity: 0.92 }}>
      <SectionHeader label="GROWTH GOALS FROM PREVIOUS CYCLE" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {goals.map((g, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '6px 10px',
              border: '1px dashed rgba(0,255,255,0.18)',
              borderRadius: 4,
              background: 'rgba(0,255,255,0.03)',
              fontSize: 12,
              color: 'var(--text-dim)',
            }}
          >
            <span aria-hidden style={{ color: 'rgba(0,255,255,0.4)', lineHeight: 1.4 }}>
              ↻
            </span>
            <span style={{ lineHeight: 1.4 }}>{title(g)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
