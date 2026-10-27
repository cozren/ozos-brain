import type { ReactNode } from 'react'

// Section header used across the person card: a glowing cyan accent bar, a
// bright label, and a hairline rule that trails off to the right (doubling as
// the visual divider between sections). Optional right-slot for counts, an edit
// affordance, or a status badge.
export function SectionHeader({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="sec-head">
      <span className="sec-bar" aria-hidden />
      <span className="sec-label">{label}</span>
      <span className="sec-rule" aria-hidden />
      {right != null && <span className="sec-right">{right}</span>}
    </div>
  )
}
