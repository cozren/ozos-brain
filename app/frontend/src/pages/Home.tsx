import { useCallback, useState } from 'react'
import { BrainVisual } from '../components/control-tower/BrainVisual'

export function Home() {
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
    </div>
  )
}
