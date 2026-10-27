import type { SetupStatus, SetupSummary } from '../types/setup'

const LABELS: Record<SetupStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
  needs_attention: 'Needs attention',
}

export function statusLabel(status: SetupStatus): string {
  return LABELS[status] ?? status
}

export function progressText(summary: SetupSummary): string {
  return `Setup: ${summary.done} of ${summary.total} done`
}

export function showBadge(summary: SetupSummary): boolean {
  return !summary.badge_dismissed && summary.open > 0
}
