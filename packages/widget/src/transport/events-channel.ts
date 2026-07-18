import type { SessionClient } from '../shell/session'
import type { MessageStore } from '../store/message-store'
import type { WidgetEvent, MessagesSnapshot, EventsPollResponse } from '../contract/types'
import { parseSSEStream } from './sse'
import { createBackoff, type Backoff } from './backoff'

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
}

export interface EventsChannelDeps {
  client: Pick<SessionClient, 'authorizedFetch'>
  store: MessageStore
  scheduler?: Scheduler
  backoff?: Backoff
  pollIntervalMs?: number
  reconnectDelayMs?: number
  isOnline?: () => boolean
}

export interface EventsChannel {
  open(): void
  close(): void
  suspend(): void
  resume(): void
  isActive(): boolean
}

const DURABLE_TYPES = new Set(['message.created', 'conversation.state_changed', 'agent.joined'])

class CursorResetError extends Error {}

function parseDurable(data: string): WidgetEvent | null {
  try {
    const v: unknown = JSON.parse(data)
    if (typeof v !== 'object' || v === null) return null
    const type = (v as { type?: unknown }).type
    if (typeof type !== 'string' || !DURABLE_TYPES.has(type)) return null
    return v as WidgetEvent
  } catch {
    return null
  }
}

