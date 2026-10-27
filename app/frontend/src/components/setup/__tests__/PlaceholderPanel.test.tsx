import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { PlaceholderPanel } from '../PlaceholderPanel'

test('names the phase that delivers the item', () => {
  render(<PlaceholderPanel itemId="define-goals" />)
  expect(screen.getByText('Arrives in Phase 3. Skip this for now.')).toBeInTheDocument()
})

test('data points are Phase 4', () => {
  render(<PlaceholderPanel itemId="first-data-point" />)
  expect(screen.getByText('Arrives in Phase 4. Skip this for now.')).toBeInTheDocument()
})
