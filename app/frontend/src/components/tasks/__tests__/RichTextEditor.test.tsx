import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RichTextEditor } from '../RichTextEditor'

// A thin controlled wrapper so tests can read the latest markdown the editor emits.
function Harness({ initial = '' }: { initial?: string }) {
  const [md, setMd] = useState(initial)
  return (
    <div>
      <RichTextEditor value={md} onChange={setMd} />
      <div data-testid="md">{md}</div>
    </div>
  )
}

test('renders the given markdown as formatted (WYSIWYG) content', () => {
  render(<RichTextEditor value={'**bold** and *italic*'} onChange={() => {}} />)
  const strong = document.querySelector('strong')
  const em = document.querySelector('em')
  expect(strong?.textContent).toBe('bold')
  expect(em?.textContent).toBe('italic')
})

test('renders markdown bullet lists as real list items', () => {
  render(<RichTextEditor value={'- one\n- two'} onChange={() => {}} />)
  const items = document.querySelectorAll('li')
  expect(items.length).toBe(2)
  expect(items[0].textContent).toContain('one')
  expect(items[1].textContent).toContain('two')
})

test('shows a formatting toolbar with the expected controls', () => {
  render(<RichTextEditor value={''} onChange={() => {}} />)
  for (const name of ['Bold', 'Italic', 'Heading', 'Bullet list', 'Numbered list', 'Link']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
})

test('shows the placeholder text when empty', () => {
  render(<RichTextEditor value={''} onChange={() => {}} placeholder="Add more detail…" />)
  // The Placeholder extension marks the empty paragraph and exposes the text
  // via a data-placeholder attribute (rendered as ::before content via CSS).
  const empty = document.querySelector('.ProseMirror p[data-placeholder]')
  expect(empty?.getAttribute('data-placeholder')).toBe('Add more detail…')
})

test('emits markdown when a toolbar command is applied', async () => {
  const user = userEvent.setup()
  render(<Harness initial={'hello'} />)
  await user.click(screen.getByRole('button', { name: 'Bullet list' }))
  // Serialized markdown for a single-item bullet list starts with a dash.
  expect(screen.getByTestId('md').textContent).toMatch(/^[-*]\s+hello/m)
})
