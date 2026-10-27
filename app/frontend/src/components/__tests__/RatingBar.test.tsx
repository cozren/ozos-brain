import { render, screen, fireEvent } from '@testing-library/react'
import { RatingBar } from '../RatingBar'

test('renders all 4 segments', () => {
  render(<RatingBar value={null} onChange={vi.fn()} />)
  expect(screen.getByTitle('lets-grow-together')).toBeInTheDocument()
  expect(screen.getByTitle('meeting-expectations')).toBeInTheDocument()
  expect(screen.getByTitle('exceeding-expectations')).toBeInTheDocument()
  expect(screen.getByTitle('driving-excellence')).toBeInTheDocument()
})

test('active label shown below bar', () => {
  render(<RatingBar value="exceeding-expectations" onChange={vi.fn()} />)
  expect(screen.getByText('EXCEEDING EXPECTATIONS')).toBeInTheDocument()
})

test('clicking segment calls onChange', () => {
  const onChange = vi.fn()
  render(<RatingBar value="meeting-expectations" onChange={onChange} />)
  fireEvent.click(screen.getByTitle('driving-excellence'))
  expect(onChange).toHaveBeenCalledWith('driving-excellence')
})
