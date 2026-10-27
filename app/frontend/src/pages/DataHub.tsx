import { useEffect, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DashboardCanvas } from '../components/datahub/DashboardCanvas'

const STORAGE_KEY = 'ozos-data-hub-tab'

const EMPTY_COPY =
  'No data points yet. Define your first data point in Setup (coming in a later phase).'

// The Data Hub is a set of user-defined tabs, each a dashboard canvas. Tabs come
// from the saved layout; a vault with no tabs shows the empty state.
export function DataHub() {
  const [tabs, setTabs] = useState<string[] | null>(null)
  const [tab, setTab] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    api
      .getDataHubLayout()
      .then((layout) => {
        if (alive) setTabs(Object.keys(layout.tabs ?? {}))
      })
      .catch(() => {
        if (alive) setTabs([])
      })
    return () => {
      alive = false
    }
  }, [])

  const active = tabs && tabs.length > 0 ? (tab && tabs.includes(tab) ? tab : tabs[0]) : null

  useEffect(() => {
    if (active) localStorage.setItem(STORAGE_KEY, active)
  }, [active])

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <PageHeader
        title="Data Hub"
        subtitle="Your data points, one canvas per tab."
        icon={<Database size={44} strokeWidth={1.5} />}
        sticky={false}
        collapseScrollRef={rootRef}
      />

      {tabs === null ? null : active === null ? (
        <section
          aria-label="Data Hub empty state"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            letterSpacing: 0.5,
            textAlign: 'center',
          }}
        >
          <p style={{ maxWidth: 480 }}>{EMPTY_COPY}</p>
        </section>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Data Hub tabs"
            style={{
              display: 'flex',
              gap: 8,
              padding: '2px 40px 8px',
              borderBottom: '1px solid rgba(0,255,255,0.12)',
              flexShrink: 0,
            }}
          >
            {tabs.map((id) => {
              const selected = id === active
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    padding: '6px 16px',
                    cursor: 'pointer',
                    borderRadius: 6,
                    border: `1px solid ${selected ? 'var(--neon-cyan)' : 'rgba(148,163,184,0.25)'}`,
                    background: selected ? 'rgba(0,255,255,0.1)' : 'transparent',
                    color: selected ? 'var(--neon-cyan)' : 'var(--text-dim)',
                    textShadow: selected ? '0 0 8px rgba(0,255,255,0.4)' : 'none',
                    transition: 'all 120ms',
                  }}
                >
                  {id}
                </button>
              )
            })}
          </div>
          <section
            role="tabpanel"
            aria-label={active}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
            className="planner-strip--bar"
          >
            <DashboardCanvas tabId={active} />
          </section>
        </>
      )}
    </div>
  )
}
