import { render, screen } from '@testing-library/react'
import { CompetencyRadar } from '../RadarChart'
import type { CompetencySet } from '../../types'

const selfData: CompetencySet = {
  'business-operational-knowledge': 'exceeding-expectations',
  'data-knowledge': 'meeting-expectations',
  'industry-domain-knowledge': 'exceeding-expectations',
  'strategy-definition': 'meeting-expectations',
  'user-knowledge': 'need-improvement',
  delivery: 'meeting-expectations',
  discovery: 'need-improvement',
  'driving-impact': 'need-improvement',
  optimization: 'meeting-expectations',
  collaboration: 'exceeding-expectations',
  'leadership-evangelism': 'exceeding-expectations',
  'stakeholder-management': 'meeting-expectations',
  overall: 'meeting-expectations',
}

test('renders legend with self label', () => {
  render(<CompetencyRadar self={selfData} manager={null} />)
  expect(screen.getByText('SELF')).toBeInTheDocument()
})

test('renders manager label when manager data present', () => {
  render(<CompetencyRadar self={selfData} manager={selfData} />)
  expect(screen.getByText('MANAGER')).toBeInTheDocument()
})

test('renders without manager data (single polygon)', () => {
  const { container } = render(<CompetencyRadar self={selfData} manager={null} />)
  expect(container.querySelector('svg')).toBeInTheDocument()
})
