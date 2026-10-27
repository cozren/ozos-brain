// frontend/src/pages/SystemHealth.tsx
import { useState, useEffect, useCallback } from 'react'
import { Stethoscope } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import type { ControlTowerStatus } from '../types/control-tower'
import { StatusBanner } from '../components/control-tower/StatusBanner'
import { VitalFunctions } from '../components/control-tower/VitalFunctions'
import { QuickGoals } from '../components/control-tower/QuickGoals'
import { BrainVisual } from '../components/control-tower/BrainVisual'
import { SessionCard } from '../components/control-tower/SessionCard'
import { BrainOverview } from '../components/control-tower/BrainOverview'
import { McpsCard } from '../components/control-tower/McpsCard'
import { PluginsCard } from '../components/control-tower/PluginsCard'
import { SkillsCard } from '../components/control-tower/SkillsCard'
import { CommandsCard } from '../components/control-tower/CommandsCard'
import { HooksCard } from '../components/control-tower/HooksCard'

const POLL_MS = 45_000

function SkeletonCard({
  color = 'rgba(0,255,255,0.12)',
  rows = 4,
}: {
  color?: string
  rows?: number
}) {
  return (
    <div style={{ background: '#0E1628', border: `1px solid ${color}`, padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 80,
            height: 12,
            background: 'rgba(0,255,255,0.15)',
            borderRadius: 2,
            animation: 'ct-skel-pulse 1.8s ease-in-out infinite',
          }}
        />
        <div
          style={{
            marginLeft: 'auto',
            width: 28,
            height: 18,
            background: 'rgba(0,255,255,0.1)',
            borderRadius: 2,
            animation: 'ct-skel-pulse 1.8s ease-in-out infinite',
          }}
        />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(0,255,255,0.15)',
              flexShrink: 0,
              animation: 'ct-skel-pulse 1.8s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 9,
              background: 'rgba(0,255,255,0.12)',
              borderRadius: 2,
              animation: 'ct-skel-pulse 1.8s ease-in-out infinite',
              width: ['100%', '80%', '62%', '88%', '71%'][i % 5],
            }}
          />
        </div>
      ))}
    </div>
  )
}

export function SystemHealth() {
  const [data, setData] = useState<ControlTowerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await api.getControlTowerStatus()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status')
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_MS)
    return () => clearInterval(id)
  }, [fetchData])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <style>{`
        @keyframes ct-skel-pulse { 0%,100%{opacity:0.25} 50%{opacity:0.55} }
        .ct-scroll { overflow-y: auto; scrollbar-width: none; }
        .ct-scroll::-webkit-scrollbar { width: 0; background: transparent; }
        .ct-scroll:hover::-webkit-scrollbar { width: 3px; }
        .ct-scroll:hover::-webkit-scrollbar-thumb { background: #1E3A5A; border-radius: 2px; }
        .ct-scroll:hover::-webkit-scrollbar-track { background: transparent; }
        .ct-hrow { scrollbar-width: thin; scrollbar-color: #1E3A5A transparent; }
        .ct-hrow::-webkit-scrollbar { height: 8px; }
        .ct-hrow::-webkit-scrollbar-thumb { background: #1E3A5A; border-radius: 4px; }
        .ct-hrow::-webkit-scrollbar-thumb:hover { background: #2c557f; }
        .ct-hrow::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Header */}
      <PageHeader
        title="System Health"
        subtitle="Live system vitals, MCPs, skills, and sessions."
        icon={<Stethoscope size={44} strokeWidth={1.5} />}
      />

      {/* Page body */}
      <main
        style={{ flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {error && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: '#EF4444',
              background: '#1a0808',
              border: '1px solid #EF444433',
              padding: '8px 14px',
            }}
          >
            ✗ {error} — retrying in 45s
          </div>
        )}

        {/* Top 3-column row */}
        <div style={{ display: 'grid', gridTemplateColumns: '310px 1fr 300px', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            {data ? (
              <SessionCard session={data.session} />
            ) : (
              <SkeletonCard color="rgba(0,255,255,0.15)" rows={4} />
            )}
            {data ? (
              <BrainOverview overview={data.brainOverview} />
            ) : (
              <SkeletonCard color="rgba(168,85,247,0.18)" rows={3} />
            )}
          </div>
          {data ? <BrainVisual overview={data.brainOverview} /> : <SkeletonCard rows={5} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
            {data ? (
              <VitalFunctions vitals={data.vitals} onRefresh={fetchData} />
            ) : (
              <SkeletonCard color="rgba(34,197,94,0.18)" rows={3} />
            )}
            <QuickGoals />
          </div>
        </div>

        {/* Status banner — between top cards and bottom cards */}
        {data ? (
          <StatusBanner data={data} />
        ) : (
          <div
            style={{
              height: 38,
              background: '#0a1f0a',
              border: '1px solid #22C55E22',
              animation: 'ct-skel-pulse 1.8s ease-in-out infinite',
            }}
          />
        )}

        {/* Bottom row — all cards on a single line; scroll horizontally to reach
            the ones past the viewport edge (Hooks sits at the far right). Each
            card keeps a fixed width (flex: 0 0) so none collapse. */}
        <div
          className="ct-hrow"
          style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}
        >
          <div style={{ flex: '0 0 320px' }}>
            {data ? (
              <McpsCard remote={data.mcps.remote} local={data.mcps.local} />
            ) : (
              <SkeletonCard color="rgba(0,128,255,0.18)" rows={8} />
            )}
          </div>
          <div style={{ flex: '0 0 300px' }}>
            {data ? (
              <PluginsCard plugins={data.plugins} externalSkills={data.externalSkills} />
            ) : (
              <SkeletonCard color="rgba(255,0,255,0.18)" rows={4} />
            )}
          </div>
          <div style={{ flex: '0 0 380px' }}>
            {data ? (
              <SkillsCard skills={data.skills} />
            ) : (
              <SkeletonCard color="rgba(34,197,94,0.12)" rows={6} />
            )}
          </div>
          <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data ? (
              <CommandsCard commands={data.commands} />
            ) : (
              <SkeletonCard color="rgba(167,139,250,0.18)" rows={4} />
            )}
          </div>
          <div style={{ flex: '0 0 340px' }}>
            {data ? (
              <HooksCard hooks={data.hooks} />
            ) : (
              <SkeletonCard color="rgba(255,107,53,0.18)" rows={5} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
