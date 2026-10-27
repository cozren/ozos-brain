import type { Goal } from '../../types/goals'
import { STATUS_COLOR } from '../../lib/goals'
import { GoalStatusChip } from './GoalStatusChip'

interface Props {
  goal: Goal
  first?: boolean
}

const META: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-dim)',
  letterSpacing: 0.3,
}

// One goal: title and status on the first line, a thin progress bar when the
// goal reports one, then owner, target and (for synced goals) the source.
export function GoalCard({ goal, first = false }: Props) {
  const color = STATUS_COLOR[goal.status]
  return (
    <div
      data-goal={goal.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid rgba(0,255,255,0.08)',
        transition: 'background 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {goal.title}
        </span>
        <GoalStatusChip status={goal.status} />
      </div>
      {goal.progress !== null && (
        <div
          role="progressbar"
          aria-valuenow={goal.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.title} progress`}
          style={{
            height: 4,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${goal.progress}%`,
              height: '100%',
              background: color,
              boxShadow: `0 0 8px color-mix(in srgb, ${color} 50%, transparent)`,
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {goal.progress !== null && <span style={META}>{goal.progress}%</span>}
        {goal.owner && <span style={META}>owner {goal.owner}</span>}
        {goal.target_date && <span style={META}>target {goal.target_date}</span>}
        {goal.source === 'atlassian' && (
          <span
            style={{
              ...META,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'rgba(148,163,184,0.8)',
              border: '1px solid rgba(148,163,184,0.25)',
              padding: '1px 6px',
            }}
          >
            Atlassian
          </span>
        )}
      </div>
    </div>
  )
}
