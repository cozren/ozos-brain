import { useCallback, useEffect, useState } from 'react'
import { BrainVisual } from '../components/control-tower/BrainVisual'
import { SetupBadge } from '../components/SetupBadge'
import { CadenceReminders } from '../components/CadenceReminders'
import { api } from '../api'
import type { Page } from '../components/Sidebar'
import type { Reminder, SetupSummary } from '../types/setup'

export function Home({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  // Setup progress and cadence reminders; both are best-effort and never break Home.
  const [summary, setSummary] = useState<SetupSummary | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  useEffect(() => {
    api
      .getSetup()
      .then((v) => setSummary(v.summary))
      .catch(() => setSummary(null))
    api
      .getSetupReminders()
      .then(setReminders)
      .catch(() => setReminders([]))
  }, [])
  const dismiss = () => {
    setSummary((s) => (s ? { ...s, badge_dismissed: true } : s))
    api.dismissSetup().catch(() => {})
  }

  // Each time the brain's synaptic pulse finishes glowing, flare the title's neon.
  const [flareKey, setFlareKey] = useState(0)
  const [flaring, setFlaring] = useState(false)

  const handlePulseEnd = useCallback(() => {
    setFlaring(true)
    setFlareKey((k) => k + 1)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 44,
        padding: 48,
        background: '#000000',
      }}
    >
      <style>{`
        @keyframes ozos-neon-idle {
          0%, 100% { text-shadow: 0 0 12px rgba(0,255,255,0.45), 0 0 24px rgba(0,255,255,0.2); }
          50%      { text-shadow: 0 0 18px rgba(0,255,255,0.75), 0 0 36px rgba(0,255,255,0.35); }
        }
        @keyframes ozos-neon-flare {
          0%   { text-shadow: 0 0 12px rgba(0,255,255,0.45); color: var(--neon-cyan); }
          18%  { text-shadow: 0 0 6px #ffffff, 0 0 22px #00ffff, 0 0 46px #00ffff, 0 0 88px #00ffff; color: #eafffd; }
          55%  { text-shadow: 0 0 14px #00ffff, 0 0 40px #00ffff; color: var(--neon-cyan); }
          100% { text-shadow: 0 0 12px rgba(0,255,255,0.45), 0 0 24px rgba(0,255,255,0.2); color: var(--neon-cyan); }
        }
      `}</style>

      <BrainVisual
        showGreeting={false}
        brainScale={1.32}
        onPulseEnd={handlePulseEnd}
        style={{
          width: 'min(820px, 92vw)',
          aspectRatio: '1.55',
          maxHeight: '68vh',
          border: 'none',
          background: '#000000',
          // Feather all four edges into the page so the bloom haze blends
          // seamlessly into the black background instead of showing a hard
          // rectangle edge. Slightly wider fade at the bottom toward the title.
          maskImage:
            'linear-gradient(to bottom, transparent 0%, #000 8%, #000 78%, transparent 100%), linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, #000 8%, #000 78%, transparent 100%), linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <div style={{ textAlign: 'center' }}>
        <h1
          key={flaring ? `flare-${flareKey}` : 'idle'}
          onAnimationEnd={() => setFlaring(false)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--neon-cyan)',
            letterSpacing: 6,
            textTransform: 'uppercase',
            marginBottom: 12,
            animation: flaring
              ? 'ozos-neon-flare 1.7s ease-out'
              : 'ozos-neon-idle 4s ease-in-out infinite',
          }}
        >
          OZOS Brain
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-dim)',
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          your personal command center
        </p>
      </div>

      {(summary || reminders.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {summary && (
            <SetupBadge
              summary={summary}
              onOpen={() => onNavigate?.('setup')}
              onDismiss={dismiss}
            />
          )}
          <CadenceReminders reminders={reminders} />
        </div>
      )}
    </div>
  )
}
