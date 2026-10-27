import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { GoalStatusChip } from '../GoalStatusChip'

test('renders the human label with the status as a data attribute', () => {
  render(<GoalStatusChip status="at_risk" />)
  const chip = screen.getByText('At risk')
  expect(chip).toHaveAttribute('data-status', 'at_risk')
})
