import { describe, expect, test } from 'vitest'
import {
  MAX_TABS,
  activeConversation,
  anyUnread,
  applyEvent,
  clearSkill,
  closeTab,
  initialState,
  minimize,
  newTab,
  openPanel,
  selectSkill,
  setDraft,
  slashQuery,
  startSend,
  streamFailed,
  switchTab,
  toggleMaximize,
} from '../floatingChatModel'

describe('initial state', () => {
  test('starts as a bubble with a single empty active conversation', () => {
    const s = initialState
    expect(s.window).toBe('bubble')
    expect(s.conversations).toHaveLength(1)
    expect(s.activeId).toBe(s.conversations[0].id)
    expect(activeConversation(s).messages).toEqual([])
  })
})

describe('window states', () => {
  test('bubble → panel → maximized → panel → bubble', () => {
    let s = initialState
    expect(s.window).toBe('bubble')
    s = openPanel(s)
    expect(s.window).toBe('panel')
    s = toggleMaximize(s)
    expect(s.window).toBe('maximized')
    s = toggleMaximize(s)
    expect(s.window).toBe('panel')
    s = minimize(s)
    expect(s.window).toBe('bubble')
  })
})

describe('tabs', () => {
  test('newTab appends an empty conversation and makes it active', () => {
    const s = newTab(openPanel(initialState))
    expect(s.conversations).toHaveLength(2)
    expect(s.activeId).toBe(s.conversations[1].id)
    expect(s.conversations[1].messages).toEqual([])
  })

  test('every tab gets a distinct id', () => {
    let s = initialState
    s = newTab(s)
    s = newTab(s)
    const ids = s.conversations.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('newTab is capped at MAX_TABS', () => {
    let s = initialState
    for (let i = 0; i < MAX_TABS + 3; i++) s = newTab(s)
    expect(s.conversations).toHaveLength(MAX_TABS)
  })

  test('switchTab activates the target and clears its unread', () => {
    let s = newTab(initialState) // two tabs, second active
    const first = s.conversations[0].id
    // mark the first tab unread, then switch to it
    s = applyEvent(s, first, { type: 'text', text: 'psst' })
    expect(s.conversations[0].unread).toBe(true)
    s = switchTab(s, first)
    expect(s.activeId).toBe(first)
    expect(s.conversations[0].unread).toBe(false)
  })

  test('closeTab removes a tab; closing the active one activates the left neighbor', () => {
    let s = newTab(newTab(initialState)) // three tabs, third active
    const [a, b, c] = s.conversations.map((x) => x.id)
    expect(s.activeId).toBe(c)
    s = closeTab(s, c)
    expect(s.conversations.map((x) => x.id)).toEqual([a, b])
    expect(s.activeId).toBe(b)
  })

  test('closing a non-active tab keeps the active tab active', () => {
    let s = newTab(newTab(initialState))
    const [a, , c] = s.conversations.map((x) => x.id)
    s = closeTab(s, a)
    expect(s.activeId).toBe(c)
    expect(s.conversations.map((x) => x.id)).not.toContain(a)
  })

  test('closing the last remaining tab leaves one fresh empty tab', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const onlyId = s.conversations[0].id
    s = closeTab(s, onlyId)
    expect(s.conversations).toHaveLength(1)
    expect(s.conversations[0].id).not.toBe(onlyId)
    expect(s.conversations[0].messages).toEqual([])
    expect(s.activeId).toBe(s.conversations[0].id)
  })
})

describe('drafts are per-tab', () => {
  test('setDraft updates only the active conversation', () => {
    let s = newTab(initialState) // second tab active
    s = setDraft(s, 'draft for tab two')
    expect(s.conversations[1].draft).toBe('draft for tab two')
    expect(s.conversations[0].draft).toBe('')
  })

  test('startSend clears the active tab draft', () => {
    let s = setDraft(openPanel(initialState), 'typed something')
    s = startSend(s, 'typed something')
    expect(activeConversation(s).draft).toBe('')
  })
})

describe('sending and streaming', () => {
  test('startSend appends user + empty assistant msg to the active tab and sets streaming', () => {
    const s = startSend(openPanel(initialState), 'hello')
    expect(activeConversation(s).streaming).toBe(true)
    expect(activeConversation(s).messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '' },
    ])
  })

  test('startSend ignores empty input and double-send while streaming', () => {
    const s = startSend(openPanel(initialState), 'hello')
    expect(startSend(s, 'again')).toBe(s)
    expect(activeConversation(startSend(openPanel(initialState), '   ')).messages).toEqual([])
  })

  test('text events append to the streaming tab, addressed by id', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = applyEvent(s, id, { type: 'text', text: 'Hel' })
    s = applyEvent(s, id, { type: 'text', text: 'lo' })
    expect(activeConversation(s).messages[1].content).toBe('Hello')
  })

  test('a background tab keeps streaming into its own messages', () => {
    // start a stream in tab one, open a second tab, stream still lands in tab one
    let s = startSend(openPanel(initialState), 'ask tab one')
    const one = s.activeId
    s = newTab(s) // tab two now active
    s = applyEvent(s, one, { type: 'text', text: 'answer' })
    expect(s.conversations[0].messages[1].content).toBe('answer')
    expect(s.conversations[0].streaming).toBe(true)
  })

  test('tool_start sets toolStatus, tool_done clears it', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = applyEvent(s, id, {
      type: 'tool_start',
      tool: 'read_wiki',
      label: 'the knowledge-graph wiki',
    })
    expect(activeConversation(s).toolStatus).toContain('the knowledge-graph wiki')
    s = applyEvent(s, id, {
      type: 'tool_done',
      tool: 'read_wiki',
      label: 'the knowledge-graph wiki',
    })
    expect(activeConversation(s).toolStatus).toBeNull()
  })

  test('done stops streaming; empty answer gets fallback text', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = applyEvent(s, id, { type: 'done' })
    expect(activeConversation(s).streaming).toBe(false)
    expect(activeConversation(s).messages[1].content).toContain('No response')
  })

  test('streamFailed marks the addressed tab and stops streaming', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = applyEvent(s, id, { type: 'text', text: 'partial' })
    s = streamFailed(s, id, 'network down')
    expect(activeConversation(s).streaming).toBe(false)
    expect(activeConversation(s).messages[1].content).toContain('partial')
    expect(activeConversation(s).messages[1].content).toContain('⚠')
  })
})

