import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { IndustryPulse } from '../IndustryPulse'
import type { IndustryPulseSnapshot } from '../../../types/reporting'

const DATA: IndustryPulseSnapshot = {
  generated_at: '2026-06-28',
  summary: {
    searched: 'Vinted, Depop, eBay (24-48h); AI shopping (7d); regulation (7d).',
    found: 11,
    dropped: 4,
    strongest_signal: 'Vinted rolled out AI listing authentication across the EU.',
    clusters_represented: ['C2C platforms', 'AI & shopping'],
    gaps: 'Could not verify the Idealo traffic figure to a primary source.',
    confession: [{ dropped: 'Generic resale-is-growing piece', reason: 'no new data' }],
  },
  posts: [
    {
      n: 1,
      template: 'A',
      template_name: 'The sharp take',
      cluster: 'C2C platforms and secondhand marketplaces',
      source_outlet: 'TechCrunch',
      source_date: '2d ago',
      source_url: 'https://techcrunch.com/2026/06/26/vinted-ai-auth',
      url_verified: true,
      text: 'Vinted just made authentication the product, not a feature. '.repeat(4).trim(),
      scoring: { confidence: 'High', post_worthiness: 'Strong', freshness: 'Breaking' },
    },
    {
      n: 2,
      template: 'B',
      template_name: 'The data anchor',
      cluster: 'Consumer behavior',
      source_outlet: 'ThredUp',
      source_date: '5d ago',
      url_verified: false,
      text: 'Tiny post.',
      scoring: { confidence: 'Medium', post_worthiness: 'Medium', freshness: 'Recent' },
    },
  ],
}

describe('IndustryPulse', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  test('renders the strongest signal and one card per post', () => {
    render(<IndustryPulse data={DATA} />)
    expect(screen.getByText(/Vinted rolled out AI listing authentication/)).toBeInTheDocument()
    expect(screen.getAllByTestId('pulse-post')).toHaveLength(2)
  })

  test('shows internal scoring badges on a card', () => {
    render(<IndustryPulse data={DATA} />)
    const first = screen.getAllByTestId('pulse-post')[0]
    expect(within(first).getByText(/High/)).toBeInTheDocument()
    expect(within(first).getByText(/Strong/)).toBeInTheDocument()
    expect(within(first).getByText(/Breaking/)).toBeInTheDocument()
  })

  test('copy button writes the post text to the clipboard', async () => {
    render(<IndustryPulse data={DATA} />)
    const first = screen.getAllByTestId('pulse-post')[0]
    await userEvent.click(within(first).getByRole('button', { name: /copy/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(DATA.posts[0].text)
  })

  test('Post to LinkedIn button is visible but disabled', () => {
    render(<IndustryPulse data={DATA} />)
    const first = screen.getAllByTestId('pulse-post')[0]
    expect(within(first).getByRole('button', { name: /post to linkedin/i })).toBeDisabled()
  })

  test('flags a post whose word count is outside 80-180', () => {
    render(<IndustryPulse data={DATA} />)
    const second = screen.getAllByTestId('pulse-post')[1] // "Tiny post." = 2 words
    expect(within(second).getByText(/2 words/)).toHaveClass('pulse-post__count--warn')
  })

  test('flags an unverified source URL for manual checking', () => {
    render(<IndustryPulse data={DATA} />)
    const second = screen.getAllByTestId('pulse-post')[1]
    expect(within(second).getByText(/verify manually/i)).toBeInTheDocument()
  })
})
