import { describe, it, expect } from 'vitest'
import { createMessageStore } from '../message-store'
import type { WidgetEvent } from '../../contract/types'

const clock = () => '2026-07-17T15:00:00Z'
function msgEvent(seq: number, messageId: string, role: 'bot' | 'agent' | 'user', text: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_demo_01_${seq}`, schemaVersion: 1, conversationId: 'conv_demo_01',
    occurredAt: '2026-07-17T15:00:01Z', type: 'message.created', payload: { messageId, role, text },
  }
}

describe('message store — optimistic + streaming', () => {
  it('optimistic user message goes pending → sent on ack', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    expect(s.getState().messages[0]).toMatchObject({ id: 'cid_1', role: 'user', status: 'pending', text: 'Hola' })
    s.ackOptimistic('cid_1', 'msg_srv_1')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_srv_1', status: 'sent', clientId: 'cid_1' })
  })

  it('durable-before-ack: the durable and the ack do not duplicate', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    s.applyDurableEvent(msgEvent(2, 'msg_srv', 'user', 'Hola')) // durable wins the race
    s.ackOptimistic('cid_1', 'msg_srv')
    expect(s.getState().messages).toHaveLength(1)
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_srv', seq: 2 })
  })

  it('failOptimistic then retryOptimistic flips failed → pending', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    s.failOptimistic('cid_1')
    expect(s.getState().messages[0]?.status).toBe('failed')
    s.retryOptimistic('cid_1')
    expect(s.getState().messages[0]?.status).toBe('pending')
  })

  it('streams a bot turn: begin → deltas accumulate → done finalizes with messageId', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1')
    expect(s.getState().messages[0]).toMatchObject({ role: 'bot', streaming: true, text: '' })
    s.appendBotDelta('t1', 'Sí, ')
    s.appendBotDelta('t1', 'claro.')
    expect(s.getState().messages[0]?.text).toBe('Sí, claro.')
    s.finishBotTurn('t1', 'msg_bot_1')
    expect(s.getState().messages[0]).toMatchObject({ id: 'msg_bot_1', streaming: false })
  })

  it('finishBotTurn does NOT advance the durable cursor', () => {
    const s = createMessageStore(clock)
    s.applyDurableEvent(msgEvent(2, 'm2', 'user', 'q')) // cursor = 2
    s.beginBotTurn('t1'); s.appendBotDelta('t1', 'x')
    s.finishBotTurn('t1', 'm_bot')
    expect(s.getState().cursor).toBe('evt_v1_conv_demo_01_2') // unchanged
  })

  it('durable-before-finish: the durable bot message and finishBotTurn do not duplicate', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1')
    s.appendBotDelta('t1', 'parcial')
    s.applyDurableEvent(msgEvent(5, 'msg_bot', 'bot', 'texto final')) // durable arrives first
    s.finishBotTurn('t1', 'msg_bot')
    const bots = s.getState().messages.filter((m) => m.role === 'bot')
    expect(bots).toHaveLength(1)
    expect(bots[0]?.text).toBe('texto final') // durable is authoritative
  })

  it('finish-before-durable: the durable replay updates, does not duplicate', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t1'); s.appendBotDelta('t1', 'texto')
    s.finishBotTurn('t1', 'msg_bot')
    s.applyDurableEvent(msgEvent(5, 'msg_bot', 'bot', 'texto'))
    expect(s.getState().messages.filter((m) => m.role === 'bot')).toHaveLength(1)
    expect(s.getState().messages[0]?.seq).toBe(5) // reconciled with the durable seq
  })

  it('failBotTurn removes an empty placeholder but keeps a partial one', () => {
    const s = createMessageStore(clock)
    s.beginBotTurn('t_empty'); s.failBotTurn('t_empty')
    expect(s.getState().messages).toHaveLength(0)
    s.beginBotTurn('t_partial'); s.appendBotDelta('t_partial', 'a medias'); s.failBotTurn('t_partial')
    expect(s.getState().messages[0]).toMatchObject({ streaming: false, text: 'a medias' })
  })

  it('never mutates a previously published snapshot (copy-on-write)', () => {
    const s = createMessageStore(clock)
    s.addOptimistic('cid_1', 'Hola')
    const snapA = s.getState()
    const msgA = snapA.messages[0]!
    s.ackOptimistic('cid_1', 'msg_1')
    expect(s.getState()).not.toBe(snapA)
    expect(snapA.messages[0]).toBe(msgA)    // old snapshot object untouched
    expect(msgA.id).toBe('cid_1')            // still the original value
    expect(s.getState().messages[0]?.id).toBe('msg_1')
  })

  it('setAgentTyping and setConnection update reactive flags', () => {
    const s = createMessageStore(clock)
    s.setAgentTyping(true)
    expect(s.getState().agentTyping).toBe(true)
    s.setConnection('polling')
    expect(s.getState().connection).toBe('polling')
  })
})
