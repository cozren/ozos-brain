import '@testing-library/jest-dom'

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom returns 0 for all layout measurements; recharts ResponsiveContainer
// will never fire with real dimensions. Patch getBoundingClientRect globally
// so it returns a non-zero size, allowing recharts to render SVG children.
Element.prototype.getBoundingClientRect = () => ({
  width: 400,
  height: 300,
  top: 0,
  left: 0,
  right: 400,
  bottom: 300,
  x: 0,
  y: 0,
  toJSON: () => ({}),
})

// jsdom doesn't implement getClientRects; ProseMirror (TipTap) calls it on
// focus/selection to compute caret coords. Return a single non-zero rect on
// both Element and Range so the rich-text editor can mount/focus in tests.
// jsdom has no scroll implementation; ProseMirror calls scrollBy on focus.
window.scrollBy = () => {}
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}

// jsdom doesn't implement elementFromPoint; TipTap's Placeholder viewport
// tracking calls it on mount. Returning the body keeps the editor mountable.
document.elementFromPoint = () => document.body

const oneRect = {
  width: 10,
  height: 14,
  top: 0,
  left: 0,
  right: 10,
  bottom: 14,
  x: 0,
  y: 0,
  toJSON: () => ({}),
}
const rectList = Object.assign([oneRect], { item: () => oneRect }) as unknown as DOMRectList
Element.prototype.getClientRects = () => rectList
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects = () => rectList
  Range.prototype.getBoundingClientRect = () => oneRect as DOMRect
}
