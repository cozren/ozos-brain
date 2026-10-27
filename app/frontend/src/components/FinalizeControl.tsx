const CYAN = 'var(--neon-cyan)'
const GOLD = '#FFD93D'

/**
 * Per-card cycle lifecycle control. Cycle *selection* lives in the Timeline now;
 * finalize/reopen stays per-person because each person's review is finalized
 * independently.
 */
export function FinalizeControl({
  status,
  onFinalize,
  onReopen,
}: {
  status?: 'active' | 'finalized'
  onFinalize: () => void
  onReopen: () => void
}) {
  const isFinalized = status === 'finalized'

  const btn = (color: string) =>
    ({
      background: 'none',
      border: `1px solid ${color}55`,
      borderRadius: 5,
      cursor: 'pointer',
      padding: '4px 9px',
      fontFamily: 'var(--font-mono)',
      fontSize: 9.5,
      letterSpacing: 1,
      color,
      transition: 'border-color 120ms, color 120ms',
    }) as const

  if (isFinalized) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8.5,
            letterSpacing: 1.5,
            color: GOLD,
            textShadow: `0 0 6px ${GOLD}66`,
          }}
        >
          ✓ FINALIZED
        </span>
        <button onClick={onReopen} style={btn('#7df9ff')} title="Reopen for editing">
          ✎ REOPEN
        </button>
      </div>
    )
  }

  return (
    <button onClick={onFinalize} style={btn(GOLD)} title="Finalize this cycle">
      💾 FINALIZE
    </button>
  )
}
