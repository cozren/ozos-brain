import type { ChatStreamEvent } from '../../api'
import type { ChatMessage } from '../../types'

export type WindowState = 'bubble' | 'panel' | 'maximized'

/** Maximum number of concurrent conversation tabs. */
export const MAX_TABS = 5

export interface Conversation {
  id: string
  messages: ChatMessage[]
  streaming: boolean
  toolStatus: string | null
  pendingSkill: string | null
  unread: boolean
  draft: string
}

export interface FloatingChatState {
  window: WindowState
  conversations: Conversation[]
  activeId: string
  /** Monotonic counter so every tab gets a unique, stable id. */
  seq: number
}

function emptyConversation(id: string): Conversation {
  return {
    id,
    messages: [],
    streaming: false,
    toolStatus: null,
    pendingSkill: null,
    unread: false,
    draft: '',
  }
}

export const initialState: FloatingChatState = {
  window: 'bubble',
  conversations: [emptyConversation('c1')],
  activeId: 'c1',
  seq: 1,
}

export function activeConversation(s: FloatingChatState): Conversation {
  return s.conversations.find((c) => c.id === s.activeId) ?? s.conversations[0]
}

export function anyUnread(s: FloatingChatState): boolean {
  return s.conversations.some((c) => c.unread)
}

/** Map over one conversation by id, leaving the rest untouched. */
function mapConv(
  s: FloatingChatState,
  id: string,
  fn: (c: Conversation) => Conversation
): FloatingChatState {
  return { ...s, conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }
}

function mapActive(s: FloatingChatState, fn: (c: Conversation) => Conversation): FloatingChatState {
  return mapConv(s, s.activeId, fn)
}

export function openPanel(s: FloatingChatState): FloatingChatState {
  return { ...mapActive(s, (c) => ({ ...c, unread: false })), window: 'panel' }
}

export function minimize(s: FloatingChatState): FloatingChatState {
  return { ...s, window: 'bubble' }
}

export function toggleMaximize(s: FloatingChatState): FloatingChatState {
  return { ...s, window: s.window === 'maximized' ? 'panel' : 'maximized' }
}

export function newTab(s: FloatingChatState): FloatingChatState {
  if (s.conversations.length >= MAX_TABS) return s
  const seq = s.seq + 1
  const id = `c${seq}`
  return {
    ...s,
    seq,
    conversations: [...s.conversations, emptyConversation(id)],
    activeId: id,
  }
}

export function closeTab(s: FloatingChatState, id: string): FloatingChatState {
  const idx = s.conversations.findIndex((c) => c.id === id)
  if (idx === -1) return s
  const remaining = s.conversations.filter((c) => c.id !== id)
  // Always keep at least one tab: replace the last one with a fresh empty tab.
  if (remaining.length === 0) {
    const seq = s.seq + 1
    const fresh = emptyConversation(`c${seq}`)
    return { ...s, seq, conversations: [fresh], activeId: fresh.id }
  }
  // Closing the active tab activates its left neighbor (or the new first tab).
  const activeId = id === s.activeId ? remaining[Math.max(0, idx - 1)].id : s.activeId
  return { ...s, conversations: remaining, activeId }
}

export function switchTab(s: FloatingChatState, id: string): FloatingChatState {
  if (!s.conversations.some((c) => c.id === id)) return s
  return { ...mapConv(s, id, (c) => ({ ...c, unread: false })), activeId: id }
}

export function setDraft(s: FloatingChatState, text: string): FloatingChatState {
  return mapActive(s, (c) => ({ ...c, draft: text }))
}

export function startSend(s: FloatingChatState, text: string): FloatingChatState {
  const active = activeConversation(s)
  if (!text.trim() || active.streaming) return s
  return mapActive(s, (c) => ({
    ...c,
    streaming: true,
    toolStatus: null,
    pendingSkill: null,
    draft: '',
    messages: [...c.messages, { role: 'user', content: text }, { role: 'assistant', content: '' }],
  }))
}

function appendToAssistant(c: Conversation, text: string): ChatMessage[] {
  const last = c.messages[c.messages.length - 1]
  if (!last || last.role !== 'assistant') return c.messages
  return [...c.messages.slice(0, -1), { ...last, content: last.content + text }]
}

function applyEventToConv(s: FloatingChatState, c: Conversation, e: ChatStreamEvent): Conversation {
  switch (e.type) {
    case 'text': {
      // Mark unread unless this tab is the one the user is actively viewing.
      const viewing = s.window !== 'bubble' && c.id === s.activeId
      return {
        ...c,
        toolStatus: null,
        unread: viewing ? c.unread : true,
        messages: appendToAssistant(c, e.text ?? ''),
      }
    }
    case 'status':
      return { ...c, toolStatus: e.text ?? null }
    case 'tool_start':
      return { ...c, toolStatus: `searching ${e.label ?? e.tool}…` }
    case 'tool_done':
      return { ...c, toolStatus: null }
    case 'done': {
      const last = c.messages[c.messages.length - 1]
      const messages =
        last?.role === 'assistant' && last.content === ''
          ? [
              ...c.messages.slice(0, -1),
              {
                ...last,
                content: 'No response received — the backend may have timed out. Please try again.',
              },
            ]
          : c.messages
      return { ...c, streaming: false, toolStatus: null, messages }
    }
    default:
      return c
  }
}

export function applyEvent(
  s: FloatingChatState,
  id: string,
  e: ChatStreamEvent
): FloatingChatState {
  return mapConv(s, id, (c) => applyEventToConv(s, c, e))
}

export function streamFailed(s: FloatingChatState, id: string, message: string): FloatingChatState {
  return mapConv(s, id, (c) => {
    const last = c.messages[c.messages.length - 1]
    const suffix = last?.content ? `\n\n⚠ ${message}` : `⚠ ${message}`
    return { ...c, streaming: false, toolStatus: null, messages: appendToAssistant(c, suffix) }
  })
}

export function selectSkill(s: FloatingChatState, name: string): FloatingChatState {
  return mapActive(s, (c) => ({ ...c, pendingSkill: name }))
}

export function clearSkill(s: FloatingChatState): FloatingChatState {
  return mapActive(s, (c) => ({ ...c, pendingSkill: null }))
}

/** Filter text for the slash-skill menu: '/'→'', '/qu'→'qu'; null once a space appears. */
export function slashQuery(input: string): string | null {
  if (!input.startsWith('/')) return null
  const rest = input.slice(1)
  if (rest.includes(' ')) return null
  return rest
}
