import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { FolderForm } from '../FolderForm'

test('prefills the default folder and reports the created path', async () => {
  const onCreate = vi
    .fn()
    .mockResolvedValue({ id: 'pdfs', label: 'Pdfs', path: 'knowledge-hub/pdfs' })
  render(<FolderForm defaultFolder="pdfs" onCreate={onCreate} />)
  expect(screen.getByLabelText('Folder name')).toHaveValue('pdfs')
  fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))
  expect(onCreate).toHaveBeenCalledWith('pdfs')
  await waitFor(() => expect(screen.getByText('Created knowledge-hub/pdfs.')).toBeInTheDocument())
})

test('shows the existing folder when the item is already done', () => {
  render(<FolderForm defaultFolder="pdfs" existing="knowledge-hub/my-pdfs" onCreate={vi.fn()} />)
  expect(screen.getByText('Folder: knowledge-hub/my-pdfs')).toBeInTheDocument()
})
