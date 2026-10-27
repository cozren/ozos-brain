import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { KnowledgeTree } from '../KnowledgeTree'
import type { KnowledgeTree as Tree } from '../../../types/knowledge'

const file = (name: string, path: string) => ({
  name,
  path,
  type: 'file' as const,
  mtime: 1_700_000_000,
})

const tree: Tree = {
  sources: [
    {
      id: 'meetings',
      label: 'Meeting Notes',
      path: 'knowledge-hub/meetings',
      children: [
        file('alpha.md', 'knowledge-hub/meetings/alpha.md'),
        file('beta.md', 'knowledge-hub/meetings/beta.md'),
      ],
    },
    {
      id: 'learnings',
      label: 'Learnings',
      path: 'knowledge-hub/learnings',
      children: [
        {
          name: 'sub',
          path: 'knowledge-hub/learnings/sub',
          type: 'dir',
          mtime: 1_700_000_000,
          children: [file('gamma.md', 'knowledge-hub/learnings/sub/gamma.md')],
        },
      ],
    },
  ],
}

const baseProps = {
  tree,
  selectedPath: null as string | null,
  onSelect: vi.fn(),
  onToggleStar: vi.fn(),
  colors: {} as Record<string, string>,
  onSetColor: vi.fn(),
}

describe('KnowledgeTree favorites', () => {
  test('renders a single top-level Favorites group with starred files from multiple sources', () => {
    const starred = new Set([
      'knowledge-hub/meetings/alpha.md',
      'knowledge-hub/learnings/sub/gamma.md',
    ])
    render(<KnowledgeTree {...baseProps} starred={starred} />)

    const favs = screen.getAllByText('Favorites')
    expect(favs).toHaveLength(1)
    // Both starred docs, drawn from two different sources, listed in the group.
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument()
  })

  test('does not render any per-source "Starred" sub-group, even when a source is expanded', () => {
    const starred = new Set(['knowledge-hub/meetings/alpha.md'])
    render(<KnowledgeTree {...baseProps} starred={starred} />)
    fireEvent.click(screen.getByText('Meeting Notes'))
    expect(screen.queryByText('Starred')).not.toBeInTheDocument()
  })

  test('a starred file still appears under its own source folder when expanded', () => {
    const starred = new Set(['knowledge-hub/meetings/alpha.md'])
    render(<KnowledgeTree {...baseProps} starred={starred} />)
    // Expand the "Meeting Notes" source.
    fireEvent.click(screen.getByText('Meeting Notes'))
    // alpha shows in the Favorites group AND under its folder.
    expect(screen.getAllByText('alpha').length).toBe(2)
  })

  test('hides the Favorites group entirely when nothing is starred', () => {
    render(<KnowledgeTree {...baseProps} starred={new Set()} />)
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument()
  })
})

// ── pagination (Phase 0, Task 0.2) ─────────────────────────────────────────

function folderWith(n: number): Tree {
  return {
    sources: [
      {
        id: 'meeting-notes',
        label: 'Meeting Notes',
        path: 'knowledge-hub/meeting-notes',
        children: [
          {
            type: 'dir',
            name: 'Jordan',
            path: 'knowledge-hub/meeting-notes/Jordan',
            mtime: 0,
            children: Array.from({ length: n }, (_, i) => ({
              type: 'file' as const,
              name: `2026-06-${String(i + 1).padStart(2, '0')} — N${i}.md`,
              path: `knowledge-hub/meeting-notes/Jordan/${i}.md`,
              mtime: 0,
            })),
          },
        ],
      },
    ],
  }
}

