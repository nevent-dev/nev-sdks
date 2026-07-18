import { describe, it, expect } from 'vitest'
import { fixtureConfig, fixtureSession, fixtureEvents, fixtureSnapshot, fixtureTurnFrames, fixturePollResponse } from '../fixtures'

describe('fixtures del contrato', () => {
  it('config con schemaVersion 1 e installationId opaco', () => {
    const c = fixtureConfig()
    expect(c.schemaVersion).toBe(1)
    expect(c.installationId).toMatch(/^inst_/)
  })
  it('sesión con token en memoria y resumeSecret opaco', () => {
    const s = fixtureSession()
    expect(s.token.length).toBeGreaterThan(10)
    expect(s.expiresInSeconds).toBeGreaterThanOrEqual(1800)
  })
  it('eventos durables ordenados por eventId y cada llamada devuelve objetos nuevos', () => {
    const evs = fixtureEvents()
    expect(evs.map((e) => e.type)).toEqual(['message.created', 'conversation.state_changed', 'agent.joined'])
    expect(fixtureEvents()).not.toBe(evs)
  })
  it('config incluye welcome opcional con quickReplies (spec §7 / gap #6)', () => {
    const c = fixtureConfig()
    expect(c.welcome?.title.length).toBeGreaterThan(0)
    expect(Array.isArray(c.welcome?.quickReplies)).toBe(true)
  })
})

describe('transport fixtures', () => {
  it('snapshot carries a versioned cursor and a canonical state', () => {
    const s = fixtureSnapshot()
    expect(s.snapshotCursor).toMatch(/^evt_v1_/)
    expect(s.state).toBe('BOT_ACTIVE')
    expect(s.messages[0]?.messageId).toBe('msg_0001')
  })
  it('turn frames end in a done frame with messageId + eventId', () => {
    const last = fixtureTurnFrames().at(-1)
    expect(last?.type).toBe('done')
    if (last?.type === 'done') {
      expect(last.messageId).toBe('msg_bot_1')
      expect(last.eventId).toMatch(/^evt_v1_/)
    }
  })
  it('poll response returns durable events + a cursor', () => {
    const p = fixturePollResponse()
    expect(p.events.length).toBeGreaterThan(0)
    expect(p.cursor).toMatch(/^evt_v1_/)
  })
})
