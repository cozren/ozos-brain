import type { Element, Text } from 'hast'
import type { ReactNode, ReactElement } from 'react'
import { Children, cloneElement, isValidElement } from 'react'

export const CALLOUT_TYPES = ['NOTE', 'TIP', 'WARNING', 'IMPORTANT', 'CAUTION'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

export const CALLOUT_ICONS: Record<CalloutType, string> = {
  NOTE: 'ℹ️',
  TIP: '💡',
  WARNING: '⚠️',
  IMPORTANT: '📌',
  CAUTION: '🔶',
}

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i

export function detectCalloutType(node: Element): CalloutType | null {
  // Skip whitespace text nodes — hast may insert them between elements
  const first = node.children.find(
    (c) => c.type === 'element' && (c as Element).tagName === 'p'
  ) as Element | undefined
  if (!first) return null
  // First child of the paragraph is the text node (remarkLineBreaks splits on \n)
  const text = first.children.find((c) => c.type === 'text') as Text | undefined
  if (!text) return null
  const match = text.value.match(CALLOUT_RE)
  if (!match) return null
  return match[1].toUpperCase() as CalloutType
}

// Remove the "[!TYPE]" marker and the <br/> that follows from React children.
// ReactMarkdown renders > [!NOTE]\n> body as <p>[!NOTE]<br/>body</p>.
export function stripCalloutMarker(children: ReactNode): ReactNode {
  const arr = Children.toArray(children)
  if (!arr.length) return children

  const first = arr[0] as ReactElement
  if (!isValidElement(first)) return children

  const pChildren = Children.toArray(first.props.children)
  let rest = pChildren

  // Strip the "[!TYPE]" text node
  if (typeof rest[0] === 'string' && CALLOUT_RE.test(rest[0])) {
    rest = rest.slice(1)
    // Strip the trailing <br/> inserted by remarkLineBreaks
    const next = rest[0] as ReactElement
    if (isValidElement(next) && next.type === 'br') rest = rest.slice(1)
  }

  if (rest.length === 0) return arr.slice(1)
  return [cloneElement(first, {}, ...rest), ...arr.slice(1)]
}
