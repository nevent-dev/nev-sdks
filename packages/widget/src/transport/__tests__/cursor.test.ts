import { describe, it, expect } from 'vitest'
import { cursorSeq, isNewerCursor, cursorConversationId } from '../cursor'

describe('cursor', () => {
  it('extracts the trailing seq from a versioned eventId', () => {
    expect(cursorSeq('evt_v1_conv_demo_01_42')).toBe(42)
  })
  it('returns -1 for an unparseable cursor', () => {
    expect(cursorSeq('garbage')).toBe(-1)
    expect(cursorSeq('evt_v1_conv_x_')).toBe(-1)
  })
  it('treats a null current cursor as older than any candidate', () => {
    expect(isNewerCursor('evt_v1_c_1', null)).toBe(true)
  })
  it('compares by numeric seq, not lexicographically', () => {
    expect(isNewerCursor('evt_v1_c_10', 'evt_v1_c_9')).toBe(true)
    expect(isNewerCursor('evt_v1_c_9', 'evt_v1_c_10')).toBe(false)
    expect(isNewerCursor('evt_v1_c_5', 'evt_v1_c_5')).toBe(false)
  })
})

describe('cursorConversationId', () => {
  it('extrae el conversationId de un cursor bien formado', () => {
    expect(cursorConversationId('evt_v1_conv_demo_42')).toBe('conv_demo')
  })
  it('el conversationId puede llevar guiones bajos — corta por el ÚLTIMO', () => {
    expect(cursorConversationId('evt_v1_conv_demo_festival_01_42')).toBe('conv_demo_festival_01')
  })
  it('null/undefined → null', () => {
    expect(cursorConversationId(null)).toBeNull()
    expect(cursorConversationId(undefined)).toBeNull()
  })
  it('sin el prefijo evt_v1_ → null', () => {
    expect(cursorConversationId('garbage')).toBeNull()
    expect(cursorConversationId('v1_conv_demo_42')).toBeNull()
  })
  it('sin separador tras el prefijo (ni conversationId ni seq) → null', () => {
    expect(cursorConversationId('evt_v1_soloesto')).toBeNull()
  })
  it('conversationId vacío (cursor empieza por _ tras el prefijo) → null', () => {
    expect(cursorConversationId('evt_v1__42')).toBeNull()
  })
  it('seq final vacío (cursor termina en _) → null', () => {
    expect(cursorConversationId('evt_v1_conv_demo_')).toBeNull()
  })
})
