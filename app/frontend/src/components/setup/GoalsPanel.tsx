import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import type { SetupItem } from '../../types/setup'
import type { GoalsPayload } from '../../types/goals'
import { AddGoalForm } from '../goals/AddGoalForm'
import { EnvForm } from './EnvForm'
import { CAPTION, ERR, HINT, OK, PRIMARY } from './formStyles'

interface Props {
  item: SetupItem
  onChanged: () => void
}

// The Goals setup item: connect Atlassian Goals (four .env lines, then a sync),
// or add a first goal by hand. Both mark the item done through the backend.
export function GoalsPanel({ item, onChanged }: Props) {
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const [goals, setGoals] = useState<GoalsPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = useCallback(() => {
    api
      .getSetupEnv()
      .then(setEnvStatus)
      .catch(() => setEnvStatus({}))
    api
      .getGoals()
      .then(setGoals)
      .catch(() => setGoals(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const sync = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.syncGoals()
      setMessage({ ok: true, text: `Synced ${result.synced} goals.` })
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof ApiError && e.detail ? e.detail : 'Sync failed.',
      })
    } finally {
      setBusy(false)
      refresh()
      onChanged()
    }
  }

  const configured = goals?.connector.configured ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={CAPTION}>Connect Atlassian Goals</p>
        <EnvForm
          names={item.env}
          status={envStatus}
          onSave={async (vars) => {
            const written = await api.setSetupEnv(vars)
            refresh()
            onChanged()
            return written
          }}
        />
        <div className="setup-form" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            style={PRIMARY}
            disabled={busy || !configured}
            onClick={sync}
            title={configured ? 'Pull goals from Atlassian' : 'Save all four variables first'}
          >
            Sync now
          </button>
          {goals?.sync && (
            <span style={{ ...HINT, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              Last sync: {goals.sync.last_run.slice(0, 16).replace('T', ' ')} ·{' '}
              {goals.sync.status === 'ok' ? `${goals.sync.count} goals` : goals.sync.message}
            </span>
          )}
          {message && <p style={message.ok ? OK : ERR}>{message.text}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={CAPTION}>Or add a goal by hand</p>
        <AddGoalForm
          onSubmit={async (payload) => {
            const created = await api.addGoal(payload)
            refresh()
            onChanged()
            return created
          }}
        />
      </div>
      <p style={HINT}>
        Goals live on the Goals &amp; Tasks page; each goal can bind to a data point once Phase 4
        ships.
      </p>
    </div>
  )
}
