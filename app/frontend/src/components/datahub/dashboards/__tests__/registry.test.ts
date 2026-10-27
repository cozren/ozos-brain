import { describe, test, expect } from 'vitest'
import { CATEGORY_ORDER, DEFAULT_CATEGORY, groupByCategory, type PickerItem } from '../registry'

describe('groupByCategory', () => {
  const M: PickerItem = { id: 'm', label: 'M', category: 'Metabase' }
  const C: PickerItem = { id: 'c', label: 'C', category: 'CSV' }
  const G: PickerItem = { id: 'g', label: 'G', category: 'Growth' }
  const D: PickerItem = { id: 'd', label: 'D' } // no category

  test('source kinds come first in canonical order, then the rest first-seen', () => {
    expect(CATEGORY_ORDER).toEqual(['Metabase', 'SQLite', 'CSV'])
    expect(groupByCategory([G, C, M]).map((g) => g.category)).toEqual(['Metabase', 'CSV', 'Growth'])
  })

  test('skips categories that have no items', () => {
    expect(groupByCategory([G]).map((g) => g.category)).toEqual(['Growth'])
  })

  test('buckets an uncategorised item under the default category', () => {
    const groups = groupByCategory([D])
    expect(DEFAULT_CATEGORY).toBe('Other')
    expect(groups.map((g) => g.category)).toEqual(['Other'])
    expect(groups[0].items).toEqual([D])
  })

  test('keeps every item of a category together', () => {
    const m2: PickerItem = { id: 'm2', label: 'M2', category: 'Metabase' }
    expect(groupByCategory([M, C, m2]).find((g) => g.category === 'Metabase')!.items).toEqual([
      M,
      m2,
    ])
  })

  test('no groups for no items', () => {
    expect(groupByCategory([])).toEqual([])
  })
})
