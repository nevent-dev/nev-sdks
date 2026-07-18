import { describe, it, expect, vi } from 'vitest'
import { createEventsChannel, type Scheduler } from '../events-channel'
import { createBackoff } from '../backoff'
import { createMessageStore } from '../../store/message-store'
import type { MessagesSnapshot } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sseOpen(frames: string[]): Response { // emits frames, stays open → connect parks live
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
function sseFail(): Response { return new Response(null, { status: 503 }) }
// A real (0ms) timer, NOT queueMicrotask: `vi.waitFor` polls via a real
// setInterval, and a retry loop that never genuinely blocks (e.g. a mock
// where /events? always fails immediately) chains an unbroken microtask
// queue — per the JS spec, microtasks fully drain before any macrotask runs,
// so a real setInterval callback can never get a turn and the loop spins
// until OOM. A 0ms real timer still resolves in well under a millisecond but
// yields to the timer phase each tick, letting vi.waitFor's poll interleave.
const immediate = (): Scheduler => ({ setTimeout: (fn) => setTimeout(fn, 0) as unknown as number, clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) })
const fastBackoff = () => createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 })

const SNAP: MessagesSnapshot = {
  messages: [{ messageId: 'm1', role: 'bot', text: 'Hola', createdAt: '2026-07-17T14:00:00Z' }],
  state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_1',
}
function ev(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}

describe('events channel — core', () => {
  it('open: snapshot then tail events with ?after=snapshotCursor, dedup overlap, cursor advances', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const calls: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      calls.push(path)
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseOpen([
        ev(1, 'm1', 'Hola'), // overlaps the snapshot → deduped
        ev(2, 'm2', 'Quiero cambiarla'),
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"ESCALATED_WAITING"}}\n\n',
      ])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().conversationState).toBe('ESCALATED_WAITING'))
    expect(store.getState().messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_3')
    expect(calls[0]).toContain('/widget/v1/conversations/current/messages')
    expect(calls[1]).toContain('/widget/v1/events?after=evt_v1_conv_demo_01_1')
    ch.close()
  })

  it('routes agent.typing (ephemeral) without moving the cursor', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseOpen(['event: agent.typing\ndata: {"isTyping":true}\n\n'])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff() })
    ch.open()
    await vi.waitFor(() => expect(store.getState().agentTyping).toBe(true))
    expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_1')
    ch.close()
  })

  it('a 409 hard-resets via replaceSnapshot and reconnects', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      eventsCall += 1
      if (eventsCall === 1) return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409)
      return sseOpen([ev(2, 'm2', 'reanudado')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    const snapshots = authorizedFetch.mock.calls.filter((c) => String(c[0]).includes('/messages')).length
    expect(snapshots).toBe(2) // re-snapshotted after the 409
    ch.close()
  })

  it('durable event-name matching is case-insensitive (backend casing drift does not silently drop events)', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(SNAP)
      return sseOpen([
        `event: Message.Created\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:02:00Z","type":"message.created","payload":{"messageId":"m2","role":"bot","text":"hola"}}\n\n`,
      ])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    ch.close()
  })

  it('open is idempotent and close stops the loop', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let snapshots = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) { snapshots += 1; return jsonRes(SNAP) }
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff() })
    ch.open(); ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    expect(snapshots).toBe(1)
    ch.close()
    expect(store.getState().connection).toBe('idle')
  })

  // Real-browser E2E finding: a FRESH session (no conversation created yet)
  // gets a real snapshotCursor from the backend for an EXISTING-but-empty
  // conversation (see SNAP/EMPTY above), but a genuinely conversation-less
  // session gets an EMPTY cursor — and the backend then unconditionally 409s
  // both /events and /events/poll for it. Opening the channel on panel-open
  // (before any message is ever sent) drove exactly this: snapshot succeeds,
  // connect() 409s, hard-reconcile still finds no conversation, connect()
  // 409s again — forever, at zero delay (nothing in the existing 409 backoff
  // resets only on a REPEATED failure of the same call; it resets on every
  // successful reconcile, so a connect-only 409 loop never engages it).
  it('a session with no conversation yet (empty cursor after reconcile) never attempts connect/poll — idles instead of looping', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const NO_CONVERSATION: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: '' }
    let snapshotCalls = 0
    let eventsCalls = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) { snapshotCalls += 1; return jsonRes(NO_CONVERSATION) }
      eventsCalls += 1 // /events or /events/poll — would only be hit by a pointless attempt
      return sseFail()
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    // NOTE: connection starts 'idle' by default (before open() does anything),
    // so waiting on connection alone would resolve trivially — wait on
    // isActive() flipping back to false instead, which only happens once the
    // no-cursor guard has actually run.
    await vi.waitFor(() => expect(ch.isActive()).toBe(false))
    expect(store.getState().connection).toBe('idle')
    expect(snapshotCalls).toBe(1)
    expect(eventsCalls).toBe(0) // never attempted — the backend guarantees a 409 for these
    ch.close()
  })

  it('after idling on no-conversation, a later open() (onConversationStarted firing on accepted) reconciles for real once a conversation exists', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const NO_CONVERSATION: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: '' }
    let snapshotCalls = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) {
        snapshotCalls += 1
        return snapshotCalls === 1 ? jsonRes(NO_CONVERSATION) : jsonRes(SNAP)
      }
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(ch.isActive()).toBe(false)) // idled on the empty cursor
    ch.open() // same call the sender's onConversationStarted hook makes on accepted
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    expect(snapshotCalls).toBe(2)
    ch.close()
  })
})

