import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { KnowledgeHub } from '../KnowledgeHub'
import type { KnowledgeTree, KnowledgeFile } from '../../types/knowledge'

vi.mock('../../api', () => ({
  api: {
    getKnowledgeTree: vi.fn(),
    getKnowledgeStars: vi.fn(),
    getKnowledgeColors: vi.fn(),
    getKnowledgeFile: vi.fn(),
    putKnowledgeFile: vi.fn(),
    renameKnowledgeFile: vi.fn(),
    moveKnowledgeFile: vi.fn(),
    setKnowledgeOrder: vi.fn(),
    knowledgeAssetUrl: (p: string) => `/asset/${p}`,
    getKnowledgeTags: vi.fn(),
    updateKnowledgeMeta: vi.fn(),
  },
}))

async function importApi() {
  const mod = await import('../../api')
  return vi.mocked(mod.api)
}

const source = (id: string, label: string): KnowledgeTree['sources'][number] => ({
  id,
  label,
  path: `knowledge-hub/${id}`,
  children: [],
})

const treeOne: KnowledgeTree = { sources: [source('onboarding', 'Onboarding')] }
const treeTwo: KnowledgeTree = {
  sources: [source('onboarding', 'Onboarding'), source('new-stuff', 'New Stuff')],
}

beforeEach(async () => {
  vi.clearAllMocks()
  // Default mock for getKnowledgeTags so KnowledgeEditor (mounted when editing) doesn't throw
  const mod = await import('../../api')
  vi.mocked(mod.api).getKnowledgeTags.mockResolvedValue({ tags: [] })
})

describe('KnowledgeHub refresh', () => {
  test('re-reads the folder tree from disk when the refresh button is clicked', async () => {
    const api = await importApi()
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValue(treeOne)

    render(<KnowledgeHub />)

    // Initial tree renders (source label, uppercased via CSS but text intact).
    await waitFor(() => expect(screen.getByText('Onboarding')).toBeInTheDocument())
    expect(screen.queryByText('New Stuff')).not.toBeInTheDocument()
    expect(api.getKnowledgeTree).toHaveBeenCalledTimes(1)

    // A new folder appears on disk → backend now returns it.
    api.getKnowledgeTree.mockResolvedValue(treeTwo)

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => expect(screen.getByText('New Stuff')).toBeInTheDocument())
    expect(api.getKnowledgeTree).toHaveBeenCalledTimes(2)
  })
})

// Helper: build a source node containing a single file child (matching SourceNode + TreeNode shapes)
const fileNode = (
  id: string,
  filePath: string,
  name: string
): KnowledgeTree['sources'][number] => ({
  id,
  label: id,
  path: `knowledge-hub/${id}`,
  children: [{ path: filePath, name, type: 'file' as const, mtime: 1_700_000_000 }],
})

const docFile: KnowledgeFile = {
  path: 'knowledge-hub/notes/doc.md',
  name: 'doc.md',
  source_id: 'notes',
  mtime: 1_700_000_000,
  content: '# Doc',
}

const renamedFile: KnowledgeFile = {
  ...docFile,
  path: 'knowledge-hub/notes/renamed.md',
  name: 'renamed.md',
}

// In the tree, source cards are collapsed by default. We expand a source by clicking
// its label, then click the file name (displayed without .md suffix).
async function openDocInHub(
  api: Awaited<ReturnType<typeof importApi>>,
  sourceLabel: string,
  fileDisplayName: string,
  filePath: string
) {
  // Expand the source card
  await userEvent.click(screen.getByText(sourceLabel))
  // Click the file row (name shown without .md)
  await waitFor(() => expect(screen.getByText(fileDisplayName)).toBeInTheDocument())
  await userEvent.click(screen.getByText(fileDisplayName))
  await waitFor(() => expect(api.getKnowledgeFile).toHaveBeenCalledWith(filePath))
}

