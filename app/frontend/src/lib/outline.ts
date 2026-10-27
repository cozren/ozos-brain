// Extract a document outline (table of contents) from markdown source.
// Only H1 (#) and H2 (##) are treated as "main titles" — H3+ are sub-points and
// skipped. Lines inside fenced code blocks (``` or ~~~) are ignored so a "#"
// comment in a code sample is never mistaken for a heading. The order matches
// the rendered document, so the Nth item maps to the Nth <h1>/<h2> in the preview.

export interface OutlineItem {
  depth: 1 | 2
  text: string
}

// Up to 3 leading spaces, 1–2 hashes, a space, then the heading text.
const HEADING_RE = /^ {0,3}(#{1,2}) +(.+)$/
const FENCE_RE = /^\s*(```|~~~)/

export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = HEADING_RE.exec(line)
    if (!m) continue
    // Strip an ATX closing run of hashes (" ##" at end), then trim.
    const text = m[2].replace(/\s+#+\s*$/, '').trim()
    if (text) items.push({ depth: m[1].length as 1 | 2, text })
  }
  return items
}
