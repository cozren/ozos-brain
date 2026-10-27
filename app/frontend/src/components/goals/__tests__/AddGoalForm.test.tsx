import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { AddGoalForm } from '../AddGoalForm'
import { ApiError } from '../../../api'

test('is disabled without a title and submits the typed payload', async () => {
  const onSubmit = vi.fn().mockResolvedValue({ id: 'grow-activation' })
  render(<AddGoalForm onSubmit={onSubmit} />)
  const add = screen.getByRole('button', { name: 'Add goal' })
  expect(add).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Grow activation' } })
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Pat' } })
  fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2027-03-31' } })
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'on_track' } })
  fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '20' } })
  expect(add).toBeEnabled()
  fireEvent.click(add)
  expect(onSubmit).toHaveBeenCalledWith({
    title: 'Grow activation',
    owner: 'Pat',
    target_date: '2027-03-31',
    status: 'on_track',
    progress: 20,
  })
  await waitFor(() => expect(screen.getByText('Added Grow activation.')).toBeInTheDocument())
  expect(screen.getByLabelText('Title')).toHaveValue('')
})

test('blank progress is sent as null and a 409 names the clash', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'exists', 'Add goal'))
  render(<AddGoalForm onSubmit={onSubmit} />)
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Dup' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
  expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Dup', progress: null })
  await waitFor(() =>
    expect(screen.getByText('A goal with that name already exists.')).toBeInTheDocument()
  )
})
