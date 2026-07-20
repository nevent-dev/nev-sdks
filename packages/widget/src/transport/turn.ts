import type { SessionClient } from '../shell/session'
import { parseSSEStream } from './sse'

export interface TurnHandlers {
  onAccepted(turnId: string, userMessageId: string): void
  onDelta(turnId: string, delta: string): void
  onDone(turnId: string, messageId: string): void
  onError(code: string): void
}

function asRecord(data: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(data)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function runStreamingTurn(
  client: Pick<SessionClient, 'authorizedFetch'>,
  idempotencyKey: string,
  text: string,
  handlers: TurnHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await client.authorizedFetch('/widget/v1/conversations/current/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`stream_http:${res.status}`)
  let settled = false
  for await (const ev of parseSSEStream(res.body, signal)) {
    const name = ev.event.toLowerCase()
    const p = asRecord(ev.data)
    if (name === 'accepted') {
      handlers.onAccepted(str(p['turnId']), str(p['userMessageId']))
    } else if (name === 'delta' || name === 'deltas') {
      handlers.onDelta(str(p['turnId']), str(p['delta']))
    } else if (name === 'done') {
      handlers.onDone(str(p['turnId']), str(p['messageId']))
      settled = true
      return
    } else if (name === 'error') {
      handlers.onError(str(p['code']) || 'stream_error')
      settled = true
      return
    }
    // unknown / heartbeat frames ignored
  }
  if (signal.aborted) throw new DOMException('turno cancelado', 'AbortError')
  if (!settled) throw new Error('stream_incomplete') // EOF without DONE|ERROR → drop
}
