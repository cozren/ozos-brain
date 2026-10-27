// frontend/src/components/control-tower/McpsCard.tsx
import { useState, useEffect } from 'react'
import type { McpEntry } from '../../types/control-tower'

interface Props {
  remote: McpEntry[]
  local: McpEntry[]
}

const STATUS_ICON: Record<string, string> = {
  active: '✓',
  'needs-auth': '⚠',
  disabled: '○',
  error: '✗',
  pending: '⏸',
}
const STATUS_COLOR: Record<string, string> = {
  active: '#22C55E',
  'needs-auth': '#F59E0B',
  disabled: '#475569',
  error: '#EF4444',
  pending: '#F59E0B',
}
const STATUS_RANK: Record<string, number> = {
  active: 0,
  pending: 1,
  'needs-auth': 2,
  error: 3,
  disabled: 4,
}

const STORAGE_KEY = 'mcps-user-disabled'

function loadDisabled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDisabled(s: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch {}
}

// Strip product names from the end of a display name: "Atlassian Goals" → "Atlassian"
function baseDisplayName(name: string, products: string[]): string {
  let result = name
  for (const p of products) {
    result = result.replace(new RegExp(`\\s+${p}\\s*$`, 'i'), '').trim()
  }
  return result || name
}

const TYPE_LABEL: Record<string, string> = {
  'api-connection': 'api',
  product: 'product',
  mcp: 'mcp',
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
      style={{
        width: 26,
        height: 14,
        borderRadius: 7,
        cursor: 'pointer',
        background: on ? '#22C55E' : '#1E293B',
        border: `1px solid ${on ? '#16A34A' : '#334155'}`,
        position: 'relative',
        flexShrink: 0,
        transition: 'background 150ms, border-color 150ms',
        boxShadow: on ? '0 0 5px #22C55E44' : 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 13 : 2,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: on ? '#fff' : '#475569',
          transition: 'left 150ms',
        }}
      />
    </div>
  )
}

function BootRow({
  entry,
  index,
  isOn,
  onToggle,
}: {
  entry: McpEntry
  index: number
  isOn: boolean
  onToggle: (name: string, on: boolean) => void
}) {
  const effectiveStatus = isOn ? entry.status : 'disabled'
  // pending = server is running, just needs Claude approval — treat as active visually
  const showCheck = isOn && (entry.status === 'active' || entry.status === 'pending')
  const color = showCheck ? STATUS_COLOR['active'] : STATUS_COLOR[effectiveStatus]
  const products = entry.products ?? []
  const displayName = baseDisplayName(entry.name, products)
  // Don't show a type label for 'product' entries — the product chips already say it
  const connType = entry.connectionType ?? 'mcp'
  const typeLabel = connType !== 'product' ? (TYPE_LABEL[connType] ?? 'mcp') : null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        padding: '5px 4px',
        opacity: isOn ? 1 : 0.38,
        animation: `ct-boot-in 250ms ease ${index * 40}ms both`,
      }}
    >
      {/* Status icon */}
      <span style={{ width: 15, textAlign: 'center', flexShrink: 0, fontSize: 13, color }}>
        {showCheck ? (
          <span
            style={{
              animation: `ct-check-pop 200ms cubic-bezier(0.34,1.56,0.64,1) ${index * 40 + 150}ms both`,
              display: 'inline-block',
            }}
          >
            ✓
          </span>
        ) : (
          (STATUS_ICON[effectiveStatus] ?? '○')
        )}
      </span>

      {/* Name + inline muted labels */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 5,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: showCheck ? '#CBD5E1' : '#94A3B8',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        {products.map((p) => (
          <span
            key={p}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: '#64748B',
              border: '1px solid #1E293B',
              background: 'transparent',
              padding: '1px 5px',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
            }}
          >
            {p}
          </span>
        ))}
        {typeLabel && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: '#3D5166',
              border: '1px solid #162032',
              background: 'transparent',
              padding: '1px 5px',
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
            }}
          >
            {typeLabel}
          </span>
        )}
      </div>

      {/* Toggle */}
      <ToggleSwitch on={isOn} onChange={(v) => onToggle(entry.name, v)} />
    </div>
  )
}

export function McpsCard({ remote, local }: Props) {
  const [disabledNames, setDisabledNames] = useState<Set<string>>(loadDisabled)
  const [othersOpen, setOthersOpen] = useState(false)

  // Persist any toggle change to localStorage
  useEffect(() => {
    saveDisabled(disabledNames)
  }, [disabledNames])

  const handleToggle = (name: string, on: boolean) => {
    setDisabledNames((prev) => {
      const next = new Set(prev)
      if (on) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const all = [...remote, ...local].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
  )

  const isOn = (m: McpEntry) => m.status !== 'disabled' && !disabledNames.has(m.name)
  const enabled = all.filter(isOn)
  const disabled = all.filter((m) => !isOn(m))
  const activeCount = all.filter((m) => m.status === 'active' && !disabledNames.has(m.name)).length

  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(0,128,255,0.18)',
        padding: '13px 13px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @keyframes ct-boot-in { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes ct-check-pop { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#60A5FA"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#60A5FA',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 5px #3B82F644',
          }}
        >
          MCPs
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#60A5FA',
            background: '#080e1c',
            border: '1px solid #3B82F622',
            padding: '2px 7px',
          }}
        >
          {activeCount}/{all.length}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="ct-scroll" style={{ maxHeight: 390 }}>
        {/* Enabled entries */}
        <div>
          {enabled.map((m, i) => (
            <BootRow key={m.name} entry={m} index={i} isOn={true} onToggle={handleToggle} />
          ))}
        </div>

        {/* Others (disabled) — collapsible */}
        {disabled.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={() => setOthersOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: '#475569',
                padding: '3px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                letterSpacing: '1px',
              }}
            >
              <span style={{ fontSize: 8, color: '#334155' }}>{othersOpen ? '▾' : '▸'}</span>
              <span>Others ({disabled.length})</span>
            </button>

            {othersOpen && (
              <div style={{ borderTop: '1px solid #1E293B', paddingTop: 4 }}>
                {disabled.map((m, i) => (
                  <BootRow key={m.name} entry={m} index={i} isOn={false} onToggle={handleToggle} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
