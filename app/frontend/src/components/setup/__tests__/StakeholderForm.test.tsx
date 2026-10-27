import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { StakeholderForm } from '../StakeholderForm'

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

test('person id is slugged from the name until edited by hand', () => {
  render(<StakeholderForm onSubmit={vi.fn()} />)
  fill('Name', 'Pat Example')
  expect(screen.getByLabelText('Person id')).toHaveValue('pat-example')
  fill('Person id', 'pat')
  fill('Name', 'Pat Example Jr')
  expect(screen.getByLabelText('Person id')).toHaveValue('pat')
})

test('submit is disabled until name and id are present, then sends the payload', async () => {
  const onSubmit = vi.fn().mockResolvedValue({ removed_example: true })
  render(<StakeholderForm onSubmit={onSubmit} />)
  const button = screen.getByRole('button', { name: 'Add person' })
  expect(button).toBeDisabled()
  fill('Name', 'Pat Example')
  fill('Email', 'pat@example.com')
  fill('Team folder', 'Growth')
  fill('Manager', 'Taylor')
  fireEvent.click(screen.getByLabelText('Member of leadership group'))
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(onSubmit).toHaveBeenCalledWith({
    person_id: 'pat-example',
    display_name: 'Pat Example',
    email: 'pat@example.com',
    team_folder: 'Growth',
    leadership: true,
    manager: 'Taylor',
  })
  await waitFor(() =>
    expect(screen.getByText('Added Pat Example. Example person removed.')).toBeInTheDocument()
  )
  expect(screen.getByLabelText('Name')).toHaveValue('')
})

test('a duplicate id shows the backend conflict message', async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error('409'))
  render(<StakeholderForm onSubmit={onSubmit} />)
  fill('Name', 'Sam')
  fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
  await waitFor(() =>
    expect(screen.getByText('A person with id "sam" already exists.')).toBeInTheDocument()
  )
  expect(screen.getByLabelText('Name')).toHaveValue('Sam')
})
