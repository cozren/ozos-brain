import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { EnvForm } from '../EnvForm'

const names = ['ATLASSIAN_EMAIL', 'ATLASSIAN_TOKEN', 'ATLASSIAN_SUBDOMAIN']

test('renders one input per name, masks secrets, never pre-fills and sends only filled names', async () => {
  const onSave = vi.fn().mockResolvedValue(['ATLASSIAN_TOKEN'])
  render(
    <EnvForm
      names={names}
      status={{ ATLASSIAN_EMAIL: true, ATLASSIAN_TOKEN: false, ATLASSIAN_SUBDOMAIN: false }}
      onSave={onSave}
    />
  )
  const email = screen.getByLabelText('ATLASSIAN_EMAIL')
  const token = screen.getByLabelText('ATLASSIAN_TOKEN')
  expect(email).toHaveValue('')
  expect(email).toHaveAttribute('placeholder', 'set')
  expect(token).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('ATLASSIAN_SUBDOMAIN')).toHaveAttribute('placeholder', 'not set')
  fireEvent.change(token, { target: { value: 's3cret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save to .env' }))
  expect(onSave).toHaveBeenCalledWith({ ATLASSIAN_TOKEN: 's3cret' })
  await waitFor(() => expect(screen.getByText('Saved ATLASSIAN_TOKEN.')).toBeInTheDocument())
  expect(screen.getByLabelText('ATLASSIAN_TOKEN')).toHaveValue('')
})

test('save is disabled with nothing typed', () => {
  render(<EnvForm names={names} status={{}} onSave={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Save to .env' })).toBeDisabled()
})
