// Zoom maths for the image lightbox. Kept pure and separate from the component
// so the bounds behaviour is testable without a DOM.
//
// Zoom is expressed relative to the *fitted* image, not its natural size: 1
// means "as large as fits in the viewing pane", which is the state the lightbox
// opens in. That keeps the percentage readout meaningful for both a small
// screenshot and a 1240px-wide diagram.

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 8
export const ZOOM_STEP = 1.25

export interface Offset {
  x: number
  y: number
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

export function zoomBy(current: number, factor: number): number {
  return clampZoom(current * factor)
}

/** At or below fit there is nothing to pan to, so drop any accumulated offset. */
export function panFor(zoom: number, offset: Offset): Offset {
  return zoom > 1 ? offset : { x: 0, y: 0 }
}
