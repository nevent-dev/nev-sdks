import type { WidgetEvent, ConversationState, MessagesSnapshot } from '../contract/types'
import { cursorSeq } from '../transport/cursor'

export type MessageStatus = 'pending' | 'sent' | 'failed'
export type ConnectionStatus = 'idle' | 'live' | 'reconnecting' | 'polling' | 'offline'

export interface StoredMessage {
  readonly id: string
  readonly role: 'user' | 'bot' | 'agent'
  readonly text: string
  readonly status: MessageStatus
  readonly seq: number | null
  readonly streaming: boolean
  readonly createdAt: string
  readonly clientId: string | null
  readonly turnId: string | null
  // Fix W5b: display name of the replying agent for THIS message specifically
  // (backend W5a's WidgetMessage.authorName) — only ever set on role:'agent'
  // messages hydrated from a snapshot; live message.created events and
  // optimistic/streaming placeholders carry null. MessageBubble falls back
  // to the conversation-level agentName, then a neutral glyph, when null.
  readonly authorName: string | null
}

export interface StoreState {
  readonly messages: readonly StoredMessage[]
  readonly conversationState: ConversationState | null
  readonly cursor: string | null
  readonly agentName: string | null
  readonly agentAvatarUrl: string | null
  readonly agentTyping: boolean
  readonly connection: ConnectionStatus
  // Task W4: se activa cuando shell/app.tsx recupera una sesión muerta con
  // una NUEVA (no resumida) — ver resetForNewConversation. NO es un reflejo
  // de estado del servidor, es un marcador puramente cliente. Task W3c
  // (nit W4 review): one-shot, no permanente — se apaga sola en el próximo
  // ackOptimistic exitoso (ver #ackOptimistic más abajo), para que la
  // tarjeta no quede pegada bajo mensajes nuevos de la conversación de
  // verdad para siempre.
  readonly newConversationNotice: boolean
}

export interface MessageStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  applySnapshot(snapshot: MessagesSnapshot): void
  replaceSnapshot(snapshot: MessagesSnapshot): void
  applyDurableEvent(event: WidgetEvent): void
  advanceCursorTo(eventId: string): void
  // Task W4: recuperación de sesión muerta con una sesión NUEVA (no resume
  // genuino) — olvida todo lo que este store sabía de la conversación
  // ANTERIOR (cursor, conversationState, identidad de agente, dedup) para
  // que el eventId de la conversación NUEVA (su propio contador, no
  // comparable con el viejo) se adopte sin colisionar. Descarta los mensajes
  // ya enviados (pertenecían a la conversación anterior); conserva los
  // pendientes/en streaming (un envío en curso no debe perderse). `showNotice`
  // activa newConversationNotice — lo decide el llamante (solo cuando había
  // algo que perder: el store tenía mensajes antes del reset).
  resetForNewConversation(showNotice: boolean): void
  addOptimistic(clientId: string, text: string): void
  ackOptimistic(clientId: string, messageId: string): void
  failOptimistic(clientId: string): void
  retryOptimistic(clientId: string): void
  beginBotTurn(turnId: string): void
  appendBotDelta(turnId: string, delta: string): void
  finishBotTurn(turnId: string, messageId: string): void
  failBotTurn(turnId: string): void
  setAgentTyping(isTyping: boolean): void
  setConnection(status: ConnectionStatus): void
}

