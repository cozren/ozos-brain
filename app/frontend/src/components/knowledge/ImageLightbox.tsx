import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  clampZoom,
  zoomBy,
  panFor,
  type Offset,
} from '../../lib/image-zoom'

/**
 * Full-screen image viewer with zoom and pan.
 *
 * Opens fitted to the pane (100%), which for a wide diagram squeezed into the
 * reading column is already a large step up. From there: buttons, the scroll
 * wheel, +/- keys, or a double-click to zoom; drag to pan once past fit.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  // Drag state lives in a ref: panning must not re-render on every mouse move.
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const label = alt.trim() || 'Image viewer'
  const canZoomOut = zoom > ZOOM_MIN
  const canZoomIn = zoom < ZOOM_MAX

  const applyZoom = useCallback((next: number) => {
    const z = clampZoom(next)
    setZoom(z)
    setOffset((o) => panFor(z, o))
  }, [])

  const reset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // Escape closes; +/-/0 drive zoom without reaching for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') applyZoom(zoom * ZOOM_STEP)
      else if (e.key === '-' || e.key === '_') applyZoom(zoom / ZOOM_STEP)
      else if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, applyZoom, reset, zoom])

  // While the viewer is open the document behind it must not scroll.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
    }
    const onUp = () => {
      drag.current = null
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    // Scroll up (negative deltaY) zooms in, matching every map and image viewer.
    applyZoom(zoomBy(zoom, e.deltaY < 0 ? 1.12 : 1 / 1.12))
  }

  const startDrag = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
  }

  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineHeight: 1,
    padding: '7px 11px',
    borderRadius: 6,
    border: '1px solid rgba(148,163,184,0.28)',
    background: 'rgba(8,12,20,0.85)',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    ...extra,
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(3,6,12,0.94)',
        backdropFilter: 'blur(3px)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid rgba(0,255,255,0.12)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text)',
            marginRight: 'auto',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {alt || 'Image'}
        </span>

        <button
          onClick={() => applyZoom(zoom / ZOOM_STEP)}
          disabled={!canZoomOut}
          aria-label="Zoom out"
          title="Zoom out  (−)"
          style={btn({ cursor: canZoomOut ? 'pointer' : 'default', opacity: canZoomOut ? 1 : 0.4 })}
        >
          −
        </button>
        <span
          data-testid="lightbox-zoom"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--neon-cyan, #67e8f9)',
            minWidth: 52,
            textAlign: 'center',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => applyZoom(zoom * ZOOM_STEP)}
          disabled={!canZoomIn}
          aria-label="Zoom in"
          title="Zoom in  (+)"
          style={btn({ cursor: canZoomIn ? 'pointer' : 'default', opacity: canZoomIn ? 1 : 0.4 })}
        >
          +
        </button>
        <button
          onClick={reset}
          aria-label="Reset zoom to fit"
          title="Fit to screen  (0)"
          style={btn()}
        >
          Fit
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in new tab"
          title="Open the full-size image in a new tab"
          style={{ ...btn(), textDecoration: 'none' }}
        >
          ↗ New tab
        </a>
        <button onClick={onClose} aria-label="Close" title="Close  (Esc)" style={btn()}>
          ✕
        </button>
      </div>

      {/* Stage — clicking the empty space around the image closes the viewer. */}
      <div
        data-testid="lightbox-stage"
        onClick={onClose}
        onWheel={onWheel}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => (zoom === 1 ? applyZoom(2) : reset())}
          onMouseDown={startDrag}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 120ms ease-out',
            userSelect: 'none',
          }}
        />
      </div>

      <div
        style={{
          padding: '7px 14px',
          borderTop: '1px solid rgba(148,163,184,0.12)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'rgba(148,163,184,0.6)',
          flexShrink: 0,
        }}
      >
        scroll or +/− to zoom · double-click to toggle · drag to pan · Esc to close
      </div>
    </div>
  )
}