function durableEvent(seq: number, id: string, text: string) {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1 as const, conversationId: 'conv_demo_01',
    occurredAt: `2026-07-17T14:0${seq}:00Z`, type: 'message.created' as const,
    payload: { messageId: id, role: 'bot' as const, text },
  }
}
const EMPTY: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }
function sseThenError(frames: string[]): Response {
  // A pull-driven stream: each pull delivers one frame; once frames are
  // exhausted the NEXT pull errors. This guarantees the consumer READS the
  // frame before the drop (enqueue + error in the same start() would discard
  // the queued chunk — the error tears the stream down before it is read).
  const enc = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < frames.length) c.enqueue(enc.encode(frames[i++]!))
      else c.error(new Error('drop'))
    },
  })
  return new Response(body, { status: 200 })
}

describe('events channel — resilience & lifecycle', () => {
  it('falls back to polling after 2 consecutive stream failures and applies polled durables', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [durableEvent(2, 'mp', 'desde-poll')], cursor: 'evt_v1_conv_demo_01_2' })
      if (path.includes('/events?')) { streamAttempts += 1; return sseFail() }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('polling'))
    expect(streamAttempts).toBeGreaterThanOrEqual(2)
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mp')).toBe(true))
    ch.close()
  })

  it('recovers to live: after polling, a working stream returns the channel to live', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [], cursor: null })
      if (path.includes('/events?')) {
        streamAttempts += 1
        if (streamAttempts <= 2) return sseFail()
        return sseOpen([ev(3, 'mlive', 'en-vivo')]) // stays open → parks live
      }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mlive')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })

  it('offline sets connection=offline and stops; resume re-reconciles when online', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let online = false
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      return sseOpen([ev(2, 'm2', 'hola')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), isOnline: () => online, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('offline'))
    online = true
    ch.resume()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })

  it('suspend keeps the cursor; resume reconnects from it', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const afters: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      const m = /after=([^&]*)/.exec(path)
      if (m) afters.push(decodeURIComponent(m[1]!))
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_2'))
    ch.suspend()
    ch.resume()
    await vi.waitFor(() => expect(afters.length).toBeGreaterThanOrEqual(2))
    expect(afters.at(-1)).toBe('evt_v1_conv_demo_01_2') // reconnected from the retained cursor
    ch.close()
  })

  it('grouped resume() calls while live do not start concurrent reconciliations', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let snapshots = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) { snapshots += 1; return jsonRes(EMPTY) }
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    const before = snapshots
    ch.resume(); ch.resume(); ch.resume() // loop already running (live) → all no-ops
    await new Promise((r) => queueMicrotask(() => r(null)))
    expect(snapshots).toBe(before)
    ch.close()
  })

  it('a stream that delivers a frame then errors resets failures (never falls to polling)', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let polled = false
    let streamN = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) { polled = true; return jsonRes({ events: [], cursor: null }) }
      streamN += 1
      return sseThenError([ev(streamN + 1, `m${streamN}`, `t${streamN}`)]) // one frame, then drop
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.length).toBeGreaterThanOrEqual(3))
    expect(polled).toBe(false) // each stream progresses (resets failures) → never reaches 2
    ch.close()
  })

  it('pollOnce advances the cursor from body.cursor even with no events', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) return jsonRes({ events: [], cursor: 'evt_v1_conv_demo_01_7' })
      if (path.includes('/events?')) return sseFail() // force into polling
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().cursor).toBe('evt_v1_conv_demo_01_7'))
    ch.close()
  })

  it('a pathological repeated snapshot-409 backs off before retrying the hard reconcile (no hot loop)', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let snapshotCalls = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) {
        snapshotCalls += 1
        if (snapshotCalls <= 2) return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409) // 409s TWICE in a row
        return jsonRes(EMPTY)
      }
      return sseOpen([ev(2, 'm2', 'ok')])
    })
    const nextDelay = vi.fn(() => 1)
    const backoff = { nextDelay, reset: vi.fn() }
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    // the FIRST 409 retries immediately (unchanged intent); the SECOND (repeated)
    // 409 must back off via the injected backoff before hammering snapshot() again
    expect(nextDelay).toHaveBeenCalledTimes(1)
    expect(snapshotCalls).toBe(3)
    ch.close()
  })

  it('a 409 from polling resets failures and hard-reconciles, then recovers to live', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamCall = 0
    let pollCall = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) { pollCall += 1; return jsonRes({ code: 'CURSOR_RESET_REQUIRED' }, 409) }
      streamCall += 1
      if (streamCall <= 2) return sseFail()          // two failures → polling
      return sseOpen([ev(2, 'mok', 'recuperado')])   // after the 409-driven hard reconcile
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mok')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    expect(pollCall).toBeGreaterThanOrEqual(1)
    ch.close()
  })
})
