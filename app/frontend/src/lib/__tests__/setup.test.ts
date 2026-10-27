import { progressText, showBadge, statusLabel } from '../setup'

test('statusLabel maps every status to a human label', () => {
  expect(statusLabel('not_started')).toBe('Not started')
  expect(statusLabel('in_progress')).toBe('In progress')
  expect(statusLabel('done')).toBe('Done')
  expect(statusLabel('skipped')).toBe('Skipped')
  expect(statusLabel('needs_attention')).toBe('Needs attention')
})

test('progressText reads "Setup: N of M done"', () => {
  expect(progressText({ done: 6, total: 14, open: 7, badge_dismissed: false })).toBe(
    'Setup: 6 of 14 done'
  )
})

test('showBadge is true only while something is open and not dismissed', () => {
  expect(showBadge({ done: 1, total: 3, open: 2, badge_dismissed: false })).toBe(true)
  expect(showBadge({ done: 1, total: 3, open: 2, badge_dismissed: true })).toBe(false)
  expect(showBadge({ done: 2, total: 3, open: 0, badge_dismissed: false })).toBe(false)
})
