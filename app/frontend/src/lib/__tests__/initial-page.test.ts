import { describe, it, expect } from 'vitest'
import { resolveInitialPage } from '../initial-page'

describe('resolveInitialPage', () => {
  it('falls back to home when nothing is stored', () => {
    expect(resolveInitialPage('', null)).toBe('home')
  })

  it('restores the stored page on a plain reload', () => {
    expect(resolveInitialPage('', 'data-hub')).toBe('data-hub')
  })

  it('maps the legacy control-hub key onto system-health', () => {
    expect(resolveInitialPage('', 'control-hub')).toBe('system-health')
  })

  it('lets ?page= override the stored page (how /ozos-brain lands on the brain)', () => {
    expect(resolveInitialPage('?page=home', 'data-hub')).toBe('home')
    expect(resolveInitialPage('?page=reporting', 'data-hub')).toBe('reporting')
  })

  it('ignores an unknown ?page= value and keeps the stored page', () => {
    expect(resolveInitialPage('?page=nonsense', 'data-hub')).toBe('data-hub')
  })
})
