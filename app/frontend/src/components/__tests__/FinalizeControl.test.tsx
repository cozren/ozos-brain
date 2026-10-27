import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { FinalizeControl } from '../FinalizeControl'

describe('FinalizeControl', () => {
  test('an active cycle offers Finalize, which calls onFinalize', () => {
    const onFinalize = vi.fn()
    render(<FinalizeControl status="active" onFinalize={onFinalize} onReopen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /finalize/i }))
    expect(onFinalize).toHaveBeenCalled()
  })

  test('a finalized cycle shows a badge and a Reopen action that calls onReopen', () => {
    const onReopen = vi.fn()
    render(<FinalizeControl status="finalized" onFinalize={vi.fn()} onReopen={onReopen} />)
    expect(screen.getByText(/finalized/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }))
    expect(onReopen).toHaveBeenCalled()
  })
})
