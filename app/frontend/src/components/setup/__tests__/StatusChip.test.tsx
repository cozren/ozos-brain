import { render, screen } from '@testing-library/react'
import { StatusChip } from '../StatusChip'

test('renders the status label and exposes the status for styling', () => {
  render(<StatusChip status="needs_attention" />)
  const chip = screen.getByText('Needs attention')
  expect(chip).toHaveAttribute('data-status', 'needs_attention')
})
