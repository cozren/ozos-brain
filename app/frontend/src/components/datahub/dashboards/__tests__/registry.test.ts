import { describe, test, expect } from 'vitest'
import { DASHBOARDS, getDashboard, groupByCategory, type DashboardDef } from '../registry'

describe('dashboard registry', () => {
  test('ships empty: a fresh vault has no dashboards', () => {
    expect(DASHBOARDS).toEqual([])
  })

  test('getDashboard returns undefined for an unknown id', () => {
    expect(getDashboard('does-not-exist')).toBeUndefined()
  })

  test('getDashboard finds a registered dashboard by id', () => {
    DASHBOARDS.push({ id: '__test__', label: 'Test', Component: () => null })
    try {
      expect(getDashboard('__test__')?.label).toBe('Test')
    } finally {
      DASHBOARDS.pop()
    }
  })
})

describe('groupByCategory', () => {
  const A: DashboardDef = { id: 'a', label: 'A', category: 'Growth', Component: () => null }
  const C: DashboardDef = { id: 'c', label: 'C', category: 'Other', Component: () => null }
  const D: DashboardDef = { id: 'd', label: 'D', Component: () => null } // no category

  test('puts Other first, then unknown categories in first-seen order', () => {
    const groups = groupByCategory([A, C])
    expect(groups.map((g) => g.category)).toEqual(['Other', 'Growth'])
  })

  test('skips categories that have no dashboards', () => {
    expect(groupByCategory([A]).map((g) => g.category)).toEqual(['Growth'])
  })

  test('buckets an uncategorised dashboard under Other', () => {
    const groups = groupByCategory([D])
    expect(groups.map((g) => g.category)).toEqual(['Other'])
    expect(groups[0].dashboards).toEqual([D])
  })

  test('keeps every dashboard for a category together', () => {
    const a2: DashboardDef = { id: 'a2', label: 'A2', category: 'Growth', Component: () => null }
    const groups = groupByCategory([A, C, a2])
    expect(groups.find((g) => g.category === 'Growth')!.dashboards).toEqual([A, a2])
  })

  test('returns no groups for the empty default registry', () => {
    expect(groupByCategory()).toEqual([])
  })
})
