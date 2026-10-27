import { describe, test, expect } from 'vitest'
import { slugify, reorder, hubParentOptions } from '../folderTools'
import type { KnowledgeTree } from '../../../types/knowledge'

describe('slugify', () => {
  test('lowercases and hyphenates spaces', () => {
    expect(slugify('Team Retros')).toBe('team-retros')
  })
  test('strips unsafe characters and collapses hyphens', () => {
    expect(slugify('  My Cool Folder!!  ')).toBe('my-cool-folder')
  })
  test('treats underscores as separators', () => {
    expect(slugify('a_b__c')).toBe('a-b-c')
  })
  test('returns empty when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('   ')).toBe('')
  })
})

describe('reorder', () => {
  const ids = ['a', 'b', 'c', 'd']
  test('moves an id before the target', () => {
    expect(reorder(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c'])
  })
  test('moves an id after the target', () => {
    expect(reorder(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
  })
  test('no-op when dropping onto itself', () => {
    expect(reorder(ids, 'b', 'b', 'before')).toEqual(['a', 'b', 'c', 'd'])
  })
  test('returns a new array, does not mutate input', () => {
    const out = reorder(ids, 'a', 'b', 'after')
    expect(out).not.toBe(ids)
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })
  test('ignores unknown ids', () => {
    expect(reorder(ids, 'x', 'b', 'before')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('hubParentOptions', () => {
  const tree: KnowledgeTree = {
    sources: [
      {
        id: 'ai-learning',
        label: 'AI Learning',
        path: 'knowledge-hub/ai-learning',
        children: [
          {
            name: 'retros',
            path: 'knowledge-hub/ai-learning/retros',
            type: 'dir',
            mtime: 1,
            children: [],
          },
          { name: 'note.md', path: 'knowledge-hub/ai-learning/note.md', type: 'file', mtime: 1 },
        ],
      },
      { id: 'docs', label: 'Docs', path: 'docs', children: [] },
    ],
  }

  test('includes the hub root first', () => {
    const opts = hubParentOptions(tree)
    expect(opts[0]).toMatchObject({ value: 'knowledge-hub', depth: 0 })
  })
  test('includes hub sources and their nested dirs, indented by depth', () => {
    const values = hubParentOptions(tree).map((o) => o.value)
    expect(values).toContain('knowledge-hub/ai-learning')
    expect(values).toContain('knowledge-hub/ai-learning/retros')
  })
  test('excludes non-hub sources like docs', () => {
    const values = hubParentOptions(tree).map((o) => o.value)
    expect(values).not.toContain('docs')
  })
  test('excludes files (dirs only)', () => {
    const values = hubParentOptions(tree).map((o) => o.value)
    expect(values).not.toContain('knowledge-hub/ai-learning/note.md')
  })
})
