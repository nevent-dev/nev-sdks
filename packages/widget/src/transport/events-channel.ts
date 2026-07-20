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
  // onSessionDead es OPCIONAL a propósito: la mayoría de dobles de test en
  // esta suite pasan `{ authorizedFetch }` a secas, y el canal debe seguir
  // funcionando exactamente igual sin él (compat hacia atrás). El cliente
  // real (shell/session.ts, Task W4) siempre lo implementa.
  client: Pick<SessionClient, 'authorizedFetch'> & { onSessionDead?: SessionClient['onSessionDead'] }
  store: MessageStore
  scheduler?: Scheduler
  backoff?: Backoff
  pollIntervalMs?: number
  reconnectDelayMs?: number
  connectWatchdogMs?: number
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
  const connectWatchdogMs = deps.connectWatchdogMs ?? 10000
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
    const name = event.toLowerCase() // tolerate backend casing drift (matches turn.ts)
    if (DURABLE_TYPES.has(name)) {
      const parsed = parseDurable(data)
      if (parsed) deps.store.applyDurableEvent(parsed)
    } else if (name === 'agent.typing') {
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

  // Never send `after=` empty: an absent cursor means "build the URL with no
  // query at all", not `after=` with nothing after it. In practice the
  // no-cursor guard below (in runChannel) means connect()/pollOnce() are never
  // even called without a cursor — this is defense in depth, not the primary
  // fix, kept because a future caller of these internals should not have to
  // rediscover the same footgun.
  const eventsUrl = (base: string, after: string | null): string =>
    after ? `${base}?after=${encodeURIComponent(after)}` : base

  // Arms a per-attempt watchdog: if `attemptAc` isn't aborted for some other
  // reason first, fires attemptAc.abort() once connectWatchdogMs elapses.
  // Returns a disarm function (idempotent, safe to call more than once).
  //
  // Cancellation is enforced via the local `disarmed` flag, NOT solely via
  // scheduler.clearTimeout() — mirrors delay()/cancelDelay()'s pendingDelay
  // guard above. A test (or a real environment) is free to hand in a
  // Scheduler whose clearTimeout() doesn't actually prevent the callback from
  // firing; if the watchdog callback ran unconditionally in that case, it
  // would abort every single connect() attempt shortly after arming it —
  // including healthy ones — and drive the retry loop into a tight,
  // never-yielding cycle.
  const armWatchdog = (attemptAc: AbortController): (() => void) => {
    let disarmed = false
    const id = scheduler.setTimeout(() => { if (!disarmed) attemptAc.abort() }, connectWatchdogMs)
    return () => { disarmed = true; scheduler.clearTimeout(id) }
  }

  // Parks on the live stream. Returns when the server closes it cleanly WITH
  // progress; throws on transport error or a 0-frame close; throws
  // CursorResetError on a 409. On the FIRST frame it resets BOTH the backoff and
  // the failure counter — a stream that opens then drops without a single
  // frame still counts as a failure, so 2 such drops reach the fallback.
  //
  // This attempt gets its OWN AbortController, chained to the caller's
  // `signal` (aborting one aborts the other) and additionally torn down by
  // armWatchdog() if neither a response nor a first frame shows up within
  // connectWatchdogMs — a backgrounded mobile radio can leave a half-open
  // socket where the request is sent but nothing, not even a rejection, ever
  // comes back on its own; without this, that single attempt parks forever
  // and the channel never falls through to the retry/backoff path.
  const connect = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor
    const attemptAc = new AbortController()
    const onParentAbort = (): void => attemptAc.abort()
    if (signal.aborted) attemptAc.abort()
    else signal.addEventListener('abort', onParentAbort)
    const disarmWatchdog = armWatchdog(attemptAc)
    try {
      let res: Response
      try {
        res = await deps.client.authorizedFetch(eventsUrl('/widget/v1/events', after), { signal: attemptAc.signal })
      } catch (err) {
        // Distinguishes "the watchdog gave up on this attempt" from a genuine
        // parent-driven abort (close()/generation bump); isCurrent(gen) below
        // still governs what happens next either way.
        if (attemptAc.signal.aborted && !signal.aborted) throw new Error('events_connect_timeout')
        throw err
      }
      if (!isCurrent(gen)) return
      if (res.status === 409) throw new CursorResetError('events_cursor_reset')
      if (!res.ok || !res.body) throw new Error(`events_http:${res.status}`)
      deps.store.setConnection('live')
      let progressed = false
      for await (const frame of parseSSEStream(res.body, attemptAc.signal)) {
        if (!isCurrent(gen)) return
        if (!progressed) { progressed = true; consecutiveFailures = 0; backoff.reset(); disarmWatchdog() }
        routeFrame(frame.event, frame.data)
      }
      if (!isCurrent(gen)) return
      if (!progressed) throw new Error('events_closed_no_progress')
    } finally {
      disarmWatchdog()
      signal.removeEventListener('abort', onParentAbort)
    }
  }

  const pollOnce = async (gen: number, signal: AbortSignal): Promise<void> => {
    const after = deps.store.getState().cursor
    const res = await deps.client.authorizedFetch(eventsUrl('/widget/v1/events/poll', after), { signal })
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
    let hardResetStreak = 0 // consecutive CURSOR_RESET_REQUIREDs, to back off a pathological 409 loop
    try {
      while (isCurrent(gen)) {
        if (!isOnline()) { deps.store.setConnection('offline'); return }
        try {
          await reconcile(gen, hard, ac.signal)
          hard = false
          hardResetStreak = 0
          if (!isCurrent(gen)) return
          // Backend semantics: a session with NO conversation returns
          // CURSOR_RESET_REQUIRED (409) unconditionally from both /events and
          // /events/poll — connecting is guaranteed to fail before it's even
          // tried. An empty cursor straight out of reconcile() IS that signal:
          // there is nothing to listen to yet (as opposed to a real conversation
          // with zero messages so far, whose snapshot still carries a real
          // cursor). Idle instead of burning a request and instead of looping:
          // deactivate so a later open() is NOT a no-op — `onConversationStarted`
          // (the sender's accepted hook, see transport/index.ts) calls it for
          // real once a conversation actually exists.
          if (!deps.store.getState().cursor) {
            deps.store.setConnection('idle')
            active = false
            return
          }
          // Reconcile just proved the network (and this session) are healthy
          // — reflect that immediately instead of waiting for connect() to
          // make any progress of its own. Previously only connect()/the catch
          // block ever touched connection state, so a connect() attempt that
          // stalled (see armWatchdog above) left the banner showing
          // offline/reconnecting forever even though data was already
          // flowing again via reconcile.
          deps.store.setConnection('live')
          await connect(gen, ac.signal)  // parks while live
          if (!isCurrent(gen)) return
          await delay(reconnectDelayMs)  // clean close → brief pause, then reconcile
        } catch (err) {
          if (!isCurrent(gen)) return
          if (err instanceof CursorResetError) {
            hard = true
            consecutiveFailures = 0
            hardResetStreak += 1
            // First 409 → immediate hard re-reconcile (unchanged intent). A REPEATED
            // 409 means the hard reconcile itself keeps failing — back off instead of
            // busy-looping snapshot() at zero delay.
            if (hardResetStreak > 1) await delay(backoff.nextDelay())
            continue
          }
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

  // At most one CURRENT (tracked) loop runs at a time, but launch() never
  // blocks progress on a stale generation actually unwinding: a resume()
  // that lands while the previous generation's runChannel() hasn't yet
  // noticed its abort (e.g. its in-flight fetch simply never settles — real
  // mobile browsers can freeze a backgrounded page's task queue before the
  // abort-triggered rejection task runs, stalling that promise indefinitely)
  // must still make forward progress. Every consequential branch inside
  // runChannel() (reconcile/connect/pollOnce, the catch block) checks
  // isCurrent(gen) before touching store/runAc/timer, so a stale generation
  // that wakes up late is always a safe no-op — it's fine for its promise to
  // keep dangling. The one thing that must NOT happen is the stale run's
  // `finally` clobbering a newer generation's `loopPromise`/`loopGen`; the
  // `loopGen === gen` guard below makes that finally inert once superseded.
  const launch = (): void => {
    if (loopPromise && loopGen === generation) return // a live/current loop is already running
    generation += 1
    loopGen = generation
    const gen = generation
    loopPromise = runChannel(gen).finally(() => {
      if (loopGen !== gen) return // superseded by a newer generation — its bookkeeping owns loopPromise/loopGen now
      loopPromise = null
      loopGen = 0
    })
  }

  const stopCurrent = (): void => {
    generation += 1        // invalidate the running loop's gen (isCurrent → false)
    runAc?.abort()         // abort in-flight snapshot / poll / stream so it unwinds now
    runAc = null
    cancelDelay()          // release any pending backoff/poll delay
  }

  // Task W4: una sesión MUERTA (terminal, ver SessionClient#onSessionDead) no
  // es un fallo transitorio más — reintentarla vía el backoff/polling
  // habitual es exactamente el bug real reproducido (Reconectando… eterno).
  // Bumpear `generation` aquí basta: TODOS los puntos de espera relevantes
  // dentro de runChannel (snapshot/connect/pollOnce, justo después de cada
  // `await authorizedFetch(...)`) ya comprueban `isCurrent(gen)` antes de
  // interpretar el status code de la respuesta — el mismo mecanismo que ya
  // usan close()/suspend() para invalidar un loop en marcha — así que el
  // 401 terminal que disparó la muerte nunca llega a re-entrar en el
  // catch/backoff: la llamada en curso simplemente se resuelve como un
  // no-op y el bucle termina. Deliberadamente NO toca `connection`: un
  // re-bootstrap está a punto de reemplazar este canal entero (shell/app.tsx)
  // — forzar 'idle'/'offline' aquí solo produciría un parpadeo del banner.
  // Nit W4 review (Task W3c): capturar la desuscripción, no descartarla — sin
  // esto, un swap de cliente (rebuild tras muerte de sesión, ver
  // shell/app.tsx) deja este listener colgado en el Set de deadListeners del
  // cliente VIEJO (session.ts) para siempre, aunque ese canal ya esté
  // cerrado y nadie vuelva a usarlo.
  const unsubscribeSessionDead = deps.client.onSessionDead?.(() => {
    stopCurrent()
    active = false
    suspended = false
  })

  return {
    open(): void {
      if (active) return
      active = true
      suspended = false
      backoff.reset()
      launch()
    },
    close(): void {
      active = false
      suspended = false
      stopCurrent()
      deps.store.setConnection('idle')
      unsubscribeSessionDead?.()
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