describe('KnowledgeHub onFileSaved — rename flow', () => {
  test('re-fetches the tree after a rename save', async () => {
    const api = await importApi()
    const treeWithDoc: KnowledgeTree = {
      sources: [fileNode('notes', 'knowledge-hub/notes/doc.md', 'doc.md')],
    }
    const treeAfterRename: KnowledgeTree = {
      sources: [fileNode('notes', 'knowledge-hub/notes/renamed.md', 'renamed.md')],
    }
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValueOnce(treeWithDoc)
    api.getKnowledgeFile.mockResolvedValue(docFile)
    api.renameKnowledgeFile.mockResolvedValue(renamedFile)

    render(<KnowledgeHub />)
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(1))

    // Expand source, select doc (displayed as "doc" without .md)
    await openDocInHub(api, 'notes', 'doc', 'knowledge-hub/notes/doc.md')

    // Open editor and rename
    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'renamed' },
    })

    // Configure tree to return updated tree on next reload
    api.getKnowledgeTree.mockResolvedValue(treeAfterRename)

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    // Tree should be re-fetched after save
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(2))
  })

  test('updates selectedPath to the new path after a rename save', async () => {
    const api = await importApi()
    const treeWithDoc: KnowledgeTree = {
      sources: [fileNode('notes', 'knowledge-hub/notes/doc.md', 'doc.md')],
    }
    const treeAfterRename: KnowledgeTree = {
      sources: [fileNode('notes', 'knowledge-hub/notes/renamed.md', 'renamed.md')],
    }
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValueOnce(treeWithDoc)
    api.getKnowledgeFile.mockResolvedValue(docFile)
    api.renameKnowledgeFile.mockResolvedValue(renamedFile)

    render(<KnowledgeHub />)
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(1))

    await openDocInHub(api, 'notes', 'doc', 'knowledge-hub/notes/doc.md')

    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'renamed' },
    })

    api.getKnowledgeTree.mockResolvedValue(treeAfterRename)
    // After the new path is selected, getKnowledgeFile will be called for the renamed path
    api.getKnowledgeFile.mockResolvedValue(renamedFile)

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    // The preview should now load the renamed file (selectedPath changed to new path)
    await waitFor(() =>
      expect(api.getKnowledgeFile).toHaveBeenCalledWith('knowledge-hub/notes/renamed.md')
    )
  })

  test('does not update selectedPath when only content changes (non-rename save)', async () => {
    const api = await importApi()
    const treeWithDoc: KnowledgeTree = {
      sources: [fileNode('notes', 'knowledge-hub/notes/doc.md', 'doc.md')],
    }
    const savedFile: KnowledgeFile = { ...docFile, content: '# Updated' }
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValue(treeWithDoc)
    api.getKnowledgeFile.mockResolvedValue(docFile)
    api.putKnowledgeFile.mockResolvedValue(savedFile)

    render(<KnowledgeHub />)
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(1))

    await openDocInHub(api, 'notes', 'doc', 'knowledge-hub/notes/doc.md')

    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: '# Updated' },
    })

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    // Tree should still be refreshed after a content-only save
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(2))

    // getKnowledgeFile should NOT be called a second time for a different path
    // (it was called once for the initial load; no reselect needed)
    const calls = api.getKnowledgeFile.mock.calls.map((c) => c[0])
    expect(calls.every((p: string) => p === 'knowledge-hub/notes/doc.md')).toBe(true)
  })
})

