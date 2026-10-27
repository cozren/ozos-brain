import type { CSSProperties } from 'react'

// Shared look for every setup form: compact mono inputs on the dark card,
// a cyan primary button, dim secondary text. Kept here so the forms match.
export const FIELD: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,255,255,0.05)',
  border: '1px solid rgba(0,255,255,0.25)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: '7px 10px',
  outline: 'none',
  transition: 'border-color 200ms ease, box-shadow 200ms ease',
}

export const LABEL: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
}

export const PRIMARY: CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(0,255,255,0.5)',
  color: 'var(--neon-cyan)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '7px 14px',
  cursor: 'pointer',
  boxShadow: '0 0 8px rgba(0,255,255,0.25)',
  transition: 'background 150ms ease, opacity 150ms ease',
}

export const SECONDARY: CSSProperties = {
  ...PRIMARY,
  border: '1px solid rgba(148,163,184,0.3)',
  color: 'var(--text-dim)',
  boxShadow: 'none',
}

export const HINT: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  color: 'var(--text-dim)',
  margin: 0,
}

export const OK: CSSProperties = { ...HINT, color: '#22C55E', fontFamily: 'var(--font-mono)' }
export const ERR: CSSProperties = { ...HINT, color: '#EF4444', fontFamily: 'var(--font-mono)' }

export const CODE: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--neon-cyan)',
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.15)',
  padding: '8px 10px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

// Focus ring and disabled state for every control inside a setup form.
export const FORM_CSS = `
  .setup-form input:focus, .setup-form textarea:focus, .setup-form select:focus {
    border-color: var(--neon-cyan); box-shadow: 0 0 0 2px rgba(0,255,255,0.2);
  }
  .setup-form button:hover:not(:disabled) { background: rgba(0,255,255,0.08); }
  .setup-form button:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }
  .setup-form button:disabled { opacity: 0.4; cursor: not-allowed; }
`

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
