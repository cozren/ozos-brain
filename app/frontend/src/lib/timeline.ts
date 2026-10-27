// Pure date helpers for the per-task planning timeline. No React, no I/O.
// All "now"-relative math takes an explicit reference date so it stays testable.

export const DEFAULT_WEEKS = 22 // ~5 months at weekly resolution (horizontally scrollable)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Local Y-M-D string (no timezone shift). */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday (local midnight) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const offset = (x.getDay() + 6) % 7 // Mon=0 … Sun=6
  x.setDate(x.getDate() - offset)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** `count` consecutive Monday ISO dates, starting with this week's Monday. */
export function weekStarts(today: Date, count: number = DEFAULT_WEEKS): string[] {
  const m = mondayOf(today)
  return Array.from({ length: count }, (_, i) => isoDate(addDays(m, i * 7)))
}

/** Window index (0..count-1) of the week containing `iso`, or null if outside. */
export function weekIndexOf(
  iso: string,
  today: Date,
  count: number = DEFAULT_WEEKS
): number | null {
  const base = mondayOf(today).getTime()
  const wk = mondayOf(parseLocal(iso)).getTime()
  const idx = Math.round((wk - base) / (7 * 86400000))
  return idx >= 0 && idx < count ? idx : null
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}

/** Start (1st) of the current 4-month term: T1 Mar–Jun, T2 Jul–Oct, T3 Nov–Feb. */
export function termStart(today: Date): Date {
  const y = today.getFullYear()
  const m = today.getMonth() // 0=Jan
  if (m >= 2 && m <= 5) return new Date(y, 2, 1) // Mar–Jun → Mar 1
  if (m >= 6 && m <= 9) return new Date(y, 6, 1) // Jul–Oct → Jul 1
  if (m >= 10) return new Date(y, 10, 1) // Nov–Dec → Nov 1
  return new Date(y - 1, 10, 1) // Jan–Feb → previous Nov 1
}

/** Planner window: weekly Mondays centered on the current week — ~4 months back
 *  through ~4 months forward — so "now" sits in the middle and you can scroll
 *  either way. */
export function planWeeks(today: Date): string[] {
  const start = mondayOf(addMonths(today, -4))
  const end = addMonths(today, 4)
  const out: string[] = []
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 7))
    out.push(isoDate(d))
  return out
}

export interface MonthSpan {
  label: string // e.g. "Jun"
  count: number // number of consecutive weeks in this month
}

/** Group consecutive week-starts by their month, for the label row under the strip. */
export function monthSpans(weekStartsISO: string[]): MonthSpan[] {
  const spans: MonthSpan[] = []
  for (const iso of weekStartsISO) {
    const label = MONTHS[parseLocal(iso).getMonth()]
    const last = spans[spans.length - 1]
    if (last && last.label === label) last.count++
    else spans.push({ label, count: 1 })
  }
  return spans
}

/** Sorted, de-duplicated union of several week-lists (ISO Monday dates). */
export function unionWeeks(lists: (string[] | undefined)[]): string[] {
  const set = new Set<string>()
  for (const list of lists) for (const w of list || []) set.add(w)
  return [...set].sort()
}

/** Short label for a single week start, e.g. "16 Jun". */
export function weekLabel(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Map a wheel event over a planner strip to the horizontal scroll delta to
 *  apply. The strips clip overflow (no native scroll), so we drive scrollLeft
 *  ourselves from whichever axis the user moved most — vertical wheel OR a
 *  horizontal trackpad swipe. Returns null when the wheel should be left alone:
 *  the strip isn't overflowing, or there was no movement. */
export function wheelToHorizontalScroll(
  deltaX: number,
  deltaY: number,
  scrollWidth: number,
  clientWidth: number
): number | null {
  if (scrollWidth <= clientWidth) return null
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  return delta === 0 ? null : delta
}
