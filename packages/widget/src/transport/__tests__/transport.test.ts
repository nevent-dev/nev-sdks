import { describe, it, expect, vi } from 'vitest'
import { createTransport } from '../index'
import { createBackoff } from '../backoff'
import type { Scheduler } from '../events-channel'
import type { SessionClient } from '../../shell/session'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'
import type { MessagesSnapshot } from '../../contract/types'
import { createMessageStore } from '../../store/message-store'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sse(frames: string[]): Response { // closes after frames
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status: 200 })
}
function sseOpen(frames: string[]): Response { // parks open
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function controllableSse(frames: string[]): { response: Response; error: () => void } {
  // Emits frames now, but the ERROR is fired by the test — AFTER it has observed
  // the frame land in the store — so the drop is provably "frame delivered, then
  // dropped", not a stream torn down before its chunk was read.
  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c; for (const f of frames) c.enqueue(enc.encode(f)) },
  })
  return { response: new Response(body, { status: 200 }), error: () => ctrl.error(new Error('drop')) }
}
// A real (0ms) timer, NOT queueMicrotask (see events-channel.test.ts's
// `immediate()` for the full rationale). This matters even more now: the
// events channel's connect() watchdog (events-channel.ts) arms its timeout
// BEFORE the fetch call, so a queueMicrotask-based "fire ASAP" scheduler
// would have that timer's microtask queued strictly earlier than even the
// fastest legitimate mock fetch's own resolution — aborting healthy attempts
// and driving the retry loop into an unbroken microtask cycle that never
// yields to a macrotask (OOM). A real (macrotask) 0ms timer lets any
// microtask-only mock response/stream fully settle — and disarm the
// watchdog — before the timer phase is ever reached.
const immediate: Scheduler = { setTimeout: (fn) => setTimeout(fn, 0) as unknown as number, clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) }
const EMPTY: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }
function botEvt(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}
function fakeClient(authorizedFetch: SessionClient['authorizedFetch']): SessionClient {
  return {
    getConfig: () => fixtureConfig(), getSession: () => fixtureSession(),
    getCurrentResumeSecret: () => fixtureSession().resumeSecret, wasResumed: () => false, authorizedFetch,
    onSessionDead: () => () => {}, destroy: vi.fn(),
  }
}
let n = 0
const uuid = () => `cid_${++n}`
const opts = () => ({ scheduler: immediate, backoff: createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 }), reconnectDelayMs: 1, uuid, now: () => '2026-07-17T15:00:00Z' })

