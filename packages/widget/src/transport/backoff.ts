export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  factor?: number
  jitter?: number // fraction of the base delay added, one-sided (0.5 = up to +50%)
  rng?: () => number
}

export interface Backoff {
  nextDelay(): number
  reset(): void
}

export function createBackoff(opts: BackoffOptions = {}): Backoff {
  const baseMs = opts.baseMs ?? 500
  const maxMs = opts.maxMs ?? 15000
  const factor = opts.factor ?? 2
  const jitter = opts.jitter ?? 0.3
  const rng = opts.rng ?? Math.random
  let attempt = 0

  return {
    nextDelay(): number {
      const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt))
      attempt += 1
      return Math.round(Math.min(maxMs, raw + raw * jitter * rng()))
    },
    reset(): void { attempt = 0 },
  }
}
