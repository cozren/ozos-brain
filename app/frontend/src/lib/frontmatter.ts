// Strip a document's YAML frontmatter before rendering it as prose.
//
// The API returns a document's raw text, frontmatter included, because the
// editor needs to round-trip it. The read view must not render it: `---`
// followed by `key: value` lines parses as a setext heading, so the metadata
// would show up as a giant heading above the real title. Everything in the
// block is already surfaced properly — tags as chips, `confluence:` as the
// header link, the date from the file mtime.
//
// Mirrors backend/services/frontmatter.py `split_frontmatter`: fences must be
// whole lines (exactly "---"), never a bare substring, so a quoted YAML value
// that happens to contain "---" cannot end the block early.

export function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text
  const lines = text.split('\n')
  if (lines[0] !== '---') return text
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return lines
        .slice(i + 1)
        .join('\n')
        .replace(/^\n+/, '')
    }
  }
  // No closing fence — not frontmatter after all; render the text as written.
  return text
}
