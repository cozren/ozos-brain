import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { RoutingForm } from '../RoutingForm'

test('one folder per line, default folder and tagging guide are sent together', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<RoutingForm onSave={onSave} />)
  fireEvent.change(screen.getByLabelText('Folders (one per line)'), {
    target: { value: 'Growth\nPlatform\n\n  Leadership ' },
  })
  fireEvent.change(screen.getByLabelText('Default folder'), { target: { value: 'Other' } })
  fireEvent.change(screen.getByLabelText('Tagging guide'), { target: { value: 'Tag teams.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save routing' }))
  expect(onSave).toHaveBeenCalledWith({
    folders: ['Growth', 'Platform', 'Leadership'],
    default_folder: 'Other',
    tagging_guide: 'Tag teams.',
  })
  await waitFor(() => expect(screen.getByText('Routing saved.')).toBeInTheDocument())
})

test('save is disabled without at least one folder', () => {
  render(<RoutingForm onSave={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Save routing' })).toBeDisabled()
})

test('prefills the current folders, default and guide so saving never drops them', () => {
  render(
    <RoutingForm
      routing={{
        folders: ['Growth', 'Leadership', 'Other'],
        default_folder: 'Other',
        tagging_guide: 'Tag teams.',
      }}
      onSave={vi.fn()}
    />
  )
  expect(screen.getByLabelText('Folders (one per line)')).toHaveValue('Growth\nLeadership\nOther')
  expect(screen.getByLabelText('Default folder')).toHaveValue('Other')
  expect(screen.getByLabelText('Tagging guide')).toHaveValue('Tag teams.')
  expect(screen.getByRole('button', { name: 'Save routing' })).toBeEnabled()
})
