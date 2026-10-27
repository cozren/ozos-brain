import type { Page } from '../components/Sidebar'

const PAGES: Page[] = [
  'home',
  'control-tower',
  'goals-tasks',
  'knowledge-hub',
  'data-hub',
  'reporting',
  'people-hub',
  'system-health',
]

/**
 * Which page the app opens on.
 *
 * Normally the last-visited page is restored, but an explicit `?page=` in the
 * URL wins — that is how `/ozos-brain` always lands on the brain animation
 * instead of wherever the previous session left off.
 */
export function resolveInitialPage(search: string, stored: string | null): Page {
  const requested = new URLSearchParams(search).get('page')
  if (requested && (PAGES as string[]).includes(requested)) return requested as Page

  // Legacy: the diagnostics page was previously keyed 'control-hub'.
  if (stored === 'control-hub') return 'system-health'
  if (stored && (PAGES as string[]).includes(stored)) return stored as Page
  return 'home'
}
