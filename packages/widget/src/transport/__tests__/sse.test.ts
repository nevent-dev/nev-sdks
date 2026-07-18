import { describe, it, expect } from 'vitest'
import { parseSSEStream, type SSEEvent } from '../sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]!))
      else controller.close()
    },
  })
}
async function collect(chunks: string[]): Promise<SSEEvent[]> {
  const out: SSEEvent[] = []
  for await (const ev of parseSSEStream(streamOf(chunks))) out.push(ev)
  return out
}

describe('parseSSEStream', () => {
  it('parses a single well-formed frame', async () => {
    expect(await collect(['event: accepted\ndata: {"turnId":"t1"}\n\n']))
      .toEqual([{ event: 'accepted', data: '{"turnId":"t1"}' }])
  })
  it('reassembles a frame split mid-event across chunks', async () => {
    expect(await collect(['event: del', 'ta\ndata: {"seq":', '1}\n\n']))
      .toEqual([{ event: 'delta', data: '{"seq":1}' }])
  })
  it('handles two frames in one chunk and CRLF line endings', async () => {
    const out = await collect(['event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n'])
    expect(out.map((e) => e.event)).toEqual(['a', 'b'])
    expect(out.map((e) => e.data)).toEqual(['1', '2'])
  })
  it('ignores comment/heartbeat lines but keeps the surrounding frame', async () => {
    expect(await collect([': keep-alive\n\nevent: done\ndata: {}\n\n']))
      .toEqual([{ event: 'done', data: '{}' }])
  })
  it('yields an event-only heartbeat frame (liveness signal for the channel)', async () => {
    expect(await collect(['event: heartbeat\n\n'])).toEqual([{ event: 'heartbeat', data: '' }])
  })
  it('joins multiple data: lines and reads id:', async () => {
    const out = await collect(['id: evt_v1_c_7\nevent: message.created\ndata: a\ndata: b\n\n'])
    expect(out[0]).toEqual({ event: 'message.created', data: 'a\nb', id: 'evt_v1_c_7' })
  })
  it('flushes a trailing frame with no final blank line', async () => {
    expect(await collect(['event: x\ndata: 1'])).toEqual([{ event: 'x', data: '1' }])
  })
  it('decodes a multi-byte char split across chunk byte boundaries (decoder flush)', async () => {
    const enc = new TextEncoder()
    const full = enc.encode('data: 👋\n\n') // 👋 = 4 bytes (0xF0 0x9F 0x91 0x8B)
    const cut = full.indexOf(0xf0) + 2       // split inside the emoji
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(full.slice(0, cut)); c.enqueue(full.slice(cut)); c.close() },
    })
    const out: SSEEvent[] = []
    for await (const ev of parseSSEStream(body)) out.push(ev)
    expect(out[0]?.data).toBe('👋')
  })
  it('aborting unblocks a read parked on a never-ending stream', async () => {
    const ac = new AbortController()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({ start() { /* never enqueue, never close */ }, cancel() { cancelled = true } })
    const gen = parseSSEStream(body, ac.signal)
    const parked = gen.next() // blocks on read()
    ac.abort()
    const r = await parked
    expect(r.done).toBe(true)
    expect(cancelled).toBe(true)
  })
})
