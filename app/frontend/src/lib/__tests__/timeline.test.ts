import {
  mondayOf,
  isoDate,
  weekStarts,
  weekIndexOf,
  monthSpans,
  unionWeeks,
  termStart,
  planWeeks,
  wheelToHorizontalScroll,
  DEFAULT_WEEKS,
} from '../timeline'

const ref = new Date(2026, 5, 17) // Wed 17 Jun 2026 (local)

test('mondayOf returns the Monday of that week', () => {
  const m = mondayOf(ref)
  expect(m.getDay()).toBe(1) // Monday
  // within the same week, on or before the reference day
  expect(m.getTime()).toBeLessThanOrEqual(ref.getTime())
  expect((ref.getTime() - m.getTime()) / 86400000).toBeLessThan(7)
})

test('isoDate formats local Y-M-D without timezone drift', () => {
  expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  expect(isoDate(new Date(2026, 11, 31))).toBe('2026-12-31')
})

test('weekStarts gives `count` consecutive Mondays starting this week', () => {
  const ws = weekStarts(ref, DEFAULT_WEEKS)
  expect(ws).toHaveLength(DEFAULT_WEEKS)
  expect(ws[0]).toBe(isoDate(mondayOf(ref)))
  // every entry is a Monday, 7 calendar days after the previous (round absorbs DST hour shifts)
  for (let i = 0; i < ws.length; i++) {
    const d = new Date(ws[i] + 'T00:00:00')
    expect(d.getDay()).toBe(1)
    if (i > 0) {
      const prev = new Date(ws[i - 1] + 'T00:00:00')
      expect(Math.round((d.getTime() - prev.getTime()) / 86400000)).toBe(7)
    }
  }
})

test('weekIndexOf round-trips a week start to its index', () => {
  const ws = weekStarts(ref, DEFAULT_WEEKS)
  expect(weekIndexOf(ws[0], ref, DEFAULT_WEEKS)).toBe(0)
  expect(weekIndexOf(ws[5], ref, DEFAULT_WEEKS)).toBe(5)
  expect(weekIndexOf(ws[DEFAULT_WEEKS - 1], ref, DEFAULT_WEEKS)).toBe(DEFAULT_WEEKS - 1)
})

test('weekIndexOf returns null for dates outside the window', () => {
  expect(weekIndexOf('2025-01-01', ref, DEFAULT_WEEKS)).toBeNull()
  expect(weekIndexOf('2030-01-01', ref, DEFAULT_WEEKS)).toBeNull()
})

test('termStart returns the start of the current 4-month term', () => {
  expect(isoDate(termStart(new Date(2026, 5, 12)))).toBe('2026-03-01') // Jun → T1 Mar 1
  expect(isoDate(termStart(new Date(2026, 7, 1)))).toBe('2026-07-01') // Aug → T2 Jul 1
  expect(isoDate(termStart(new Date(2026, 11, 20)))).toBe('2026-11-01') // Dec → T3 Nov 1
  expect(isoDate(termStart(new Date(2026, 0, 15)))).toBe('2025-11-01') // Jan → previous Nov 1
})

test('planWeeks centers on the current week, ~4 months back and ~4 months forward, weekly', () => {
  const today = new Date(2026, 5, 12) // 12 Jun 2026
  const ws = planWeeks(today)
  const nowMon = isoDate(mondayOf(today))

  // the current week is in the window
  expect(ws).toContain(nowMon)

  // every entry is a Monday, 7 calendar days after the previous
  for (let i = 0; i < ws.length; i++) {
    const d = new Date(ws[i] + 'T00:00:00')
    expect(d.getDay()).toBe(1)
    if (i > 0) {
      const prev = new Date(ws[i - 1] + 'T00:00:00')
      expect(Math.round((d.getTime() - prev.getTime()) / 86400000)).toBe(7)
    }
  }

  // spans roughly 4 months before and 4 months after "now"
  const first = new Date(ws[0] + 'T00:00:00')
  const last = new Date(ws[ws.length - 1] + 'T00:00:00')
  expect(first.getTime()).toBeLessThanOrEqual(new Date(2026, 1, 12).getTime()) // reaches back to ~Feb (4mo)
  expect(first.getTime()).toBeGreaterThanOrEqual(new Date(2026, 0, 1).getTime()) // but not absurdly far
  expect(last.getTime()).toBeGreaterThanOrEqual(new Date(2026, 9, 1).getTime()) // reaches into Oct (4mo)
  expect(last.getTime()).toBeLessThanOrEqual(new Date(2026, 10, 1).getTime()) // but not past ~Nov

  // "now" sits roughly in the middle of the window
  const nowIdx = ws.indexOf(nowMon)
  expect(Math.abs(nowIdx - ws.length / 2)).toBeLessThanOrEqual(2)
})

test('unionWeeks merges, de-dups and sorts', () => {
  expect(
    unionWeeks([['2026-07-06', '2026-06-15'], ['2026-06-15', '2026-06-22'], undefined])
  ).toEqual(['2026-06-15', '2026-06-22', '2026-07-06'])
})

test('unionWeeks of nothing is empty', () => {
  expect(unionWeeks([[], undefined])).toEqual([])
})

test('monthSpans groups consecutive weeks by month label', () => {
  const ws = weekStarts(ref, DEFAULT_WEEKS)
  const spans = monthSpans(ws)
  // spans cover every week exactly once, in order
  const total = spans.reduce((n, s) => n + s.count, 0)
  expect(total).toBe(ws.length)
  expect(spans[0].label).toMatch(/Jun/)
  // each span has a positive count and a 3-letter month label
  for (const s of spans) {
    expect(s.count).toBeGreaterThan(0)
    expect(s.label.length).toBeGreaterThanOrEqual(3)
  }
})

// ── wheelToHorizontalScroll: planner wheel/trackpad → horizontal delta ──
// Returns the px to add to scrollLeft, or null when the wheel should NOT be
// intercepted (content fits, or no movement).

test('vertical wheel scrolls the planner horizontally', () => {
  expect(wheelToHorizontalScroll(0, 40, 500, 100)).toBe(40)
})

test('horizontal trackpad gesture scrolls the planner horizontally', () => {
  expect(wheelToHorizontalScroll(-30, 0, 500, 100)).toBe(-30)
})

test('the dominant axis wins when both deltas are present', () => {
  expect(wheelToHorizontalScroll(50, 10, 500, 100)).toBe(50)
  expect(wheelToHorizontalScroll(10, 50, 500, 100)).toBe(50)
})

test('no interception when the strip is not overflowing', () => {
  expect(wheelToHorizontalScroll(0, 40, 100, 100)).toBeNull()
  expect(wheelToHorizontalScroll(40, 0, 100, 120)).toBeNull()
})

test('no interception when there is no movement', () => {
  expect(wheelToHorizontalScroll(0, 0, 500, 100)).toBeNull()
})
