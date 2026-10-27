import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { GoalsSection } from '../GoalsSection'

const goal = (over = {}) => ({ title: 'Goal', description: '', done: false, ...over })

test('renders goal titles', () => {
  render(<GoalsSection goals={[goal({ title: 'Ship it' })]} onChange={vi.fn()} />)
  expect(screen.getByText('Ship it')).toBeInTheDocument()
})

test('tolerates legacy bare-string goals', () => {
  render(<GoalsSection goals={['Old style goal']} onChange={vi.fn()} />)
  expect(screen.getByText('Old style goal')).toBeInTheDocument()
})

test('shows a checkmark done toggle by default (goals)', () => {
  render(<GoalsSection goals={[goal()]} onChange={vi.fn()} />)
  expect(screen.getByTitle(/mark as/i).textContent).toBe('✓')
})

test('achievement mode renders a trophy icon and no done toggle', () => {
  render(<GoalsSection goals={[goal()]} onChange={vi.fn()} achievement />)
  expect(screen.getByRole('img', { name: /achievement/i })).toBeInTheDocument()
  expect(screen.queryByTitle(/mark as/i)).not.toBeInTheDocument()
})

test('achievement mode never strikes through the title, even when done', () => {
  render(
    <GoalsSection
      goals={[goal({ title: 'Won the award', done: true })]}
      onChange={vi.fn()}
      achievement
    />
  )
  expect(screen.getByText('Won the award')).toHaveStyle({ textDecoration: 'none' })
})

test('adding a goal emits a {title, description, done} object', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[]} onChange={onChange} placeholder="Add goal..." />)
  fireEvent.change(screen.getByPlaceholderText('Add goal...'), { target: { value: 'New goal' } })
  fireEvent.keyDown(screen.getByPlaceholderText('Add goal...'), { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith([{ title: 'New goal', description: '', done: false }])
})

test('description read view is hidden until the chevron is clicked', () => {
  render(<GoalsSection goals={[goal({ description: 'plain desc' })]} onChange={vi.fn()} />)
  expect(screen.queryByText('plain desc')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTitle('Toggle description'))
  expect(screen.getByText('plain desc')).toBeInTheDocument()
})

test('expanded read view renders markdown (bold becomes <strong>)', () => {
  render(<GoalsSection goals={[goal({ description: '**bold bit**' })]} onChange={vi.fn()} />)
  fireEvent.click(screen.getByTitle('Toggle description'))
  expect(screen.getByText('bold bit').tagName).toBe('STRONG')
})

test('single newlines in the description render as line breaks', () => {
  const { container } = render(
    <GoalsSection goals={[goal({ description: 'line one\nline two' })]} onChange={vi.fn()} />
  )
  fireEvent.click(screen.getByTitle('Toggle description'))
  expect(container.querySelector('br')).toBeInTheDocument()
})

test('the editor opens on double-click of the title', () => {
  render(<GoalsSection goals={[goal()]} onChange={vi.fn()} />)
  expect(screen.queryByPlaceholderText(/description/i)).not.toBeInTheDocument()
  fireEvent.dblClick(screen.getByText('Goal'))
  expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
})

test('double-clicking the description read view opens the editor', () => {
  render(<GoalsSection goals={[goal({ description: 'plain desc' })]} onChange={vi.fn()} />)
  fireEvent.click(screen.getByTitle('Toggle description'))
  fireEvent.dblClick(screen.getByText('plain desc'))
  expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
})

test('editing the description emits the updated goal', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal()]} onChange={onChange} />)
  fireEvent.dblClick(screen.getByText('Goal'))
  fireEvent.change(screen.getByPlaceholderText(/description/i), {
    target: { value: 'do the thing' },
  })
  expect(onChange).toHaveBeenCalledWith([
    { title: 'Goal', description: 'do the thing', done: false },
  ])
})

test('editing the title emits the updated goal', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ description: 'keep me' })]} onChange={onChange} />)
  fireEvent.dblClick(screen.getByText('Goal'))
  fireEvent.change(screen.getByDisplayValue('Goal'), { target: { value: 'Goal renamed' } })
  expect(onChange).toHaveBeenCalledWith([
    { title: 'Goal renamed', description: 'keep me', done: false },
  ])
})

