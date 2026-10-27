import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { BrainLogo } from '../BrainLogo'
import { ChatMarkdown } from './ChatMarkdown'
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
  type FloatingChatState,
} from './floatingChatModel'
import '../../styles/floating-chat.css'

interface SkillInfo {
  name: string
  description: string
}

/** Minimal cyberpunk speech-bubble outline — stroke only, empty inside. */
function ChatBubbleIcon() {
  return (
    <svg
      className="fc-tab-icon"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 3.2h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.6l-2.9 2.4v-2.4H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function FloatingChat({ page }: { page: string }) {
  const [state, setState] = useState<FloatingChatState>(initialState)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [elapsedSec, setElapsedSec] = useState(0)
  const skillsLoaded = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  // Per-conversation stream bookkeeping so tabs can stream concurrently.
  const abortMap = useRef<Map<string, AbortController>>(new Map())
  const requestMap = useRef<Map<string, number>>(new Map())

  const open = state.window !== 'bubble'
  const active = activeConversation(state)
  const busy = state.conversations.some((c) => c.streaming)

  useEffect(() => {
    if (open && !skillsLoaded.current) {
      skillsLoaded.current = true
      api
        .getChatSkills()
        .then(setSkills)
        .catch(() => {})
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active.messages])

  useEffect(() => {
    if (!active.streaming) {
      setElapsedSec(0)
      return
    }
    setElapsedSec(0)
    const id = window.setInterval(() => setElapsedSec((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [active.streaming, active.id])

  const send = async () => {
    const text = active.draft.trim()
    if (!text || active.streaming) return
    const id = active.id
    const skill = active.pendingSkill ?? undefined
    const history = [...active.messages, { role: 'user' as const, content: text }]
    const controller = new AbortController()
    abortMap.current.set(id, controller)
    const requestId = (requestMap.current.get(id) ?? 0) + 1
    requestMap.current.set(id, requestId)
    setState((s) => startSend(s, text))
    try {
      await api.streamChat(
        history,
        { page, skill },
        (e) => {
          if (requestMap.current.get(id) !== requestId) return
          setState((s) => applyEvent(s, id, e))
        },
        controller.signal
      )
    } catch (err) {
      if (requestMap.current.get(id) !== requestId) return // superseded or tab closed
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      setState((s) => streamFailed(s, id, msg))
    }
  }

  const addTab = () => setState(newTab)

  const closeTabById = (id: string) => {
    // Invalidate any in-flight callbacks for this tab, then abort its request.
    requestMap.current.set(id, (requestMap.current.get(id) ?? 0) + 1)
    abortMap.current.get(id)?.abort()
    abortMap.current.delete(id)
    requestMap.current.delete(id)
    setState((s) => closeTab(s, id))
  }

  const q = slashQuery(active.draft)
  const slashMatches =
    q === null ? [] : skills.filter((s) => s.name.toLowerCase().startsWith(q.toLowerCase()))

  const pickSkill = (name: string) => {
    setState((s) => setDraft(selectSkill(s, name), ''))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (slashMatches.length > 0) pickSkill(slashMatches[0].name)
      else void send()
    }
  }

  if (!open) {
    return (
      <div className="fc-root">
        <button
          aria-label="Open OZOS assistant"
          className={`fc-bubble${busy ? ' fc-bubble--busy' : ''}`}
          onClick={() => setState(openPanel)}
        >
          <BrainLogo height={30} />
          {anyUnread(state) && <span className="fc-unread" data-testid="fc-unread" />}
        </button>
      </div>
    )
  }

  const isCompact = active.messages.length === 0 && state.window !== 'maximized'
  const maximized = state.window === 'maximized'

  return (
    <div className="fc-root">
      <div
        className={`fc-panel${maximized ? ' fc-panel--max' : ''}${
          isCompact ? ' fc-panel--compact' : ''
        }`}
      >
        <div className="fc-header">
          <BrainLogo height={18} />
          <div className={`fc-tabs${maximized ? ' fc-tabs--max' : ''}`}>
            {/* Tab pills only appear once there's more than one conversation. */}
            {state.conversations.length > 1 &&
              state.conversations.map((c, i) => (
                <div
                  key={c.id}
                  className={`fc-tab${c.id === state.activeId ? ' fc-tab--active' : ''}`}
                >
                  <button
                    className="fc-tab-select"
                    aria-label={`Chat ${i + 1}`}
                    aria-current={c.id === state.activeId ? 'true' : undefined}
                    onClick={() => setState((s) => switchTab(s, c.id))}
                  >
                    <ChatBubbleIcon />
                    <span className="fc-tab-num">{i + 1}</span>
                    {c.unread && <span className="fc-tab-unread" data-testid="fc-tab-unread" />}
                  </button>
                  <button
                    className="fc-tab-close"
                    aria-label={`Close chat ${i + 1}`}
                    title="Close chat"
                    onClick={() => closeTabById(c.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            {state.conversations.length < MAX_TABS && (
              <button
                className="fc-tab-add"
                aria-label="New chat"
                title="New chat"
                onClick={addTab}
              >
                +
              </button>
            )}
          </div>
          <div className="fc-header-actions">
            <button
              aria-label={maximized ? 'Restore' : 'Maximize'}
              title={maximized ? 'Restore' : 'Maximize'}
              onClick={() => setState(toggleMaximize)}
            >
              ⛶
            </button>
            <button aria-label="Minimize" title="Minimize" onClick={() => setState(minimize)}>
              ─
            </button>
          </div>
        </div>

        <div className="fc-messages">
          {active.messages.length === 0 && (
            <div className="fc-greeting">
              <div className="fc-greeting-text">👋 Hi! How can I help you?</div>
              <div className="fc-tool-status">
                ask about the project, people, meetings — or type / for skills
              </div>
            </div>
          )}
          {active.messages.map((m, i) => {
            const isLast = i === active.messages.length - 1
            return m.role === 'user' ? (
              <div key={i} className="fc-msg-user">
                {m.content}
              </div>
            ) : (
              <div key={i} className="fc-msg-assistant">
                {active.streaming && isLast && active.toolStatus && (
                  <div className="fc-tool-status">⏺ {active.toolStatus}</div>
                )}
                {active.streaming && isLast && !active.toolStatus && m.content === '' && (
                  <div className="fc-tool-status">
                    › thinking…{elapsedSec > 0 ? ` (${elapsedSec}s)` : ''}
                  </div>
                )}
                <ChatMarkdown content={m.content} />
                {active.streaming && isLast && !active.toolStatus && (
                  <span className="fc-cursor">▋</span>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {active.pendingSkill && (
          <div className="fc-skill-chip">
            /{active.pendingSkill}
            <button aria-label="Clear skill" onClick={() => setState(clearSkill)}>
              ×
            </button>
          </div>
        )}

        <div className="fc-input-row">
          {slashMatches.length > 0 && (
            <div className="fc-slash-menu">
              {slashMatches.map((s, i) => (
                <button
                  key={s.name}
                  className={i === 0 ? 'fc-slash-active' : ''}
                  onClick={() => pickSkill(s.name)}
                >
                  <span className="fc-slash-name">/{s.name}</span>{' '}
                  <span className="fc-slash-desc">{s.description}</span>
                </button>
              ))}
            </div>
          )}
          <span className="fc-prompt">›</span>
          <textarea
            className="fc-input"
            rows={1}
            value={active.draft}
            placeholder="message… (/ for skills)"
            onChange={(e) => setState((s) => setDraft(s, e.target.value))}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  )
}
