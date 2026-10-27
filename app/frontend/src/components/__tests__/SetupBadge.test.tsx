import { render, screen, fireEvent } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { SetupBadge } from '../SetupBadge'

const summary = { done: 6, total: 14, open: 7, badge_dismissed: false }

test('shows progress, opens Setup on click and dismisses with the × button', () => {
  const onOpen = vi.fn()
  const onDismiss = vi.fn()
  render(<SetupBadge summary={summary} onOpen={onOpen} onDismiss={onDismiss} />)
  fireEvent.click(screen.getByRole('button', { name: 'Setup: 6 of 14 done' }))
  expect(onOpen).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss setup badge' }))
  expect(onDismiss).toHaveBeenCalled()
})

test('renders nothing when dismissed or when nothing is open', () => {
  const { container, rerender } = render(
    <SetupBadge
      summary={{ ...summary, badge_dismissed: true }}
      onOpen={vi.fn()}
      onDismiss={vi.fn()}
    />
  )
  expect(container).toBeEmptyDOMElement()
  rerender(<SetupBadge summary={{ ...summary, open: 0 }} onOpen={vi.fn()} onDismiss={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
})
