import { shouldHideHeader } from '../header'

test('always shows the header when at or near the top', () => {
  // Even if it was hidden and we appear to be scrolling down, being within the
  // threshold of the top forces it visible.
  expect(shouldHideHeader(true, 500, 10)).toBe(false)
  expect(shouldHideHeader(true, 500, 0)).toBe(false)
})

test('hides when scrolling down past the threshold', () => {
  expect(shouldHideHeader(false, 100, 200)).toBe(true)
})

test('shows when scrolling up', () => {
  expect(shouldHideHeader(true, 300, 220)).toBe(false)
})

test('keeps the previous state when there is no vertical movement', () => {
  expect(shouldHideHeader(true, 200, 200)).toBe(true)
  expect(shouldHideHeader(false, 200, 200)).toBe(false)
})

test('respects a custom threshold', () => {
  // 40 is below a threshold of 50, so it stays visible even scrolling down.
  expect(shouldHideHeader(false, 10, 40, 50)).toBe(false)
  // 60 is past the threshold and scrolling down, so it hides.
  expect(shouldHideHeader(false, 10, 60, 50)).toBe(true)
})
