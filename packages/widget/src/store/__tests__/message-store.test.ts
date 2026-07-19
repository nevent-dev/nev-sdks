import { describe, it, expect, vi } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent } from '../../contract/types'
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

  it('replaceSnapshot resets agent identity + watermark so a lower-seq agent.joined re-applies', () => {
    const s = createMessageStore()
    s.applyDurableEvent(agentJoined(8, 'Laura'))
    expect(s.getState().agentName).toBe('Laura')
    s.replaceSnapshot(fixtureSnapshot())          // hard reset drops the cursor to seq=1
    expect(s.getState().agentName).toBeNull()     // identity cleared
    s.applyDurableEvent(agentJoined(3, 'Laura'))  // valid replay with seq LOWER than the old 8
    expect(s.getState().agentName).toBe('Laura')  // re-applied (watermark was reset to -1)
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
