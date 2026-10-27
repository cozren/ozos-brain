import { render, screen } from '@testing-library/react'
import { vi, describe, test, expect } from 'vitest'

vi.mock('../../components/PersonalTasks', () => ({
  PersonalTasks: () => <div data-testid="personal-tasks" />,
}))
vi.mock('../../api', () => ({
  api: {
    getGoals: vi.fn().mockResolvedValue({
      goals: [],
      sync: null,
      connector: { configured: false, missing: [] },
      statuses: [],
    }),
    syncGoals: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

import { GoalsTasks } from '../GoalsTasks'

describe('GoalsTasks', () => {
  test('shows the goals board by default and keeps personal tasks reachable', async () => {
    render(<GoalsTasks />)
    expect(screen.getByRole('heading', { name: /goals/i })).toBeInTheDocument()
    expect(await screen.findByText(/no goals yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/coming in a later phase/i)).not.toBeInTheDocument()
  })
})
