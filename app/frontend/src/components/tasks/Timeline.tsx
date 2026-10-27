import { useState, useRef, useCallback, type CSSProperties, type UIEvent } from 'react'
import {
  planWeeks,
  monthSpans,
  weekLabel,
  mondayOf,
  isoDate,
  wheelToHorizontalScroll,
} from '../../lib/timeline'

const CYAN = 'var(--neon-cyan)'
// Grid lines: kept faint so the strip reads as a quiet backdrop, not a loud table.
const GRID_LINE = 'rgba(42,63,87,0.45)'
// One fixed week size everywhere, so the top planner and every subtask planner are
// exactly the same size. The strip keeps its size and simply extends further right
// (scroll) for the later weeks — it is never squeezed to fit the panel.
const CELL_W = 22 // px per week — narrow so more weeks fit the visible window
const CELL_H = 28 // strip height

// ── synced horizontal scroll ────────────────────────────────────────
// All strips that share one ScrollSync scroll together (months bar, main planner,
// every subtask planner). Registering also enables wheel → horizontal scrolling.
export interface ScrollSync {
  register: (el: HTMLDivElement | null) => void
  onScroll: (e: UIEvent<HTMLDivElement>) => void
}

// Pixel offset of the current week's centre within the strip, so the planner can
// open scrolled to "now" in the middle of the window.
function nowCenterPx(): number {
  const weeks = planWeeks(new Date())
  const idx = weeks.indexOf(isoDate(mondayOf(new Date())))
  return idx < 0 ? 0 : (idx + 0.5) * CELL_W
}

export function useSyncedScroll(): ScrollSync {
  const els = useRef<Set<HTMLDivElement>>(new Set())
  const centered = useRef(false)
  const register = useCallback((el: HTMLDivElement | null) => {
    if (!el || els.current.has(el)) return
    els.current.add(el)
    // Drive horizontal scroll from the wheel — vertical wheel OR a horizontal
    // trackpad swipe (the strip clips overflow, so there is no native scroll to
    // fall back on). Non-passive so we can preventDefault.
    el.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        const delta = wheelToHorizontalScroll(e.deltaX, e.deltaY, el.scrollWidth, el.clientWidth)
        if (delta !== null) {
          el.scrollLeft += delta
          e.preventDefault()
        }
      },
      { passive: false }
    )
    // Once, after the strips have laid out and become scrollable, scroll every strip
    // so "now" is centred. Retry across frames until the grid has sized the column
    // (clientWidth settles and the content overflows) so we don't clamp to 0 early.
    if (!centered.current) {
      centered.current = true
      const tryCenter = (tries: number) => {
        const ready = [...els.current].every(
          (s) => s.clientWidth > 0 && s.scrollWidth > s.clientWidth
        )
        if (!ready && tries < 40) {
          requestAnimationFrame(() => tryCenter(tries + 1))
          return
        }
        const target = nowCenterPx()
        els.current.forEach((s) => {
          s.scrollLeft = Math.max(0, target - s.clientWidth / 2)
        })
      }
      requestAnimationFrame(() => tryCenter(0))
    }
  }, [])
  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft
    els.current.forEach((el) => {
      if (!el.isConnected) els.current.delete(el)
      else if (el !== e.currentTarget && el.scrollLeft !== left) el.scrollLeft = left
    })
  }, [])
  return { register, onScroll }
}

// Strips and the months bar CLIP their overflow — no per-strip scrollbar (those add
// height and clutter). They still scroll via wheel and programmatically, all kept in
// sync; the single ScrollRail at the bottom is the only visible scrollbar.
// min-width:0 lets the element shrink below its content as a grid/flex item so the
// fixed-width week row overflows instead of widening the column.
const clipBox = (style?: CSSProperties): CSSProperties => ({
  overflowX: 'hidden',
  overflowY: 'hidden',
  minWidth: 0,
  ...style,
})

// ── month label row (proportional to weeks-per-month) ───────────────
function MonthsInner() {
  const spans = monthSpans(planWeeks(new Date()))
  return (
    <div style={{ display: 'flex', width: 'max-content' }}>
      {spans.map((s, k) => (
        <div
          key={k}
          style={{
            width: s.count * CELL_W,
            flexShrink: 0,
            boxSizing: 'border-box',
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: 0.5,
            color: '#9cc0de',
            textAlign: 'center',
            borderLeft: k ? '1px solid #24384f' : 'none',
          }}
        >
          {s.label}
        </div>
      ))}
    </div>
  )
}

/** Standalone month-label bar (the planner header). Clips; no scrollbar. */
export function MonthsBar({ scroll, style }: { scroll?: ScrollSync; style?: CSSProperties }) {
  return (
    <div
      className="planner-strip"
      ref={scroll?.register}
      onScroll={scroll?.onScroll}
      style={clipBox(style)}
    >
      <MonthsInner />
    </div>
  )
}

