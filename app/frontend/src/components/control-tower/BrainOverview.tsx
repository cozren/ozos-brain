// frontend/src/components/control-tower/BrainOverview.tsx
import type { BrainOverview as BrainOverviewData } from '../../types/control-tower'

interface Props {
  overview: BrainOverviewData
}

const STATS = (o: BrainOverviewData) => [
  { label: 'Notes', value: o.meetingNotes, color: '#00FFFF' },
  { label: 'Docs', value: o.documents, color: '#60A5FA' },
  { label: 'Goals', value: o.goals, color: '#22C55E' },
  { label: 'Reports', value: o.reports, color: '#F59E0B' },
  { label: 'People', value: o.people, color: '#FB923C' },
  { label: 'Nodes', value: o.graphNodes, color: '#A855F7' },
]

export function BrainOverview({ overview }: Props) {
  return (
    <div
      style={{
        background: '#0E1628',
        border: '1px solid rgba(168,85,247,0.18)',
        padding: '14px 15px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @keyframes bov-radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bov-blip-fade   { 0% { opacity: 1; } 70% { opacity: 0.5; } 100% { opacity: 0; } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C084FC"
          strokeWidth="2"
        >
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: '#C084FC',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            textShadow: '0 0 6px #A855F744',
          }}
        >
          Brain Stats
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {STATS(overview).map((s) => (
          <div
            key={s.label}
            style={{
              background: '#080e1c',
              border: '1px solid #1E293B',
              padding: '8px 9px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
                marginBottom: 3,
                color: s.color,
                textShadow: `0 0 8px ${s.color}44`,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#64748B',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Radar — fills the remaining space, centred */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 10,
        }}
      >
        <div style={{ position: 'relative', width: 130, height: 130 }}>
          {/* Outer ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1px solid rgba(168,85,247,0.22)',
              background: 'radial-gradient(circle, rgba(168,85,247,0.04) 0%, transparent 70%)',
            }}
          />
          {/* Inner rings */}
          {[88, 48].map((size) => (
            <div
              key={size}
              style={{
                position: 'absolute',
                borderRadius: '50%',
                border: '1px solid rgba(168,85,247,0.10)',
                width: size,
                height: size,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
              }}
            />
          ))}
          {/* Cross hairs */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 10,
              right: 10,
              height: 1,
              background: 'rgba(168,85,247,0.07)',
              transform: 'translateY(-50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 10,
              bottom: 10,
              width: 1,
              background: 'rgba(168,85,247,0.07)',
              transform: 'translateX(-50%)',
            }}
          />
          {/* Sweep arm */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '50%',
              height: 1,
              transformOrigin: 'left center',
              animation: 'bov-radar-sweep 4s linear infinite',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -32,
                left: 0,
                width: 65,
                height: 65,
                background:
                  'conic-gradient(from -80deg at 0% 50%, transparent 0deg, rgba(168,85,247,0.20) 80deg, transparent 81deg)',
                transformOrigin: '0 50%',
              }}
            />
          </div>
          {/* Center dot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#C084FC',
              boxShadow: '0 0 6px #C084FC',
              transform: 'translate(-50%,-50%)',
            }}
          />
          {/* Blips */}
          {[
            { top: '28%', left: '64%', delay: '0.6s' },
            { top: '66%', left: '54%', delay: '1.8s' },
            { top: '44%', left: '76%', delay: '1.1s' },
            { top: '58%', left: '32%', delay: '2.4s' },
          ].map((b, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#C084FC',
                boxShadow: '0 0 5px #C084FC',
                top: b.top,
                left: b.left,
                animation: `bov-blip-fade 4s ease-out ${b.delay} infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
