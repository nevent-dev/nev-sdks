import { describe, it, expect, vi } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent, MessagesSnapshot } from '../../contract/types'
import { fixtureSnapshot } from '../../contract/fixtures'

function msgEvent(seq: number, messageId: string, role: 'bot' | 'agent' | 'user', text: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:03:00Z', type: 'message.created', payload: { messageId, role, text },
  }
}
function stateEvent(seq: number, state: 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:04:00Z', type: 'conversation.state_changed', payload: { state },
  }
}
function agentJoined(seq: number, name: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T14:09:00Z', type: 'agent.joined', payload: { agentName: name, agentAvatarUrl: null },
  }
}

describe('message store — durable core', () => {
  it('starts idle, empty, with a NULL conversationState (server-dictated)', () => {
    const s = createMessageStore()
    expect(s.getState().messages).toEqual([])
    expect(s.getState().conversationState).toBeNull()
    expect(s.getState().cursor).toBeNull()
    expect(s.getState().connection).toBe('idle')
  })

  it('applies a snapshot: messages, state and cursor', () => {
    const s = createMessageStore()
    s.applySnapshot(fixtureSnapshot())
    const st = s.getState()
    expect(st.messages.map((m) => m.id)).toEqual(['msg_0001'])
    expect(st.conversationState).toBe('BOT_ACTIVE')
    expect(st.cursor).toBe('evt_v1_conv_demo_01_1')
  })

  it('appends durable message.created ordered and advances the cursor', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'segundo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'user', 'tercero'))
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m2', 'm3'])
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_3')
  })

  it('dedups replayed events by eventId (overlap after reconnect)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola'))
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'hola'))
    expect(s.getState().messages).toHaveLength(1)
  })

  it('does not rewind the cursor on an older replayed event; orders by seq', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'nuevo'))
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'viejo'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5')
    expect(s.getState().messages.map((m) => m.id)).toEqual(['m3', 'm5'])
  })

  it('sets state ONLY from state_changed; an OLDER replay never reverts it', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(6, 'AGENT_ACTIVE'))
    s.applyDurableEvent(stateEvent(4, 'ESCALATED_WAITING')) // stale, out of order
    expect(s.getState().conversationState).toBe('AGENT_ACTIVE')
  })

  it('records agent identity from the newest agent.joined only', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(7, 'Laura'))
    s.applyDurableEvent(agentJoined(5, 'Pedro')) // stale
    expect(s.getState().agentName).toBe('Laura')
  })

  // Fix W5b: backend W5a adds `agent: { name }` to the snapshot — present
  // iff a human agent is currently assigned. A soft reconcile (the normal
  // reconnect/reload path, see events-channel.ts's `hard=false` default)
  // must hydrate the SAME identity state agent.joined sets, without waiting
  // for that durable event to replay (it may be outside the poll window).
  it('applySnapshot with an agent block hydrates agent identity like agent.joined would', () => {
    const s = createMessageStore()
    const snap = { ...fixtureSnapshot(), agent: { name: 'Ana' } }
    s.applySnapshot(snap)
    expect(s.getState().agentName).toBe('Ana')
  })

  // The W5a-review "post-resolve disappearance" concern, now on the client:
  // once a conversation resolves, the backend stops sending the agent block
  // — a later soft reconcile must clear the identity so the header goes back
  // to the assistant, instead of leaving the last-seen agent name stuck.
  it('applySnapshot with NO agent block clears a previously-set agent identity (resolve+reconcile)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(3, 'Laura'))
    expect(s.getState().agentName).toBe('Laura')
    // snapshotCursor seq=5 > lastAgentSeq=3: this snapshot is fresher than
    // the join we applied, so its absent agent block is authoritative.
    const snap = { messages: [], state: 'RESOLVED' as const, snapshotCursor: 'evt_v1_conv_demo_01_5' }
    s.applySnapshot(snap)
    expect(s.getState().agentName).toBeNull()
  })

  // The snapshot is a FLOOR, never a ceiling: a live agent.joined that landed
  // AFTER the snapshot's own cutoff must not be clobbered by that snapshot,
  // whichever order the two arrive in — no flicker/contradiction.
  it('a snapshot older than the last live agent.joined does not regress the identity', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(9, 'Laura')) // live event already ahead of the snapshot below
    const staleSnap = { messages: [], state: 'AGENT_ACTIVE' as const, snapshotCursor: 'evt_v1_conv_demo_01_4' }
    s.applySnapshot(staleSnap) // no agent block, but seq 4 < lastAgentSeq 9 — must not clear
    expect(s.getState().agentName).toBe('Laura')
  })

  it('a live agent.joined newer than the snapshot cursor refines the identity set by the snapshot', () => {
    const s = createMessageStore()
    const snap = { messages: [], state: 'AGENT_ACTIVE' as const, snapshotCursor: 'evt_v1_conv_demo_01_4', agent: { name: 'Ana' } }
    s.applySnapshot(snap)
    expect(s.getState().agentName).toBe('Ana')
    s.applyDurableEvent(agentJoined(9, 'Laura')) // reassignment after the snapshot's cutoff
    expect(s.getState().agentName).toBe('Laura')
  })

  it('mergeSnapshotMessages carries authorName per message, defaulting to null when absent', () => {
    const s = createMessageStore()
    const snap = {
      messages: [
        { messageId: 'm1', role: 'agent' as const, text: 'Hola, soy Ana', createdAt: '2026-07-18T10:00:00Z', authorName: 'Ana' },
        { messageId: 'm2', role: 'bot' as const, text: 'Hola', createdAt: '2026-07-18T09:59:00Z' },
      ],
      state: 'AGENT_ACTIVE' as const,
      snapshotCursor: 'evt_v1_conv_demo_01_2',
      agent: { name: 'Ana' },
    }
    s.applySnapshot(snap)
    const messages = s.getState().messages
    expect(messages.find((m) => m.id === 'm1')?.authorName).toBe('Ana')
    expect(messages.find((m) => m.id === 'm2')?.authorName).toBeNull()
  })

  it('applySnapshot after events keeps the max cursor and merges (no rewind, no dup)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(5, 'm5', 'bot', 'live'))
    s.applySnapshot(fixtureSnapshot()) // snapshotCursor seq=1, message msg_0001
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_5')
    expect(s.getState().messages.map((m) => m.id)).toEqual(['msg_0001', 'm5'])
  })

  it('replaceSnapshot hard-resets the cursor DOWN and clears dedup (409 recovery)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(9, 'm9', 'bot', 'lejano'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_9')
    s.replaceSnapshot(fixtureSnapshot()) // snapshotCursor seq=1
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_1') // forced down
    expect(s.getState().messages.map((m) => m.id)).toEqual(['msg_0001']) // rebuilt from snapshot
  })

  it('replaceSnapshot with NO agent block clears identity and lowers the watermark to the new snapshot cursor', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(8, 'Laura'))
    expect(s.getState().agentName).toBe('Laura')
    s.replaceSnapshot(fixtureSnapshot())          // hard reset, snapshotCursor seq=1, no agent block
    expect(s.getState().agentName).toBeNull()     // identity cleared
    s.applyDurableEvent(agentJoined(2, 'Pedro'))  // future event in the new cursor space (seq 2 > 1)
    expect(s.getState().agentName).toBe('Pedro')
  })

  // Fix W5b: backend W5a puts agent identity directly in the snapshot, so a
  // hard reset no longer needs to null + wait for an agent.joined replay
  // that a lowered cursor might never receive.
  it('replaceSnapshot with an agent block hydrates identity directly — no replay needed', () => {
    const s = createMessageStore()
    const snap = { ...fixtureSnapshot(), agent: { name: 'Ana' } }
    s.replaceSnapshot(snap)
    expect(s.getState().agentName).toBe('Ana')
  })

  it('advanceCursorTo moves the cursor forward monotonically only', () => {
    const s = createMessageStore()
    s.advanceCursorTo('evt_v1_conv_demo_01_4')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_4')
    s.advanceCursorTo('evt_v1_conv_demo_01_2') // older → ignored
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_4')
    s.advanceCursorTo('evt_v1_conv_demo_01_7')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_7')
  })

  it('getState deep-freezes the snapshot, the array and every message', () => {
    const s = createMessageStore()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'x'))
    const st = s.getState()
    expect(Object.isFrozen(st)).toBe(true)
    expect(Object.isFrozen(st.messages)).toBe(true)
    expect(Object.isFrozen(st.messages[0])).toBe(true)
  })

  it('publishes a stable snapshot between changes and a NEW one after a change', () => {
    const s = createMessageStore()
    const listener = vi.fn()
    const unsub = s.subscribe(listener)
    const before = s.getState()
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'x'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(s.getState()).not.toBe(before)
    const a = s.getState()
    expect(s.getState()).toBe(a)
    unsub()
    s.applyDurableEvent(msgEvent(3, 'm3', 'bot', 'y'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

// Drift cazado en la integración E2E real (2026-07-18): una sesión SIN
// conversación devuelve snapshotCursor:null — el shape literal del backend.
// Antes: cursorSeq(null) lanzaba TypeError dentro de reconcile(), el catch del
// canal lo silenciaba y el bucle reintentaba para siempre ("Reconectando…").
describe('snapshot sin conversación (snapshotCursor null, backend real)', () => {
  const emptySnap = { messages: [], state: 'BOT_ACTIVE' as const, snapshotCursor: null }

  it('applySnapshot no lanza y deja cursor en null', () => {
    const s = createMessageStore()
    expect(() => s.applySnapshot(emptySnap)).not.toThrow()
    expect(s.getState().cursor).toBeNull()
    expect(s.getState().conversationState).toBe('BOT_ACTIVE')
  })

  it('replaceSnapshot (hard reset) tampoco lanza y deja cursor en null', () => {
    const s = createMessageStore()
    s.applySnapshot(fixtureSnapshot())
    expect(() => s.replaceSnapshot(emptySnap)).not.toThrow()
    expect(s.getState().cursor).toBeNull()
  })
})

// Drift real de wire (2026-07-20): MessagesSnapshotDto se serializa con
// @JsonInclude(NON_NULL) — para una sesión sin conversación el body NO es
// `{"snapshotCursor":null,...}` (el caso de arriba), es directamente
// `{"messages":[],"state":"BOT_ACTIVE"}`: el campo snapshotCursor NI SIQUIERA
// aparece. cursorSeq(undefined) revienta igual que cursorSeq hacía antes con
// null (solo guardaba `=== null`), y applySnapshot/replaceSnapshot lo llaman
// incondicionalmente.
describe('snapshot sin snapshotCursor en el wire (campo ausente, JsonInclude NON_NULL real)', () => {
  // Body real de una sesión sin conversación: la clave snapshotCursor no
  // aparece (no es un `null` explícito). El tipo la declara opcional
  // precisamente por esto, así que el literal es asignable tal cual.
  const wireSnapNoField: MessagesSnapshot = { messages: [], state: 'BOT_ACTIVE' }

  it('applySnapshot no lanza y deja cursor en null cuando snapshotCursor falta por completo', () => {
    const s = createMessageStore()
    expect(() => s.applySnapshot(wireSnapNoField)).not.toThrow()
    expect(s.getState().cursor).toBeNull()
    expect(s.getState().conversationState).toBe('BOT_ACTIVE')
  })

  it('replaceSnapshot (hard reset) tampoco lanza cuando snapshotCursor falta por completo', () => {
    const s = createMessageStore()
    s.applySnapshot(fixtureSnapshot())
    expect(() => s.replaceSnapshot(wireSnapNoField)).not.toThrow()
    expect(s.getState().cursor).toBeNull()
  })
})

// Task W4: al recuperarse de una sesión muerta con un cliente NUEVO cuya
// sesión NO es un resume genuino (conversación distinta o inexistente), el
// store debe olvidar todo lo que sabía de la conversación ANTERIOR — sobre
// todo el cursor, que de lo contrario quedaría apuntando a un eventId de una
// conversación que la sesión nueva ni siquiera posee (los eventId codifican
// el conversationId, p.ej. evt_v1_conv_demo_01_N — compararlos entre
// conversaciones distintas no tiene sentido y el siguiente ?after= del canal
// quedaría roto).
describe('resetForNewConversation (Task W4 — recuperación de sesión muerta)', () => {
  it('limpia cursor, conversationState, identidad de agente y el watermark de dedup', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(4, 'AGENT_ACTIVE'))
    s.applyDurableEvent(agentJoined(5, 'Laura'))
    expect(s.getState().cursor).not.toBeNull()
    s.resetForNewConversation(false)
    const st = s.getState()
    expect(st.cursor).toBeNull()
    expect(st.conversationState).toBeNull()
    expect(st.agentName).toBeNull()
    expect(st.agentAvatarUrl).toBeNull()
    // el watermark de agent.joined se resetea de verdad: un replay con seq
    // MENOR que el anterior (5) debe re-aplicarse tras el reset (mismo
    // criterio que replaceSnapshot, ver test de arriba).
    s.applyDurableEvent(agentJoined(2, 'Pedro'))
    expect(s.getState().agentName).toBe('Pedro')
  })

  it('descarta los mensajes YA ENVIADOS (pertenecen a la conversación anterior) pero conserva los pendientes/en streaming', () => {
    const s = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    s.applyDurableEvent(msgEvent(2, 'm2', 'bot', 'de la conversación vieja'))
    s.addOptimistic('cid_1', 'mensaje del visitante aún no confirmado')
    s.beginBotTurn('turn_1') // streaming: nunca se pierde un turno en curso
    s.resetForNewConversation(false)
    const ids = s.getState().messages.map((m) => m.id)
    expect(ids).not.toContain('m2')
    expect(ids).toContain('cid_1')
    expect(ids).toContain('turn:turn_1')
  })

  it('un eventId de la conversación nueva tras el reset se adopta sin colisionar con el cursor viejo (cursor arranca null)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(99, 'RESOLVED')) // cursor alto de la conversación anterior
    s.resetForNewConversation(false)
    // Una conversación nueva puede perfectamente tener un seq MENOR (es su
    // propio contador) — antes del fix, advanceCursor solo avanza hacia
    // delante y esto se habría quedado pegado al 99 viejo.
    s.applyDurableEvent(stateEvent(1, 'BOT_ACTIVE'))
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_1')
    expect(s.getState().conversationState).toBe('BOT_ACTIVE')
  })

  it('showNotice=true activa newConversationNotice; showNotice=false lo deja en false', () => {
    const s1 = createMessageStore()
    expect(s1.getState().newConversationNotice).toBe(false)
    s1.resetForNewConversation(true)
    expect(s1.getState().newConversationNotice).toBe(true)

    const s2 = createMessageStore()
    s2.resetForNewConversation(false)
    expect(s2.getState().newConversationNotice).toBe(false)
  })

  it('publica UNA sola notificación a los subscribers (mutación atómica, como applySnapshot/replaceSnapshot)', () => {
    const s = createMessageStore()
    s.applyDurableEvent(stateEvent(4, 'AGENT_ACTIVE'))
    const listener = vi.fn()
    s.subscribe(listener)
    s.resetForNewConversation(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
