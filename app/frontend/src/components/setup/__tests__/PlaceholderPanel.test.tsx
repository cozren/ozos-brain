import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { PlaceholderPanel } from '../PlaceholderPanel'

test('data points are Phase 4', () => {
  render(<PlaceholderPanel itemId="first-data-point" />)
  expect(screen.getByText('Arrives in Phase 4. Skip this for now.')).toBeInTheDocument()
})

test('an item without a known phase gets the generic line', () => {
  render(<PlaceholderPanel itemId="define-goals" />)
  expect(screen.getByText('Arrives in a later phase.')).toBeInTheDocument()
})
