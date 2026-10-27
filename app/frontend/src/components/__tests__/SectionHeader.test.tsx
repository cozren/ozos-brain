import { render, screen } from '@testing-library/react'
import { SectionHeader } from '../SectionHeader'

test('renders the label text', () => {
  render(<SectionHeader label="GROWTH GOALS" />)
  expect(screen.getByText('GROWTH GOALS')).toBeInTheDocument()
})

test('renders a right-slot when provided', () => {
  render(<SectionHeader label="KEY ACCOMPLISHMENTS" right={<span>4</span>} />)
  expect(screen.getByText('4')).toBeInTheDocument()
})
