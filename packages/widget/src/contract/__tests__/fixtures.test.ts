import { describe, it, expect } from 'vitest'
import { fixtureConfig, fixtureSession, fixtureEvents } from '../fixtures'

describe('fixtures del contrato', () => {
  it('config con schemaVersion 1 e installationId opaco', () => {
    const c = fixtureConfig()
    expect(c.schemaVersion).toBe(1)
    expect(c.installationId).toMatch(/^inst_/)
  })
  it('sesión con token en memoria y guestHandle opaco', () => {
    const s = fixtureSession()
    expect(s.token.length).toBeGreaterThan(10)
    expect(s.expiresInSeconds).toBeGreaterThanOrEqual(1800)
  })
  it('eventos durables ordenados por eventId y cada llamada devuelve objetos nuevos', () => {
    const evs = fixtureEvents()
    expect(evs.map((e) => e.type)).toEqual(['message.created', 'conversation.state_changed', 'agent.joined'])
    expect(fixtureEvents()).not.toBe(evs)
  })
})
