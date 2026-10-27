import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

const noop = () => {}

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onNavigate = overrides.onNavigate ?? noop
  render(
    <Sidebar
      activePage={overrides.activePage ?? 'goals-tasks'}
      onNavigate={onNavigate}
      navState={overrides.navState ?? 1}
      onNavStateChange={overrides.onNavStateChange ?? noop}
    />
  )
  return { onNavigate }
}

test('clicking the OZOS Brain logo navigates home', () => {
  const onNavigate = vi.fn()
  renderSidebar({ onNavigate })
  fireEvent.click(screen.getByText('OZOS Brain'))
  expect(onNavigate).toHaveBeenCalledWith('home')
})

test('does not render a separate "Home" nav item — the logo is the Home button', () => {
  renderSidebar()
  expect(screen.queryByText('Home', { exact: true })).toBeNull()
  // Sanity: the other nav items still render.
  expect(screen.getByText('Goals & Tasks')).toBeInTheDocument()
  expect(screen.getByText('System Health')).toBeInTheDocument()
})

test('renders the Control Tower nav item and it is the first item in the nav', () => {
  renderSidebar()
  const controlTower = screen.getByText('Control Tower')
  const goalsTasks = screen.getByText('Goals & Tasks')
  expect(controlTower).toBeInTheDocument()
  // Control Tower must come before every other nav item in DOM order.
  expect(
    controlTower.compareDocumentPosition(goalsTasks) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})

test('navigates to control-tower when the Control Tower item is clicked', () => {
  const onNavigate = vi.fn()
  renderSidebar({ onNavigate })
  fireEvent.click(screen.getByText('Control Tower'))
  expect(onNavigate).toHaveBeenCalledWith('control-tower')
})

test('renamed System Health item navigates to the system-health page', () => {
  const onNavigate = vi.fn()
  renderSidebar({ onNavigate })
  fireEvent.click(screen.getByText('System Health'))
  expect(onNavigate).toHaveBeenCalledWith('system-health')
})

test('no longer renders the old "Control Hub" label', () => {
  renderSidebar()
  expect(screen.queryByText('Control Hub')).toBeNull()
})

test('renders the Insights Hub nav item (renamed from Reporting) and navigates to the reporting page', () => {
  const onNavigate = vi.fn()
  renderSidebar({ onNavigate })
  expect(screen.queryByText('Reporting')).toBeNull()
  fireEvent.click(screen.getByText('Insights Hub'))
  expect(onNavigate).toHaveBeenCalledWith('reporting')
})

test('renders a Setup nav item first (right under the logo) and navigates to setup', () => {
  const onNavigate = vi.fn()
  renderSidebar({ onNavigate })
  const setup = screen.getByText('Setup')
  const controlTower = screen.getByText('Control Tower')
  expect(
    setup.compareDocumentPosition(controlTower) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  fireEvent.click(setup)
  expect(onNavigate).toHaveBeenCalledWith('setup')
})