// Display order: durable events strictly by seq among themselves; anything
// without a seq (snapshot history / optimistic / streaming) by its timestamp.
function compareMessages(a: StoredMessage, b: StoredMessage): number {
  if (a.seq !== null && b.seq !== null) return a.seq - b.seq
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

export function createMessageStore(now: () => string = () => new Date().toISOString()): MessageStore {
  // `messages` is treated as immutable and REPLACED (never mutated) on every
  // change, so any array/object a prior getState() handed out stays frozen.
  let messages: readonly StoredMessage[] = []
  const appliedEventIds = new Set<string>()
  let conversationState: ConversationState | null = null
  let cursor: string | null = null
  let agentName: string | null = null
  let agentAvatarUrl: string | null = null
  let agentTyping = false
  let connection: ConnectionStatus = 'idle'
  let lastStateSeq = -1
  let lastAgentSeq = -1
  let newConversationNotice = false

  const listeners = new Set<() => void>()
  let published: StoreState | null = null

  const notify = (): void => {
    published = null
    for (const l of listeners) l()
  }
  // assignMessages sorts + replaces WITHOUT publishing; callers that also touch
  // scalars call notify() once at the end so each mutation publishes atomically.
  const assignMessages = (next: StoredMessage[]): void => {
    next.sort(compareMessages)
    messages = next
  }
  const setMessages = (next: StoredMessage[]): void => {
    assignMessages(next)
    notify()
  }
  const advanceCursor = (eventId: string | null): void => {
    if (eventId === null) return // sesión sin conversación: no hay cursor que avanzar
    if (cursor === null || cursorSeq(eventId) > cursorSeq(cursor)) cursor = eventId
  }
  const indexOf = (pred: (m: StoredMessage) => boolean): number => messages.findIndex(pred)

  // Fail paths (HTTP error / stream disconnect) never carry the server messageId
  // the way the ack / done frame do, and the durable message.created payload
  // carries no back-reference to clientId/turnId either — so, unlike
  // ackOptimistic/finishBotTurn, there is no id to reconcile against exactly.
  // Best-effort fallback: if a durable message of the same role arrived no
  // earlier than this placeholder, the send actually succeeded server-side and
  // this placeholder is superseded — drop it instead of marking it failed.
  // Residual limitation: two concurrent unacked sends of the same role cannot
  // be told apart by this signal (see P2 task 5 report).
  const supersededByDurable = (placeholder: StoredMessage, role: StoredMessage['role']): boolean =>
    messages.some((m) => m.seq !== null && m.role === role && Date.parse(m.createdAt) >= Date.parse(placeholder.createdAt))

  const mergeSnapshotMessages = (base: StoredMessage[], snap: MessagesSnapshot): StoredMessage[] => {
    const next = base.slice()
    for (const m of snap.messages) {
      if (next.some((x) => x.id === m.messageId)) continue
      next.push({
        id: m.messageId, role: m.role, text: m.text, status: 'sent',
        seq: null, streaming: false, createdAt: m.createdAt, clientId: null, turnId: null,
        authorName: m.authorName ?? null,
      })
    }
    return next
  }

  const applyDurableEvent = (event: WidgetEvent): void => {
    if (appliedEventIds.has(event.eventId)) return
    appliedEventIds.add(event.eventId)
    const seq = cursorSeq(event.eventId)
    advanceCursor(event.eventId)
    if (event.type === 'message.created') {
      const i = indexOf((m) => m.id === event.payload.messageId)
      if (i !== -1) {
        const next = messages.slice()
        next[i] = { ...next[i]!, text: event.payload.text, seq, status: 'sent', streaming: false, turnId: null }
        setMessages(next)
      } else {
        // No exact id match. A degraded non-streaming ack (server response had no
        // userMessageId) leaves its optimistic placeholder's id equal to its own
        // clientId — unresolved, since the client never learned the real server
        // id. Reconcile THIS durable event against that placeholder (by role +
        // timestamp, same heuristic as supersededByDurable) instead of appending
        // a duplicate bubble; works whichever arrives first.
        const pi = indexOf((m) =>
          m.clientId !== null && m.id === m.clientId && m.status !== 'failed' &&
          m.role === event.payload.role && Date.parse(event.occurredAt) >= Date.parse(m.createdAt))
        const next = messages.slice()
        if (pi !== -1) {
          next[pi] = { ...next[pi]!, id: event.payload.messageId, text: event.payload.text, seq, status: 'sent', streaming: false, turnId: null }
        } else {
          next.push({
            id: event.payload.messageId, role: event.payload.role, text: event.payload.text,
            status: 'sent', seq, streaming: false, createdAt: event.occurredAt, clientId: null, turnId: null,
            // The live message.created contract carries no authorName (that
            // field is snapshot-only, backend W5a) — an agent-role message
            // arriving this way relies on the conversation-level agentName
            // (set by agent.joined) for its avatar, same as before W5b.
            authorName: null,
          })
        }
        setMessages(next)
      }
    } else if (event.type === 'conversation.state_changed') {
      if (seq > lastStateSeq) { conversationState = event.payload.state; lastStateSeq = seq; notify() }
    } else if (event.type === 'agent.joined') {
      if (seq > lastAgentSeq) { agentName = event.payload.agentName; agentAvatarUrl = event.payload.agentAvatarUrl; lastAgentSeq = seq; notify() }
    }
  }

  const applySnapshot = (snap: MessagesSnapshot): void => {
    // Mutate messages + scalars, THEN publish once (no intermediate notify).
    const snapSeq = cursorSeq(snap.snapshotCursor)
    assignMessages(mergeSnapshotMessages(messages.slice(), snap))
    if (snapSeq >= lastStateSeq) { conversationState = snap.state; lastStateSeq = snapSeq }
    // Fix W5b: backend W5a puts agent identity directly in the snapshot
    // (`agent.name`, present iff a human agent is assigned right now) — hydrate
    // it the same way conversationState is refreshed above, on the same
    // watermark. The snapshot is a FLOOR, never a ceiling: only applied when at
    // least as fresh as the newest agent.joined already recorded, so a live
    // event that landed after this snapshot's cutoff is never clobbered. An
    // absent block (resolved / unassigned) clears the identity — this is what
    // returns the header to the assistant name after a resolve+reconcile.
    if (snapSeq >= lastAgentSeq) { agentName = snap.agent ? snap.agent.name : null; lastAgentSeq = snapSeq }
    advanceCursor(snap.snapshotCursor)
    notify()
  }

  const replaceSnapshot = (snap: MessagesSnapshot): void => {
    // Hard reset for CURSOR_RESET_REQUIRED: drop dedup + cursor and rebuild from
    // the fresh snapshot, keeping only unsent optimistic / in-flight streaming.
    appliedEventIds.clear()
    const keep = messages.filter((m) => m.status !== 'sent' || m.streaming)
    cursor = snap.snapshotCursor
    const snapSeq = cursorSeq(snap.snapshotCursor)
    conversationState = snap.state
    lastStateSeq = snapSeq
    // Fix W5b: the snapshot now carries agent identity directly (backend
    // W5a) — hydrate/clear it straight from `snap.agent`, unconditionally,
    // the same way conversationState above trusts the fresh snapshot
    // entirely on a hard reset. The watermark moves to snapSeq (NOT reset to
    // -1): any FUTURE agent.joined in the new cursor space (seq > snapSeq)
    // still refines it — there is no more need to wait for a replay the
    // lowered cursor might never receive.
    agentName = snap.agent ? snap.agent.name : null
    agentAvatarUrl = null
    lastAgentSeq = snapSeq
    assignMessages(mergeSnapshotMessages(keep, snap))
    notify()
  }

  // Task W4 — ver comentario de la interfaz MessageStore#resetForNewConversation.
  // Deliberadamente NO reutiliza replaceSnapshot: no hay un MessagesSnapshot
  // a mano en el momento del re-bootstrap (el fetch a la conversación nueva
  // lo hará el canal recién abierto, DESPUÉS de este reset) — este método
  // solo limpia lo viejo, sin intentar adivinar el estado del servidor.
  const resetForNewConversation = (showNotice: boolean): void => {
    appliedEventIds.clear()
    cursor = null
    conversationState = null
    agentName = null
    agentAvatarUrl = null
    lastStateSeq = -1
    lastAgentSeq = -1
    if (showNotice) newConversationNotice = true
    const keep = messages.filter((m) => m.status !== 'sent' || m.streaming)
    setMessages(keep) // única notify() — mutación atómica, mismo patrón que replaceSnapshot
  }

  const advanceCursorTo = (eventId: string): void => {
    if (cursor !== null && cursorSeq(eventId) <= cursorSeq(cursor)) return
    cursor = eventId
    notify()
  }

  const setStatus = (clientId: string, status: MessageStatus): void => {
    const i = indexOf((m) => m.clientId === clientId)
    if (i === -1) return
    const next = messages.slice()
    next[i] = { ...next[i]!, status }
    setMessages(next)
  }

  const addOptimistic = (clientId: string, text: string): void => {
    setMessages([...messages, {
      id: clientId, role: 'user', text, status: 'pending', seq: null,
      streaming: false, createdAt: now(), clientId, turnId: null, authorName: null,
    }])
  }
  const ackOptimistic = (clientId: string, messageId: string): void => {
    // Matched by clientId + still-pending status, NOT by "id !== messageId":
    // a degraded ack (see below) never rewrites `id`, so that comparison would
    // never hold and the placeholder would hang pending forever. Status-based
    // matching is equally idempotent (a second ack call finds nothing 'pending').
    const oi = indexOf((m) => m.clientId === clientId && m.status === 'pending')
    if (oi === -1) return // already acked / reconciled by a durable twin (idempotent)
    // Nit W4 review (Task W3c): one-shot — el aviso "Conversación nueva" solo
    // debe sobrevivir hasta que el visitante retome la conversación de
    // verdad (su próximo turno CONFIRMADO), no quedarse pegado bajo mensajes
    // nuevos para siempre.
    if (newConversationNotice) newConversationNotice = false
    const next = messages.slice()
    if (messageId !== clientId) {
      // normal ack: the server told us the real id.
      const durableI = indexOf((m) => m.id === messageId)
      if (durableI !== -1 && durableI !== oi) {
        next.splice(oi, 1) // durable arrived first: keep it, drop the placeholder
      } else {
        next[oi] = { ...next[oi]!, id: messageId, status: 'sent' }
      }
    } else {
      // Degraded ack: the server response carried no userMessageId, so the
      // caller fell back to clientId. There is no real id to rewrite to — flip
      // to 'sent' and leave `id` as clientId; applyDurableEvent's role/timestamp
      // fallback reconciles it against the durable message.created when it
      // arrives, instead of leaving it stuck pending or duplicated.
      next[oi] = { ...next[oi]!, status: 'sent' }
    }
    setMessages(next)
  }
  const failOptimistic = (clientId: string): void => {
    const oi = indexOf((m) => m.clientId === clientId)
    if (oi === -1) return
    const placeholder = messages[oi]!
    // Already durably confirmed — e.g. a degraded ack's placeholder that
    // applyDurableEvent already reconciled IN PLACE (same object, seq set).
    // supersededByDurable looks for a SEPARATE durable entry, so it would
    // never match itself here; guard explicitly instead of failing/dropping
    // an already-sent message.
    if (placeholder.seq !== null) return
    const next = messages.slice()
    if (supersededByDurable(placeholder, 'user')) next.splice(oi, 1) // durable twin arrived: send actually succeeded
    else next[oi] = { ...placeholder, status: 'failed' }
    setMessages(next)
  }
  const retryOptimistic = (clientId: string): void => setStatus(clientId, 'pending')

  const beginBotTurn = (turnId: string): void => {
    setMessages([...messages, {
      id: `turn:${turnId}`, role: 'bot', text: '', status: 'sent', seq: null,
      streaming: true, createdAt: now(), clientId: null, turnId, authorName: null,
    }])
  }
  const appendBotDelta = (turnId: string, delta: string): void => {
    const i = indexOf((m) => m.turnId === turnId)
    if (i === -1) return
    const next = messages.slice()
    next[i] = { ...next[i]!, text: next[i]!.text + delta }
    setMessages(next)
  }
  const finishBotTurn = (turnId: string, messageId: string): void => {
    const ti = indexOf((m) => m.turnId === turnId)
    if (ti === -1) return
    const durableI = indexOf((m) => m.id === messageId)
    const next = messages.slice()
    if (durableI !== -1 && durableI !== ti) {
      next.splice(ti, 1) // durable already present: discard the streaming placeholder
    } else {
      next[ti] = { ...next[ti]!, id: messageId, streaming: false, turnId: null }
    }
    setMessages(next)
    // Do NOT advance the cursor / mark eventId applied: the durable message.created
    // for this messageId arrives via the channel with the authoritative seq.
  }
  const failBotTurn = (turnId: string): void => {
    const i = indexOf((m) => m.turnId === turnId)
    if (i === -1) return
    const m = messages[i]!
    const next = messages.slice()
    if (supersededByDurable(m, 'bot')) next.splice(i, 1) // durable twin arrived: the turn actually completed
    else if (m.text === '') next.splice(i, 1)
    else next[i] = { ...m, streaming: false, turnId: null }
    setMessages(next)
  }
  const setAgentTyping = (isTyping: boolean): void => {
    if (agentTyping === isTyping) return
    agentTyping = isTyping; notify()
  }
  const setConnection = (status: ConnectionStatus): void => {
    if (connection === status) return
    connection = status; notify()
  }

  return {
    getState(): StoreState {
      if (published === null) {
        // Deep freeze so consumers (and our own future mutations) can never
        // mutate a snapshot that was already handed out. Copy-on-write means the
        // NEXT mutation builds fresh objects, so freezing these is safe.
        for (const m of messages) Object.freeze(m)
        Object.freeze(messages)
        published = Object.freeze({
          messages, conversationState, cursor, agentName, agentAvatarUrl, agentTyping, connection, newConversationNotice,
        })
      }
      return published
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    applySnapshot,
    replaceSnapshot,
    applyDurableEvent,
    advanceCursorTo,
    resetForNewConversation,
    addOptimistic,
    ackOptimistic,
    failOptimistic,
    retryOptimistic,
    beginBotTurn,
    appendBotDelta,
    finishBotTurn,
    failBotTurn,
    setAgentTyping,
    setConnection,
  }
}