export function createEventsChannel(deps: EventsChannelDeps): EventsChannel {
  const scheduler: Scheduler = deps.scheduler ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  }
  const backoff = deps.backoff ?? createBackoff()
  const pollIntervalMs = deps.pollIntervalMs ?? 3000
  const reconnectDelayMs = deps.reconnectDelayMs ?? 500
  const isOnline = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true)

  let active = false
  let suspended = false
  let generation = 0
  let consecutiveFailures = 0
  let runAc: AbortController | null = null   // one AbortController per loop run (snapshot+poll+stream)
  let timer: number | null = null
  let pendingDelay: (() => void) | null = null
  let loopPromise: Promise<void> | null = null
  let loopGen = 0                            // generation of the loop currently running (0 = none)
  let restartRequested = false

  const isCurrent = (gen: number): boolean => active && !suspended && gen === generation
  const cancelDelay = (): void => {
    if (timer !== null) { scheduler.clearTimeout(timer); timer = null }
    if (pendingDelay) { const r = pendingDelay; pendingDelay = null; r() } // let an awaiting loop unwind
  }
  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      pendingDelay = resolve
      timer = scheduler.setTimeout(() => { timer = null; pendingDelay = null; resolve() }, ms)
    })

  const routeFrame = (event: string, data: string): void => {
    if (DURABLE_TYPES.has(event)) {
      const parsed = parseDurable(data)
      if (parsed) deps.store.applyDurableEvent(parsed)
    } else if (event === 'agent.typing') {
      try { deps.store.setAgentTyping((JSON.parse(data) as { isTyping?: unknown }).isTyping === true) }
      catch { /* ignore malformed ephemeral */ }
    }
    // presence / heartbeat: ignored (heartbeat still counts as progress in connect())
  }

  const snapshot = async (gen: number, signal: AbortSignal): Promise<MessagesSnapshot | null> => {
    const res = await deps.client.authorizedFetch('/widget/v1/conversations/current/messages?limit=50', { signal })
    if (!isCurrent(gen)) return null
    if (res.status === 409) throw new CursorResetError('snapshot_cursor_reset')
    if (!res.ok) throw new Error(`snapshot_http:${res.status}`)
    return (await res.json()) as MessagesSnapshot
  }

  // Parks on the live stream. Returns when the server closes it cleanly WITH
  // progress; throws on transport error or a 0-frame close; throws
  // CursorResetError on a 409. On the FIRST frame it resets BOTH the backoff and
  // the failure counter (Codex #4) — a stream that opens then drops without a
  // single frame still counts as a failure, so 2 such drops reach the fallback.
  const connect = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor ?? ''
    const res = await deps.client.authorizedFetch(`/widget/v1/events?after=${encodeURIComponent(after)}`, { signal })
    if (!isCurrent(gen)) return
    if (res.status === 409) throw new CursorResetError('events_cursor_reset')
    if (!res.ok || !res.body) throw new Error(`events_http:${res.status}`)
    deps.store.setConnection('live')
    let progressed = false
    for await (const frame of parseSSEStream(res.body, signal)) {
      if (!isCurrent(gen)) return
      if (!progressed) { progressed = true; consecutiveFailures = 0; backoff.reset() }
      routeFrame(frame.event, frame.data)
    }
    if (!isCurrent(gen)) return
    if (!progressed) throw new Error('events_closed_no_progress')
  }

  const pollOnce = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor ?? ''
    const res = await deps.client.authorizedFetch(`/widget/v1/events/poll?after=${encodeURIComponent(after)}`, { signal })
    if (!isCurrent(gen)) return
    if (res.status === 409) throw new CursorResetError('poll_cursor_reset')
    if (!res.ok) throw new Error(`poll_http:${res.status}`)
    const body = (await res.json()) as EventsPollResponse
    if (!isCurrent(gen)) return
    for (const e of body.events) deps.store.applyDurableEvent(e)
    if (body.cursor !== null) deps.store.advanceCursorTo(body.cursor) // advance even with 0 events
  }

  const reconcile = async (gen: number, hard: boolean, signal: AbortSignal): Promise<void> => {
    const snap = await snapshot(gen, signal)
    if (snap === null || !isCurrent(gen)) return
    if (hard) deps.store.replaceSnapshot(snap)
    else deps.store.applySnapshot(snap)
  }

  const runChannel = async (gen: number): Promise<void> => {
    const ac = new AbortController()
    runAc = ac
    consecutiveFailures = 0
    let hard = false
    try {
      while (isCurrent(gen)) {
        if (!isOnline()) { deps.store.setConnection('offline'); return }
        try {
          await reconcile(gen, hard, ac.signal)
          hard = false
          if (!isCurrent(gen)) return
          await connect(gen, ac.signal)  // parks while live
          if (!isCurrent(gen)) return
          await delay(reconnectDelayMs)  // clean close → brief pause, then reconcile
        } catch (err) {
          if (!isCurrent(gen)) return
          if (err instanceof CursorResetError) { hard = true; consecutiveFailures = 0; continue }
          consecutiveFailures += 1
          if (consecutiveFailures >= 2) {
            deps.store.setConnection('polling')
            try {
              await pollOnce(gen, ac.signal)
            } catch (e) {
              if (e instanceof CursorResetError) { hard = true; consecutiveFailures = 0; continue } // 409 from poll → hard reconcile
              if (!isCurrent(gen)) return
              // other poll error: stay in polling and retry next tick
            }
            if (!isCurrent(gen)) return
            await delay(pollIntervalMs)
          } else {
            deps.store.setConnection('reconnecting')
            await delay(backoff.nextDelay())
          }
        }
      }
    } finally {
      if (runAc === ac) runAc = null
    }
  }

  // At most ONE loop runs at a time. A launch requested while a loop is still
  // unwinding is deferred to that loop's `finally` (Codex #7) — so a suspend()
  // immediately followed by resume() never yields two concurrent reconciliations.
  // A launch while a CURRENT loop is live is a no-op (nothing to restart).
  const launch = (): void => {
    if (loopPromise && loopGen === generation) return // a live/current loop is already running
    if (loopPromise) { restartRequested = true; return } // a stale loop is unwinding → chain
    restartRequested = false
    generation += 1
    loopGen = generation
    const gen = generation
    loopPromise = runChannel(gen).finally(() => {
      loopPromise = null
      loopGen = 0
      if (restartRequested && active && !suspended) { restartRequested = false; launch() }
    })
  }

  const stopCurrent = (): void => {
    generation += 1        // invalidate the running loop's gen (isCurrent → false)
    runAc?.abort()         // abort in-flight snapshot / poll / stream so it unwinds now
    runAc = null
    cancelDelay()          // release any pending backoff/poll delay
  }

  return {
    open(): void {
      if (active) return
      active = true
      suspended = false
      restartRequested = false
      backoff.reset()
      launch()
    },
    close(): void {
      active = false
      suspended = false
      restartRequested = false
      stopCurrent()
      deps.store.setConnection('idle')
    },
    suspend(): void {
      if (!active) return
      suspended = true
      stopCurrent()
      if (!isOnline()) deps.store.setConnection('offline')
    },
    resume(): void {
      if (!active) return
      suspended = false
      launch()
    },
    isActive(): boolean { return active },
  }
}