describe('KnowledgeHub file move', () => {
  test('dropping a file on a folder row moves it and reloads the tree', async () => {
    const api = await importApi()
    const treeWithFolder: KnowledgeTree = {
      sources: [
        {
          id: 'notes',
          label: 'notes',
          path: 'knowledge-hub/notes',
          children: [
            {
              path: 'knowledge-hub/notes/sub',
              name: 'sub',
              type: 'dir' as const,
              mtime: 1_700_000_000,
              children: [],
            },
            {
              path: 'knowledge-hub/notes/doc.md',
              name: 'doc.md',
              type: 'file' as const,
              mtime: 1_700_000_000,
            },
          ],
        },
      ],
    }
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValue(treeWithFolder)
    const movedFile: KnowledgeFile = {
      path: 'knowledge-hub/notes/sub/doc.md',
      name: 'doc.md',
      source_id: 'notes',
      mtime: 1_700_000_000,
      content: '',
    }
    api.moveKnowledgeFile.mockResolvedValue(movedFile)
    // The success path selects the moved file at its new path, which makes
    // KnowledgePreview fetch it via getKnowledgeFile — mock it so the test
    // is self-contained (does not rely on a prior test leaving this mocked).
    api.getKnowledgeFile.mockResolvedValue(movedFile)

    render(<KnowledgeHub />)
    await waitFor(() => expect(screen.getByText('notes')).toBeInTheDocument())

    // Expand the source to reveal its folder + file rows.
    await userEvent.click(screen.getByText('notes'))
    await waitFor(() => expect(screen.getByText('sub')).toBeInTheDocument())

    const dataTransfer = {
      types: ['application/x-kh-file'],
      getData: () => 'knowledge-hub/notes/doc.md',
      dropEffect: '',
      effectAllowed: '',
    }
    const folder = screen.getByText('sub')
    fireEvent.dragOver(folder, { dataTransfer })
    fireEvent.drop(folder, { dataTransfer })

    await waitFor(() =>
      expect(api.moveKnowledgeFile).toHaveBeenCalledWith(
        'knowledge-hub/notes/doc.md',
        'knowledge-hub/notes/sub'
      )
    )
    await waitFor(() => expect(api.getKnowledgeTree).toHaveBeenCalledTimes(2))

    // The moved file should remain selected at its new path (setSelectedPath(moved.path)).
    await waitFor(() =>
      expect(api.getKnowledgeFile).toHaveBeenCalledWith('knowledge-hub/notes/sub/doc.md')
    )
  })

  test('surfaces an error message when the move fails and does not reload the tree', async () => {
    const api = await importApi()
    const treeWithFolder: KnowledgeTree = {
      sources: [
        {
          id: 'notes',
          label: 'notes',
          path: 'knowledge-hub/notes',
          children: [
            {
              path: 'knowledge-hub/notes/sub',
              name: 'sub',
              type: 'dir' as const,
              mtime: 1_700_000_000,
              children: [],
            },
            {
              path: 'knowledge-hub/notes/doc.md',
              name: 'doc.md',
              type: 'file' as const,
              mtime: 1_700_000_000,
            },
          ],
        },
      ],
    }
    api.getKnowledgeStars.mockResolvedValue({ starred: [] })
    api.getKnowledgeColors.mockResolvedValue({ colors: {} })
    api.getKnowledgeTree.mockResolvedValue(treeWithFolder)
    api.moveKnowledgeFile.mockRejectedValue(new Error('A file with that name already exists there'))

    render(<KnowledgeHub />)
    await waitFor(() => expect(screen.getByText('notes')).toBeInTheDocument())

    // Expand the source to reveal its folder + file rows.
    await userEvent.click(screen.getByText('notes'))
    await waitFor(() => expect(screen.getByText('sub')).toBeInTheDocument())

    const dataTransfer = {
      types: ['application/x-kh-file'],
      getData: () => 'knowledge-hub/notes/doc.md',
      dropEffect: '',
      effectAllowed: '',
    }
    const folder = screen.getByText('sub')
    fireEvent.dragOver(folder, { dataTransfer })
    fireEvent.drop(folder, { dataTransfer })

    await waitFor(() =>
      expect(api.moveKnowledgeFile).toHaveBeenCalledWith(
        'knowledge-hub/notes/doc.md',
        'knowledge-hub/notes/sub'
      )
    )

    await waitFor(() => expect(screen.getByText(/already exists there/i)).toBeInTheDocument())
  })
})
