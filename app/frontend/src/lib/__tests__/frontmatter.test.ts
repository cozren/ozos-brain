import { describe, test, expect } from 'vitest'
import { stripFrontmatter } from '../frontmatter'

describe('stripFrontmatter', () => {
  test('removes a leading YAML frontmatter block', () => {
    const doc = [
      '---',
      'confluence: https://example.com/page',
      'tags: [ads]',
      '---',
      '',
      '# Title',
      'Body.',
    ].join('\n')
    expect(stripFrontmatter(doc)).toBe('# Title\nBody.')
  })

  test('leaves a document without frontmatter untouched', () => {
    const doc = '# Title\n\nBody with --- a dash run in it.'
    expect(stripFrontmatter(doc)).toBe(doc)
  })

  test('does not treat a horizontal rule mid-document as frontmatter', () => {
    const doc = '# Title\n\n---\n\nMore body.'
    expect(stripFrontmatter(doc)).toBe(doc)
  })

  test('leaves the document untouched when the closing fence is missing', () => {
    const doc = '---\ntags: [ads]\n\n# Title'
    expect(stripFrontmatter(doc)).toBe(doc)
  })

  test('handles an empty frontmatter block', () => {
    expect(stripFrontmatter('---\n---\n\n# Title')).toBe('# Title')
  })

  test('only matches a fence that is a whole line', () => {
    // A quoted YAML value containing "---" must not end the block early.
    const doc = ['---', 'title: "a --- b"', 'tags: [x]', '---', '', '# Title'].join('\n')
    expect(stripFrontmatter(doc)).toBe('# Title')
  })
})
