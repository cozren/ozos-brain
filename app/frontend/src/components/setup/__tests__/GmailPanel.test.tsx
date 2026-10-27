import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { GmailPanel } from '../GmailPanel'

test('renders the three checks, the auth command and saves the Drive folder id', async () => {
  const onSaveDrive = vi.fn().mockResolvedValue(undefined)
  render(
    <GmailPanel
      status={{
        credentials_file: true,
        token_file: false,
        drive_parent_folder_id: null,
        auth_command: 'python3 tools/meeting-notes/sync_gemini_notes.py --auth',
      }}
      onSaveDrive={onSaveDrive}
    />
  )
  expect(screen.getByText('OAuth client file')).toHaveAttribute('data-ok', 'true')
  expect(screen.getByText('Gmail token')).toHaveAttribute('data-ok', 'false')
  expect(screen.getByText('Drive mirror folder')).toHaveAttribute('data-ok', 'false')
  expect(
    screen.getByText('python3 tools/meeting-notes/sync_gemini_notes.py --auth')
  ).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Drive folder id (optional)'), {
    target: { value: 'abc123' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save Drive folder' }))
  expect(onSaveDrive).toHaveBeenCalledWith('abc123')
  await waitFor(() => expect(screen.getByText('Drive folder saved.')).toBeInTheDocument())
})

test('shows a loading line until the status arrives', () => {
  render(<GmailPanel status={null} onSaveDrive={vi.fn()} />)
  expect(screen.getByText('Checking Gmail setup…')).toBeInTheDocument()
})
