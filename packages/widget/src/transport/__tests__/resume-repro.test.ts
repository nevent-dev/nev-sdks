import { describe, it, expect, vi } from 'vitest'
import { createEventsChannel, type Scheduler } from '../events-channel'
import { createBackoff } from '../backoff'
import { createMessageStore } from '../../store/message-store'
import type { MessagesSnapshot } from '../../contract/types'

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function sseOpen(frames: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)) } })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
function sseFail(): Response { return new Response(null, { status: 503 }) }
const immediate = (): Scheduler => ({ setTimeout: (fn) => setTimeout(fn, 0) as unknown as number, clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) })
// Unlike immediate() above, this honors the requested `ms` — needed to prove
// the watchdog waits ~connectWatchdogMs before giving up, not that it fires
// on the very next tick regardless of the configured constant.
const real = (): Scheduler => ({ setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>) })
const fastBackoff = () => createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 })

const EMPTY: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_conv_demo_01_0' }
function ev(seq: number, id: string, text: string): string {
  return `event: message.created\ndata: {"eventId":"evt_v1_conv_demo_01_${seq}","schemaVersion":1,"conversationId":"conv_demo_01","occurredAt":"2026-07-17T14:0${seq}:00Z","type":"message.created","payload":{"messageId":"${id}","role":"bot","text":"${text}"}}\n\n`
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('resume repro — variant (c): suspend while a fetch hangs (ignores abort), then resume', () => {
  it('recovers once resume is called, even if the OLD generation fetch never settles', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    // A fetch that IGNORES the AbortSignal entirely — never rejects, never
    // resolves on its own. Simulates a backgrounded-tab network stack that
    // does not promptly honor cancellation.
    const hungFirstEventsFetch = deferred<Response>()
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(EMPTY)
      eventsCall += 1
      if (eventsCall === 1) return hungFirstEventsFetch.promise // never settles
      return sseOpen([ev(2, 'm2', 'after-resume')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    // Let the loop reach the point where it's parked awaiting the hung fetch.
    await vi.waitFor(() => expect(eventsCall).toBe(1))

    ch.suspend()
    ch.resume()

    // The SECOND events call (post-resume) should eventually happen even
    // though the first fetch never settled.
    await vi.waitFor(() => expect(eventsCall).toBeGreaterThanOrEqual(2), { timeout: 500 })
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true), { timeout: 500 })
    ch.close()
  })
})

describe('resume repro — variant (a): suspend mid-poll, then resume', () => {
  it('recovers to live after a suspend that lands while pollOnce is in flight', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    let pollAttempts = 0
    const hungPoll = deferred<Response>()
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events/poll')) {
        pollAttempts += 1
        if (pollAttempts === 1) return hungPoll.promise // in-flight when we suspend
        return jsonRes({ events: [], cursor: null })
      }
      if (path.includes('/events?')) {
        streamAttempts += 1
        if (streamAttempts <= 2) return sseFail() // force polling fallback
        return sseOpen([ev(3, 'mlive', 'en-vivo')])
      }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), pollIntervalMs: 1, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(pollAttempts).toBe(1)) // now inside pollOnce, awaiting hungPoll

    ch.suspend()
    ch.resume()

    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'mlive')).toBe(true), { timeout: 1000 })
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'), { timeout: 500 })
    ch.close()
  })
})

describe('resume repro — variant (b): suspend during a backoff delay, then resume', () => {
  it('recovers after a suspend landing exactly inside the reconnect backoff delay (delay never fires on its own)', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let streamAttempts = 0
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events?')) {
        streamAttempts += 1
        if (streamAttempts === 1) return sseFail() // → reconnecting, awaits backoff delay
        return sseOpen([ev(2, 'm2', 'x')])
      }
      return jsonRes({})
    })
    // A scheduler that NEVER fires its timers on its own — the backoff delay
    // only ever resolves via cancelDelay()'s synchronous release (i.e. via
    // suspend()). This proves the recovery in this test is driven by
    // suspend()/resume(), not by the delay's own timeout elapsing.
    const scheduler: Scheduler = { setTimeout: () => 1, clearTimeout: () => {} }
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler, backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('reconnecting'))

    ch.suspend()
    ch.resume()

    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true), { timeout: 1000 })
    ch.close()
  })
})

