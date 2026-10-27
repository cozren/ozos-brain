import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { KnowledgePreview } from '../KnowledgePreview'

vi.mock('../../../api', () => ({
  api: {
    getKnowledgeFile: vi.fn(),
    putKnowledgeFile: vi.fn(),
    renameKnowledgeFile: vi.fn(),
    knowledgeAssetUrl: (p: string) => `/asset/${p}`,
    getKnowledgeTags: vi.fn(),
    updateKnowledgeMeta: vi.fn(),
  },
}))

const mockFile = (content: string) => ({
  path: 'test/doc.md',
  name: 'doc.md',
  source_id: 'test-source',
  mtime: 1_700_000_000,
  content,
})

const mockImage = () => ({
  path: 'test/pic.png',
  name: 'pic.png',
  source_id: 'test-source',
  mtime: 1_700_000_000,
  kind: 'image' as const,
  content: '',
})

const mockHtml = (content: string) => ({
  path: 'test/chart.html',
  name: 'chart.html',
  source_id: 'test-source',
  mtime: 1_700_000_000,
  kind: 'html' as const,
  content,
})

const defaultProps = {
  path: 'test/doc.md' as string | null,
  sourceLabels: {} as Record<string, string>,
  starred: false,
  onToggleStar: vi.fn(),
}

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  // Default mock for getKnowledgeTags so KnowledgeEditor (rendered inside Preview) doesn't throw
  const mod = await import('../../../api')
  vi.mocked(mod.api).getKnowledgeTags.mockResolvedValue({ tags: [] })
})

describe('KnowledgePreview', () => {
  test('shows placeholder when no path is provided', () => {
    render(<KnowledgePreview {...defaultProps} path={null} />)
    expect(screen.getByText(/select a document/i)).toBeInTheDocument()
  })

  test('renders NOTE callout box from > [!NOTE] syntax', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('> [!NOTE]\n> This is important information.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('NOTE')).toBeInTheDocument())
    expect(screen.getByText(/This is important information/)).toBeInTheDocument()
  })

  test('renders WARNING callout box', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('> [!WARNING]\n> Be careful here.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('WARNING')).toBeInTheDocument())
  })

  test('renders TIP callout box', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('> [!TIP]\n> Use this trick.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('TIP')).toBeInTheDocument())
  })

  test('renders plain blockquote for non-callout', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('> This is a regular quote.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText(/regular quote/)).toBeInTheDocument())
    expect(screen.queryByText('NOTE')).not.toBeInTheDocument()
  })

  test('renders code block with language header', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('```python\nprint("hello")\n```'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('python')).toBeInTheDocument())
    expect(screen.getByText(/print/)).toBeInTheDocument()
  })

  test('renders code block without header when no language is specified', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('```\nsome code\n```'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText(/some code/)).toBeInTheDocument())
  })

  test('renders an <img> for an image file instead of markdown', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockImage())
    render(<KnowledgePreview {...defaultProps} path="test/pic.png" />)
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', '/asset/test/pic.png')
    expect(img).toHaveAttribute('alt', 'pic.png')
  })

  test('renders a sandboxed iframe for an HTML file instead of markdown', async () => {
    const api = await importApi()
    const html = '<!doctype html><html><body><h1>Salary Bands</h1></body></html>'
    api.getKnowledgeFile.mockResolvedValue(mockHtml(html))
    render(<KnowledgePreview {...defaultProps} path="test/chart.html" />)

    const frame = (await screen.findByTitle(/chart\.html/i)) as HTMLIFrameElement
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('srcdoc', html)
    // Sandbox runs the page's own scripts but keeps it origin-isolated.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    // HTML docs are view-only — no in-app markdown editor.
    expect(screen.queryByRole('button', { name: /^Edit$/i })).not.toBeInTheDocument()
  })

  test('renders error message on API failure', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockRejectedValue(new Error('not found'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText(/not found/)).toBeInTheDocument())
  })
})

describe('KnowledgePreview outline', () => {
  const docWithHeadings = '# Title\n\nintro\n\n## Section A\n\nbody A\n\n## Section B\n\nbody B\n'

  test('outline panel is hidden by default but the toggle is offered', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile(docWithHeadings))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /outline/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  test('toggling the outline lists the H1 and H2 titles', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile(docWithHeadings))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /outline/i })).toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: /outline/i }))

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('button', { name: 'Title' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Section A' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Section B' })).toBeInTheDocument()
  })

  test('clicking an outline title scrolls to that heading', async () => {
    let scrolledEl: Element | null = null
    // jsdom does not implement scrollIntoView — capture the element it is called on.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value() {
        scrolledEl = this
      },
      writable: true,
      configurable: true,
    })

    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile(docWithHeadings))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /outline/i })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: /outline/i }))

    const nav = screen.getByRole('navigation')
    fireEvent.click(within(nav).getByRole('button', { name: 'Section B' }))

    expect(scrolledEl).not.toBeNull()
    expect(scrolledEl!.tagName).toBe('H2')
    expect(scrolledEl!.textContent).toContain('Section B')
  })

  test('no outline toggle for image files', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockImage())
    render(<KnowledgePreview {...defaultProps} path="test/pic.png" />)
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /outline/i })).not.toBeInTheDocument()
  })
})