describe('unread dot', () => {
  test('text arriving while minimized sets that tab unread; opening clears the active tab', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = minimize(s)
    s = applyEvent(s, id, { type: 'text', text: 'psst' })
    expect(activeConversation(s).unread).toBe(true)
    expect(anyUnread(s)).toBe(true)
    s = openPanel(s)
    expect(activeConversation(s).unread).toBe(false)
  })

  test('text arriving in the active, open tab does not set unread', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const id = s.activeId
    s = applyEvent(s, id, { type: 'text', text: 'visible' })
    expect(activeConversation(s).unread).toBe(false)
  })

  test('text arriving in a non-active tab sets that tab unread even while open', () => {
    let s = startSend(openPanel(initialState), 'hi')
    const one = s.activeId
    s = newTab(s) // switch to tab two
    s = applyEvent(s, one, { type: 'text', text: 'done in background' })
    expect(s.conversations[0].unread).toBe(true)
    expect(activeConversation(s).unread).toBe(false)
  })
})

describe('skills', () => {
  test('selectSkill sets pendingSkill on active tab; startSend consumes it', () => {
    let s = selectSkill(openPanel(initialState), 'quick-prd')
    expect(activeConversation(s).pendingSkill).toBe('quick-prd')
    s = startSend(s, 'write a prd')
    expect(activeConversation(s).pendingSkill).toBeNull()
  })

  test('clearSkill clears the active tab pendingSkill', () => {
    let s = selectSkill(openPanel(initialState), 'quick-prd')
    s = clearSkill(s)
    expect(activeConversation(s).pendingSkill).toBeNull()
  })

  test('slashQuery', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/qu')).toBe('qu')
    expect(slashQuery('hello')).toBeNull()
    expect(slashQuery('/quick-prd write me')).toBeNull()
  })
})
