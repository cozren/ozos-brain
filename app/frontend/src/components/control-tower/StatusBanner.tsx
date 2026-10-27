// frontend/src/components/control-tower/StatusBanner.tsx
import type { ControlTowerStatus } from '../../types/control-tower'

interface Props {
  data: ControlTowerStatus
}

const HEALTH_TEXT: Record<ControlTowerStatus['overallHealth'], string> = {
  nominal: 'ALL SYSTEMS NOMINAL',
  degraded: 'SYSTEM DEGRADED',
  critical: 'CRITICAL — ACTION REQUIRED',
}
const HEALTH_COLOR: Record<ControlTowerStatus['overallHealth'], string> = {
  nominal: '#22C55E',
  degraded: '#F59E0B',
  critical: '#EF4444',
}

export function StatusBanner({ data }: Props) {
  const color = HEALTH_COLOR[data.overallHealth]
  const mcpTotal = data.mcps.remote.length + data.mcps.local.length
  const mcpActive =
    data.mcps.remote.filter((m) => m.status === 'active').length +
    data.mcps.local.filter((m) => m.status === 'active').length

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: data.overallHealth === 'nominal' ? '#0a1f0a' : '#1a0a0a',
        border: `1px solid ${color}44`,
        padding: '9px 16px',
      }}
    >
      <style>{`
        @keyframes ct-banner-pulse {
          0%,100% { box-shadow: 0 0 5px ${color}; }
          50%      { box-shadow: 0 0 16px ${color}, 0 0 32px ${color}44; }
        }
      `}</style>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          animation: 'ct-banner-pulse 2s ease-in-out infinite',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color,
          letterSpacing: '2px',
          textShadow: `0 0 6px ${color}`,
        }}
      >
        {HEALTH_TEXT[data.overallHealth]}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {[
          { label: 'MCPs', value: `${mcpActive}/${mcpTotal}` },
          { label: 'plugins', value: data.plugins.length },
          { label: 'skills', value: data.skills.length },
          { label: 'hooks', value: data.hooks.length },
        ].map((pill) => (
          <span
            key={pill.label}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#94A3B8',
              background: '#0f172a',
              border: '1px solid #1E293B',
              padding: '2px 9px',
            }}
          >
            <span style={{ color: '#CBD5E1' }}>{pill.value}</span> {pill.label}
          </span>
        ))}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#C084FC',
            background: '#0f172a',
            border: '1px solid #7C3AED44',
            padding: '2px 9px',
          }}
        >
          <span style={{ color: '#E879F9' }}>
            {data.session.tokensAllTime > 0
              ? `${(data.session.tokensAllTime / 1000).toFixed(0)}k`
              : '—'}
          </span>{' '}
          tokens
        </span>
      </div>
    </div>
  )
}
