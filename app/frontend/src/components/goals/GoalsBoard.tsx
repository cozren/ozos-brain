import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import type { Goal, GoalPatch, GoalsPayload, NewGoalPayload } from '../../types/goals'
import type { DataPoint, DataPointValue } from '../../types/datapoints'
import { STATUS_ORDER, sortGoals, statusCounts } from '../../lib/goals'
import { AddGoalForm } from './AddGoalForm'
import { GoalCard, type GoalMeasure } from './GoalCard'
import { GoalStatusChip } from './GoalStatusChip'

export const GOALS_EMPTY_COPY = 'No goals yet. Add one below, or connect Atlassian Goals in Setup.'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12 }

// The Goals page body: a count strip, the sorted list, and (when the Atlassian
// connector is configured) a sync button with the last outcome.
export function GoalsBoard() {
  const [data, setData] = useState<GoalsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [datapoints, setDatapoints] = useState<DataPoint[]>([])
  const [values, setValues] = useState<Record<string, DataPointValue>>({})

  // Bound goals show their data point's latest value: one fetch per distinct
  // point that exists, never a write back to progress.
  const loadMeasures = useCallback((goals: Goal[], points: DataPoint[]) => {
    const ids = new Set(
      goals
        .map((g) => g.data_point_id)
        .filter((id): id is string => !!id && points.some((p) => p.id === id))
    )
    for (const id of ids) {
      api
        .getDataPointValue(id)
        .then((v) => setValues((prev) => ({ ...prev, [id]: v })))
        .catch(() => {})
    }
  }, [])

  const load = useCallback(() => {
    Promise.all([api.getGoals(), api.getDataPoints().catch(() => null)])
      .then(([d, p]) => {
        const points = p?.datapoints ?? []
        setData(d)
        setDatapoints(points)
        setError(null)
        loadMeasures(d.goals, points)
      })
      .catch(() => setError('Could not load goals'))
  }, [loadMeasures])

  useEffect(() => {
    load()
  }, [load])

  const sync = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.syncGoals()
      setMessage({ ok: true, text: `Synced ${result.synced} goals.` })
      load()
    } catch (e) {
      const text = e instanceof ApiError && e.detail ? e.detail : 'Sync failed.'
      setMessage({ ok: false, text })
      load()
    } finally {
      setBusy(false)
    }
  }

  const replace = (updated: Goal) => {
    setData((d) =>
      d ? { ...d, goals: d.goals.map((g) => (g.id === updated.id ? updated : g)) } : d
    )
    if (updated.data_point_id && !values[updated.data_point_id]) {
      loadMeasures([updated], datapoints)
    }
  }

  const measureFor = (g: Goal): GoalMeasure | undefined => {
    const dp = g.data_point_id ? datapoints.find((p) => p.id === g.data_point_id) : undefined
    const value = g.data_point_id ? values[g.data_point_id] : undefined
    return dp && value ? { dp, value } : undefined
  }

  const patch = (id: string, change: GoalPatch) => {
    api
      .updateGoal(id, change)
      .then(replace)
      .catch((e) =>
        setMessage({
          ok: false,
          text: e instanceof ApiError && e.detail ? e.detail : 'Could not update goal.',
        })
      )
  }

  const remove = (id: string) => {
    api
      .deleteGoal(id)
      .then(() => setData((d) => (d ? { ...d, goals: d.goals.filter((g) => g.id !== id) } : d)))
      .catch((e) =>
        setMessage({
          ok: false,
          text: e instanceof ApiError && e.detail ? e.detail : 'Could not delete goal.',
        })
      )
  }

  const add = async (payload: NewGoalPayload) => {
    const created = await api.addGoal(payload)
    load()
    return created
  }

  if (error) return <p style={{ ...MONO, color: '#EF4444' }}>{error}</p>
  if (!data) return <p style={{ ...MONO, color: 'var(--text-dim)' }}>Loading goals…</p>

  const counts = statusCounts(data.goals)
  const goals = sortGoals(data.goals)

  return (
    <section aria-label="Goals" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <GoalStatusChip status={s} />
            <span data-testid={`goal-count-${s}`} style={{ ...MONO, color: 'var(--text)' }}>
              {counts[s]}
            </span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {data.sync && (
            <span style={{ ...MONO, fontSize: 11, color: 'var(--text-dim)' }}>
              Last sync: {data.sync.last_run.slice(0, 16).replace('T', ' ')} ·{' '}
              {data.sync.status === 'ok' ? `${data.sync.count} goals` : 'failed'}
            </span>
          )}
          {data.connector.configured && (
            <button className="btn-neon" onClick={sync} disabled={busy} style={{ fontSize: 11 }}>
              Sync Atlassian
            </button>
          )}
        </span>
      </div>
      {message && (
        <p style={{ ...MONO, margin: 0, color: message.ok ? '#22C55E' : '#EF4444' }}>
          {message.text}
        </p>
      )}
      {goals.length === 0 ? (
        <p
          style={{
            ...MONO,
            fontSize: 13,
            color: 'var(--text-dim)',
            textAlign: 'center',
            padding: '48px 20px',
            margin: 0,
          }}
        >
          {GOALS_EMPTY_COPY}
        </p>
      ) : (
        <div
          className="card"
          style={{ boxShadow: 'none', border: '1px solid rgba(0,255,255,0.18)' }}
        >
          {goals.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              first={i === 0}
              onPatch={patch}
              onDelete={remove}
              datapoints={datapoints}
              measure={measureFor(g)}
            />
          ))}
        </div>
      )}
      <div className="card" style={{ boxShadow: 'none', border: '1px solid rgba(0,255,255,0.12)' }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Add a goal
        </div>
        <AddGoalForm onSubmit={add} />
      </div>
    </section>
  )
}
