import { describe, it, expect } from 'vitest'
import { createBackoff } from '../backoff'

describe('createBackoff', () => {
  it('grows exponentially and caps at maxMs (jitter disabled)', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 800, jitter: 0 })
    expect(b.nextDelay()).toBe(100)
    expect(b.nextDelay()).toBe(200)
    expect(b.nextDelay()).toBe(400)
    expect(b.nextDelay()).toBe(800)
    expect(b.nextDelay()).toBe(800) // capped
  })
  it('applies bounded jitter using the injected rng', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 10000, jitter: 0.5, rng: () => 1 })
    expect(b.nextDelay()).toBe(150) // 100 * (1 + 0.5*1)
  })
  it('reset returns to the first delay', () => {
    const b = createBackoff({ baseMs: 100, factor: 2, maxMs: 800, jitter: 0 })
    b.nextDelay(); b.nextDelay()
    b.reset()
    expect(b.nextDelay()).toBe(100)
  })
})
