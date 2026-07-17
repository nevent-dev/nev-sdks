import { describe, it, expect } from 'vitest'
import { WIDGET_VERSION } from '../index'

describe('paquete', () => {
  it('expone la versión', () => {
    expect(WIDGET_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
