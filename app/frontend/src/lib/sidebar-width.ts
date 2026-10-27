// Bounds for the Knowledge Hub left tree pane when the user drags its right edge.
// Fixed min/max so the document preview always keeps usable space.
export const SIDEBAR_MIN = 220
export const SIDEBAR_MAX = 560
export const SIDEBAR_DEFAULT = 290

// Clamp a candidate pixel width into the allowed range; fall back to the default
// for a non-numeric value (e.g. a corrupt persisted value).
export function clampSidebarWidth(px: number): number {
  if (Number.isNaN(px)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px))
}
