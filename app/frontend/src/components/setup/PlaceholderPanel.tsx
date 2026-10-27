import { HINT } from './formStyles'

const PHASE: Record<string, number> = { 'first-data-point': 4 }

// Items whose real form arrives in a later phase; skipping them is first-class.
export function PlaceholderPanel({ itemId }: { itemId: string }) {
  const phase = PHASE[itemId]
  return (
    <p style={HINT}>
      {phase ? `Arrives in Phase ${phase}. Skip this for now.` : 'Arrives in a later phase.'}
    </p>
  )
}
