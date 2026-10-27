import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { shouldHideHeader } from '../lib/header'

// Find the nearest scrollable ancestor of an element, falling back to the
// window. Used so the header can hide/reveal in response to whichever
// container actually scrolls on a given page.
function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement ?? null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return window
}

// Hide the header when scrolling down, reveal it when scrolling up or near the
// top. Listens to an explicit scroll container if given, otherwise auto-detects
// the nearest scrollable ancestor of the header. Disabled (always visible) when
// `enabled` is false — e.g. fixed-height pages that scroll internally.
function useAutoHide(
  headerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  scrollRef?: RefObject<HTMLElement | null>
) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return
    }
    const target: HTMLElement | Window = scrollRef?.current ?? findScrollParent(headerRef.current)
    const getTop = () => (target instanceof Window ? window.scrollY : target.scrollTop)
    let last = getTop()
    const onScroll = () => {
      const cur = getTop()
      setHidden((prev) => shouldHideHeader(prev, last, cur))
      last = cur
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [headerRef, enabled, scrollRef])
  return enabled ? hidden : false
}

// Auto-hide for pages that scroll *internally* (fixed-height layouts, sticky
// {false}) rather than growing the app shell. A capturing scroll listener on
// the given container catches scrolls from any descendant scroller — tab panel,
// preview pane, dashboard canvas — regardless of which one moves. When hidden
// the header collapses its own measured height (negative margin) so the space
// below reclaims it, keeping any pinned tab bars flush to the top.
function useCollapseOnScroll(
  headerRef: RefObject<HTMLElement | null>,
  containerRef?: RefObject<HTMLElement | null>
) {
  const [hidden, setHidden] = useState(false)
  const [height, setHeight] = useState(0)
  // Collapsing reclaims the header's space, which resizes the scroll container
  // and can bounce scrollTop the other way. That bounce fires a scroll event
  // that would re-toggle the header and make the pinned tab bar jump. After
  // every toggle we lock for the length of the collapse transition and absorb
  // those reflow-driven events.
  const lockedUntil = useRef(0)

  useEffect(() => {
    const container = containerRef?.current
    if (!container) return
    // Track the last scrollTop per scroller so switching between nested
    // containers (e.g. tab → sub-tab canvas) doesn't spuriously toggle hide.
    const lastByTarget = new WeakMap<EventTarget, number>()
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (!t || typeof t.scrollTop !== 'number') return
      const cur = t.scrollTop
      const last = lastByTarget.get(t) ?? 0
      lastByTarget.set(t, cur)
      // Absorb the reflow bounce during the collapse transition.
      if (performance.now() < lockedUntil.current) return
      setHidden((prev) => {
        const next = shouldHideHeader(prev, last, cur)
        if (next !== prev) lockedUntil.current = performance.now() + 350
        return next
      })
    }
    const opts = { capture: true, passive: true } as const
    container.addEventListener('scroll', onScroll, opts)
    return () => container.removeEventListener('scroll', onScroll, { capture: true })
  }, [containerRef])

  // Measure the header so the collapse can slide it up by exactly its height.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
  }, [headerRef])

  return { hidden, height }
}

// Unified page title used across the app's top-level pages: a glowing cyan
// uppercase title with an optional dim subtitle on the left, optional inline
// controls (children), and a large glowing emblem icon anchored to the right
// that bleeds past the header's edges. When `sticky` (default) the header pins
// to the top of its scroll container and auto-hides on scroll-down / reveals on
// scroll-up. Pass `sticky={false}` for fixed-height pages whose body scrolls
// internally (the header then stays put and can hold controls).
export function PageHeader({
  title,
  subtitle,
  icon,
  children,
  scrollRef,
  sticky = true,
  collapseScrollRef,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  children?: ReactNode
  scrollRef?: RefObject<HTMLElement | null>
  sticky?: boolean
  // For fixed-height pages (sticky={false}) whose body scrolls internally:
  // collapse the header on scroll-down within this container. Ignored when
  // sticky is true.
  collapseScrollRef?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLElement>(null)
  const stickyHidden = useAutoHide(ref, sticky, scrollRef)
  const collapsing = !sticky && collapseScrollRef != null
  const { hidden: collapseHidden, height } = useCollapseOnScroll(
    ref,
    collapsing ? collapseScrollRef : undefined
  )
  const hidden = sticky ? stickyHidden : collapseHidden

  return (
    <header
      ref={ref}
      data-hidden={hidden}
      style={{
        position: sticky ? 'sticky' : 'relative',
        top: sticky ? 0 : undefined,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 40px 14px',
        flexShrink: 0,
        // Let the oversized emblem icon bleed past the header box.
        overflow: 'visible',
        // Sticky pages slide the floating header up over content; internally
        // scrolling pages collapse the header's own height so pinned tab bars
        // move flush to the top.
        transform: sticky
          ? hidden
            ? 'translateY(calc(-100% - 28px))'
            : 'translateY(0)'
          : undefined,
        marginTop: collapsing ? (hidden ? -height : 0) : undefined,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transition: collapsing
          ? 'margin-top 300ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease'
          : 'transform 300ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease',
        // Subtle top-anchored backdrop so the title stays legible while it
        // slides over content (only when it can actually float over content).
        background: sticky
          ? 'linear-gradient(to bottom, rgba(8,12,20,0.92) 45%, rgba(8,12,20,0))'
          : 'transparent',
        backdropFilter: sticky ? 'blur(4px)' : undefined,
        WebkitBackdropFilter: sticky ? 'blur(4px)' : undefined,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <h1
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--neon-cyan)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            textShadow: '0 0 10px rgba(0,255,255,0.45)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle != null && (
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-dim)',
              letterSpacing: 1,
              margin: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {children != null && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {children}
        </div>
      )}

      {icon != null && (
        <span
          aria-hidden
          style={{
            marginLeft: children != null ? 16 : 'auto',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--neon-cyan)',
            filter: 'drop-shadow(0 0 12px rgba(0,255,255,0.6))',
            // Negative margins let the larger icon break over the header edges.
            marginTop: -16,
            marginBottom: -22,
          }}
        >
          {icon}
        </span>
      )}
    </header>
  )
}
