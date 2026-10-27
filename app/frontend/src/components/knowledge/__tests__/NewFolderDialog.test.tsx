import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NewFolderDialog } from '../NewFolderDialog'
import type { KnowledgeTree } from '../../../types/knowledge'

vi.mock('../../../api', () => ({
  api: { createKnowledgeFolder: vi.fn() },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const tree: KnowledgeTree = {
  sources: [
    { id: 'ai-learning', label: 'AI Learning', path: 'knowledge-hub/ai-learning', children: [] },
    { id: 'docs', label: 'Docs', path: 'docs', children: [] },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('NewFolderDialog', () => {
  test('shows a live slug preview of the target path', async () => {
    render(<NewFolderDialog tree={tree} onClose={vi.fn()} onCreated={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Team Retros')
    expect(screen.getByText(/knowledge-hub\/team-retros/)).toBeInTheDocument()
  })

  test('disables Create when the name slugifies to nothing', async () => {
    render(<NewFolderDialog tree={tree} onClose={vi.fn()} onCreated={vi.fn()} />)
    const create = screen.getByRole('button', { name: /create/i })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/name/i), '!!!')
    expect(create).toBeDisabled()
  })

  test('offers hub folders as parents but not non-hub sources', () => {
    render(<NewFolderDialog tree={tree} onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByRole('option', { name: /knowledge-hub$/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /AI Learning/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Docs$/ })).not.toBeInTheDocument()
  })

  test('creates the folder and reports success', async () => {
    const api = await importApi()
    api.createKnowledgeFolder.mockResolvedValue({ path: 'knowledge-hub/team-retros' })
    const onCreated = vi.fn()
    const onClose = vi.fn()
    render(<NewFolderDialog tree={tree} onClose={onClose} onCreated={onCreated} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Team Retros')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() =>
      expect(api.createKnowledgeFolder).toHaveBeenCalledWith('Team Retros', 'knowledge-hub')
    )
    expect(onCreated).toHaveBeenCalledWith('knowledge-hub/team-retros')
  })

  test('shows the backend error message inline on failure', async () => {
    const api = await importApi()
    api.createKnowledgeFolder.mockRejectedValue(new Error('A folder with that name already exists'))
    render(<NewFolderDialog tree={tree} onClose={vi.fn()} onCreated={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Existing')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
  })
})
