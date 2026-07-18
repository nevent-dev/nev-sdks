import { describe, it, expect } from 'vitest'
import { cursorSeq, isNewerCursor } from '../cursor'

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