describe('banner-stuck repro: reconcile succeeding must clear the banner without waiting on connect()', () => {
  it('reconcile succeeding after offline flips connection off "offline" BEFORE the SSE fetch resolves', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let online = false
    let eventsCall = 0
    const hungEvents = deferred<Response>() // never resolves in this test — proves the banner does not wait on it
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages') && path.includes('limit')) return jsonRes(EMPTY)
      if (path.includes('/events?')) { eventsCall += 1; return hungEvents.promise }
      return jsonRes({})
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), isOnline: () => online, reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(store.getState().connection).toBe('offline'))

    online = true
    ch.resume()

    // connect() has started (proves reconcile succeeded and a cursor exists)
    // but its fetch is deliberately parked forever — the banner must already
    // be honest by the time this happens, not stuck on 'offline'.
    await vi.waitFor(() => expect(eventsCall).toBeGreaterThanOrEqual(1))
    expect(store.getState().connection).toBe('live')
    ch.close()
  })
})

describe('banner-stuck repro: a hung SSE connect attempt must not stall the retry loop forever', () => {
  it('SSE connect hangs (fetch settles ONLY on abort) → watchdog aborts it after the constant; retry reaches a second attempt and recovers', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    const authorizedFetch = vi.fn((path: string, init?: RequestInit) => {
      if (path.includes('/messages') && path.includes('limit')) return Promise.resolve(jsonRes(EMPTY))
      if (path.includes('/events?')) {
        eventsCall += 1
        if (eventsCall === 1) {
          // Simulates a half-open mobile socket: the request is sent but no
          // response — and no timeout — ever arrives on its own. The ONLY way
          // this promise ever settles is via the injected AbortSignal, exactly
          // like a real fetch() rejects once its controller aborts even when
          // the server never answers.
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
        }
        return Promise.resolve(sseOpen([ev(2, 'm2', 'after-watchdog')]))
      }
      return Promise.resolve(jsonRes({}))
    })
    const ch = createEventsChannel({
      client: { authorizedFetch }, store, scheduler: real(), backoff: fastBackoff(),
      reconnectDelayMs: 1, connectWatchdogMs: 200,
    })
    ch.open()
    // A short poll interval so this catches the FIRST attempt still parked
    // (well within the 200ms watchdog window, since this only needs a
    // resolved snapshot fetch + one synchronous reconcile pass) rather than
    // vi.waitFor's default 50ms poll cadence skipping straight past it.
    await vi.waitFor(() => expect(eventsCall).toBe(1), { interval: 1 })
    // Fix 1 already cleared the banner via the successful reconcile — confirm
    // the watchdog doesn't regress that while the first attempt is parked.
    expect(store.getState().connection).toBe('live')

    // The watchdog must give up on the first (hung) attempt and let the
    // channel retry, reaching a SECOND /events attempt that succeeds.
    await vi.waitFor(() => expect(eventsCall).toBeGreaterThanOrEqual(2), { timeout: 1000 })
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true))
    await vi.waitFor(() => expect(store.getState().connection).toBe('live'))
    ch.close()
  })
})

describe('resume repro — variant (d): suspend/resume/suspend interleave before the old loop unwinds, then a final resume', () => {
  it('a resume that lands while a stale loop is still winding down, followed by another suspend/resume, eventually restarts', async () => {
    const store = createMessageStore(() => '2026-07-17T15:00:00Z')
    let eventsCall = 0
    const hungFirstEventsFetch = deferred<Response>()
    const authorizedFetch = vi.fn(async (path: string) => {
      if (path.includes('/messages')) return jsonRes(EMPTY)
      eventsCall += 1
      if (eventsCall === 1) return hungFirstEventsFetch.promise
      return sseOpen([ev(2, 'm2', 'x')])
    })
    const ch = createEventsChannel({ client: { authorizedFetch }, store, scheduler: immediate(), backoff: fastBackoff(), reconnectDelayMs: 1 })
    ch.open()
    await vi.waitFor(() => expect(eventsCall).toBe(1))

    // S1, R1, S2 fired back-to-back (synchronously) — before the old (gen1)
    // loop's abort has actually unwound (its fetch never settles on its own).
    ch.suspend()
    ch.resume()
    ch.suspend()
    // ... then, much later, the real final resume.
    ch.resume()

    await vi.waitFor(() => expect(eventsCall).toBeGreaterThanOrEqual(2), { timeout: 500 })
    await vi.waitFor(() => expect(store.getState().messages.some((m) => m.id === 'm2')).toBe(true), { timeout: 500 })
    ch.close()
  })
})
