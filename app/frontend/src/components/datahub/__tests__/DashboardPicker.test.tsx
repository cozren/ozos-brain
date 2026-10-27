import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { DashboardPicker } from '../DashboardPicker'
import { DASHBOARDS } from '../dashboards/registry'
import type { PickerFoldersConfig } from '../dashboards/pickerFolders'

// Drive a controlled registry so these tests don't depend on shipped dashboards.
beforeEach(() => {
  DASHBOARDS.length = 0
  DASHBOARDS.push({ id: 'c1', label: 'Widget One', category: 'Widget', Component: () => null })
  DASHBOARDS.push({ id: 'c2', label: 'Widget Two', category: 'Widget', Component: () => null })
})
afterEach(() => {
  DASHBOARDS.length = 0
})

function renderPicker(folders: PickerFoldersConfig = {}) {
  const onFoldersChange = vi.fn()
  const onPick = vi.fn()
  render(<DashboardPicker folders={folders} onFoldersChange={onFoldersChange} onPick={onPick} />)
  return { onFoldersChange, onPick }
}

describe('DashboardPicker', () => {
  test('categories are collapsed by default', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: /Widget/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Widget One' })).not.toBeInTheDocument()
  })

  test('expanding a category reveals its loose boards, which are pickable', async () => {
    const { onPick } = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /Widget/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Widget One' }))
    expect(onPick).toHaveBeenCalledWith('c1')
  })

  test('a board assigned to a folder appears under that folder (once expanded), not loose', async () => {
    renderPicker({ Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1'] }] })
    await userEvent.click(screen.getByRole('button', { name: /Widget/i }))
    // The folder is listed, collapsed.
    const folder = screen.getByRole('button', { name: 'Revenue' })
    expect(folder).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Widget One' })).not.toBeInTheDocument()
    await userEvent.click(folder)
    expect(screen.getByRole('button', { name: 'Widget One' })).toBeInTheDocument()
    // c2 stays loose and pickable without expanding the folder.
    expect(screen.getByRole('button', { name: 'Widget Two' })).toBeInTheDocument()
  })

  test('creating a sub-folder calls onFoldersChange with the new folder', async () => {
    const { onFoldersChange } = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /Widget/i }))
    await userEvent.click(screen.getByRole('button', { name: /new sub-folder/i }))
    await userEvent.type(screen.getByLabelText('Folder name'), 'Revenue{Enter}')
    expect(onFoldersChange).toHaveBeenCalledTimes(1)
    const next = onFoldersChange.mock.calls[0][0] as PickerFoldersConfig
    expect(next.Widget).toHaveLength(1)
    expect(next.Widget[0].name).toBe('Revenue')
    expect(next.Widget[0].dashboardIds).toEqual([])
  })

  test('deleting a sub-folder calls onFoldersChange dropping it', async () => {
    const { onFoldersChange } = renderPicker({
      Widget: [{ id: 'f1', name: 'Revenue', dashboardIds: ['c1'] }],
    })
    await userEvent.click(screen.getByRole('button', { name: /Widget/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete folder revenue/i }))
    expect(onFoldersChange).toHaveBeenCalledTimes(1)
    const next = onFoldersChange.mock.calls[0][0] as PickerFoldersConfig
    expect(next.Widget).toEqual([])
  })
})
