import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotesSection } from '../NotesSection'

test('renders the section label', () => {
  render(<NotesSection value="" onChange={vi.fn()} />)
  expect(screen.getByText('PERSONAL NOTES')).toBeInTheDocument()
})

test('renders an existing note as markdown (bold becomes <strong>)', () => {
  render(<NotesSection value="**remember this**" onChange={vi.fn()} />)
  expect(screen.getByText('remember this').tagName).toBe('STRONG')
})

test('single newlines render as line breaks', () => {
  const { container } = render(<NotesSection value={'line one\nline two'} onChange={vi.fn()} />)
  expect(container.querySelector('br')).toBeInTheDocument()
})

test('empty state shows a hint and no rendered note', () => {
  render(<NotesSection value="" onChange={vi.fn()} />)
  expect(screen.getByText(/double-click to add/i)).toBeInTheDocument()
})

test('double-clicking opens the editor seeded with the current note', () => {
  render(<NotesSection value="my note" onChange={vi.fn()} />)
  expect(screen.queryByPlaceholderText(/note/i)).not.toBeInTheDocument()
  fireEvent.dblClick(screen.getByText('my note'))
  expect((screen.getByPlaceholderText(/note/i) as HTMLTextAreaElement).value).toBe('my note')
})

test('editing the note emits the new text', () => {
  const onChange = vi.fn()
  render(<NotesSection value="" onChange={onChange} />)
  fireEvent.dblClick(screen.getByText(/double-click to add/i))
  fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'a learning' } })
  expect(onChange).toHaveBeenCalledWith('a learning')
})

test('Cmd/Ctrl+B wraps the selected note text in markdown bold', () => {
  const onChange = vi.fn()
  render(<NotesSection value="hello" onChange={onChange} />)
  fireEvent.dblClick(screen.getByText('hello'))
  const ta = screen.getByPlaceholderText(/note/i) as HTMLTextAreaElement
  ta.setSelectionRange(0, 5)
  fireEvent.keyDown(ta, { key: 'b', metaKey: true })
  expect(onChange).toHaveBeenCalledWith('**hello**')
})

test('shows a visible Edit affordance in read mode when a note exists', () => {
  render(<NotesSection value="my note" onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: /edit notes/i })).toBeInTheDocument()
})

test('shows the Edit affordance even when empty, so editing is discoverable', () => {
  render(<NotesSection value="" onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: /edit notes/i })).toBeInTheDocument()
})

test('clicking the Edit affordance opens the editor seeded with the current note', () => {
  render(<NotesSection value="my note" onChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /edit notes/i }))
  expect((screen.getByPlaceholderText(/note/i) as HTMLTextAreaElement).value).toBe('my note')
})

test('typing survives an unrelated parent re-render (no caret reset)', () => {
  function Harness() {
    const [, force] = useState(0)
    return <NotesSection value="a" onChange={() => force((n) => n + 1)} />
  }
  render(<Harness />)
  fireEvent.dblClick(screen.getByText('a'))
  const ta = screen.getByPlaceholderText(/note/i) as HTMLTextAreaElement
  fireEvent.change(ta, { target: { value: 'ab' } })
  expect(ta.value).toBe('ab')
  fireEvent.change(ta, { target: { value: 'abc' } })
  expect(ta.value).toBe('abc')
})
