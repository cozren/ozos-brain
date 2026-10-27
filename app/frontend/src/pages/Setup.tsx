import { useCallback, useEffect, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SetupItemRow } from '../components/setup/SetupItemRow'
import { SetupItemBody } from '../components/setup/SetupItemBody'
import { api } from '../api'
import type { SetupItem, SetupStatus, SetupView } from '../types/setup'

// The setup journal: every onboarding item grouped, with its status. Items are
// independent and nothing gates anything; the page is meant to stay half-done
// for weeks.
export function Setup() {
  const [view, setView] = useState<SetupView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .getSetup()
      .then((v) => {
        setView(v)
        setError(null)
      })
      .catch(() => setError('Could not load setup'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Replace one item in place from whatever the backend returns (its status may
  // be derived, so the response wins over what was clicked).
  const replaceItem = useCallback((updated: SetupItem) => {
    setView((v) => {
      if (!v) return v
      const groups = v.groups.map((g) => ({
        ...g,
        items: g.items.map((it) => (it.id === updated.id ? updated : it)),
      }))
      const all = groups.flatMap((g) => g.items)
      const done = all.filter((it) => it.status === 'done').length
      const skipped = all.filter((it) => it.status === 'skipped').length
      return {
        ...v,
        groups,
        summary: { ...v.summary, done, open: all.length - done - skipped },
      }
    })
  }, [])

  const handleStatus = useCallback(
    (id: string, status: SetupStatus) => {
      api
        .setSetupStatus(id, status)
        .then(replaceItem)
        .catch(() => setError('Could not update item'))
    },
    [replaceItem]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageHeader
        title="Setup"
        subtitle="Connect your sources one at a time. Nothing here gates anything."
        icon={<ListChecks size={44} strokeWidth={1.5} />}
      >
        {view && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-dim)',
              letterSpacing: 1,
            }}
          >
            {view.summary.done} of {view.summary.total} done
          </span>
        )}
      </PageHeader>

      <div
        style={{
          padding: '8px 40px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          maxWidth: 960,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {error && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#EF4444' }}>{error}</p>
        )}
        {!view && !error && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
            Loading setup…
          </p>
        )}
        {view?.groups.map((group) => (
          <section key={group.id} data-group={group.id}>
            <div className="section-label">{group.label}</div>
            <div
              className="card"
              style={{ boxShadow: 'none', border: '1px solid rgba(0,255,255,0.18)' }}
            >
              {group.items.map((item, i) => (
                <SetupItemRow key={item.id} item={item} first={i === 0} onStatus={handleStatus}>
                  <SetupItemBody item={item} onChanged={load} />
                </SetupItemRow>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
