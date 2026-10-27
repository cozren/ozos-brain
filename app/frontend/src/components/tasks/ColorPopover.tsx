import { useEffect, useRef } from 'react'
import { LABEL_PALETTE } from '../../lib/tasks'

// A small popover of palette swatches anchored to a label's color dot.
// Click a swatch to pick; click-outside or Escape closes without change.
export function ColorPopover({
  current,
  onPick,
  onClose,
}: {
  current: string
  onPick: (color: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="label color"
      style={{
        position: 'absolute',
        top: '130%',
        left: 0,
        zIndex: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 7,
        background: '#0b1626',
        border: '1px solid #2a3f57',
        borderRadius: 9,
        padding: 9,
        boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
      }}
    >
      {LABEL_PALETTE.map((c) => {
        const on = c.toLowerCase() === current.toLowerCase()
        return (
          <span
            key={c}
            role="option"
            aria-selected={on}
            title={c}
            onClick={(e) => {
              e.stopPropagation()
              onPick(c)
            }}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              cursor: 'pointer',
              background: c,
              border: on ? '2px solid #f2f9ff' : '2px solid transparent',
              boxShadow: on ? `0 0 8px ${c}` : 'none',
            }}
          />
        )
      })}
    </div>
  )
}
