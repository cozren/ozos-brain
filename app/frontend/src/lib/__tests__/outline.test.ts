import { describe, test, expect } from 'vitest'
import { extractOutline } from '../outline'

describe('extractOutline', () => {
  test('captures H1 and H2 in document order', () => {
    const md = '# Title\n\nintro\n\n## Section A\n\nbody\n\n## Section B\n'
    expect(extractOutline(md)).toEqual([
      { depth: 1, text: 'Title' },
      { depth: 2, text: 'Section A' },
      { depth: 2, text: 'Section B' },
    ])
  })

  test('ignores H3 and deeper', () => {
    const md = '## Main\n\n### Sub\n\n#### Deeper\n'
    expect(extractOutline(md)).toEqual([{ depth: 2, text: 'Main' }])
  })

  test('ignores # lines inside fenced code blocks', () => {
    const md = '# Real\n\n```bash\n# not a heading\n## also not\n```\n\n## Real Two\n'
    expect(extractOutline(md)).toEqual([
      { depth: 1, text: 'Real' },
      { depth: 2, text: 'Real Two' },
    ])
  })

  test('handles ~~~ fenced blocks too', () => {
    const md = '# Real\n\n~~~\n## hidden\n~~~\n'
    expect(extractOutline(md)).toEqual([{ depth: 1, text: 'Real' }])
  })

  test('strips trailing ATX closing hashes', () => {
    expect(extractOutline('## Section ##\n')).toEqual([{ depth: 2, text: 'Section' }])
  })

  test('keeps an internal hash in heading text', () => {
    expect(extractOutline('## C# basics\n')).toEqual([{ depth: 2, text: 'C# basics' }])
  })

  test('returns empty array for a doc with no H1/H2', () => {
    expect(extractOutline('just text\n\n### only sub\n')).toEqual([])
  })
})
