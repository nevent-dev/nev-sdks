import { describe, it, expect, vi, afterEach } from 'vitest'
import { Composer } from '../Composer'
import { computeViewState } from '../view-state'
import { MessageBubble } from '../MessageBubble'
import type { StoredMessage } from '../../store/message-store'
import { ConnectionBanner } from '../ConnectionBanner'
import { STRINGS, StringsContext, type WidgetStrings } from '../strings'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: 1, streaming: true,
    createdAt: '2026-07-18T14:02:00.000Z', clientId: null, turnId: null, authorName: null, authorAvatarUrl: null, ...overrides,
  }
}

describe('locale — el árbol respeta STRINGS.en vía StringsContext.Provider', () => {
  it('Composer: placeholder (view-state parametrizado) y "Powered by" (propio) en inglés', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
      assistantName: 'Assistant', isStreaming: false, strings: STRINGS.en,
    })
    const root = await mount(
      <StringsContext.Provider value={STRINGS.en}>
        <Composer viewState={viewState} onSend={vi.fn()} onStop={vi.fn()} />
      </StringsContext.Provider>,
    )
    expect(root.querySelector('textarea')?.getAttribute('placeholder')).toBe('Type your question…')
    expect(root.querySelector('.powered')?.textContent).toContain('Powered by')
  })

  it('MessageBubble: "Thinking…" en streaming sin texto, "Retry" en mensaje fallido', async () => {
    const thinkingRoot = await mount(
      <StringsContext.Provider value={STRINGS.en}>
        <MessageBubble message={msg()} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />
      </StringsContext.Provider>,
    )
    expect(thinkingRoot.querySelector('.thinking')?.textContent).toContain('Thinking')

    const failedRoot = await mount(
      <StringsContext.Provider value={STRINGS.en}>
        <MessageBubble
          message={msg({ role: 'user', status: 'failed', clientId: 'c1', streaming: false })}
          agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false}
        />
      </StringsContext.Provider>,
    )
    expect(failedRoot.querySelector('button.retry')?.textContent?.trim()).toBe('Retry')
  })

  it('ConnectionBanner offline: "Offline. Retrying…"', async () => {
    const root = await mount(
      <StringsContext.Provider value={STRINGS.en}>
        <ConnectionBanner kind="offline" />
      </StringsContext.Provider>,
    )
    expect(root.querySelector('.conn.offline')?.textContent).toBe('Offline. Retrying…')
  })
})

describe('STRINGS — paridad de claves entre locales (nunca una traducción a medias)', () => {
  it('es/en/ca/pt exponen exactamente las mismas claves', () => {
    const keysOf = (o: WidgetStrings): string[] => Object.keys(o).sort()
    const es = keysOf(STRINGS.es)
    expect(es.length).toBeGreaterThan(0)
    expect(keysOf(STRINGS.en)).toEqual(es)
    expect(keysOf(STRINGS.ca)).toEqual(es)
    expect(keysOf(STRINGS.pt)).toEqual(es)
  })
})
