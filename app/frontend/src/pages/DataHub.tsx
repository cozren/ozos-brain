import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, Plus } from 'lucide-react'
import { api } from '../api'
import type { DataHubLayout } from '../types/datahub'
import type { DataPoint } from '../types/datapoints'
import { PageHeader } from '../components/PageHeader'
import { DashboardCanvas } from '../components/datahub/DashboardCanvas'
import { DataPointForm } from '../components/datahub/DataPointForm'
import { FIELD, PRIMARY } from '../components/setup/formStyles'

const STORAGE_KEY = 'ozos-data-hub-tab'

export const NO_POINTS_COPY =
  'No data points yet. A data point is a Metabase card, a SQL query or a CSV in your vault, shown as a number, a table or a line.'
export const NO_TABS_COPY = 'Add a tab to place your data points.'

const EMPTY_LAYOUT: DataHubLayout = { tabs: {}, pickerFolders: {} }

const TAB_BUTTON = (selected: boolean): React.CSSProperties => ({
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
})

// Inline "Add tab" control: a + button that turns into a name input.
function AddTab({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const commit = () => {
    if (!name.trim()) return // nothing to add; keep typing
    onAdd(name)
    setName('')
    setOpen(false)
  }
  if (!open) {
    return (
      <button
        aria-label="Add tab"
        title="Add tab"
        onClick={() => setOpen(true)}
        style={{ ...TAB_BUTTON(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Plus size={13} /> Add tab
      </button>
    )
  }
  return (
    <input
      aria-label="Tab name"
      autoFocus
      value={name}
      placeholder="tab name"
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setName('')
          setOpen(false)
        }
      }}
      onBlur={() => (name.trim() ? commit() : setOpen(false))}
      style={{ ...FIELD, width: 160, padding: '5px 10px' }}
    />
  )
}

// The Data Hub is a set of user-defined tabs, each a dashboard canvas of data
// point tiles. Tabs come from the saved layout and are created here; a vault
// with no tabs shows an empty state that leads to the first data point.
export function DataHub() {
  const [layout, setLayout] = useState<DataHubLayout | null>(null)
  const [datapoints, setDatapoints] = useState<DataPoint[]>([])
  const [connectorConfigured, setConnectorConfigured] = useState(false)
  const [tab, setTab] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const [defining, setDefining] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const loadPoints = useCallback(() => {
    return api
      .getDataPoints()
      .then((d) => {
        setDatapoints(d.datapoints)
        setConnectorConfigured(d.connector.configured)
      })
      .catch(() => setDatapoints([]))
  }, [])

  useEffect(() => {
    let alive = true
    api
      .getDataHubLayout()
      .then((l) => {
        if (alive) setLayout({ tabs: l.tabs ?? {}, pickerFolders: l.pickerFolders ?? {} })
      })
      .catch(() => {
        if (alive) setLayout(EMPTY_LAYOUT)
      })
    loadPoints()
    return () => {
      alive = false
    }
  }, [loadPoints])

  const tabs = layout ? Object.keys(layout.tabs) : null
  const active = tabs && tabs.length > 0 ? (tab && tabs.includes(tab) ? tab : tabs[0]) : null

  useEffect(() => {
    if (active) localStorage.setItem(STORAGE_KEY, active)
  }, [active])

  const addTab = (raw: string) => {
    const name = raw.trim()
    if (!layout || !name || name in layout.tabs) return
    const next: DataHubLayout = {
      tabs: { ...layout.tabs, [name]: { rows: [] } },
      pickerFolders: layout.pickerFolders ?? {},
    }
    api.saveDataHubLayout(next).then(
      () => {
        setLayout(next)
        setTab(name)
        setSaveError(false)
      },
      () => setSaveError(true)
    )
  }

  const emptyStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 40,
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    letterSpacing: 0.5,
    textAlign: 'center',
  }

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
        <section aria-label="Data Hub empty state" style={emptyStyle}>
          {datapoints.length === 0 ? (
            <>
              <p style={{ maxWidth: 520, margin: 0 }}>{NO_POINTS_COPY}</p>
              {defining ? (
                <div
                  className="card"
                  style={{
                    width: 'min(900px, 100%)',
                    textAlign: 'left',
                    boxShadow: 'none',
                    padding: 18,
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 10 }}>
                    Define your first data point
                  </div>
                  <DataPointForm
                    connectorConfigured={connectorConfigured}
                    onSubmit={async (payload) => {
                      const created = await api.addDataPoint(payload)
                      await loadPoints()
                      return created
                    }}
                  />
                </div>
              ) : (
                <div className="setup-form">
                  <button style={PRIMARY} onClick={() => setDefining(true)}>
                    Define your first data point
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ maxWidth: 480, margin: 0 }}>{NO_TABS_COPY}</p>
              <div className="setup-form">
                <AddTab onAdd={addTab} />
              </div>
            </>
          )}
          {saveError && (
            <p role="alert" style={{ color: '#f87171', margin: 0 }}>
              Couldn't save the tab. Is the backend running?
            </p>
          )}
        </section>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Data Hub tabs"
            style={{
              display: 'flex',
              alignItems: 'center',
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
                  style={TAB_BUTTON(selected)}
                >
                  {id}
                </button>
              )
            })}
            <AddTab onAdd={addTab} />
            {saveError && (
              <span
                role="alert"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171' }}
              >
                Couldn't save the tab.
              </span>
            )}
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
