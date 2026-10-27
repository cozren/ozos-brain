import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { CadenceReminders } from '../CadenceReminders'

test('renders nothing for an empty list', () => {
  const { container } = render(<CadenceReminders reminders={[]} />)
  expect(container).toBeEmptyDOMElement()
})

test('one line per report with both due dates', () => {
  render(
    <CadenceReminders
      reminders={[
        {
          person_id: 'sam',
          display_name: 'Sam B',
          monthly_due: '2027-06-01',
          quarterly_due: '2027-07-01',
        },
      ]}
    />
  )
  expect(screen.getByText('Reminders')).toBeInTheDocument()
  expect(screen.getByText('Sam B')).toBeInTheDocument()
  expect(screen.getByText('1:1 note check due 2027-06-01')).toBeInTheDocument()
  expect(screen.getByText('reflection due 2027-07-01')).toBeInTheDocument()
})
