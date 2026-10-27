import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { GoalCard } from '../GoalCard'
import type { Goal } from '../../../types/goals'

const base: Goal = {
  id: 'grow-activation',
  title: 'Grow activation',
  description: '',
  owner: 'Pat',
  status: 'on_track',
  progress: 42,
  target_date: '2027-03-31',
  source: 'manual',
  external_id: null,
  data_point_id: null,
  updated_at: null,
  synced_at: null,
}

test('shows title, status chip, progress bar, owner and target date', () => {
  render(<GoalCard goal={base} />)
  expect(screen.getByText('Grow activation')).toBeInTheDocument()
  expect(screen.getByText('On track')).toHaveAttribute('data-status', 'on_track')
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  expect(screen.getByText(/Pat/)).toBeInTheDocument()
  expect(screen.getByText(/2027-03-31/)).toBeInTheDocument()
  expect(screen.queryByText('Atlassian')).toBeNull()
})

test('a synced goal carries an Atlassian badge; no progress bar without progress', () => {
  render(
    <GoalCard
      goal={{
        ...base,
        id: 'atlassian-1',
        source: 'atlassian',
        external_id: 'ari:1',
        progress: null,
      }}
    />
  )
  expect(screen.getByText('Atlassian')).toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).toBeNull()
})
