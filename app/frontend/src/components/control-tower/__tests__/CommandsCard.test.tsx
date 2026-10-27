import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect } from 'vitest'
import { CommandsCard } from '../CommandsCard'
import type { CommandEntry } from '../../../types/control-tower'

const cmd = (over: Partial<CommandEntry> = {}): CommandEntry => ({
  name: 'git',
  description: 'Save work to git.',
  usageCount: 3,
  lastUsed: '2h ago',
  contextTokens: 400,
  ...over,
})

describe('CommandsCard', () => {
  test('renders each command name and the count badge', () => {
    render(<CommandsCard commands={[cmd(), cmd({ name: 'commit', usageCount: 0 })]} />)
    expect(screen.getByText('git')).toBeInTheDocument()
    expect(screen.getByText('commit')).toBeInTheDocument()
    // Count badge shows the total number of commands.
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('clicking a command reveals its description', () => {
    render(<CommandsCard commands={[cmd({ description: 'Ship the build to prod' })]} />)
    expect(screen.queryByText('Ship the build to prod')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('git'))
    expect(screen.getByText('Ship the build to prod')).toBeInTheDocument()
  })

  test('shows the usage multiplier when a command has been used', () => {
    render(<CommandsCard commands={[cmd({ name: 'git', usageCount: 5 })]} />)
    expect(screen.getByText('5×')).toBeInTheDocument()
  })
})
