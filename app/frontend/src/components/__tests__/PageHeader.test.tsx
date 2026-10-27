import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PageHeader } from '../PageHeader'

test('renders the title as a level-1 heading', () => {
  render(<PageHeader title="Reporting" />)
  expect(screen.getByRole('heading', { level: 1, name: 'Reporting' })).toBeInTheDocument()
})

test('renders the subtitle when provided', () => {
  render(<PageHeader title="Data Hub" subtitle="Data workspace — content coming soon." />)
  expect(screen.getByText('Data workspace — content coming soon.')).toBeInTheDocument()
})

test('omits the subtitle when not provided', () => {
  render(<PageHeader title="Reporting" />)
  expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument()
})

test('renders the right-aligned emblem icon when provided', () => {
  render(<PageHeader title="People Hub" icon={<span data-testid="ph-icon">★</span>} />)
  expect(screen.getByTestId('ph-icon')).toBeInTheDocument()
})

test('renders inline controls passed as children', () => {
  render(
    <PageHeader title="Knowledge Hub" sticky={false}>
      <button>Refresh</button>
    </PageHeader>
  )
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
})

// An internally-scrolling page (sticky={false}) can still auto-hide the header
// by collapsing it, driven by scrolls anywhere inside a container ref. This is
// how Data Hub / Knowledge Hub get the same disappear-on-scroll effect as the
// pages that scroll the whole app shell.
function CollapseHarness() {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef}>
      <PageHeader title="Data Hub" sticky={false} collapseScrollRef={containerRef} />
      <div data-testid="scroller" style={{ height: 100, overflow: 'auto' }}>
        <div style={{ height: 1000 }} />
      </div>
    </div>
  )
}

test('collapses on scroll-down and reveals on scroll-up inside the collapse container', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  try {
    render(<CollapseHarness />)
    const header = screen.getByRole('heading', { name: 'Data Hub' }).closest('header')!
    const scroller = screen.getByTestId('scroller')

    expect(header).toHaveAttribute('data-hidden', 'false')

    // Scroll down past the threshold → header hides.
    scroller.scrollTop = 200
    fireEvent.scroll(scroller)
    expect(header).toHaveAttribute('data-hidden', 'true')

    // Scroll back up, after the collapse transition has settled → header reveals.
    now.mockReturnValue(1000)
    scroller.scrollTop = 80
    fireEvent.scroll(scroller)
    expect(header).toHaveAttribute('data-hidden', 'false')
  } finally {
    now.mockRestore()
  }
})

// Collapsing the header reclaims its space, which grows the scroll container and
// can bounce scrollTop back — that must NOT immediately re-toggle the header,
// or the tab bar below it visibly jumps. A short lock after each toggle absorbs
// the reflow-induced scroll events.
test('does not re-toggle on a scroll bounce during the collapse transition', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  try {
    render(<CollapseHarness />)
    const header = screen.getByRole('heading', { name: 'Data Hub' }).closest('header')!
    const scroller = screen.getByTestId('scroller')

    scroller.scrollTop = 200
    fireEvent.scroll(scroller)
    expect(header).toHaveAttribute('data-hidden', 'true')

    // A reflow bounce (scrollTop drops) within the transition window is ignored.
    now.mockReturnValue(40)
    scroller.scrollTop = 150
    fireEvent.scroll(scroller)
    expect(header).toHaveAttribute('data-hidden', 'true')
  } finally {
    now.mockRestore()
  }
})
