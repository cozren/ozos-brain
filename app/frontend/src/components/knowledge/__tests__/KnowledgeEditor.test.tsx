import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { KnowledgeEditor } from '../KnowledgeEditor'
import type { KnowledgeFile } from '../../../types/knowledge'

vi.mock('../../../api', () => ({
  api: {
    putKnowledgeFile: vi.fn(),
    renameKnowledgeFile: vi.fn(),
    knowledgeAssetUrl: (p: string) => `/asset/${p}`,
    getKnowledgeTags: vi.fn(),
    updateKnowledgeMeta: vi.fn(),
  },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const baseFile: KnowledgeFile = {
  path: 'knowledge-hub/notes/2026-06-29 — Test.md',
  name: '2026-06-29 — Test.md',
  source_id: 'notes',
  mtime: 1_700_000_000,
  content: '---\ndate: 2026-06-29\ntags: []\n---\n# Test\n\nOriginal body.',
}

beforeEach(async () => {
  vi.clearAllMocks()
  // Provide a default mock for getKnowledgeTags so all tests work without explicit setup
  const mod = await import('../../../api')
  vi.mocked(mod.api).getKnowledgeTags.mockResolvedValue({ tags: [] })
})

describe('KnowledgeEditor — body editing', () => {
  test('renders a textarea pre-filled with the file content', () => {
    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)
    const textarea = screen.getByRole('textbox', { name: /body/i })
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe(baseFile.content)
  })

  test('editing the body and clicking Save calls PUT /knowledge/file with new content', async () => {
    const api = await importApi()
    const updatedFile: KnowledgeFile = {
      ...baseFile,
      content: '---\ndate: 2026-06-29\ntags: []\n---\n# Test\n\nEdited body.',
    }
    api.putKnowledgeFile.mockResolvedValue(updatedFile)

    const onSaved = vi.fn()
    render(<KnowledgeEditor file={baseFile} onSaved={onSaved} />)

    const textarea = screen.getByRole('textbox', { name: /body/i })
    fireEvent.change(textarea, {
      target: { value: '---\ndate: 2026-06-29\ntags: []\n---\n# Test\n\nEdited body.' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.putKnowledgeFile).toHaveBeenCalledWith(
        baseFile.path,
        '---\ndate: 2026-06-29\ntags: []\n---\n# Test\n\nEdited body.'
      )
    })
    expect(onSaved).toHaveBeenCalledWith(updatedFile)
  })

  test('does not call PUT when content has not changed', async () => {
    const api = await importApi()
    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.putKnowledgeFile).not.toHaveBeenCalled()
    })
  })
})

describe('KnowledgeEditor — rename', () => {
  test('renders a title input pre-filled with the file name (without .md)', () => {
    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: /title/i })
    expect((input as HTMLInputElement).value).toBe('2026-06-29 — Test')
  })

  test('editing the title and saving calls POST /knowledge/rename with the new name', async () => {
    const api = await importApi()
    const renamedFile: KnowledgeFile = {
      ...baseFile,
      path: 'knowledge-hub/notes/2026-06-29 — Renamed.md',
      name: '2026-06-29 — Renamed.md',
    }
    api.renameKnowledgeFile.mockResolvedValue(renamedFile)

    const onSaved = vi.fn()
    render(<KnowledgeEditor file={baseFile} onSaved={onSaved} />)

    const input = screen.getByRole('textbox', { name: /title/i })
    fireEvent.change(input, { target: { value: '2026-06-29 — Renamed' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.renameKnowledgeFile).toHaveBeenCalledWith(baseFile.path, '2026-06-29 — Renamed.md')
    })
    expect(onSaved).toHaveBeenCalledWith(renamedFile)
  })

  test('does not call rename when title has not changed', async () => {
    const api = await importApi()
    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.renameKnowledgeFile).not.toHaveBeenCalled()
    })
  })

  test('calls both PUT and rename when both body and title have changed', async () => {
    const api = await importApi()
    const savedFile: KnowledgeFile = {
      ...baseFile,
      path: 'knowledge-hub/notes/2026-06-29 — NewName.md',
      name: '2026-06-29 — NewName.md',
      content: '---\ntags: []\n---\n# Updated\n\nNew body.',
    }
    api.putKnowledgeFile.mockResolvedValue({
      ...baseFile,
      content: '---\ntags: []\n---\n# Updated\n\nNew body.',
    })
    api.renameKnowledgeFile.mockResolvedValue(savedFile)

    const onSaved = vi.fn()
    render(<KnowledgeEditor file={baseFile} onSaved={onSaved} />)

    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: '---\ntags: []\n---\n# Updated\n\nNew body.' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: '2026-06-29 — NewName' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.putKnowledgeFile).toHaveBeenCalled()
      expect(api.renameKnowledgeFile).toHaveBeenCalled()
    })
    expect(api.renameKnowledgeFile).toHaveBeenCalledWith(baseFile.path, '2026-06-29 — NewName.md')
    expect(onSaved).toHaveBeenCalledWith(savedFile)
  })
})

