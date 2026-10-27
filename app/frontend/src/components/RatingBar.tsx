import type { Rating } from '../types'

const RATINGS: { value: Exclude<Rating, null>; short: string; color: string }[] = [
  { value: 'lets-grow-together', short: 'LGT', color: '#FF4444' },
  { value: 'meeting-expectations', short: 'MET', color: '#FFAA00' },
  { value: 'exceeding-expectations', short: 'EXC', color: '#00FFFF' },
  { value: 'driving-excellence', short: 'DRV', color: '#FF00FF' },
]

interface Props {
  value: Rating
  onChange: (r: Rating) => void
}

export function RatingBar({ value, onChange }: Props) {
  const active = RATINGS.find((r) => r.value === value)

  return (
    <div>
      <div style={{ display: 'flex', gap: 2 }}>
        {RATINGS.map((r) => {
          const isActive = r.value === value
          return (
            <button
              key={r.value}
              title={r.value}
              onClick={() => onChange(r.value)}
              style={{
                flex: 1,
                padding: '6px 0',
                border: `1px solid ${r.color}`,
                background: isActive ? `${r.color}22` : 'transparent',
                color: isActive ? r.color : 'rgba(255,255,255,0.3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
                boxShadow: isActive ? `0 0 10px ${r.color}` : 'none',
                transition: 'var(--transition)',
              }}
            >
              {r.short}
            </button>
          )
        })}
      </div>
      {active && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: active.color,
            textShadow: `0 0 6px ${active.color}`,
            marginTop: 4,
          }}
        >
          {active.value.replace(/-/g, ' ').toUpperCase()}
        </div>
      )}
    </div>
  )
}
