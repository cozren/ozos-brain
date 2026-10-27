import { render, screen } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import { ResearchArticle } from '../ResearchArticle'
import type { ResearchSnapshot } from '../../../types/reporting'

const SNAPSHOT: ResearchSnapshot = {
  generated_at: '2026-07-01',
  purpose: 'research',
  summary: {
    searched: 'agentic shopping, C2C (24-72h)',
    found: 9,
    dropped: 3,
    strongest_signal: 'RESEARCH_SIGNAL_MARKER',
    clusters_represented: ['AI & shopping'],
    gaps: 'no EU regulator comment',
    confession: [{ dropped: 'old blog', reason: 'too old' }],
  },
  article: {
    title: 'The Agentic Shopping Shift',
    tldr: 'TLDR_MARKER paragraph summary.',
    sections: [
      { heading: 'SECTION_ONE_HEADING', body: 'Section one body.' },
      { heading: 'SECTION_TWO_HEADING', body: 'Section two body.' },
    ],
    sources: [
      { outlet: 'Reuters', date: '2d ago', url: 'https://reuters.com/x', url_verified: true },
      { outlet: 'RandomBlog', date: '5d ago', url: 'https://blog.example/y', url_verified: false },
    ],
  },
}

describe('ResearchArticle', () => {
  test('renders title, TL;DR and all sections', () => {
    render(<ResearchArticle data={SNAPSHOT} />)
    expect(screen.getByText('The Agentic Shopping Shift')).toBeInTheDocument()
    expect(screen.getByText(/TLDR_MARKER/)).toBeInTheDocument()
    expect(screen.getByText('SECTION_ONE_HEADING')).toBeInTheDocument()
    expect(screen.getByText('SECTION_TWO_HEADING')).toBeInTheDocument()
  })

  test('verified sources link out; unverified show a verify-manually note', () => {
    render(<ResearchArticle data={SNAPSHOT} />)
    const link = screen.getByRole('link', { name: /reuters/i })
    expect(link).toHaveAttribute('href', 'https://reuters.com/x')
    expect(screen.getByText(/verify manually/i)).toBeInTheDocument()
  })

  test('has a Copy button', () => {
    render(<ResearchArticle data={SNAPSHOT} />)
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })
})
