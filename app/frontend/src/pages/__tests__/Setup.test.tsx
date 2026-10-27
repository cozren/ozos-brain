import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'
import type { SetupView } from '../../types/setup'

const getSetup = vi.fn()
vi.mock('../../api', () => ({
  api: {
    getSetup: (...a: unknown[]) => getSetup(...a),
    setSetupStatus: vi.fn(),
    dismissSetup: vi.fn(),
    getSetupEnv: vi.fn().mockResolvedValue({}),
    getSetupGmail: vi.fn().mockResolvedValue(null),
    getSetupRouting: vi.fn().mockResolvedValue(null),
  },
  ApiError: class ApiError extends Error {},
}))

import { Setup } from '../Setup'

const view: SetupView = {
  groups: [
    {
      id: 'you',
      label: 'You',
      items: [
        {
          id: 'profile',
          group: 'you',
          title: 'Your profile',
          why: 'Your name drives the greeting.',
          writes: '~/.ozos/config.json',
          kind: 'profile',
          setup_doc: null,
          vital: null,
          env: [],
          mcp_match: null,
          default_folder: null,
          status: 'done',
          updated_at: null,
          notes: '',
          rows: [],
          derived: { profile: { name: 'Taylor', me: 'taylor', voice_text: '' } },
        },
      ],
    },
    {
      id: 'meeting-notes',
      label: 'Meeting notes',
      items: [
        {
          id: 'granola',
          group: 'meeting-notes',
          title: 'Granola',
          why: 'Granola meetings flow into the notes pipeline.',
          writes: '(nothing)',
          kind: 'manual',
          setup_doc: 'docs/connectors/granola.md',
          vital: 'meeting-notes',
          env: [],
          mcp_match: null,
          default_folder: null,
          status: 'not_started',
          updated_at: null,
          notes: '',
          rows: [],
          derived: null,
        },
      ],
    },
  ],
  summary: { done: 1, total: 2, open: 1, badge_dismissed: false },
  cadence: null,
}

beforeEach(() => {
  getSetup.mockReset()
})

test('renders the page title, groups in order, item titles and status chips', async () => {
  getSetup.mockResolvedValue(view)
  render(<Setup />)
  expect(screen.getByRole('heading', { level: 1, name: 'Setup' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Your profile')).toBeInTheDocument())
  const you = screen.getByText('You')
  const notes = screen.getByText('Meeting notes')
  expect(you.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Granola')).toBeInTheDocument()
  expect(screen.getByText('Done')).toHaveAttribute('data-status', 'done')
  expect(screen.getByText('Not started')).toHaveAttribute('data-status', 'not_started')
  expect(screen.getByText('1 of 2 done')).toBeInTheDocument()
})

test('shows an error line when the backend is unreachable', async () => {
  getSetup.mockRejectedValue(new Error('boom'))
  render(<Setup />)
  await waitFor(() => expect(screen.getByText('Could not load setup')).toBeInTheDocument())
})

test('clicking Skip updates the row from the backend response', async () => {
  getSetup.mockResolvedValue(view)
  const { api } = await import('../../api')
  ;(api.setSetupStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...view.groups[1].items[0],
    status: 'skipped',
  })
  render(<Setup />)
  await waitFor(() => expect(screen.getByText('Granola')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
  await waitFor(() => expect(screen.getByText('Skipped')).toBeInTheDocument())
  expect(api.setSetupStatus).toHaveBeenCalledWith('granola', 'skipped')
})

test('the people item renders the stakeholder form and its sub-rows', async () => {
  const withPeople: SetupView = {
    ...view,
    groups: [
      {
        id: 'people',
        label: 'People',
        items: [
          {
            ...view.groups[1].items[0],
            id: 'add-stakeholder',
            group: 'people',
            title: 'Add a stakeholder',
            kind: 'people',
            status: 'done',
            rows: [{ id: 'pat', display_name: 'Pat Example', added_at: '2026-01-02T10:00:00' }],
          },
        ],
      },
    ],
  }
  getSetup.mockResolvedValue(withPeople)
  render(<Setup />)
  await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument())
  expect(screen.getByText('Pat Example')).toBeInTheDocument()
  expect(screen.getByText('2026-01-02')).toBeInTheDocument()
})
