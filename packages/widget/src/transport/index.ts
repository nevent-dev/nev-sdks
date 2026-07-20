import type { SessionClient } from '../shell/session'
import { createMessageStore, type MessageStore } from '../store/message-store'
import { createSender } from './send'
import { createEventsChannel, type Scheduler } from './events-channel'
import { bindPageLifecycle } from '../shell/lifecycle'
import type { Backoff } from './backoff'

export interface TransportOptions {
  window?: Window
  scheduler?: Scheduler
  backoff?: Backoff
  pollIntervalMs?: number
  reconnectDelayMs?: number
  uuid?: () => string
  now?: () => string
  // Task W4: reutiliza un MessageStore EXISTENTE en vez de fabricar uno
  // nuevo — necesario cuando shell/app.tsx reconstruye el transport sobre un
  // cliente NUEVO tras un re-bootstrap de sesión (sesión muerta a mitad de
  // vida): sin esto, el historial ya mostrado en pantalla se perdería en
  // cada swap de cliente aunque la sesión se hubiera resumido de verdad.
  store?: MessageStore
}

export interface Transport {
  store: MessageStore
  send(text: string): Promise<void>
  retry(clientId: string): Promise<void>
  cancel(): void
  openChannel(): void
  closeChannel(): void
  destroy(): void
}

export function createTransport(client: SessionClient, opts: TransportOptions = {}): Transport {
  const store = opts.store ?? (opts.now ? createMessageStore(opts.now) : createMessageStore())

  const channel = createEventsChannel({
    client,
    store,
    ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
    ...(opts.backoff ? { backoff: opts.backoff } : {}),
    ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
    ...(opts.reconnectDelayMs !== undefined ? { reconnectDelayMs: opts.reconnectDelayMs } : {}),
  })

  const sender = createSender({
    client,
    store,
    streaming: true, // always attempt streaming; the sender degrades on transport failure (Task 7)
    ...(opts.uuid ? { uuid: opts.uuid } : {}),
    onConversationStarted: () => channel.open(), // open once the server accepts the first message
  })

  const win = opts.window ?? (typeof window !== 'undefined' ? window : undefined)
  const unbindLifecycle = win
    ? bindPageLifecycle(win, { onSuspend: () => channel.suspend(), onResume: () => channel.resume() })
    : () => {}

  return {
    store,
    send: (text) => sender.send(text),
    retry: (clientId) => sender.retry(clientId),
    cancel: () => sender.cancel(),
    openChannel: () => channel.open(),
    closeChannel: () => channel.close(),
    destroy: () => { unbindLifecycle(); sender.teardown(); channel.close() },
  }
}
