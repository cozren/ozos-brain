import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentZone } from '../DocumentZone'
import type { Document } from '../../types'

const docs: Document[] = [
  { file: 'self-assessment.md', label: 'Self Assessment', ingested_at: '2026-04-20' },
]

test('renders existing documents with view links', () => {
  render(<DocumentZone documents={docs} onUpload={vi.fn()} onView={vi.fn()} />)
  expect(screen.getByText('Self Assessment')).toBeInTheDocument()
  expect(screen.getByText('VIEW ↗')).toBeInTheDocument()
})

test('clicking VIEW calls onView with filename', () => {
  const onView = vi.fn()
  render(<DocumentZone documents={docs} onUpload={vi.fn()} onView={onView} />)
  fireEvent.click(screen.getByText('VIEW ↗'))
  expect(onView).toHaveBeenCalledWith('self-assessment.md')
})

test('drop zone is visible', () => {
  render(<DocumentZone documents={[]} onUpload={vi.fn()} onView={vi.fn()} />)
  expect(screen.getByText(/DROP FILES HERE/i)).toBeInTheDocument()
})
