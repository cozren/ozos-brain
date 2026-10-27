import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ChatMarkdown } from '../ChatMarkdown'

describe('ChatMarkdown', () => {
  test('renders GFM tables as real tables', () => {
    render(<ChatMarkdown content={'| A | B |\n| --- | --- |\n| 1 | 2 |'} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('A')).toBeInTheDocument()
    expect(screen.queryByText(/--- \|/)).not.toBeInTheDocument()
  })

  test('renders headings and bold', () => {
    render(<ChatMarkdown content={'### Section\n**key** point'} />)
    expect(screen.getByText('Section')).toBeInTheDocument()
    expect(screen.getByText('key')).toBeInTheDocument()
  })
})
