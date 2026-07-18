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
