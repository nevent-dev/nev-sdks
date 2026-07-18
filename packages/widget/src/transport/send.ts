import type { SessionClient } from '../shell/session'
import type { MessageStore } from '../store/message-store'
import { runStreamingTurn, type TurnHandlers } from './turn'

export interface SenderDeps {
  client: Pick<SessionClient, 'authorizedFetch'>
  store: MessageStore
  streaming: boolean
  uuid?: () => string
  onConversationStarted?: () => void
}

export interface Sender {
  send(text: string): Promise<void>
  retry(clientId: string): Promise<void>
  cancel(): void
  teardown(): void
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
function asRecord(data: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(data)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function createSender(deps: SenderDeps): Sender {
  const uuid = deps.uuid ?? (() => crypto.randomUUID())
  const texts = new Map<string, string>()
  let useStreaming = deps.streaming
  let started = false
  let inFlight: AbortController | null = null
  let currentTurnId: string | null = null

  const markStarted = (): void => {
    if (started) return
    started = true
    deps.onConversationStarted?.()
  }

  const streamOnce = async (clientId: string, text: string): Promise<void> => {
    const ac = new AbortController()
    inFlight = ac
    currentTurnId = null
    let began = false
    const handlers: TurnHandlers = {
      onAccepted: (turnId, userMessageId) => {
        currentTurnId = turnId
        deps.store.ackOptimistic(clientId, userMessageId)
        markStarted() // channel opens once the conversation exists
      },
      onDelta: (turnId, delta) => {
        if (!began) { deps.store.beginBotTurn(turnId); began = true }
        deps.store.appendBotDelta(turnId, delta)
      },
      onDone: (turnId, messageId) => deps.store.finishBotTurn(turnId, messageId),
      onError: (_code) => { if (currentTurnId) deps.store.failBotTurn(currentTurnId) },
    }
    try {
      await runStreamingTurn(deps.client, clientId, text, handlers, ac.signal)
    } catch (err) {
      if (isAbortError(err) && !currentTurnId) {
        // cancelled before the turn was accepted: no bot placeholder exists yet,
        // and nothing else will ever ack/fail this optimistic user message.
        deps.store.failOptimistic(clientId)
        return
      }
      // mirror the abort branch for non-abort mid-stream failures too, so a
      // streaming placeholder is never left orphaned in `streaming: true`.
      if (currentTurnId) deps.store.failBotTurn(currentTurnId)
      if (isAbortError(err)) return
      throw err
    } finally {
      if (inFlight === ac) { inFlight = null; currentTurnId = null }
    }
  }

  const sendNonStreaming = async (clientId: string, text: string): Promise<void> => {
    const res = await deps.client.authorizedFetch('/widget/v1/conversations/current/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientId },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`send_http:${res.status}`)
    const body = asRecord(await res.text())
    const userMessageId = typeof body['userMessageId'] === 'string' ? body['userMessageId'] : clientId
    deps.store.ackOptimistic(clientId, userMessageId)
    markStarted()
    // state + bot reply arrive via the events channel — never inferred from the response.
  }

  const deliver = async (clientId: string, text: string): Promise<void> => {
    try {
      if (useStreaming) await streamOnce(clientId, text)
      else await sendNonStreaming(clientId, text)
    } catch (err) {
      if (isAbortError(err)) return // cancel: never fail, never fall back
      if (useStreaming) useStreaming = false // degrade SUBSEQUENT sends (not this one)
      deps.store.failOptimistic(clientId)
    }
  }

  return {
    async send(text: string): Promise<void> {
      const clientId = uuid()
      texts.set(clientId, text)
      deps.store.addOptimistic(clientId, text)
      await deliver(clientId, text)
    },
    async retry(clientId: string): Promise<void> {
      const text = texts.get(clientId)
      if (text === undefined) return
      deps.store.retryOptimistic(clientId)
      await deliver(clientId, text)
    },
    cancel(): void {
      const turnId = currentTurnId
      inFlight?.abort()
      if (turnId) void deps.client.authorizedFetch(`/widget/v1/turns/${turnId}/cancel`, { method: 'POST' })
    },
    teardown(): void {
      // Local-only abort: unlike cancel(), never POSTs /turns/{id}/cancel — the
      // caller (facade destroy()) is tearing down the widget, not asking the
      // server to abort a turn that should keep persisting server-side.
      inFlight?.abort()
    },
  }
}
