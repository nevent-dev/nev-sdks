import { describe, it, expect } from 'vitest'
import { seal, open, isCommand, LOADER_TO_SHELL, PROTOCOL_VERSION } from '../envelope'

describe('envelope', () => {
  it('sella y abre un envelope válido', () => {
    const e = seal('open', { a: 1 }, 'inst-1')
    expect(open(e, { instanceId: 'inst-1' })).toEqual({ ns: 'nevw', v: PROTOCOL_VERSION, instanceId: 'inst-1', type: 'open', payload: { a: 1 } })
  })
  it('rechaza ns desconocido, versión distinta, shape inválido y primitivas', () => {
    expect(open({ ns: 'otro', v: 1, instanceId: 'x', type: 'open' }, {})).toBeNull()
    expect(open({ ns: 'nevw', v: 99, instanceId: 'x', type: 'open' }, {})).toBeNull()
    expect(open({ ns: 'nevw', v: 1 }, {})).toBeNull()
    expect(open('cadena', {})).toBeNull()
    expect(open(null, {})).toBeNull()
  })
  it('rechaza instanceId que no coincide', () => {
    const e = seal('open', null, 'inst-1')
    expect(open(e, { instanceId: 'inst-2' })).toBeNull()
  })
  it('la allowlist de comandos filtra tipos desconocidos', () => {
    expect(isCommand('open', LOADER_TO_SHELL)).toBe(true)
    expect(isCommand('eval', LOADER_TO_SHELL)).toBe(false)
  })
})
