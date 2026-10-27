import { render, screen } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import { PrevGoalsReminder } from '../PrevGoalsReminder'

describe('PrevGoalsReminder', () => {
  test('shows the previous-cycle label and the carried goal titles', () => {
    render(
      <PrevGoalsReminder
        goals={[{ title: 'Grow strategy muscle', description: '', done: false }, 'Mentor juniors']}
      />
    )
    expect(screen.getByText(/growth goals from previous cycle/i)).toBeInTheDocument()
    expect(screen.getByText('Grow strategy muscle')).toBeInTheDocument()
    expect(screen.getByText('Mentor juniors')).toBeInTheDocument()
  })

  test('renders nothing when there are no previous goals', () => {
    const { container } = render(<PrevGoalsReminder goals={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
