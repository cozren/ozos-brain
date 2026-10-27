import { describe, test, expect } from 'vitest'
import { clampSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from '../sidebar-width'

describe('clampSidebarWidth', () => {
  test('keeps a width within bounds unchanged', () => {
    expect(clampSidebarWidth(360)).toBe(360)
  })

  test('clamps a width below the minimum up to the minimum', () => {
    expect(clampSidebarWidth(50)).toBe(SIDEBAR_MIN)
  })

  test('clamps a width above the maximum down to the maximum (keeps preview visible)', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX)
  })

  test('falls back to the default for a non-numeric width', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT)
  })
})
