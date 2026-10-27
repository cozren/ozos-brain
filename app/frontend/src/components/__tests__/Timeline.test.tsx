import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { Timeline } from '../Timeline'
import type { CyclesData } from '../../types'

const mockCycles: CyclesData = {
  active_cycle: '2026-deep-dive',
  cycles: {
    '2026-deep-dive': {
      name: 'Deep Dive 2026',
      type: 'deep-dive',
      events: [
        { id: 'self-assessment', label: 'Self Assessment', start: '2026-04-09', end: '2026-04-24' },
        { id: 'manager-review', label: 'Manager Review', start: '2026-04-15', end: '2026-05-08' },
      ],
    },
    '2026-light-touch': {
      name: 'Light Touch Q3 2026',
      type: 'light-touch',
      events: [
        {
          id: 'manager-conversation',
          label: 'Manager Conversation',
          start: '2026-10-01',
          end: '2026-10-31',
        },
      ],
    },
  },
}

function renderTimeline(overrides: Record<string, unknown> = {}) {
  const props = {
    cycles: mockCycles,
    selectedId: '2026-deep-dive',
    onSelectCycle: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onEventUpdate: vi.fn(),
    onCycleRename: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<Timeline {...(props as never)} />) }
}

describe('Timeline', () => {
  test('renders the selected cycle event labels', () => {
    renderTimeline()
    expect(screen.getByText('Self Assessment')).toBeInTheDocument()
    expect(screen.getByText('Manager Review')).toBeInTheDocument()
  })

  test('shows the selected cycle name', () => {
    renderTimeline()
    expect(screen.getByText(/Deep Dive 2026/i)).toBeInTheDocument()
  })

  test('renders the SELECTED cycle, not the active one', () => {
    renderTimeline({ selectedId: '2026-light-touch' })
    expect(screen.getByText('Manager Conversation')).toBeInTheDocument()
    expect(screen.queryByText('Self Assessment')).not.toBeInTheDocument()
  })

  test('date range shows formatted range text', () => {
    renderTimeline()
    expect(screen.getByText(/9 Apr/)).toBeInTheDocument()
  })

  test('clicking a date range opens the calendar picker', () => {
    renderTimeline()
    fireEvent.click(screen.getAllByTitle('Click to pick date range')[0])
    expect(screen.getByText(/SELECT START DATE|SELECT END DATE/i)).toBeInTheDocument()
  })

  test('the switcher lists the other cycles and selecting one calls onSelectCycle', () => {
    const onSelectCycle = vi.fn()
    renderTimeline({ onSelectCycle })
    fireEvent.click(screen.getByTitle('Switch cycle'))
    fireEvent.click(screen.getByText('Light Touch Q3 2026'))
    expect(onSelectCycle).toHaveBeenCalledWith('2026-light-touch')
  })

  test('the new-cycle form submits name and type to onCreate', () => {
    const onCreate = vi.fn()
    renderTimeline({ onCreate })
    fireEvent.click(screen.getByTitle('Switch cycle'))
    fireEvent.click(screen.getByRole('button', { name: /new cycle/i }))
    fireEvent.change(screen.getByPlaceholderText(/cycle name/i), {
      target: { value: 'Deep Dive 2027' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreate).toHaveBeenCalledWith('Deep Dive 2027', expect.any(String))
  })

  test('delete calls onDelete with the selected cycle id', () => {
    const onDelete = vi.fn()
    renderTimeline({ onDelete })
    fireEvent.click(screen.getByTitle('Switch cycle'))
    fireEvent.click(screen.getByTitle('Delete this cycle'))
    expect(onDelete).toHaveBeenCalledWith('2026-deep-dive')
  })

  test('delete is disabled when only one cycle remains', () => {
    const single: CyclesData = {
      active_cycle: '2026-deep-dive',
      cycles: { '2026-deep-dive': mockCycles.cycles['2026-deep-dive'] },
    }
    renderTimeline({ cycles: single })
    fireEvent.click(screen.getByTitle('Switch cycle'))
    expect(screen.getByTitle('Delete this cycle')).toBeDisabled()
  })
})
