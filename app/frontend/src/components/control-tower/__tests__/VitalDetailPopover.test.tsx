import { render, screen, fireEvent } from '@testing-library/react'
import { VitalDetailPopover } from '../VitalDetailPopover'
import type { VitalDetail } from '../../../types/control-tower'

const detail = (over: Partial<VitalDetail> = {}): VitalDetail => ({
  id: 'meeting-notes',
  lastRunIso: '2026-06-17T10:00:00+00:00',
  lastRunHuman: '3h ago',
  delta: '+2',
  todayCount: 2,
  items: ['Taylor/Jordan Performance review', 'Robin weekly'],
  ...over,
})

test('summary shows last run and the count added just now', () => {
  render(<VitalDetailPopover detail={detail()} loading={false} onClose={vi.fn()} />)
  expect(screen.getByText(/3h ago/)).toBeInTheDocument()
  expect(screen.getByText(/\+2/)).toBeInTheDocument()
  expect(screen.getByText(/just now/i)).toBeInTheDocument()
})

test('"more" reveals the list of everything added today', () => {
  render(<VitalDetailPopover detail={detail()} loading={false} onClose={vi.fn()} />)
  expect(screen.queryByText('Robin weekly')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /more/i }))
  expect(screen.getByText(/added today/i)).toBeInTheDocument()
  expect(screen.getByText('Robin weekly')).toBeInTheDocument()
  expect(screen.getByText('Taylor/Jordan Performance review')).toBeInTheDocument()
})

test('shows a loading state while detail is null and loading', () => {
  render(<VitalDetailPopover detail={null} loading={true} onClose={vi.fn()} />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
})

test('shows an empty-today note when nothing was added today', () => {
  render(
    <VitalDetailPopover
      detail={detail({ items: [], delta: '+0', todayCount: 0 })}
      loading={false}
      onClose={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /more/i }))
  expect(screen.getByText(/nothing added today/i)).toBeInTheDocument()
})
