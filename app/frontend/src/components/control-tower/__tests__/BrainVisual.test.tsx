import { render, waitFor } from '@testing-library/react'
import { vi, describe, test, expect } from 'vitest'
import { BrainVisual } from '../BrainVisual'

vi.mock('../NeuralBrain', () => ({ NeuralBrain: () => <div data-testid="neural-brain" /> }))
vi.mock('../../../api', () => ({ api: { getMe: vi.fn() } }))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

const greeting = (container: HTMLElement) =>
  container.querySelector('[data-full-greeting]')?.getAttribute('data-full-greeting') ?? ''

describe('BrainVisual greeting', () => {
  test('greets the configured user by name', async () => {
    const api = await importApi()
    api.getMe.mockResolvedValue({ name: 'Taylor', me: 'taylor' })
    const { container } = render(<BrainVisual />)
    await waitFor(() => expect(greeting(container)).toMatch(/, Taylor$/))
  })

  test('greets without a name when none is configured', async () => {
    const api = await importApi()
    api.getMe.mockResolvedValue({ name: '', me: 'me' })
    const { container } = render(<BrainVisual />)
    await waitFor(() => expect(api.getMe).toHaveBeenCalled())
    expect(greeting(container)).toMatch(/^(Good (morning|afternoon|evening)|Hello)$/)
  })
})
