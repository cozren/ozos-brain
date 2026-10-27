import { render, screen, fireEvent } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
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

test('a manual goal with handlers exposes a status select, a progress input and delete', () => {
  const onPatch = vi.fn()
  const onDelete = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<GoalCard goal={base} onPatch={onPatch} onDelete={onDelete} />)
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'at_risk' } })
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { status: 'at_risk' })
  const progress = screen.getByLabelText('Progress')
  fireEvent.change(progress, { target: { value: '55' } })
  fireEvent.blur(progress)
  expect(onPatch).toHaveBeenCalledWith('grow-activation', { progress: 55 })
  fireEvent.click(screen.getByRole('button', { name: 'Delete Grow activation' }))
  expect(onDelete).toHaveBeenCalledWith('grow-activation')
})

test('a synced goal never exposes edit controls even with handlers', () => {
  render(
    <GoalCard
      goal={{ ...base, id: 'atlassian-1', source: 'atlassian', external_id: 'ari:1' }}
      onPatch={vi.fn()}
      onDelete={vi.fn()}
    />
  )
  expect(screen.queryByLabelText('Status')).toBeNull()
  expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  expect(screen.getByText('On track')).toBeInTheDocument()
})