/** The single, minimal scrollbar for the whole planner. It scrolls every strip via the
 *  shared sync. A 1px-tall spacer the full width of the week row gives it a thumb whose
 *  size matches the strips. */
export function ScrollRail({ scroll }: { scroll?: ScrollSync }) {
  const width = planWeeks(new Date()).length * CELL_W
  return (
    <div
      className="planner-strip planner-strip--bar"
      ref={scroll?.register}
      onScroll={scroll?.onScroll}
      style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', minWidth: 0 }}
    >
      <div style={{ width, height: 1 }} />
    </div>
  )
}

interface Props {
  selected: string[]
  onChange?: (weeks: string[]) => void
  compact?: boolean // hide the inner month row (subtask rows use the shared bar)
  scroll?: ScrollSync // share horizontal scroll with sibling strips
  testId?: string // data-testid on the strip root (distinguishes task vs subtask planners)
}

// A weekly strip centered on the current week (~4 months either side). Click a week to
// toggle it; mark as many as you like. Shift-click fills the range. Scrolls horizontally.
export function Timeline({ selected, onChange, compact = false, scroll, testId }: Props) {
  const weeks = planWeeks(new Date())
  const [lastIdx, setLastIdx] = useState<number | null>(null)
  const sel = new Set(selected)
  const readOnly = !onChange

  const click = (i: number, shift: boolean) => {
    if (readOnly) return
    const s = new Set(sel)
    if (shift && lastIdx !== null) {
      for (let k = Math.min(lastIdx, i); k <= Math.max(lastIdx, i); k++) s.add(weeks[k])
    } else if (s.has(weeks[i])) {
      s.delete(weeks[i])
    } else {
      s.add(weeks[i])
    }
    setLastIdx(i)
    onChange!([...s].sort())
  }

  const isSel = (i: number) => sel.has(weeks[i])
  const nowIdx = weeks.indexOf(isoDate(mondayOf(new Date()))) // current week, -1 if outside window

  return (
    <div
      className="planner-strip"
      data-testid={testId}
      ref={scroll?.register}
      onScroll={scroll?.onScroll}
      style={clipBox()}
    >
      {!compact && <MonthsInner />}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 'max-content',
          marginTop: compact ? 0 : 3,
        }}
      >
        {weeks.map((w, i) => (
          <div
            key={w}
            onClick={(e) => click(i, e.shiftKey)}
            title={
              readOnly ? weekLabel(w) : `${weekLabel(w)} — click to toggle, shift-click for range`
            }
            style={{
              width: CELL_W,
              flexShrink: 0,
              boxSizing: 'border-box',
              height: CELL_H,
              cursor: readOnly ? 'default' : 'pointer',
              background: isSel(i)
                ? 'linear-gradient(180deg,#1a4a6b,rgba(45,212,255,0.42))'
                : i === nowIdx
                  ? 'rgba(45,212,255,0.07)'
                  : '#13243a',
              borderTop: `1px solid ${isSel(i) ? 'rgba(45,212,255,0.85)' : GRID_LINE}`,
              borderBottom: `1px solid ${isSel(i) ? 'rgba(45,212,255,0.85)' : GRID_LINE}`,
              borderLeft: `1px solid ${isSel(i) ? 'rgba(45,212,255,0.85)' : GRID_LINE}`,
              borderRight:
                i === weeks.length - 1
                  ? `1px solid ${isSel(i) ? 'rgba(45,212,255,0.85)' : GRID_LINE}`
                  : 'none',
              boxShadow: isSel(i) ? 'inset 0 0 6px rgba(45,212,255,0.4)' : 'none',
              transition: 'background 100ms',
            }}
          />
        ))}
        {/* "now" marker — current week */}
        {nowIdx >= 0 && (
          <div
            style={{
              position: 'absolute',
              left: nowIdx * CELL_W,
              top: -2,
              bottom: -2,
              width: 0,
              pointerEvents: 'none',
            }}
            title={`This week — ${weekLabel(weeks[nowIdx])}`}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#ffd166',
                boxShadow: '0 0 6px rgba(255,209,102,0.8)',
              }}
            />
            {!compact && (
              <div
                style={{
                  position: 'absolute',
                  left: -3.5,
                  top: -5,
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: '#ffd166',
                  boxShadow: '0 0 7px rgba(255,209,102,0.9)',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact one-line summary of a selection — "16 Jun → 13 Jul · 5 wks".
export function planSummary(weeks: string[]): string {
  if (!weeks.length) return ''
  const sorted = [...weeks].sort()
  const span =
    sorted.length === 1
      ? weekLabel(sorted[0])
      : `${weekLabel(sorted[0])} → ${weekLabel(sorted[sorted.length - 1])}`
  return `${span} · ${sorted.length} wk${sorted.length > 1 ? 's' : ''}`
}
