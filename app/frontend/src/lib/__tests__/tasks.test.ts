import {
  labelUnion,
  filterByLabel,
  chipStyle,
  colorFor,
  reorderById,
  splitByDone,
  sortByCompletedDesc,
  DEFAULT_LABEL_COLOR,
  PR_LABEL_COLOR,
} from '../tasks'
import type { Task, ReviewGoalTask } from '../../types/tasks'

const task = (labels: string[]): Task => ({
  id: 't_' + labels.join(''),
  title: 't',
  description: '',
  labels,
  done: false,
  order: 0,
  subtasks: [],
})
const goal = (id: string): ReviewGoalTask => ({
  id,
  title: 'g',
  description: '',
  labels: ['performance review'],
  done: false,
  subtasks: [],
  reviewLinked: true,
  cycle: 'c',
  index: 0,
})

test('labelUnion dedups across tasks, order-preserving', () => {
  expect(labelUnion([task(['work', 'urgent']), task(['home', 'work'])], [])).toEqual([
    'work',
    'urgent',
    'home',
  ])
})

test('labelUnion surfaces "performance review" when review goals exist', () => {
  expect(labelUnion([], [goal('pr:c:0')])).toEqual(['performance review'])
})

test('labelUnion adds nothing extra when no review goals', () => {
  expect(labelUnion([task(['x'])], [])).toEqual(['x'])
})

test('filterByLabel null shows everything', () => {
  const items = [task(['a']), task(['b'])]
  expect(filterByLabel(items, null)).toHaveLength(2)
})

test('filterByLabel keeps only items carrying the label', () => {
  const a = task(['a'])
  const b = task(['b'])
  expect(filterByLabel([a, b], 'a')).toEqual([a])
})

test('filterByLabel matches review goals by their performance review label', () => {
  const g = goal('pr:c:0')
  const t = task(['work'])
  expect(filterByLabel([t, g], 'performance review')).toEqual([g])
})

test('chipStyle derives text, translucent border and background from a hex', () => {
  expect(chipStyle('#2dd4ff')).toEqual({
    color: '#2dd4ff',
    border: '1px solid rgba(45,212,255,0.55)',
    background: 'rgba(45,212,255,0.1)',
  })
})

test('colorFor returns the stored color for a normal label', () => {
  expect(colorFor('work', { work: '#ff6ad5' })).toBe('#ff6ad5')
})

test('colorFor falls back to the default cyan when unset', () => {
  expect(colorFor('work', {})).toBe(DEFAULT_LABEL_COLOR)
})

test('colorFor defaults performance review to amber when unset', () => {
  expect(colorFor('performance review', {})).toBe(PR_LABEL_COLOR)
})

test('colorFor honors a stored color for performance review (recolorable)', () => {
  expect(colorFor('performance review', { 'performance review': '#ff6ad5' })).toBe('#ff6ad5')
})

// ── reorderById ─────────────────────────────────────────────────────

test('reorderById moves an item to the target position (later → earlier)', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  expect(reorderById(items, 'c', 'a').map((i) => i.id)).toEqual(['c', 'a', 'b'])
})

test('reorderById moves an item to the target position (earlier → later)', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  expect(reorderById(items, 'a', 'c').map((i) => i.id)).toEqual(['b', 'c', 'a'])
})

test('reorderById is a no-op when dropping onto itself', () => {
  const items = [{ id: 'a' }, { id: 'b' }]
  expect(reorderById(items, 'a', 'a')).toBe(items)
})

test('reorderById returns the input unchanged when an id is absent', () => {
  const items = [{ id: 'a' }, { id: 'b' }]
  expect(reorderById(items, 'x', 'a')).toBe(items)
})

// ── splitByDone ─────────────────────────────────────────────────────

test('splitByDone separates active from completed, preserving order', () => {
  const items = [
    { id: 'a', done: false },
    { id: 'b', done: true },
    { id: 'c', done: false },
    { id: 'd', done: true },
  ]
  const { active, completed } = splitByDone(items)
  expect(active.map((i) => i.id)).toEqual(['a', 'c'])
  expect(completed.map((i) => i.id)).toEqual(['b', 'd'])
})

// ── sortByCompletedDesc ─────────────────────────────────────────────

test('sortByCompletedDesc puts the newest completion first', () => {
  const items = [
    { id: 'old', completedAt: '2026-06-10T09:00:00' },
    { id: 'new', completedAt: '2026-06-12T09:00:00' },
    { id: 'mid', completedAt: '2026-06-11T09:00:00' },
  ]
  expect(sortByCompletedDesc(items).map((i) => i.id)).toEqual(['new', 'mid', 'old'])
})

test('sortByCompletedDesc sorts undated items last', () => {
  const items = [
    { id: 'none', completedAt: null },
    { id: 'dated', completedAt: '2026-06-12T09:00:00' },
    { id: 'undef' },
  ]
  expect(sortByCompletedDesc(items).map((i) => i.id)).toEqual(['dated', 'none', 'undef'])
})

test('sortByCompletedDesc does not mutate the input', () => {
  const items = [
    { id: 'a', completedAt: '2026-06-10T00:00:00' },
    { id: 'b', completedAt: '2026-06-12T00:00:00' },
  ]
  const before = items.map((i) => i.id)
  sortByCompletedDesc(items)
  expect(items.map((i) => i.id)).toEqual(before)
})
