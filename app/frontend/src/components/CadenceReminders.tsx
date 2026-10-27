import type { Reminder } from '../types/setup'

// The default manager cadence as a reminder list: one line per report with the
// next monthly 1:1 note check and the next quarterly written reflection. Dates
// come from the backend, computed from the clock at request time.
export function CadenceReminders({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 320,
        maxWidth: 560,
        width: '100%',
        border: '1px solid rgba(0,255,255,0.18)',
        padding: '12px 16px',
        background: 'rgba(15,23,42,0.6)',
      }}
    >
      <div className="section-label" style={{ marginBottom: 2 }}>
        Reminders
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {reminders.map((r) => (
          <li
            key={r.person_id}
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'baseline',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-dim)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: 'var(--text)', minWidth: 110 }}>{r.display_name}</span>
            <span>1:1 note check due {r.monthly_due}</span>
            <span>reflection due {r.quarterly_due}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
