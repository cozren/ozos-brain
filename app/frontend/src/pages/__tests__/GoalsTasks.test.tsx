import { render, screen } from '@testing-library/react'
import { vi, describe, test, expect } from 'vitest'
import { GoalsTasks } from '../GoalsTasks'

vi.mock('../../components/PersonalTasks', () => ({
  PersonalTasks: () => <div data-testid="personal-tasks" />,
}))

describe('GoalsTasks', () => {
  test('shows the goals empty state by default and keeps personal tasks reachable', () => {
    render(<GoalsTasks />)
    expect(screen.getByRole('heading', { name: /goals/i })).toBeInTheDocument()
    expect(screen.getByText(/no goals defined yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/complete term/i)).not.toBeInTheDocument()
  })
})
