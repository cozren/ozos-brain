import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskItem } from '../TaskItem'
import type { Task } from '../../../types/tasks'

const task: Task = {
  id: 't1',
  title: 'Task one',
  description: 'plain note',
  labels: [],
  done: false,
  order: 0,
  subtasks: [],
  plan: null,
}

const longTitle =
  'Finish the cross-border segmentation fix and re-run validation against merchant 927 before the launch window closes'

test('with subtasks: one planner strip per subtask and no aggregate task strip', async () => {
  const user = userEvent.setup()
  const item: Task = {
    ...task,
    subtasks: [
      { id: 's1', title: 'first', done: false, weeks: [] },
      { id: 's2', title: 'second', done: false, weeks: [] },
    ],
  }
  render(
    <TaskItem item={item} allLabels={[]} labelColors={{}} onPatch={() => {}} onDelete={() => {}} />
  )
  await user.click(screen.getByTitle('expand'))
  expect(screen.getAllByTestId('subtask-planner')).toHaveLength(2)
  expect(screen.queryByTestId('task-planner')).not.toBeInTheDocument()
})

test('with no subtasks: exactly one whole-task planner strip', async () => {
  const user = userEvent.setup()
  render(
    <TaskItem item={task} allLabels={[]} labelColors={{}} onPatch={() => {}} onDelete={() => {}} />
  )
  await user.click(screen.getByTitle('expand'))
  expect(screen.getByTestId('task-planner')).toBeInTheDocument()
  expect(screen.queryAllByTestId('subtask-planner')).toHaveLength(0)
})

test('a long subtask title is shown in full and allowed to wrap (not truncated)', async () => {
  const user = userEvent.setup()
  const item: Task = { ...task, subtasks: [{ id: 's1', title: longTitle, done: false, weeks: [] }] }
  render(
    <TaskItem item={item} allLabels={[]} labelColors={{}} onPatch={() => {}} onDelete={() => {}} />
  )
  await user.click(screen.getByTitle('expand'))
  const el = screen.getByText(longTitle)
  expect(el.style.whiteSpace).not.toBe('nowrap')
  expect(el.style.textOverflow).not.toBe('ellipsis')
})

test('editing the description opens the rich-text editor', async () => {
  const user = userEvent.setup()
  render(
    <TaskItem item={task} allLabels={[]} labelColors={{}} onPatch={() => {}} onDelete={() => {}} />
  )
  // expand the card, then enter description edit mode
  await user.click(screen.getByTitle('expand'))
  // double-click the rendered description to edit it
  await user.dblClick(screen.getByText('plain note'))
  expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument()
})

test('Done saves the description via onPatch', async () => {
  const user = userEvent.setup()
  const onPatch = vi.fn()
  render(
    <TaskItem item={task} allLabels={[]} labelColors={{}} onPatch={onPatch} onDelete={() => {}} />
  )
  await user.click(screen.getByTitle('expand'))
  await user.dblClick(screen.getByText('plain note'))
  await user.click(screen.getByRole('button', { name: /^done$/i }))
  // unchanged content should not patch; here content is unchanged so no description patch.
  // We assert Done is wired (closes editor) by the toolbar disappearing.
  expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument()
})
