import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddTask } from '../AddTask'

test('description field is a rich-text editor (has a formatting toolbar)', async () => {
  const user = userEvent.setup()
  render(<AddTask allLabels={[]} labelColors={{}} onCreate={() => {}} />)
  await user.click(screen.getByRole('button', { name: /add a task/i }))
  // The plain textarea is gone — the rich editor's Bold control proves the swap.
  expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
})

test('still creates a task from the typed title', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<AddTask allLabels={[]} labelColors={{}} onCreate={onCreate} />)
  await user.click(screen.getByRole('button', { name: /add a task/i }))
  await user.type(screen.getByPlaceholderText(/task title/i), 'Ship it')
  await user.click(screen.getByRole('button', { name: /^add task$/i }))
  expect(onCreate).toHaveBeenCalledWith('Ship it', expect.any(String), [])
})
