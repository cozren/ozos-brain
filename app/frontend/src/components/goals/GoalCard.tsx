import { useEffect, useState } from 'react'
import type { Goal, GoalPatch, GoalStatus } from '../../types/goals'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../../lib/goals'
import { GoalStatusChip } from './GoalStatusChip'

interface Props {
  goal: Goal
  first?: boolean
  // When both are given and the goal is manual, the card becomes editable.
  onPatch?: (id: string, patch: GoalPatch) => void
  onDelete?: (id: string) => void
}

const META: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-dim)',
  letterSpacing: 0.3,
}

const CONTROL: React.CSSProperties = {
  background: 'rgba(0,255,255,0.05)',
  border: '1px solid rgba(0,255,255,0.25)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '3px 6px',
  outline: 'none',
  colorScheme: 'dark',
  cursor: 'pointer',
  transition: 'border-color 200ms ease, box-shadow 200ms ease',
}

const DELETE: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(239,68,68,0.35)',
  color: '#EF4444',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '3px 8px',
  cursor: 'pointer',
  transition: 'background 150ms ease',
}

// One goal: title and status on the first line, a thin progress bar when the
// goal reports one, then owner, target and (for synced goals) the source.
// Manual goals with handlers get a status select, a progress input and Delete;
// synced goals stay read-only (they are changed in their source).
export function GoalCard({ goal, first = false, onPatch, onDelete }: Props) {
  const color = STATUS_COLOR[goal.status]
  const editable = goal.source === 'manual' && !!onPatch && !!onDelete
  const [progressDraft, setProgressDraft] = useState(
    goal.progress === null ? '' : String(goal.progress)
  )
  useEffect(() => {
    setProgressDraft(goal.progress === null ? '' : String(goal.progress))
  }, [goal.progress])

  const commitProgress = () => {
    const next = progressDraft.trim() === '' ? null : Number(progressDraft)
    if (next !== goal.progress && onPatch) onPatch(goal.id, { progress: next })
  }

  return (
    <div
      data-goal={goal.id}
      className="goal-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '14px 18px',
        borderTop: first ? 'none' : '1px solid rgba(0,255,255,0.08)',
        transition: 'background 200ms ease',
      }}
    >
      <style>{`
        .goal-card select:focus, .goal-card input:focus { border-color: var(--neon-cyan); box-shadow: 0 0 0 2px rgba(0,255,255,0.2); }
        .goal-card button:hover { background: rgba(239,68,68,0.1); }
        .goal-card button:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }
      `}</style>
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
        {editable ? (
          <select
            aria-label="Status"
            value={goal.status}
            onChange={(e) => onPatch!(goal.id, { status: e.target.value as GoalStatus })}
            style={{
              ...CONTROL,
              color,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontSize: 10,
            }}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <GoalStatusChip status={goal.status} />
        )}
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
        {editable ? (
          <span style={{ ...META, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              aria-label="Progress"
              type="number"
              min={0}
              max={100}
              value={progressDraft}
              placeholder="–"
              onChange={(e) => setProgressDraft(e.target.value)}
              onBlur={commitProgress}
              onKeyDown={(e) => e.key === 'Enter' && commitProgress()}
              style={{ ...CONTROL, width: 52, cursor: 'text' }}
            />
            %
          </span>
        ) : (
          goal.progress !== null && <span style={META}>{goal.progress}%</span>
        )}
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
        {editable && (
          <button
            aria-label={`Delete ${goal.title}`}
            style={{ ...DELETE, marginLeft: 'auto' }}
            onClick={() => {
              if (window.confirm(`Delete goal "${goal.title}"?`)) onDelete!(goal.id)
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
