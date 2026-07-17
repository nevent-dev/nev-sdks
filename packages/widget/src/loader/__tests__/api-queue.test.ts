import { describe, it, expect, vi } from 'vitest'
import { installGlobalStub, drainQueue, type ApiStub } from '../api-queue'

describe('api-queue', () => {
  it('encola llamadas previas al boot y las reproduce en orden', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const stub = installGlobalStub(w)
    stub('boot', 'inst_123')
    stub('open')
    const handler = vi.fn()
    drainQueue(stub, handler)
    expect(handler.mock.calls).toEqual([['boot', ['inst_123']], ['open', []]])
  })
  it('tras el drain, las llamadas van directas al handler', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const stub = installGlobalStub(w)
    const handler = vi.fn()
    drainQueue(stub, handler)
    w.NeventWidget!('close')
    expect(handler).toHaveBeenCalledWith('close', [])
  })
  it('installGlobalStub es idempotente (doble inclusión del script)', () => {
    const w = {} as Window & { NeventWidget?: ApiStub }
    const a = installGlobalStub(w)
    const b = installGlobalStub(w)
    expect(a).toBe(b)
  })
})