describe('KnowledgePreview collapsible sections', () => {
  test('shows section body by default under a heading', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('# Section One\n\nHello body text.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Section One')).toBeInTheDocument())
    expect(screen.getByText('Hello body text.')).toBeInTheDocument()
  })

  test('clicking a heading collapses its body, clicking again expands it', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('# Section One\n\nHello body text.'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Hello body text.')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Section One'))
    expect(screen.queryByText('Hello body text.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Section One'))
    expect(screen.getByText('Hello body text.')).toBeInTheDocument()
  })

  test('a "#" line inside a code block is not turned into a collapsible heading', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('```python\n# a code comment\nprint(1)\n```'))
    render(<KnowledgePreview {...defaultProps} />)
    await waitFor(() => expect(screen.getByText(/print/)).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /a code comment/ })).not.toBeInTheDocument()
  })
})

describe('KnowledgePreview edit toggle', () => {
  test('shows Edit control; clicking it mounts the editor; clicking Close unmounts it', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('# Hello\n\nBody text.'))
    render(<KnowledgePreview {...defaultProps} />)

    // Wait for file to load and Edit button to appear
    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())

    // Clicking Edit should mount the editor (textarea appears)
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    expect(screen.getByRole('textbox', { name: /body/i })).toBeInTheDocument()

    // Clicking Close should unmount the editor
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }))
    expect(screen.queryByRole('textbox', { name: /body/i })).not.toBeInTheDocument()
  })
})

describe('KnowledgePreview related links', () => {
  test('renders a Related section with anchors when file.links is non-empty', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue({
      path: 'test/doc.md',
      name: 'doc.md',
      source_id: 'test-source',
      mtime: 1_700_000_000,
      content: '# Hello',
      links: [
        { label: 'Figma', url: 'https://figma.com/x' },
        { label: '', url: 'https://doc' },
      ],
    })
    render(<KnowledgePreview {...defaultProps} />)

    const region = await screen.findByRole('region', { name: /related/i })
    const anchors = within(region).getAllByRole('link')

    expect(anchors).toHaveLength(2)

    const figmaAnchor = anchors.find((a) => a.getAttribute('href') === 'https://figma.com/x')
    expect(figmaAnchor).toBeDefined()
    expect(figmaAnchor).toHaveTextContent('Figma')
    expect(figmaAnchor).toHaveAttribute('target', '_blank')
    expect(figmaAnchor).toHaveAttribute('rel', 'noopener noreferrer')

    const fallbackAnchor = anchors.find((a) => a.getAttribute('href') === 'https://doc')
    expect(fallbackAnchor).toBeDefined()
    expect(fallbackAnchor).toHaveTextContent('https://doc')
  })

  test('renders no Related section when file.links is empty or absent', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue({
      path: 'test/doc.md',
      name: 'doc.md',
      source_id: 'test-source',
      mtime: 1_700_000_000,
      content: '# Hello',
    })
    render(<KnowledgePreview {...defaultProps} />)

    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: /related/i })).not.toBeInTheDocument()
  })
})

describe('KnowledgePreview folder tags', () => {
  test('renders folder_tags as read-only chips in the header', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue({ ...mockFile('# A'), folder_tags: ['Ads', 'DMP'] })
    render(<KnowledgePreview {...defaultProps} path="test/doc.md" />)

    expect(await screen.findByText('Ads')).toBeInTheDocument()
    expect(screen.getByText('DMP')).toBeInTheDocument()
  })
})

