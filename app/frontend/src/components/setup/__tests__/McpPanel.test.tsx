import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { McpPanel } from '../McpPanel'
import type { SetupItem } from '../../../types/setup'

const base: SetupItem = {
  id: 'slack-mcp',
  group: 'workspace',
  title: 'Slack',
  why: 'why',
  writes: 'nothing',
  kind: 'mcp',
  setup_doc: null,
  vital: null,
  env: [],
  mcp_match: 'slack',
  default_folder: null,
  status: 'not_started',
  updated_at: null,
  notes: '',
  rows: [],
  derived: { mcp: { connected: false, names: [] } },
}

test('shows the /mcp instruction and "not detected" when nothing is connected', () => {
  render(<McpPanel item={base} />)
  expect(screen.getByText('/mcp')).toBeInTheDocument()
  expect(screen.getByText(/enable Slack and authenticate/)).toBeInTheDocument()
  expect(screen.getByText('Not detected yet')).toBeInTheDocument()
})

test('lists the connected server names', () => {
  render(
    <McpPanel
      item={{ ...base, status: 'done', derived: { mcp: { connected: true, names: ['Slack'] } } }}
    />
  )
  expect(screen.getByText('Connected (Slack)')).toBeInTheDocument()
})
