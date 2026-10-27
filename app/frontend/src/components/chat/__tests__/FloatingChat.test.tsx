import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { FloatingChat } from '../FloatingChat'
import { MAX_TABS } from '../floatingChatModel'

vi.mock('../../../api', () => ({
  api: {
    streamChat: vi.fn(),
    getChatSkills: vi.fn().mockResolvedValue([]),
  },
}))

async function importApi() {
  const mod = await import('../../../api')
  return vi.mocked(mod.api)
}

async function openPanel() {
  await userEvent.click(screen.getByRole('button', { name: /open ozos assistant/i }))
}

beforeEach(() => vi.clearAllMocks())

describe('FloatingChat', () => {
  test('starts as a bubble; clicking opens the panel', async () => {
    render(<FloatingChat page="data-hub" />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await openPanel()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  test('minimize returns to the bubble', async () => {
    render(<FloatingChat page="data-hub" />)
    await openPanel()
    await userEvent.click(screen.getByRole('button', { name: /minimize/i }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('greets with a friendly message when opened with no messages', async () => {
    render(<FloatingChat page="data-hub" />)
    await openPanel()
    expect(screen.getByText(/how can i help you/i)).toBeInTheDocument()
  })

  test('sending a message streams events into an assistant reply with page context', async () => {
    const api = await importApi()
    api.streamChat.mockImplementation(async (_msgs, opts, onEvent) => {
      expect(opts.page).toBe('data-hub')
      onEvent({ type: 'text', text: '**hi** there' })
      onEvent({ type: 'done' })
    })
    render(<FloatingChat page="data-hub" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}')
    expect(await screen.findByText('hi')).toBeInTheDocument()
    expect(api.streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      expect.objectContaining({ page: 'data-hub' }),
      expect.any(Function),
      expect.any(AbortSignal)
    )
  })

  test('shows an incrementing elapsed-time indicator while waiting for a reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = await importApi()
    api.streamChat.mockImplementation(() => new Promise(() => {}))
    render(<FloatingChat page="data-hub" />)
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: /open ozos assistant/i }))
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .type(screen.getByRole('textbox'), 'hello{Enter}')
    expect(screen.getByText(/thinking…$/)).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(2000)
    expect(screen.getByText(/thinking…\s*\(2s\)/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  test('typing / opens the skill menu; selecting sets the chip and sends skill', async () => {
    const api = await importApi()
    api.getChatSkills.mockResolvedValue([
      { name: 'quick-prd', description: 'Structured PRD' },
      { name: 'doc-style', description: 'House doc style' },
    ])
    api.streamChat.mockImplementation(async (_msgs, _opts, onEvent) => {
      onEvent({ type: 'done' })
    })
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), '/qu')
    await userEvent.click(await screen.findByText('/quick-prd'))
    expect(screen.getByText(/\/quick-prd/)).toBeInTheDocument() // chip
    await userEvent.type(screen.getByRole('textbox'), 'write a prd{Enter}')
    expect(api.streamChat).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skill: 'quick-prd' }),
      expect.any(Function),
      expect.any(AbortSignal)
    )
  })

  test('unread dot shows on the bubble when text streams while minimized', async () => {
    const api = await importApi()
    let pushEvent: ((e: { type: string; text?: string }) => void) | undefined
    api.streamChat.mockImplementation(
      (_msgs, _opts, onEvent) =>
        new Promise<void>((resolve) => {
          pushEvent = (e) => {
            onEvent(e as never)
            if (e.type === 'done') resolve()
          }
        })
    )
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}')
    await userEvent.click(screen.getByRole('button', { name: /minimize/i }))
    pushEvent!({ type: 'text', text: 'late reply' })
    expect(await screen.findByTestId('fc-unread')).toBeInTheDocument()
    pushEvent!({ type: 'done' })
  })
})

describe('tabs', () => {
  test('a single conversation shows no tab pills, only the + control', async () => {
    render(<FloatingChat page="home" />)
    await openPanel()
    expect(screen.queryByRole('button', { name: 'Chat 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument()
  })

  test('the + button reveals both numbered tabs once a second one exists', async () => {
    render(<FloatingChat page="home" />)
    await openPanel()
    expect(screen.queryByRole('button', { name: 'Chat 1' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    expect(screen.getByRole('button', { name: 'Chat 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chat 2' })).toBeInTheDocument()
  })

  test('numbered tabs use a drawn icon, not an emoji', async () => {
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    const tabOne = screen.getByRole('button', { name: 'Chat 1' })
    expect(tabOne.textContent).not.toContain('💬')
    expect(tabOne.querySelector('svg')).toBeInTheDocument()
  })

  test('the + button disappears once the tab cap is reached', async () => {
    render(<FloatingChat page="home" />)
    await openPanel()
    for (let i = 1; i < MAX_TABS; i++) {
      await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    }
    expect(screen.getByRole('button', { name: `Chat ${MAX_TABS}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new chat/i })).not.toBeInTheDocument()
  })

  test('each tab keeps its own conversation; switching shows the right one', async () => {
    const api = await importApi()
    api.streamChat.mockImplementation(async (msgs, _opts, onEvent) => {
      const last = msgs[msgs.length - 1]
      onEvent({ type: 'text', text: `echo:${last.content}` })
      onEvent({ type: 'done' })
    })
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'first{Enter}')
    expect(await screen.findByText('echo:first')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    expect(screen.queryByText('first')).not.toBeInTheDocument() // fresh tab
    await userEvent.type(screen.getByRole('textbox'), 'second{Enter}')
    expect(await screen.findByText('echo:second')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Chat 1' }))
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.queryByText('second')).not.toBeInTheDocument()
  })

  test('opening a new tab does NOT abort the current tab’s in-flight request', async () => {
    const api = await importApi()
    let capturedSignal: AbortSignal | undefined
    api.streamChat.mockImplementation(
      (_msgs, _opts, _onEvent, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal
          signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
        })
    )
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}')
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    expect(capturedSignal?.aborted).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Chat 1' }))
    expect(screen.getByText(/thinking/i)).toBeInTheDocument() // still streaming in the background
  })

  test('closing a tab aborts its in-flight request', async () => {
    const api = await importApi()
    let firstSignal: AbortSignal | undefined
    api.streamChat.mockImplementation(
      (_msgs, _opts, _onEvent, signal) =>
        new Promise((_resolve, reject) => {
          firstSignal ??= signal
          signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
        })
    )
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}')
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()

    // Open a second tab so the close controls appear, then close the streaming tab.
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    await userEvent.click(screen.getByRole('button', { name: /close chat 1/i }))
    expect(firstSignal?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: 'Chat 1' })).not.toBeInTheDocument() // only one tab left
  })

  test('a background tab shows an unread dot when its reply streams in', async () => {
    const api = await importApi()
    let pushToFirst: ((e: { type: string; text?: string }) => void) | undefined
    api.streamChat.mockImplementation(
      (_msgs, _opts, onEvent) =>
        new Promise<void>((resolve) => {
          pushToFirst = (e) => {
            onEvent(e as never)
            if (e.type === 'done') resolve()
          }
        })
    )
    render(<FloatingChat page="home" />)
    await openPanel()
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}')

    // Move to a new tab, then let tab one's reply arrive in the background.
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    pushToFirst!({ type: 'text', text: 'late reply' })

    const tabOne = await screen.findByRole('button', { name: 'Chat 1' })
    expect(await within(tabOne).findByTestId('fc-tab-unread')).toBeInTheDocument()
    pushToFirst!({ type: 'done' })
  })
})
