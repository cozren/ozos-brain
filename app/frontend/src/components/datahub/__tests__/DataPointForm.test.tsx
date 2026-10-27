import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect } from 'vitest'

vi.mock('../../../api', () => ({
  ApiError: class ApiError extends Error {
    status: number
    detail: string | null
    constructor(status: number, detail: string | null) {
      super(detail ?? String(status))
      this.status = status
      this.detail = detail
    }
  },
}))

import { ApiError } from '../../../api'
import { DataPointForm } from '../DataPointForm'

const button = () => screen.getByRole('button', { name: 'Define data point' })

describe('DataPointForm', () => {
  test('disabled until the name and the kind-specific fields are filled', async () => {
    render(<DataPointForm onSubmit={vi.fn()} connectorConfigured />)
    expect(button()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
    expect(button()).toBeDisabled() // metabase needs a card id
    await userEvent.type(screen.getByLabelText('Card id'), '42')
    expect(button()).toBeEnabled()
  })

  test('submits a metabase payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<DataPointForm onSubmit={onSubmit} connectorConfigured />)
    await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
    await userEvent.type(screen.getByLabelText('Card id'), '42')
    await userEvent.type(screen.getByLabelText('Unit'), 'users')
    await userEvent.click(button())
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Weekly signups',
      source: { kind: 'metabase', card_id: 42 },
      display: 'number',
      refresh: 'manual',
      unit: 'users',
    })
    expect(await screen.findByText('Defined Weekly signups.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  test('submits a csv payload with display and refresh; blank column is null', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<DataPointForm onSubmit={onSubmit} connectorConfigured />)
    await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'csv')
    await userEvent.type(screen.getByLabelText('File (relative to the vault)'), 'data/signups.csv')
    await userEvent.selectOptions(screen.getByLabelText('Display'), 'line')
    await userEvent.selectOptions(screen.getByLabelText('Refresh'), 'daily')
    await userEvent.click(button())
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Weekly signups',
      source: { kind: 'csv', path: 'data/signups.csv', column: null },
      display: 'line',
      refresh: 'daily',
      unit: '',
    })
  })

  test('sqlite needs a file and a query', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<DataPointForm onSubmit={onSubmit} connectorConfigured />)
    await userEvent.type(screen.getByLabelText('Name'), 'Orders')
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'sqlite')
    await userEvent.type(screen.getByLabelText('File (relative to the vault)'), 'data/app.db')
    expect(button()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Query'), 'select count(*) from orders')
    await userEvent.click(button())
    expect(onSubmit.mock.calls[0][0].source).toEqual({
      kind: 'sqlite',
      path: 'data/app.db',
      query: 'select count(*) from orders',
    })
  })

  test('the Metabase hint shows only while the connector is not configured', () => {
    const { rerender } = render(<DataPointForm onSubmit={vi.fn()} connectorConfigured={false} />)
    expect(screen.getByText(/Save METABASE_URL and METABASE_API_KEY/)).toBeInTheDocument()
    rerender(<DataPointForm onSubmit={vi.fn()} connectorConfigured />)
    expect(screen.queryByText(/Save METABASE_URL/)).not.toBeInTheDocument()
  })

  test('a 409 says the name is taken; another detail is shown as is', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new ApiError(409, 'exists'))
    render(<DataPointForm onSubmit={onSubmit} connectorConfigured />)
    await userEvent.type(screen.getByLabelText('Name'), 'Weekly signups')
    await userEvent.type(screen.getByLabelText('Card id'), '42')
    await userEvent.click(button())
    expect(
      await screen.findByText('A data point with that name already exists.')
    ).toBeInTheDocument()
    onSubmit.mockRejectedValueOnce(new ApiError(422, 'path must stay inside the vault'))
    await userEvent.click(button())
    await waitFor(() =>
      expect(screen.getByText('path must stay inside the vault')).toBeInTheDocument()
    )
  })
})