describe('KnowledgeEditor — live preview', () => {
  test('typing into the body textarea updates the preview region', async () => {
    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)

    const textarea = screen.getByRole('textbox', { name: /body/i })
    fireEvent.change(textarea, { target: { value: '# Hello' } })

    // The preview pane should render a heading with "Hello"
    await waitFor(() => {
      const preview = screen.getByTestId('ke-preview')
      expect(preview.querySelector('h1')).not.toBeNull()
      expect(preview.querySelector('h1')!.textContent).toBe('Hello')
    })
  })
})

// A file that has tags and folders in its frontmatter
const fileWithMeta: KnowledgeFile = {
  path: 'knowledge-hub/notes/2026-06-29 — Test.md',
  name: '2026-06-29 — Test.md',
  source_id: 'notes',
  mtime: 1_700_000_000,
  content:
    '---\ndate: 2026-06-29\ntags: [existing-tag]\nfolders: [notes]\n---\n# Test\n\nOriginal body.',
  tags: ['existing-tag'],
  folders: ['notes'],
  links: [],
}

describe('KnowledgeEditor — error handling', () => {
  test('shows an error message when save fails', async () => {
    const api = await importApi()
    api.putKnowledgeFile.mockRejectedValue(new Error('Disk full'))

    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/Disk full/)).toBeInTheDocument()
  })

  test('disables Save button while saving is in progress', async () => {
    const api = await importApi()
    let resolve!: (v: KnowledgeFile) => void
    api.putKnowledgeFile.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )

    render(<KnowledgeEditor file={baseFile} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: 'changed content' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    })

    resolve({ ...baseFile, content: 'changed content' })
  })
})

describe('KnowledgeEditor — tags', () => {
  test('adding a tag and saving calls updateKnowledgeMeta with merged tags', async () => {
    const api = await importApi()
    api.getKnowledgeTags.mockResolvedValue({ tags: ['existing-tag', 'new-tag', 'other'] })
    api.updateKnowledgeMeta.mockResolvedValue({
      ...fileWithMeta,
      tags: ['existing-tag', 'new-tag'],
    })

    render(<KnowledgeEditor file={fileWithMeta} onSaved={vi.fn()} folderOptions={['notes']} />)

    // type a new tag and press Enter
    const tagInput = screen.getByPlaceholderText(/add tag/i)
    fireEvent.change(tagInput, { target: { value: 'new-tag' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.updateKnowledgeMeta).toHaveBeenCalledWith(
        fileWithMeta.path,
        expect.objectContaining({ tags: expect.arrayContaining(['existing-tag', 'new-tag']) })
      )
    })
  })

  test('tag autocomplete fetches from GET /api/knowledge/tags', async () => {
    const api = await importApi()
    api.getKnowledgeTags.mockResolvedValue({ tags: ['team-sync', 'pricing'] })

    render(<KnowledgeEditor file={fileWithMeta} onSaved={vi.fn()} folderOptions={['notes']} />)

    await waitFor(() => {
      expect(api.getKnowledgeTags).toHaveBeenCalled()
    })
  })
})

