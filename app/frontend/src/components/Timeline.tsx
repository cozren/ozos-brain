import { useState, useEffect, useRef } from 'react'
import type { CyclesData, CycleEvent } from '../types'

const STYLES = `
@keyframes particle-travel {
  0%   { left: 0%;   opacity: 0; }
  8%   { opacity: 0.12; }
  92%  { opacity: 0.12; }
  100% { left: 100%; opacity: 0; }
}
@keyframes ring-oscillate {
  0%   { transform: rotate(-50deg); }
  50%  { transform: rotate(50deg); }
  100% { transform: rotate(-50deg); }
}
@keyframes ring-steady {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes active-glow {
  0%, 100% {
    box-shadow: 0 0 7px 2px rgba(0,255,255,0.38),
                0 0 14px 5px rgba(0,255,255,0.13);
  }
  50% {
    box-shadow: 0 0 11px 4px rgba(0,255,255,0.58),
                0 0 22px 8px rgba(0,255,255,0.22);
  }
}
@keyframes idle-glow {
  0%, 100% { box-shadow: 0 0 5px 2px rgba(0,255,255,0.22); }
  50%       { box-shadow: 0 0 8px 3px rgba(0,255,255,0.38); }
}
@keyframes hover-glow {
  0%, 100% { box-shadow: 0 0 8px 3px rgba(0,255,255,0.5); }
  50%       { box-shadow: 0 0 14px 5px rgba(0,255,255,0.7); }
}
`

const CYAN = '#00FFFF'
const DOT_SIZE = 36

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/* ── Editable cycle name ─────────────────────────────────────── */

