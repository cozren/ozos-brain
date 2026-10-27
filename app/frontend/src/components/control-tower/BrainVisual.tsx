// frontend/src/components/control-tower/BrainVisual.tsx
import { useState, useEffect } from 'react'
import { api } from '../../api'
import type { BrainOverview } from '../../types/control-tower'
import { NeuralBrain } from './NeuralBrain'

interface Props {
  overview?: BrainOverview
  style?: React.CSSProperties
  showGreeting?: boolean
  brainScale?: number
  onPulseEnd?: () => void
}

function getGreeting(name: string) {
  const h = new Date().getHours()
  const base =
    h >= 5 && h < 12
      ? 'Good morning'
      : h >= 12 && h < 18
        ? 'Good afternoon'
        : h >= 18 && h < 22
          ? 'Good evening'
          : 'Hello'
  return name ? `${base}, ${name}` : base
}

export function BrainVisual({
  overview: _overview,
  style,
  showGreeting = true,
  brainScale,
  onPulseEnd,
}: Props) {
  // The user's name comes from ~/.ozos/config.json via /api/me (set by `ozos init`).
  const [name, setName] = useState('')
  useEffect(() => {
    let alive = true
    api
      .getMe()
      .then((me) => {
        if (alive) setName(me.name || '')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const fullText = getGreeting(name)
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    setDisplayed('')
    let i = 0
    const start = setTimeout(() => {
      const interval = setInterval(() => {
        i++
        setDisplayed(fullText.slice(0, i))
        if (i >= fullText.length) clearInterval(interval)
      }, 55)
      return () => clearInterval(interval)
    }, 400)
    return () => clearTimeout(start)
  }, [fullText])

  return (
    <div
      style={{
        position: 'relative',
        background: '#000000',
        border: '1px solid rgba(0,255,255,0.1)',
        minHeight: 200,
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{`
        @keyframes ct-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      <NeuralBrain scale={brainScale} onPulseEnd={onPulseEnd} />

      {showGreeting && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 12,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <span
            data-full-greeting={fullText}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 22,
              fontWeight: 800,
              color: '#00FFFF',
              letterSpacing: '-0.3px',
              textShadow: '0 0 16px rgba(0,255,255,0.3)',
            }}
          >
            {displayed}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 18,
              fontWeight: 800,
              color: '#00FFFF',
              marginLeft: 2,
              animation: 'ct-cursor-blink 1s step-end infinite',
            }}
          >
            _
          </span>
        </div>
      )}
    </div>
  )
}
