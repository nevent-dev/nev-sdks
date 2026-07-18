import { describe, it, expect, vi } from 'vitest'
import { createSender } from '../send'
import { createMessageStore } from '../../store/message-store'
import type { WidgetEvent } from '../../contract/types'

function sse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status })
}
function openSse(frames: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
let n = 0
const uuid = () => `cid_${++n}`

describe('createSender', () => {
  it('streaming send: optimistic pending → acked, bot bubble streamed and finalized', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async (_path: string, _init?: RequestInit) => sse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"Hola "}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"👋"}\n\n',
      'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('¿Puedo cambiar mi entrada?')
    const msgs = store.getState().messages
    expect(msgs.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    expect(msgs.find((m) => m.role === 'bot')).toMatchObject({ id: 'm1', text: 'Hola 👋', streaming: false })
    expect(new Headers(authorizedFetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')).toBe('cid_1')
  })

  it('a stream transport failure marks THIS message failed and does NOT auto-resend', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => { throw new Error('network') })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]?.status).toBe('failed')
    expect(authorizedFetch).toHaveBeenCalledTimes(1) // NO second endpoint attempt for this message
  })

  it('after a stream failure, the NEXT send degrades to non-streaming POST /messages', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let call = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      call += 1
      if (call === 1) throw new Error('network')       // first (streaming) send fails
      return json({ turnId: 't2', userMessageId: 'u2', state: 'BOT_ACTIVE' }) // subsequent: non-streaming
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('uno')
    await sender.send('dos')
    expect(store.getState().messages.find((m) => m.clientId === 'cid_2')).toMatchObject({ id: 'u2', status: 'sent' })
    expect(String(authorizedFetch.mock.calls[1]![0])).toBe('/widget/v1/conversations/current/messages')
  })

  it('retry re-sends with the SAME Idempotency-Key', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let call = 0
    const authorizedFetch = vi.fn(async (_path: string, _init?: RequestInit) => {
      call += 1
      if (call === 1) throw new Error('network')
      return json({ turnId: 't1', userMessageId: 'u1', state: 'BOT_ACTIVE' })
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]?.status).toBe('failed')
    await sender.retry('cid_1')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    const keys = authorizedFetch.mock.calls.map((c) => new Headers(c[1]?.headers).get('Idempotency-Key'))
    expect(keys.every((k) => k === 'cid_1')).toBe(true)
  })

  it('non-streaming send acks from the body and NEVER sets state from the response', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => json({ turnId: 't1', userMessageId: 'u1', state: 'AGENT_ACTIVE' }))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: false, uuid })
    await sender.send('Hola')
    expect(store.getState().messages[0]).toMatchObject({ id: 'u1', status: 'sent' })
    expect(store.getState().conversationState).toBeNull() // NOT taken from the response
  })

  it('cancel aborts the stream, POSTs /turns/{id}/cancel, and does NOT fail the message', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const cancels: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.endsWith('/cancel')) { cancels.push(path); return json({ ok: true }, 202) }
      return openSse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n']) // parks after accepted
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    const p = sender.send('Hola')
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'u1')).toBe(true))
    sender.cancel()
    await p
    expect(cancels).toEqual(['/widget/v1/turns/t1/cancel'])
    expect(store.getState().messages.find((m) => m.role === 'user')?.status).toBe('sent') // not failed
  })

  it('a non-abort mid-stream drop AFTER a delta resolves the streaming placeholder instead of leaving it stuck "typing" forever', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const authorizedFetch = vi.fn(async () => sse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"Hola "}\n\n',
      // connection drops here: no done / error frame → stream_incomplete (non-abort)
    ]))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    const bot = store.getState().messages.find((m) => m.role === 'bot')
    expect(bot).toMatchObject({ text: 'Hola ', streaming: false }) // resolved, not orphaned mid-stream
  })

  it('non-abort mid-stream drop: if the durable twin already landed, the truncated placeholder is dropped (no duplicate bubble)', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const durableTwin: WidgetEvent = {
      eventId: 'evt_v1_conv_demo_01_5', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-17T15:00:01Z', type: 'message.created',
      payload: { messageId: 'm1', role: 'bot', text: 'Hola final' },
    }
    const authorizedFetch = vi.fn(async () => {
      // the durable events channel is independent of this turn's SSE stream and
      // delivers the persisted answer before the stream itself is torn down.
      store.applyDurableEvent(durableTwin)
      return sse([
        'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
        'event: delta\ndata: {"turnId":"t1","delta":"Hola "}\n\n',
      ])
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    await sender.send('Hola')
    const bots = store.getState().messages.filter((m) => m.role === 'bot')
    expect(bots).toHaveLength(1) // no orphaned duplicate alongside the durable message
    expect(bots[0]).toMatchObject({ id: 'm1', text: 'Hola final', streaming: false })
  })

  it('cancel() BEFORE any accepted frame leaves the optimistic user message failed, not stuck pending forever', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const cancels: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.endsWith('/cancel')) { cancels.push(path); return json({ ok: true }, 202) }
      return openSse([]) // never emits 'accepted' — parks indefinitely
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    const p = sender.send('Hola')
    await vi.waitFor(() => expect(store.getState().messages[0]?.status).toBe('pending'))
    sender.cancel()
    await p
    expect(cancels).toEqual([]) // no turnId yet: nothing to POST /cancel for
    expect(store.getState().messages[0]).toMatchObject({ status: 'failed' })
  })

  it('regression: cancel() AFTER accepted with a delta in flight still resolves the bot turn, and leaves the user message sent', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const cancels: string[] = []
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.endsWith('/cancel')) { cancels.push(path); return json({ ok: true }, 202) }
      return openSse([
        'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
        'event: delta\ndata: {"turnId":"t1","delta":"Hola "}\n\n',
      ]) // parks after the delta, no done/error
    })
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid })
    const p = sender.send('Hola')
    await vi.waitFor(() => expect(store.getState().messages.find((m) => m.role === 'bot')?.text).toBe('Hola '))
    sender.cancel()
    await p
    expect(cancels).toEqual(['/widget/v1/turns/t1/cancel'])
    expect(store.getState().messages.find((m) => m.role === 'user')).toMatchObject({ id: 'u1', status: 'sent' })
    expect(store.getState().messages.find((m) => m.role === 'bot')).toMatchObject({ text: 'Hola ', streaming: false })
  })

  it('opens the conversation channel on accepted, not before', async () => {
    n = 0
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    const started = vi.fn()
    const authorizedFetch = vi.fn(async () => sse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const sender = createSender({ client: { authorizedFetch }, store, streaming: true, uuid, onConversationStarted: started })
    const p = sender.send('Hola')
    expect(started).not.toHaveBeenCalled() // not at send() entry
    await p
    expect(started).toHaveBeenCalledTimes(1) // fired on accepted
  })
})
