import { render, screen, fireEvent } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import { SetupItemRow } from '../SetupItemRow'
import type { SetupItem } from '../../../types/setup'

function item(over: Partial<SetupItem> = {}): SetupItem {
  return {
    id: 'granola',
    group: 'meeting-notes',
    title: 'Granola',
    why: 'why',
    writes: 'nothing',
    kind: 'manual',
    setup_doc: null,
    vital: null,
    env: [],
    mcp_match: null,
    default_folder: null,
    status: 'not_started',
    updated_at: null,
    notes: '',
    rows: [],
    derived: null,
    ...over,
  }
}

test('an open item offers Mark done and Skip', () => {
  const onStatus = vi.fn()
  render(<SetupItemRow item={item()} onStatus={onStatus} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
  expect(onStatus).toHaveBeenCalledWith('granola', 'done')
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  expect(onStatus).toHaveBeenCalledWith('granola', 'skipped')
  expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull()
})

test('a done or skipped item offers only Reopen', () => {
  const onStatus = vi.fn()
  render(<SetupItemRow item={item({ status: 'done' })} onStatus={onStatus} />)
  expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
  expect(onStatus).toHaveBeenCalledWith('granola', 'not_started')
})

test('needs_attention still offers Mark done and Skip', () => {
  render(<SetupItemRow item={item({ status: 'needs_attention' })} onStatus={() => {}} />)
  expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument()
})

test('derived rows (profile, mcp) never offer Mark done', () => {
  render(<SetupItemRow item={item({ id: 'profile', kind: 'profile' })} onStatus={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
})

test('without onStatus no controls render', () => {
  render(<SetupItemRow item={item()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

test('a derived-done row offers no controls (reopening would be re-derived), a skipped one offers Reopen', () => {
  const { rerender } = render(
    <SetupItemRow
      item={item({ id: 'slack-mcp', kind: 'mcp', status: 'done' })}
      onStatus={() => {}}
    />
  )
  expect(screen.queryByRole('button')).toBeNull()
  rerender(
    <SetupItemRow
      item={item({ id: 'slack-mcp', kind: 'mcp', status: 'skipped' })}
      onStatus={() => {}}
    />
  )
  expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
})
