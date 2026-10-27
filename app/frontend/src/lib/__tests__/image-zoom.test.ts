import { describe, test, expect } from 'vitest'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, zoomBy, panFor } from '../image-zoom'

describe('clampZoom', () => {
  test('leaves a zoom inside the range untouched', () => {
    expect(clampZoom(2)).toBe(2)
  })

  test('clamps below the minimum', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
  })

  test('clamps above the maximum', () => {
    expect(clampZoom(999)).toBe(ZOOM_MAX)
  })
})

describe('zoomBy', () => {
  test('zooms in by the given factor', () => {
    expect(zoomBy(1, ZOOM_STEP)).toBeCloseTo(ZOOM_STEP)
  })

  test('zooms out with a factor below 1', () => {
    expect(zoomBy(2, 0.5)).toBeCloseTo(1)
  })

  test('never exceeds the bounds', () => {
    expect(zoomBy(ZOOM_MAX, 4)).toBe(ZOOM_MAX)
    expect(zoomBy(ZOOM_MIN, 0.1)).toBe(ZOOM_MIN)
  })
})

describe('panFor', () => {
  test('keeps the pan offset while zoomed in', () => {
    expect(panFor(2, { x: 40, y: -12 })).toEqual({ x: 40, y: -12 })
  })

  test('drops the pan offset once the image fits again', () => {
    // Panning a fitted image would strand it off-centre with no way back.
    expect(panFor(1, { x: 40, y: -12 })).toEqual({ x: 0, y: 0 })
    expect(panFor(0.5, { x: 40, y: -12 })).toEqual({ x: 0, y: 0 })
  })
})