describe('createTransport (integration)', () => {
  it('send → optimistic → streamed reply; the durable replay dedups against the streamed bubble; channel opened on accepted', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)  // snapshot
      if (path.includes('/stream')) return sse([
        'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
        'event: delta\ndata: {"turnId":"t1","delta":"Sí 🙌"}\n\n',
        'event: done\ndata: {"turnId":"t1","messageId":"mbot","eventId":"evt_v1_conv_demo_01_5"}\n\n',
      ])
      if (path.includes('/events?')) return sseOpen([botEvt(5, 'mbot', 'Sí 🙌')]) // durable replay of the bot msg
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    await t.send('¿Puedo cambiar mi entrada?')
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'mbot')).toBe(true))
    expect(t.store.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1) // no duplicate
    expect(t.store.getState().messages.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    // Durable-only signal: `seq` is set exclusively by applyDurableEvent's message.created
    // branch (cursorSeq(eventId) === 5 here); the streaming-only path (finishBotTurn) leaves
    // it null. A non-null seq of 5 proves the durable replay genuinely arrived and deduped
    // against the streamed bubble — not merely that the streamed 'done' frame alone produced 'mbot'.
    await vi.waitFor(() => expect(t.store.getState().messages.find((m) => m.id === 'mbot')).toMatchObject({ seq: 5 }))
    // And that the durable channel actually opened and fetched (onConversationStarted → channel.open()).
    expect(authorizedFetch.mock.calls.some(([path]) => typeof path === 'string' && path.includes('/events?'))).toBe(true)
    t.destroy()
  })

  it('destroy() while a bot turn streams tears down the sender locally, WITHOUT posting /turns/{id}/cancel', async () => {
    n = 0
    let streamSignal: AbortSignal | undefined
    const cancels: string[] = []
    const authorizedFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY) // snapshot
      if (path.endsWith('/cancel')) { cancels.push(path); return jsonRes({ ok: true }, 202) }
      if (path.includes('/stream')) {
        streamSignal = init?.signal ?? undefined
        return sseOpen([
          'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
          'event: delta\ndata: {"turnId":"t1","delta":"Sí"}\n\n',
        ]) // parks mid-turn, never emits done/error
      }
      if (path.includes('/events?')) return sseOpen([]) // durable channel parks quietly
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    const p = t.send('¿Puedo cambiar mi entrada?')
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.role === 'bot')).toBe(true))
    expect(streamSignal?.aborted).not.toBe(true) // sanity: still in flight before destroy
    t.destroy()
    expect(streamSignal?.aborted).toBe(true) // the sender's in-flight controller was aborted locally
    expect(cancels).toEqual([]) // no server-cancel POST — the turn should keep persisting server-side
    await p
  })

  it('a server state_changed on the channel drives the client state machine', async () => {
    n = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events?')) return sseOpen([
        'event: conversation.state_changed\ndata: {"eventId":"evt_v1_conv_demo_01_2","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:06:00Z","type":"conversation.state_changed","payload":{"state":"AGENT_ACTIVE"}}\n\n',
        'event: agent.joined\ndata: {"eventId":"evt_v1_conv_demo_01_3","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:07:00Z","type":"agent.joined","payload":{"agentName":"Laura","agentAvatarUrl":null}}\n\n',
      ])
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    t.openChannel()
    await vi.waitFor(() => expect(t.store.getState().conversationState).toBe('AGENT_ACTIVE'))
    expect(t.store.getState().agentName).toBe('Laura')
    t.destroy()
  })

  it('a stream that ERRORS after delivering an event reconciles and dedups the overlap (gap-free)', async () => {
    n = 0
    let eventsCall = 0
    let firstStream: { response: Response; error: () => void } | null = null
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) {
        // after the drop, the re-snapshot returns m2 (overlap) + the missed m3
        return jsonRes(eventsCall >= 1
          ? { messages: [{ messageId: 'm2', role: 'bot', text: 'primero', createdAt: '2026-07-17T14:02:00Z' }, { messageId: 'm3', role: 'bot', text: 'segundo', createdAt: '2026-07-17T14:03:00Z' }], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_3' }
          : EMPTY)
      }
      if (path.includes('/events?')) {
        eventsCall += 1
        if (eventsCall === 1) { firstStream = controllableSse([botEvt(2, 'm2', 'primero')]); return firstStream.response }
        return sseOpen([]) // the post-reconnect stream parks quietly
      }
      return jsonRes({})
    })
    const t = createTransport(fakeClient(authorizedFetch), opts())
    t.openChannel()
    // 1) the SSE frame m2 is delivered and applied to the store...
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    // 2) ...THEN we drop the live stream with a real error...
    firstStream!.error()
    // 3) ...the channel reconciles (the re-snapshot brings the missed m3) and dedups the m2 overlap.
    await vi.waitFor(() => expect(t.store.getState().messages.some((m) => m.id === 'm3')).toBe(true))
    expect(t.store.getState().messages.filter((m) => m.id === 'm2')).toHaveLength(1)
    t.destroy()
  })

  // Task W4: tras un re-bootstrap de sesión (cliente NUEVO), shell/app.tsx
  // necesita seguir usando el MISMO store para no perder el historial ya
  // mostrado en pantalla — createTransport debe aceptar uno existente en vez
  // de fabricar uno propio.
  it('Task W4 — opts.store: reutiliza el store dado en vez de crear uno nuevo', () => {
    n = 0
    const existingStore = createMessageStore(() => '2026-07-17T15:00:00Z')
    existingStore.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_1', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-17T14:01:00Z', type: 'message.created', payload: { messageId: 'm1', role: 'bot', text: 'previo' },
    })
    const authorizedFetch = vi.fn(async () => jsonRes({}))
    const t = createTransport(fakeClient(authorizedFetch), { ...opts(), store: existingStore })
    expect(t.store).toBe(existingStore)
    expect(t.store.getState().messages.some((m) => m.id === 'm1')).toBe(true)
    t.destroy()
  })

  it('sin opts.store (comportamiento por defecto): crea un store nuevo, vacío', () => {
    n = 0
    const authorizedFetch = vi.fn(async () => jsonRes({}))
    const t = createTransport(fakeClient(authorizedFetch), opts())
    expect(t.store.getState().messages).toEqual([])
    t.destroy()
  })
})
