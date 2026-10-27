import { render, screen, waitFor } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import type { SetupItem } from '../../../types/setup'

const getSetupRouting = vi.fn()
vi.mock('../../../api', () => ({
  api: {
    getSetupRouting: (...a: unknown[]) => getSetupRouting(...a),
    setSetupRouting: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}))

import { SetupItemBody } from '../SetupItemBody'

const item: SetupItem = {
  id: 'routing-folders',
  group: 'meeting-notes',
  title: 'Routing folders',
  why: 'why',
  writes: '.ozos/meeting-routing.json',
  kind: 'routing',
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
}

// No beforeEach here on purpose: each test sets its own implementation, and under
// vitest 4 a beforeEach that touches this spy makes the component's *handled*
// rejection surface as the test's failure.

test('routing form is prefilled from the backend', async () => {
  getSetupRouting.mockResolvedValue({
    folders: ['Growth', 'Other'],
    default_folder: 'Other',
    tagging_guide: '',
  })
  render(<SetupItemBody item={item} onChanged={() => {}} />)
  await waitFor(() =>
    expect(screen.getByLabelText('Folders (one per line)')).toHaveValue('Growth\nOther')
  )
})

test('when the current routing cannot be loaded, no form is offered (saving would wipe folders)', async () => {
  getSetupRouting.mockRejectedValue(new Error('down'))
  render(<SetupItemBody item={item} onChanged={() => {}} />)
  await waitFor(() =>
    expect(
      screen.getByText('Could not load the current routing; reload before editing folders.')
    ).toBeInTheDocument()
  )
  expect(screen.queryByLabelText('Folders (one per line)')).toBeNull()
})