describe('KnowledgePreview onFileSaved callback', () => {
  test('calls onFileSaved with (originalPath, updatedDoc) after a save that returns a new path (rename)', async () => {
    const api = await importApi()
    const originalDoc = mockFile('# Original')
    const renamedDoc = {
      ...originalDoc,
      path: 'test/renamed.md',
      name: 'renamed.md',
    }
    api.getKnowledgeFile.mockResolvedValue(originalDoc)
    api.renameKnowledgeFile.mockResolvedValue(renamedDoc)

    const onFileSaved = vi.fn()
    render(<KnowledgePreview {...defaultProps} path="test/doc.md" onFileSaved={onFileSaved} />)

    // Open the editor
    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))

    // Change the title to trigger a rename
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), {
      target: { value: 'renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onFileSaved).toHaveBeenCalledTimes(1))
    expect(onFileSaved).toHaveBeenCalledWith('test/doc.md', renamedDoc)
  })

  test('calls onFileSaved with the original path even when only content changes (non-rename save)', async () => {
    const api = await importApi()
    const originalDoc = mockFile('# Original')
    const savedDoc = { ...originalDoc, content: '# Updated' }
    api.getKnowledgeFile.mockResolvedValue(originalDoc)
    api.putKnowledgeFile.mockResolvedValue(savedDoc)

    const onFileSaved = vi.fn()
    render(<KnowledgePreview {...defaultProps} path="test/doc.md" onFileSaved={onFileSaved} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))

    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: '# Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onFileSaved).toHaveBeenCalledTimes(1))
    expect(onFileSaved).toHaveBeenCalledWith('test/doc.md', savedDoc)
  })

  test('does not require onFileSaved to be provided (prop is optional)', async () => {
    const api = await importApi()
    const originalDoc = mockFile('# Hello')
    const savedDoc = { ...originalDoc, content: '# Changed' }
    api.getKnowledgeFile.mockResolvedValue(originalDoc)
    api.putKnowledgeFile.mockResolvedValue(savedDoc)

    // No onFileSaved prop — must not throw
    render(<KnowledgePreview {...defaultProps} path="test/doc.md" />)

    await waitFor(() => expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /body/i }), {
      target: { value: '# Changed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    // Editor closes without error — no onFileSaved means no crash
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /body/i })).not.toBeInTheDocument()
    )
  })
})

describe('KnowledgePreview — Confluence source link', () => {
  test('renders a link to the upstream Confluence page when confluence_url is set', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue({
      ...mockFile('# Ad Tech\n\nBody.'),
      confluence_url: 'https://examplecorp.atlassian.net/wiki/spaces/PEP/pages/8836907194/Ad+Tech',
    })
    render(<KnowledgePreview {...defaultProps} />)

    const link = await screen.findByRole('link', { name: /confluence/i })
    expect(link).toHaveAttribute(
      'href',
      'https://examplecorp.atlassian.net/wiki/spaces/PEP/pages/8836907194/Ad+Tech'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  test('renders no Confluence link when the document has no confluence_url', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('# Ad Tech\n\nBody.'))
    render(<KnowledgePreview {...defaultProps} />)

    await screen.findByText('doc')
    expect(screen.queryByRole('link', { name: /confluence/i })).not.toBeInTheDocument()
  })
})

describe('KnowledgePreview — frontmatter is metadata, not body text', () => {
  test('does not render the YAML frontmatter block in the document body', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue({
      ...mockFile(
        '---\nconfluence: https://examplecorp.atlassian.net/wiki/x/abc\ntags: [ads]\n---\n\n# Ad Tech\n\nReal body.'
      ),
      tags: ['ads'],
      confluence_url: 'https://examplecorp.atlassian.net/wiki/x/abc',
    })
    render(<KnowledgePreview {...defaultProps} />)

    await screen.findByText('Real body.')
    expect(screen.queryByText(/confluence:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/tags: \[ads\]/)).not.toBeInTheDocument()
    // The metadata still reaches the reader through the chips and the header link.
    expect(screen.getByRole('link', { name: /confluence/i })).toBeInTheDocument()
  })

  test('outline skips frontmatter keys and lists only real headings', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(
      mockFile('---\ntags: [ads]\n---\n\n# Real Heading\n\nBody.')
    )
    render(<KnowledgePreview {...defaultProps} />)

    await screen.findByText('Body.')
    fireEvent.click(screen.getByRole('button', { name: /outline/i }))
    const nav = await screen.findByRole('navigation', { name: /document outline/i })
    expect(within(nav).getByText('Real Heading')).toBeInTheDocument()
  })
})

describe('KnowledgePreview — image zoom', () => {
  test('clicking an embedded markdown image opens the zoom lightbox', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('# Arch\n\n![Ad stack diagram](./diagram.svg)'))
    render(<KnowledgePreview {...defaultProps} />)

    const img = await screen.findByAltText('Ad stack diagram')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(img)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
  })

  test('clicking a standalone image document opens the zoom lightbox', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockImage())
    render(<KnowledgePreview {...defaultProps} path="test/pic.png" />)

    fireEvent.click(await screen.findByAltText('pic.png'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  test('closing the lightbox returns to the document', async () => {
    const api = await importApi()
    api.getKnowledgeFile.mockResolvedValue(mockFile('![Ad stack diagram](./diagram.svg)'))
    render(<KnowledgePreview {...defaultProps} />)

    fireEvent.click(await screen.findByAltText('Ad stack diagram'))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /close/i })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