describe('KnowledgeTree pagination', () => {
  test('shows first 20 files then Show more when folder has 25 files', () => {
    render(
      <KnowledgeTree
        tree={folderWith(25)}
        selectedPath={null}
        onSelect={vi.fn()}
        starred={new Set()}
        onToggleStar={vi.fn()}
        colors={{}}
        onSetColor={vi.fn()}
      />
    )
    // Expand the source card first
    fireEvent.click(screen.getByText('Meeting Notes'))
    // Expand the Jordan subfolder
    fireEvent.click(screen.getByText('Jordan'))
    // Only 20 files visible initially (NodeRow strips .md from display)
    expect(screen.getAllByText(/— N\d+$/).length).toBe(20)
    // "Show more (5)" button present
    fireEvent.click(screen.getByText(/Show more \(5\)/))
    // All 25 visible after expanding
    expect(screen.getAllByText(/— N\d+$/).length).toBe(25)
  })

  test('shows all files without Show more when folder has exactly 20', () => {
    render(
      <KnowledgeTree
        tree={folderWith(20)}
        selectedPath={null}
        onSelect={vi.fn()}
        starred={new Set()}
        onToggleStar={vi.fn()}
        colors={{}}
        onSetColor={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Meeting Notes'))
    fireEvent.click(screen.getByText('Jordan'))
    expect(screen.getAllByText(/— N\d+$/).length).toBe(20)
    expect(screen.queryByText(/Show more/)).not.toBeInTheDocument()
  })

  test('pagination resets to 20 when folder is collapsed then reopened', () => {
    render(
      <KnowledgeTree
        tree={folderWith(25)}
        selectedPath={null}
        onSelect={vi.fn()}
        starred={new Set()}
        onToggleStar={vi.fn()}
        colors={{}}
        onSetColor={vi.fn()}
      />
    )
    // Open source card, then the subfolder
    fireEvent.click(screen.getByText('Meeting Notes'))
    fireEvent.click(screen.getByText('Jordan'))
    // Initially 20 visible
    expect(screen.getAllByText(/— N\d+$/).length).toBe(20)
    // Click "Show more" so all 25 are shown
    fireEvent.click(screen.getByText(/Show more \(5\)/))
    expect(screen.getAllByText(/— N\d+$/).length).toBe(25)
    // Collapse the subfolder
    fireEvent.click(screen.getByText('Jordan'))
    // Reopen the subfolder — pagination should reset back to 20
    fireEvent.click(screen.getByText('Jordan'))
    expect(screen.getAllByText(/— N\d+$/).length).toBe(20)
    expect(screen.getByText(/Show more \(5\)/)).toBeInTheDocument()
  })
})

describe('KnowledgeTree drag-and-drop move', () => {
  const dt = (path: string) => ({
    types: ['application/x-kh-file'],
    getData: () => path,
    setData: vi.fn(),
    dropEffect: '',
    effectAllowed: '',
  })

  test('file rows are draggable when onMoveFile is provided', () => {
    render(<KnowledgeTree {...baseProps} starred={new Set()} onMoveFile={vi.fn()} />)
    fireEvent.click(screen.getByText('Meeting Notes'))
    const row = screen.getByText('alpha').closest('.kh-file-row')
    expect(row?.getAttribute('draggable')).toBe('true')
  })

  test('file rows are not draggable without onMoveFile', () => {
    render(<KnowledgeTree {...baseProps} starred={new Set()} />)
    fireEvent.click(screen.getByText('Meeting Notes'))
    const row = screen.getByText('alpha').closest('.kh-file-row')
    expect(row?.getAttribute('draggable')).toBe('false')
  })

  test('dropping a file on a folder calls onMoveFile with dragged path and folder dest', () => {
    const onMoveFile = vi.fn()
    render(<KnowledgeTree {...baseProps} starred={new Set()} onMoveFile={onMoveFile} />)
    fireEvent.click(screen.getByText('Learnings'))
    const folder = screen.getByText('sub')
    const dataTransfer = dt('knowledge-hub/meetings/alpha.md')
    fireEvent.dragOver(folder, { dataTransfer })
    fireEvent.drop(folder, { dataTransfer })
    expect(onMoveFile).toHaveBeenCalledWith(
      'knowledge-hub/meetings/alpha.md',
      'knowledge-hub/learnings/sub'
    )
  })

  test('dropping a file on a source header targets the source root', () => {
    const onMoveFile = vi.fn()
    render(<KnowledgeTree {...baseProps} starred={new Set()} onMoveFile={onMoveFile} />)
    const header = screen.getByText('Learnings')
    const dataTransfer = dt('knowledge-hub/meetings/alpha.md')
    fireEvent.dragOver(header, { dataTransfer })
    fireEvent.drop(header, { dataTransfer })
    expect(onMoveFile).toHaveBeenCalledWith(
      'knowledge-hub/meetings/alpha.md',
      'knowledge-hub/learnings'
    )
  })

  test('dropping a file on a label-mode source header does not call onMoveFile', () => {
    const onMoveFile = vi.fn()
    const labelTree: Tree = {
      sources: [
        {
          id: 'meeting-notes',
          label: 'Meeting Notes',
          path: 'knowledge-hub/meeting-notes',
          mode: 'labels',
          children: [],
        },
      ],
    }
    render(
      <KnowledgeTree {...baseProps} tree={labelTree} starred={new Set()} onMoveFile={onMoveFile} />
    )
    const header = screen.getByText('Meeting Notes')
    const dataTransfer = dt('knowledge-hub/meeting-notes/alpha.md')
    fireEvent.dragOver(header, { dataTransfer })
    fireEvent.drop(header, { dataTransfer })
    expect(onMoveFile).not.toHaveBeenCalled()
  })

  test('a card-reorder drag commits a reorder and does not trigger onMoveFile', () => {
    const onMoveFile = vi.fn()
    const onReorder = vi.fn()
    render(
      <KnowledgeTree
        {...baseProps}
        starred={new Set()}
        onMoveFile={onMoveFile}
        onReorder={onReorder}
      />
    )
    const cardDt = {
      types: ['text/plain'],
      getData: vi.fn(() => 'kh-card'),
      setData: vi.fn(),
      dropEffect: '',
      effectAllowed: '',
    }
    // Start a real card-reorder drag from the FIRST source's drag handle
    // ("Meeting Notes", id 'meetings') — this is what actually sets the
    // component's internal dragId and flips `reordering` to true.
    const handle = screen.getAllByTitle('Drag to reorder')[0]
    fireEvent.dragStart(handle, { dataTransfer: cardDt })
    // Drag over and drop on a DIFFERENT source header ("Learnings") so a
    // reorder would actually be committed (dropping on itself is a no-op).
    const otherHeader = screen.getByText('Learnings')
    fireEvent.dragOver(otherHeader, { dataTransfer: cardDt, clientY: 9999 })
    fireEvent.drop(otherHeader, { dataTransfer: cardDt, clientY: 9999 })
    expect(onMoveFile).not.toHaveBeenCalled()
    expect(onReorder).toHaveBeenCalledWith(['learnings', 'meetings'])
  })
})
