import { describe, it, expect, vi } from 'vitest'
import { runStreamingTurn, type TurnHandlers } from '../turn'

function sseResponse(frames: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}
function openResponse(frames: string[]): Response { // emits frames, never closes
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200 })
}
function handlers(): TurnHandlers & { log: string[] } {
  const log: string[] = []
  return {
    log,
    onAccepted: (t, u) => log.push(`accepted:${t}:${u}`),
    onDelta: (t, d) => log.push(`delta:${t}:${d}`),
    onDone: (t, m) => log.push(`done:${t}:${m}`),
    onError: (c) => log.push(`error:${c}`),
  }
}

describe('runStreamingTurn', () => {
  it('sends Idempotency-Key + body and drives accepted → delta → done', async () => {
    const authorizedFetch = vi.fn(async (_path: string, _init?: RequestInit) => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","seq":1,"delta":"Sí, "}\n\n',
      'event: delta\ndata: {"turnId":"t1","seq":2,"delta":"claro."}\n\n',
      'event: DONE\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n',
    ]))
    const h = handlers()
    await runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', h, new AbortController().signal)
    expect(h.log).toEqual(['accepted:t1:u1', 'delta:t1:Sí, ', 'delta:t1:claro.', 'done:t1:m1'])
    const [path, init] = authorizedFetch.mock.calls[0]!
    expect(path).toBe('/widget/v1/conversations/current/stream')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('idem-1')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Hola' })
  })

  it('routes an ERROR frame to onError and stops', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: ERROR\ndata: {"code":"quota_exceeded"}\n\n',
    ]))
    const h = handlers()
    await runStreamingTurn({ authorizedFetch }, 'idem-1', 'Hola', h, new AbortController().signal)
    expect(h.log).toEqual(['accepted:t1:u1', 'error:quota_exceeded'])
  })

  it('throws stream_incomplete when EOF arrives after accepted/delta without DONE', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([
      'event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n',
      'event: delta\ndata: {"turnId":"t1","delta":"parcial"}\n\n',
    ])) // stream closes (EOF), no DONE
    const h = handlers()
    await expect(runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', h, new AbortController().signal))
      .rejects.toThrow('stream_incomplete')
    expect(h.log).toEqual(['accepted:t1:u1', 'delta:t1:parcial'])
  })

  it('throws AbortError (not stream_incomplete) when aborted mid-turn', async () => {
    const ac = new AbortController()
    const h = handlers()
    const authorizedFetch = vi.fn(async () => openResponse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n']))
    const p = runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', h, ac.signal)
    await vi.waitFor(() => expect(h.log).toContain('accepted:t1:u1'))
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('throws on a non-OK HTTP status', async () => {
    const authorizedFetch = vi.fn(async () => sseResponse([], 503))
    await expect(runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', handlers(), new AbortController().signal))
      .rejects.toThrow(/stream_http:503/)
  })

  it('passes the abort signal through to authorizedFetch', async () => {
    const ac = new AbortController()
    const authorizedFetch = vi.fn(async (_path: string, _init?: RequestInit) => sseResponse(['event: accepted\ndata: {"turnId":"t1","userMessageId":"u1"}\n\n', 'event: done\ndata: {"turnId":"t1","messageId":"m1","eventId":"evt_v1_c_5"}\n\n']))
    await runStreamingTurn({ authorizedFetch }, 'idem', 'Hola', handlers(), ac.signal)
    expect(authorizedFetch.mock.calls[0]![1]?.signal).toBe(ac.signal)
  })
})