test('typing in the description survives an unrelated parent re-render (no caret reset)', () => {
  function Harness() {
    const [, force] = useState(0)
    const goals = [{ title: 'Goal', description: 'a', done: false }]
    return <GoalsSection goals={goals} onChange={() => force((n) => n + 1)} />
  }
  render(<Harness />)
  fireEvent.dblClick(screen.getByText('Goal'))
  const ta = screen.getByPlaceholderText(/description/i) as HTMLTextAreaElement
  fireEvent.change(ta, { target: { value: 'ab' } })
  expect(ta.value).toBe('ab')
  fireEvent.change(ta, { target: { value: 'abc' } })
  expect(ta.value).toBe('abc')
})

test('there is no formatting toolbar (keyboard-driven only)', () => {
  render(<GoalsSection goals={[goal()]} onChange={vi.fn()} />)
  fireEvent.dblClick(screen.getByText('Goal'))
  expect(screen.queryByTitle('Bold')).not.toBeInTheDocument()
  expect(screen.queryByTitle('Bullet list')).not.toBeInTheDocument()
})

test('Cmd/Ctrl+B wraps the selected description text in markdown bold', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ description: 'hello' })]} onChange={onChange} />)
  fireEvent.dblClick(screen.getByText('Goal'))
  const ta = screen.getByPlaceholderText(/description/i) as HTMLTextAreaElement
  ta.setSelectionRange(0, 5)
  fireEvent.keyDown(ta, { key: 'b', metaKey: true })
  expect(onChange).toHaveBeenCalledWith([{ title: 'Goal', description: '**hello**', done: false }])
})

test('delete is only available inside the opened editor', () => {
  render(<GoalsSection goals={[goal({ title: 'A' })]} onChange={vi.fn()} />)
  expect(screen.queryByText('DELETE')).not.toBeInTheDocument()
  fireEvent.dblClick(screen.getByText('A'))
  expect(screen.getByText('DELETE')).toBeInTheDocument()
})

test('deleting a goal removes it from the list', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ title: 'A' }), goal({ title: 'B' })]} onChange={onChange} />)
  fireEvent.dblClick(screen.getByText('A'))
  fireEvent.click(screen.getByText('DELETE'))
  expect(onChange).toHaveBeenCalledWith([{ title: 'B', description: '', done: false }])
})

test('toggling the done control emits done: true', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ title: 'A' })]} onChange={onChange} />)
  fireEvent.click(screen.getByTitle('Mark as done'))
  expect(onChange).toHaveBeenCalledWith([{ title: 'A', description: '', done: true }])
})

test('a done goal exposes an undo control instead', () => {
  render(<GoalsSection goals={[goal({ title: 'A', done: true })]} onChange={vi.fn()} />)
  expect(screen.getByTitle('Mark as not done')).toBeInTheDocument()
  expect(screen.queryByTitle('Mark as done')).not.toBeInTheDocument()
})

test('a done goal renders with a green glow', () => {
  render(<GoalsSection goals={[goal({ title: 'A', done: true })]} onChange={vi.fn()} />)
  const row = screen.getByTestId('goal-row-0')
  expect(row.style.boxShadow).toMatch(/0, *255, *136|0,255,136|rgba\(0, ?255, ?136/i)
})

test('goals are numbered by their position (1-based, top-down)', () => {
  render(<GoalsSection goals={[goal({ title: 'A' }), goal({ title: 'B' })]} onChange={vi.fn()} />)
  expect(screen.getByTestId('goal-number-0')).toHaveTextContent('1')
  expect(screen.getByTestId('goal-number-1')).toHaveTextContent('2')
})

test('dragging a goal onto another position reorders the list', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ title: 'A' }), goal({ title: 'B' })]} onChange={onChange} />)
  fireEvent.dragStart(screen.getByTestId('goal-drag-0'))
  fireEvent.dragOver(screen.getByTestId('goal-row-1'))
  fireEvent.drop(screen.getByTestId('goal-row-1'))
  expect(onChange).toHaveBeenCalledWith([
    { title: 'B', description: '', done: false },
    { title: 'A', description: '', done: false },
  ])
})

test('dropping a goal on its own position is a no-op', () => {
  const onChange = vi.fn()
  render(<GoalsSection goals={[goal({ title: 'A' }), goal({ title: 'B' })]} onChange={onChange} />)
  fireEvent.dragStart(screen.getByTestId('goal-drag-0'))
  fireEvent.drop(screen.getByTestId('goal-row-0'))
  expect(onChange).not.toHaveBeenCalled()
})
