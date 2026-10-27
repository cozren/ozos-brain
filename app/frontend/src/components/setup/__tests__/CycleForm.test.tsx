import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { CycleForm } from '../CycleForm'

test('default cadence submits {mode: default} and confirms', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CycleForm onSubmit={onSubmit} />)
  expect(screen.getByText(/monthly 1:1 note check/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use default cadence' }))
  expect(onSubmit).toHaveBeenCalledWith({ mode: 'default' })
  await waitFor(() => expect(screen.getByText('Default cadence set.')).toBeInTheDocument())
})

test('company cycle needs a name and a stage, then submits stages in order', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CycleForm onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('button', { name: 'Company cycle' }))
  const save = screen.getByRole('button', { name: 'Save cycle' })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Cycle name'), { target: { value: 'Annual Review' } })
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'light-touch' } })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getAllByLabelText('Stage label')[0], {
    target: { value: 'Self Assessment' },
  })
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '2027-01-10' } })
  fireEvent.change(screen.getAllByLabelText('End')[0], { target: { value: '2027-01-24' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add stage' }))
  fireEvent.change(screen.getAllByLabelText('Stage label')[1], {
    target: { value: 'Manager Review' },
  })
  expect(save).toBeEnabled()
  fireEvent.click(save)
  expect(onSubmit).toHaveBeenCalledWith({
    mode: 'company',
    name: 'Annual Review',
    type: 'light-touch',
    stages: [
      { label: 'Self Assessment', start: '2027-01-10', end: '2027-01-24' },
      { label: 'Manager Review', start: '', end: '' },
    ],
  })
  await waitFor(() => expect(screen.getByText('Cycle saved.')).toBeInTheDocument())
})

test('shows the current choice when a cadence is already set', () => {
  render(<CycleForm onSubmit={vi.fn()} cadence={{ mode: 'company', cycle_id: 'annual-review' }} />)
  expect(screen.getByText('Current: company cycle annual-review')).toBeInTheDocument()
})