describe('KnowledgeEditor — folders', () => {
  test('selecting a second folder and saving sends folders array', async () => {
    const api = await importApi()
    api.getKnowledgeTags.mockResolvedValue({ tags: [] })
    api.updateKnowledgeMeta.mockResolvedValue({ ...fileWithMeta, folders: ['notes', 'docs'] })

    render(
      <KnowledgeEditor
        file={fileWithMeta}
        onSaved={vi.fn()}
        folderOptions={['notes', 'docs', 'other']}
      />
    )

    // find the "docs" folder option and click/select it
    const docsCheckbox = screen.getByLabelText('docs')
    fireEvent.click(docsCheckbox)

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.updateKnowledgeMeta).toHaveBeenCalledWith(
        fileWithMeta.path,
        expect.objectContaining({ folders: expect.arrayContaining(['notes', 'docs']) })
      )
    })
  })
})

describe('KnowledgeEditor — links', () => {
  test('adding a link with an invalid URL prevents save and shows error', async () => {
    const api = await importApi()
    api.getKnowledgeTags.mockResolvedValue({ tags: [] })

    render(<KnowledgeEditor file={fileWithMeta} onSaved={vi.fn()} folderOptions={['notes']} />)

    // Add a link row
    fireEvent.click(screen.getByRole('button', { name: /add link/i }))

    // fill in invalid url
    const urlInputs = screen.getAllByPlaceholderText(/url/i)
    fireEvent.change(urlInputs[urlInputs.length - 1], { target: { value: 'not-a-url' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      // updateKnowledgeMeta should NOT have been called
      expect(api.updateKnowledgeMeta).not.toHaveBeenCalled()
      // An inline error should appear
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  test('a valid link url is included in the /meta payload', async () => {
    const api = await importApi()
    api.getKnowledgeTags.mockResolvedValue({ tags: [] })
    api.updateKnowledgeMeta.mockResolvedValue({
      ...fileWithMeta,
      links: [{ label: 'Docs', url: 'https://example.com' }],
    })

    render(<KnowledgeEditor file={fileWithMeta} onSaved={vi.fn()} folderOptions={['notes']} />)

    // Add a link row
    fireEvent.click(screen.getByRole('button', { name: /add link/i }))

    const labelInputs = screen.getAllByPlaceholderText(/label/i)
    const urlInputs = screen.getAllByPlaceholderText(/url/i)
    fireEvent.change(labelInputs[labelInputs.length - 1], { target: { value: 'Docs' } })
    fireEvent.change(urlInputs[urlInputs.length - 1], { target: { value: 'https://example.com' } })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.updateKnowledgeMeta).toHaveBeenCalledWith(
        fileWithMeta.path,
        expect.objectContaining({
          links: expect.arrayContaining([{ label: 'Docs', url: 'https://example.com' }]),
        })
      )
    })
  })
})

describe('KnowledgeEditor — save flow', () => {
  test('a body-only change calls PUT /file but NOT updateKnowledgeMeta', async () => {
    const api = await importApi()
    api.putKnowledgeFile.mockResolvedValue({ ...fileWithMeta, content: 'changed' })
    api.getKnowledgeTags.mockResolvedValue({ tags: [] })

    render(<KnowledgeEditor file={fileWithMeta} onSaved={vi.fn()} folderOptions={['notes']} />)

    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: 'changed' },
    })

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(api.putKnowledgeFile).toHaveBeenCalled()
      expect(api.updateKnowledgeMeta).not.toHaveBeenCalled()
    })
  })
})

describe('KnowledgeEditor — folder tags', () => {
  test('renders folder_tags as read-only chips (no remove button) and excludes them from saved tags', async () => {
    const onSaved = vi.fn()
    const file = {
      path: 'knowledge-hub/ad-stack/DMP/a.md',
      name: 'a.md',
      source_id: 'ad-stack',
      mtime: 1_700_000_000,
      content: '# A',
      tags: ['manual-tag'],
      folder_tags: ['Ads', 'DMP'],
    }
    render(<KnowledgeEditor file={file} onSaved={onSaved} />)
    // Folder tag is shown…
    expect(screen.getByText('Ads')).toBeInTheDocument()
    expect(screen.getByText('DMP')).toBeInTheDocument()
    // …but has no remove control (only the manual tag does).
    expect(screen.queryByRole('button', { name: /Remove tag Ads/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove tag manual-tag/i })).toBeInTheDocument()
  })
})
