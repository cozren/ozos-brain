import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'

const getSetup = vi.fn()
const getSetupReminders = vi.fn()
const dismissSetup = vi.fn()
vi.mock('../../api', () => ({
  api: {
    getSetup: (...a: unknown[]) => getSetup(...a),
    getSetupReminders: (...a: unknown[]) => getSetupReminders(...a),
    dismissSetup: (...a: unknown[]) => dismissSetup(...a),
  },
  ApiError: class ApiError extends Error {},
}))
vi.mock('../../components/control-tower/BrainVisual', () => ({
  BrainVisual: () => <div data-testid="brain" />,
}))

import { Home } from '../Home'

beforeEach(() => {
  getSetup.mockReset()
  getSetupReminders.mockReset()
  dismissSetup.mockReset()
})

test('shows the setup badge, navigates on click, and hides it after dismiss', async () => {
  getSetup.mockResolvedValue({
    groups: [],
    summary: { done: 2, total: 17, open: 15, badge_dismissed: false },
    cadence: null,
  })
  getSetupReminders.mockResolvedValue([])
  dismissSetup.mockResolvedValue({ badge_dismissed: true })
  const onNavigate = vi.fn()
  render(<Home onNavigate={onNavigate} />)
  const badge = await screen.findByRole('button', { name: 'Setup: 2 of 17 done' })
  fireEvent.click(badge)
  expect(onNavigate).toHaveBeenCalledWith('setup')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss setup badge' }))
  await waitFor(() => expect(screen.queryByText('Setup: 2 of 17 done')).toBeNull())
  expect(dismissSetup).toHaveBeenCalled()
})

test('renders reminders and survives a failing backend', async () => {
  getSetup.mockRejectedValue(new Error('down'))
  getSetupReminders.mockResolvedValue([
    {
      person_id: 'sam',
      display_name: 'Sam B',
      monthly_due: '2027-06-01',
      quarterly_due: '2027-07-01',
    },
  ])
  render(<Home />)
  expect(await screen.findByText('Sam B')).toBeInTheDocument()
  expect(screen.getByText('OZOS Brain')).toBeInTheDocument()
})