function EditableCycleName({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = (val: string) => {
    const trimmed = val.trim()
    if (trimmed && trimmed !== name) onSave(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft)
          if (e.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
        autoFocus
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${CYAN}99`,
          color: `${CYAN}ee`,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1.5,
          outline: 'none',
          minWidth: 80,
          width: `${Math.max(draft.length, 8) * 8}px`,
        }}
      />
    )
  }

  return (
    <span
      onClick={() => {
        setDraft(name)
        setEditing(true)
      }}
      title="Click to rename"
      style={{
        cursor: 'text',
        color: `${CYAN}dd`,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        borderBottom: `1px dashed ${CYAN}44`,
      }}
    >
      {name}
    </span>
  )
}

/* ── Calendar range picker ───────────────────────────────────── */

function CalendarPicker({
  start,
  end,
  onCommit,
  onClose,
}: {
  start: string
  end: string
  onCommit: (s: string, e: string) => void
  onClose: () => void
}) {
  const initD = start ? new Date(start + 'T00:00:00') : new Date()
  const [year, setYear] = useState(initD.getFullYear())
  const [month, setMonth] = useState(initD.getMonth())
  const [selStart, setSelStart] = useState(start)
  const [selEnd, setSelEnd] = useState(end)
  const [step, setStep] = useState<'start' | 'end'>(start ? 'end' : 'start')
  const [hoverDay, setHoverDay] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else setMonth((m) => m + 1)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const today = new Date().toISOString().slice(0, 10)

  const [effLo, effHi] = (() => {
    if (step === 'end' && hoverDay && selStart)
      return [selStart, hoverDay].sort() as [string, string]
    return [selStart, selEnd] as [string, string]
  })()

  const inRange = (d: string) => effLo && effHi && d > effLo && d < effHi
  const isEdge = (d: string) => d === effLo || (effHi && d === effHi)

  const handleDay = (dateStr: string) => {
    if (step === 'start') {
      setSelStart(dateStr)
      setSelEnd('')
      setStep('end')
    } else {
      const [s, e] = [selStart, dateStr].sort() as [string, string]
      onCommit(s, e)
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        background: '#0b0b1e',
        border: `1px solid ${CYAN}66`,
        padding: '12px 10px 10px',
        boxShadow: `0 12px 48px rgba(0,0,0,0.92), 0 0 24px ${CYAN}18`,
        width: 210,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Month nav */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            background: 'none',
            border: 'none',
            color: `${CYAN}cc`,
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 6px',
            lineHeight: 1,
          }}
        >
          ‹
        </button>
        <span
          style={{ fontSize: 11, color: CYAN, letterSpacing: 2, textShadow: `0 0 8px ${CYAN}66` }}
        >
          {MONTHS[month].slice(0, 3).toUpperCase()} {year}
        </span>
        <button
          onClick={nextMonth}
          style={{
            background: 'none',
            border: 'none',
            color: `${CYAN}cc`,
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 6px',
            lineHeight: 1,
          }}
        >
          ›
        </button>
      </div>

      {/* Instruction */}
      <div
        style={{
          fontSize: 9,
          color: CYAN,
          textAlign: 'center',
          marginBottom: 8,
          letterSpacing: 2,
          opacity: step === 'start' ? 0.75 : 0.9,
          textShadow: step === 'end' ? `0 0 6px ${CYAN}` : 'none',
        }}
      >
        {step === 'start' ? '▸ SELECT START DATE' : '▸ SELECT END DATE'}
      </div>

      {/* Separator */}
      <div style={{ borderTop: `1px solid ${CYAN}22`, marginBottom: 6 }} />

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 3 }}>
        {DAYS_SHORT.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 8,
              color: `${CYAN}77`,
              padding: '1px 0',
              letterSpacing: 0.3,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1
          const ds = toISO(year, month, d)
          const edge = isEdge(ds)
          const range = inRange(ds)
          const isToday = ds === today

          return (
            <div
              key={d}
              onClick={() => handleDay(ds)}
              onMouseEnter={() => step === 'end' && setHoverDay(ds)}
              onMouseLeave={() => setHoverDay('')}
              style={{
                textAlign: 'center',
                padding: '3px 0',
                fontSize: 10,
                cursor: 'pointer',
                userSelect: 'none',
                color: edge ? '#000030' : range ? CYAN : isToday ? CYAN : `${CYAN}bb`,
                background: edge ? CYAN : range ? `${CYAN}28` : 'transparent',
                borderRadius: edge ? '50%' : 0,
                fontWeight: edge ? 700 : 400,
                outline: isToday && !edge ? `1px solid ${CYAN}44` : 'none',
                outlineOffset: -1,
                transition: 'background 60ms, color 60ms',
              }}
            >
              {d}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${CYAN}22`,
          marginTop: 8,
          paddingTop: 7,
          display: 'flex',
          gap: 5,
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={() => {
            setSelStart('')
            setSelEnd('')
            setStep('start')
          }}
          style={{
            background: 'none',
            border: `1px solid ${CYAN}44`,
            color: `${CYAN}aa`,
            fontSize: 9,
            cursor: 'pointer',
            padding: '3px 9px',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            transition: 'border-color 80ms, color 80ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `${CYAN}88`
            e.currentTarget.style.color = CYAN
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${CYAN}44`
            e.currentTarget.style.color = `${CYAN}aa`
          }}
        >
          CLEAR
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: `1px solid ${CYAN}44`,
            color: `${CYAN}aa`,
            fontSize: 9,
            cursor: 'pointer',
            padding: '3px 9px',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            transition: 'border-color 80ms, color 80ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `${CYAN}88`
            e.currentTarget.style.color = CYAN
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${CYAN}44`
            e.currentTarget.style.color = `${CYAN}aa`
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}

/* ── Date range display ──────────────────────────────────────── */

function fmtDate(d: string): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtRange(start: string, end: string): string {
  if (!start && !end) return 'Not scheduled'
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  if (start) return `From ${fmtDate(start)}`
  return `Until ${fmtDate(end)}`
}

function DateRange({
  start,
  end,
  onCommit,
}: {
  start: string
  end: string
  onCommit: (s: string, e: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <span
        onClick={() => setOpen((v) => !v)}
        title="Click to pick date range"
        style={{
          cursor: 'pointer',
          color: CYAN,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          borderBottom: `1px dashed ${CYAN}44`,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}
      >
        {fmtRange(start, end)}
      </span>
      {open && (
        <CalendarPicker
          start={start}
          end={end}
          onCommit={(s, e) => {
            onCommit(s, e)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

/* ── Status helper ───────────────────────────────────────────── */

type Status = 'past' | 'active' | 'future'

function getStatus(event: CycleEvent, today: string): Status {
  if (!event.start && !event.end) return 'future'
  if (event.end && event.end < today) return 'past'
  if (event.start && event.start <= today && (!event.end || event.end >= today)) return 'active'
  return 'future'
}

/* ── Timeline ────────────────────────────────────────────────── */

const CYCLE_TYPES = [
  { value: 'deep-dive', label: 'Deep Dive' },
  { value: 'light-touch', label: 'Light Touch' },
]

function monthRange(events: CycleEvent[]): string {
  const starts = events
    .map((e) => e.start)
    .filter(Boolean)
    .sort()
  const ends = events
    .map((e) => e.end)
    .filter(Boolean)
    .sort()
  if (!starts.length || !ends.length) return ''
  const m = (d: string) => (MONTHS[parseInt(d.split('-')[1], 10) - 1] || '').slice(0, 3)
  return `${m(starts[0])}–${m(ends[ends.length - 1])}`
}

/* ── Cycle switcher (command bar) ────────────────────────────── */

function CycleSwitcher({
  cycles,
  selectedId,
  onSelectCycle,
  onCreate,
  onDelete,
}: {
  cycles: CyclesData
  selectedId: string
  onSelectCycle: (id: string) => void
  onCreate: (name: string, type: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState(CYCLE_TYPES[0].value)
  const ids = Object.keys(cycles.cycles)
  const onlyOne = ids.length <= 1

  const close = () => {
    setOpen(false)
    setCreating(false)
  }
  const submit = () => {
    if (!name.trim()) return
    onCreate(name.trim(), type)
    setName('')
    setType(CYCLE_TYPES[0].value)
    close()
  }

  const menuAction = (color: string, disabled = false) =>
    ({
      display: 'block',
      width: '100%',
      textAlign: 'left',
      background: 'none',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      padding: '7px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      color,
      opacity: disabled ? 0.4 : 1,
    }) as const

  const inputStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${CYAN}33`,
    borderRadius: 4,
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '5px 8px',
    width: '100%',
  } as const

  return (
    <div
      style={{ position: 'relative' }}
      tabIndex={0}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setTimeout(close, 150)
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        title="Switch cycle"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: `${CYAN}cc`,
          fontSize: 12,
          padding: '2px 4px',
        }}
      >
        ▾
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 200,
            minWidth: 220,
            background: '#0b0b1e',
            border: `1px solid ${CYAN}40`,
            borderRadius: 6,
            boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 22px ${CYAN}14`,
            overflow: 'hidden',
          }}
        >
          {!creating ? (
            <>
              <div
                style={{
                  padding: '8px 12px 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8.5,
                  letterSpacing: 1,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                }}
              >
                Switch cycle
              </div>
              {ids.map((id) => {
                const c = cycles.cycles[id]
                const sel = id === selectedId
                return (
                  <div
                    key={id}
                    onClick={() => {
                      if (!sel) onSelectCycle(id)
                      close()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      cursor: 'pointer',
                      color: sel ? CYAN : 'var(--text)',
                      background: sel ? `${CYAN}12` : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: sel ? CYAN : `${CYAN}44`,
                        boxShadow: sel ? `0 0 6px ${CYAN}` : 'none',
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: sel ? 700 : 400 }}>{c.name}</span>
                    <span style={{ opacity: 0.5, fontSize: 9 }}>{monthRange(c.events)}</span>
                  </div>
                )
              })}
              <div style={{ height: 1, background: `${CYAN}1f`, margin: '4px 0' }} />
              <button onClick={() => setCreating(true)} style={menuAction('#7df9ff')}>
                ＋ New cycle
              </button>
              <button
                onClick={() => !onlyOne && onDelete(selectedId)}
                disabled={onlyOne}
                title="Delete this cycle"
                style={menuAction('rgba(255,80,80,0.85)', onlyOne)}
              >
                🗑 Delete this cycle
              </button>
            </>
          ) : (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8.5,
                  letterSpacing: 1,
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                }}
              >
                New cycle
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Cycle name…"
                style={inputStyle}
              />
              <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
                {CYCLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={close} className="btn-neon" style={{ fontSize: 10 }}>
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!name.trim()}
                  className="btn-neon"
                  style={{ fontSize: 10, opacity: name.trim() ? 1 : 0.5 }}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Timeline ────────────────────────────────────────────────── */

interface Props {
  cycles: CyclesData
  selectedId: string
  onSelectCycle: (id: string) => void
  onCreate: (name: string, type: string) => void
  onDelete: (id: string) => void
  onEventUpdate: (cycleId: string, eventId: string, start: string, end: string) => void
  onCycleRename: (cycleId: string, name: string) => void
}

export function Timeline({
  cycles,
  selectedId,
  onSelectCycle,
  onCreate,
  onDelete,
  onEventUpdate,
  onCycleRename,
}: Props) {
  const cycle = cycles.cycles[selectedId]
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (!cycle) return null

  const today = new Date().toISOString().slice(0, 10)
  const events = cycle.events
  const N = events.length
  const linePct = `${(100 / (2 * N)).toFixed(3)}%`
  const period = monthRange(events)
  const typeLabel = CYCLE_TYPES.find((t) => t.value === cycle.type)?.label ?? cycle.type

  const baseOpacity = (status: Status) =>
    status === 'future' ? 0.62 : status === 'past' ? 0.75 : 1

  return (
    <>
      <style>{STYLES}</style>

      <div
        style={{
          marginBottom: 28,
          border: `1px solid ${CYAN}22`,
          borderRadius: 10,
          padding: '14px 18px 18px',
          background: `linear-gradient(180deg, ${CYAN}08, transparent 60%)`,
          boxShadow: `0 0 30px ${CYAN}0a inset`,
        }}
      >
        {/* Command bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: `${CYAN}88`,
              textShadow: `0 0 10px ${CYAN}44`,
            }}
          >
            Timeline
          </div>

          {/* Selector pill: status dot · editable name · period · switcher caret */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              padding: '5px 8px 5px 11px',
              border: `1px solid ${CYAN}3a`,
              borderRadius: 7,
              background: `${CYAN}0d`,
              boxShadow: `0 0 12px ${CYAN}12`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: CYAN,
                boxShadow: `0 0 7px ${CYAN}`,
              }}
            />
            <EditableCycleName
              name={cycle.name}
              onSave={(name) => onCycleRename(selectedId, name)}
            />
            {period && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: `${CYAN}80`,
                  letterSpacing: 0.5,
                }}
              >
                {period}
              </span>
            )}
            <CycleSwitcher
              cycles={cycles}
              selectedId={selectedId}
              onSelectCycle={onSelectCycle}
              onCreate={onCreate}
              onDelete={onDelete}
            />
          </div>

          {/* Type chip */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: `${CYAN}99`,
              border: `1px solid ${CYAN}33`,
              borderRadius: 4,
              padding: '3px 7px',
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Timeline row */}
        <div
          style={{ position: 'relative', paddingTop: 14, paddingBottom: 4, overflow: 'visible' }}
        >
          {/* Line + particles */}
          <div
            style={{
              position: 'absolute',
              top: 14 + DOT_SIZE / 2 - 1,
              left: linePct,
              right: linePct,
              height: 2,
              background: `linear-gradient(90deg,
              transparent, ${CYAN}22 15%,
              ${CYAN}35 50%, ${CYAN}22 85%, transparent)`,
              zIndex: 0,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: CYAN,
                boxShadow: `0 0 4px 2px ${CYAN}55`,
                animation: 'particle-travel 10s linear infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -2,
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: CYAN,
                boxShadow: `0 0 3px 1px ${CYAN}44`,
                animation: 'particle-travel 10s linear infinite',
                animationDelay: '5s',
              }}
            />
          </div>

          {/* Nodes */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${N}, 1fr)`,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {events.map((event) => {
              const status = getStatus(event, today)
              const isActive = status === 'active'
              const isHovered = hoveredId === event.id
              const opacity = isHovered ? 1 : baseOpacity(status)

              return (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0,
                    opacity,
                    transition: 'opacity 200ms ease',
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      position: 'relative',
                      width: DOT_SIZE,
                      height: DOT_SIZE,
                      cursor: 'default',
                    }}
                    onMouseEnter={() => setHoveredId(event.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: -9,
                          borderRadius: '50%',
                          border: `1px solid ${CYAN}`,
                          borderTopColor: 'transparent',
                          borderBottomColor: 'transparent',
                          animation: 'ring-oscillate 3.8s ease-in-out infinite',
                        }}
                      />
                    )}
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: -4,
                          borderRadius: '50%',
                          border: `1px solid ${CYAN}66`,
                          borderRightColor: 'transparent',
                          animation: 'ring-steady 6.5s linear infinite',
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: `radial-gradient(circle at 38% 35%, ${CYAN}${isHovered ? 'bb' : isActive ? '77' : '55'}, rgba(0,0,0,0.88))`,
                        border: `1.5px solid ${CYAN}`,
                        transition: 'background 200ms',
                        animation: isActive
                          ? 'active-glow 3s ease-in-out infinite'
                          : isHovered
                            ? 'hover-glow 1.5s ease-in-out infinite'
                            : 'idle-glow 4s ease-in-out infinite',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: '38%',
                        borderRadius: '50%',
                        background: CYAN,
                        opacity: isActive ? 0.9 : 0.55,
                        transition: 'opacity 200ms',
                      }}
                    />
                  </div>

                  {/* Label */}
                  <div
                    style={{
                      marginTop: isActive ? 14 : 10,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      color: CYAN,
                      textShadow: isActive ? `0 0 8px ${CYAN}77` : undefined,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.label}
                  </div>

                  {/* Date range */}
                  <div style={{ marginTop: 5 }}>
                    <DateRange
                      start={event.start}
                      end={event.end}
                      onCommit={(s, e) => onEventUpdate(selectedId, event.id, s, e)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
