import { describe, expect, test } from 'vitest'
import type { Element, Text } from 'hast'
import { detectCalloutType, CALLOUT_ICONS, CALLOUT_TYPES } from '../knowledge-callouts'

function makeBlockquote(firstText: string, extraChildren: (Element | Text)[] = []): Element {
  return {
    type: 'element',
    tagName: 'blockquote',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [{ type: 'text', value: firstText } as Text, ...extraChildren],
      } as Element,
    ],
  }
}

describe('detectCalloutType', () => {
  test('detects [!NOTE]', () => {
    expect(detectCalloutType(makeBlockquote('[!NOTE]'))).toBe('NOTE')
  })
  test('detects [!NOTE] with trailing text on same line', () => {
    expect(detectCalloutType(makeBlockquote('[!NOTE] inline note'))).toBe('NOTE')
  })
  test('detects [!TIP]', () => {
    expect(detectCalloutType(makeBlockquote('[!TIP]'))).toBe('TIP')
  })
  test('detects [!WARNING]', () => {
    expect(detectCalloutType(makeBlockquote('[!WARNING]'))).toBe('WARNING')
  })
  test('detects [!IMPORTANT]', () => {
    expect(detectCalloutType(makeBlockquote('[!IMPORTANT]'))).toBe('IMPORTANT')
  })
  test('detects [!CAUTION]', () => {
    expect(detectCalloutType(makeBlockquote('[!CAUTION]'))).toBe('CAUTION')
  })
  test('is case-insensitive', () => {
    expect(detectCalloutType(makeBlockquote('[!note]'))).toBe('NOTE')
    expect(detectCalloutType(makeBlockquote('[!Warning]'))).toBe('WARNING')
  })
  test('returns null for regular blockquote text', () => {
    expect(detectCalloutType(makeBlockquote('Regular quote text'))).toBeNull()
  })
  test('returns null for blockquote with no children', () => {
    const node: Element = {
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [],
    }
    expect(detectCalloutType(node)).toBeNull()
  })
  test('returns null when first child is not a paragraph', () => {
    const node: Element = {
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'ul',
          properties: {},
          children: [],
        } as Element,
      ],
    }
    expect(detectCalloutType(node)).toBeNull()
  })
  test('returns null when paragraph has no text child', () => {
    const node: Element = {
      type: 'element',
      tagName: 'blockquote',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [],
        } as Element,
      ],
    }
    expect(detectCalloutType(node)).toBeNull()
  })
})

describe('CALLOUT_ICONS', () => {
  test('has an emoji for every callout type', () => {
    for (const type of CALLOUT_TYPES) {
      expect(CALLOUT_ICONS[type]).toBeTruthy()
    }
  })
})
