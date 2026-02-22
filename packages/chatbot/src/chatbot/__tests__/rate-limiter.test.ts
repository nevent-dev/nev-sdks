/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../rate-limiter';
import type { RateLimiterConfig } from '../rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Construction & Defaults
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with default config when no config is provided', () => {
      const limiter = new RateLimiter();

      // Should allow requests (not rate limited from the start)
      expect(limiter.canProceed()).toBe(true);
      expect(limiter.remaining()).toBe(10); // default maxRequests
    });

    it('should accept custom configuration', () => {
      const limiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 10000,
        cooldownMs: 2000,
      });

      expect(limiter.remaining()).toBe(3);
    });

    it('should merge partial config with defaults', () => {
      const limiter = new RateLimiter({ maxRequests: 5 });

      expect(limiter.remaining()).toBe(5);
      // windowMs and cooldownMs should use defaults (tested implicitly)
    });
  });

  // ==========================================================================
  // canProceed()
  // ==========================================================================

  describe('canProceed', () => {
    it('should return true when under the limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3 });

      expect(limiter.canProceed()).toBe(true);
    });

    it('should return true after consuming fewer than maxRequests', () => {
      const limiter = new RateLimiter({ maxRequests: 3 });

      limiter.consume();
      limiter.consume();

      expect(limiter.canProceed()).toBe(true);
    });

    it('should return false when at the limit (cooldown active)', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
        cooldownMs: 5000,
      });

      limiter.consume();
      limiter.consume();

      // Third consume triggers cooldown
      const result = limiter.consume();
      expect(result.allowed).toBe(false);

      expect(limiter.canProceed()).toBe(false);
    });

    it('should not consume a token (read-only check)', () => {
      const limiter = new RateLimiter({ maxRequests: 3 });

      // Multiple canProceed calls should NOT affect remaining count
      limiter.canProceed();
      limiter.canProceed();
      limiter.canProceed();

      expect(limiter.remaining()).toBe(3);
    });

    it('should return true after cooldown expires', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 5000,
      });

      limiter.consume(); // uses the 1 allowed request
      limiter.consume(); // triggers cooldown

      expect(limiter.canProceed()).toBe(false);

      // Advance past cooldown
      vi.advanceTimersByTime(5001);

      // Window still has 1 request in it, so canProceed depends on whether
      // the window has space. We consumed 1, maxRequests is 1, so it's full.
      // But after the window expires, it should be true.
      vi.advanceTimersByTime(55000); // total 60001ms from first consume

      expect(limiter.canProceed()).toBe(true);
    });
  });

  // ==========================================================================
  // consume()
  // ==========================================================================

  describe('consume', () => {
    it('should allow requests when under the limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000 });

      const r1 = limiter.consume();
      const r2 = limiter.consume();
      const r3 = limiter.consume();

      expect(r1.allowed).toBe(true);
      expect(r1.retryAfterMs).toBeUndefined();

      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
    });

    it('should deny requests when limit is reached', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 60000,
        cooldownMs: 3000,
      });

      limiter.consume();
      limiter.consume();

      const denied = limiter.consume();

      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterMs).toBe(3000);
    });

    it('should include retryAfterMs in denied result', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 7000,
      });

      limiter.consume(); // allowed
      const denied = limiter.consume(); // denied

      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterMs).toBe(7000);
    });

    it('should deny during cooldown even if window has space', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000, // very short window
        cooldownMs: 5000,
      });

      limiter.consume();
      limiter.consume();

      // This triggers cooldown
      const denied = limiter.consume();
      expect(denied.allowed).toBe(false);

      // Advance past the window but NOT past cooldown
      vi.advanceTimersByTime(2000);

      // Even though the window has expired (old timestamps pruned),
      // cooldown is still active
      const stillDenied = limiter.consume();
      expect(stillDenied.allowed).toBe(false);
      expect(stillDenied.retryAfterMs).toBe(3000); // 5000 - 2000 = 3000
    });

    it('should report decreasing retryAfterMs during cooldown', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 10000,
      });

      limiter.consume();
      limiter.consume(); // triggers cooldown

      vi.advanceTimersByTime(3000);
      const r1 = limiter.consume();
      expect(r1.retryAfterMs).toBe(7000);

      vi.advanceTimersByTime(4000);
      const r2 = limiter.consume();
      expect(r2.retryAfterMs).toBe(3000);
    });

    it('should allow requests again after cooldown AND window expiration', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 5000,
        cooldownMs: 3000,
      });

      limiter.consume();
      limiter.consume();
      limiter.consume(); // triggers cooldown

      // Advance past both cooldown (3s) and window (5s)
      vi.advanceTimersByTime(6000);

      const result = limiter.consume();
      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // Sliding Window Behavior
  // ==========================================================================

  describe('sliding window', () => {
    it('should prune expired timestamps allowing new requests', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 5000,
        cooldownMs: 1000,
      });

      // Consume 2 at time 0
      limiter.consume();
      limiter.consume();

      // At time 0, limit reached
      expect(limiter.remaining()).toBe(0);

      // Advance past the window so old timestamps expire
      vi.advanceTimersByTime(6000); // past cooldown (1s) and window (5s)

      // Old timestamps are pruned; should have capacity again
      expect(limiter.remaining()).toBe(2);
      expect(limiter.canProceed()).toBe(true);
    });

    it('should track requests across partial window overlaps', () => {
      const limiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 10000,
        cooldownMs: 1000,
      });

      // T=0: first request
      limiter.consume();

      // T=4s: second request
      vi.advanceTimersByTime(4000);
      limiter.consume();

      // T=8s: third request
      vi.advanceTimersByTime(4000);
      limiter.consume();

      // At T=8s, all 3 are within the 10s window
      expect(limiter.remaining()).toBe(0);

      // T=11s: the first request (T=0) has expired
      vi.advanceTimersByTime(3000);
      expect(limiter.remaining()).toBe(1);

      // T=15s: both T=0 and T=4s have expired
      vi.advanceTimersByTime(4000);
      expect(limiter.remaining()).toBe(2);
    });
  });

  // ==========================================================================
  // remaining()
  // ==========================================================================

  describe('remaining', () => {
    it('should return maxRequests when no requests have been made', () => {
      const limiter = new RateLimiter({ maxRequests: 5 });
      expect(limiter.remaining()).toBe(5);
    });

    it('should decrease after each consume', () => {
      const limiter = new RateLimiter({ maxRequests: 3 });

      limiter.consume();
      expect(limiter.remaining()).toBe(2);

      limiter.consume();
      expect(limiter.remaining()).toBe(1);

      limiter.consume();
      expect(limiter.remaining()).toBe(0);
    });

    it('should return 0 during cooldown', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 5000,
      });

      limiter.consume();
      limiter.consume(); // triggers cooldown

      expect(limiter.remaining()).toBe(0);
    });

    it('should increase as old requests expire', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 5000,
        cooldownMs: 500,
      });

      limiter.consume();
      limiter.consume();

      expect(limiter.remaining()).toBe(0);

      // Advance past window + cooldown
      vi.advanceTimersByTime(6000);

      expect(limiter.remaining()).toBe(2);
    });
  });

  // ==========================================================================
  // reset()
  // ==========================================================================

  describe('reset', () => {
    it('should clear all tracked timestamps', () => {
      const limiter = new RateLimiter({ maxRequests: 3 });

      limiter.consume();
      limiter.consume();
      expect(limiter.remaining()).toBe(1);

      limiter.reset();
      expect(limiter.remaining()).toBe(3);
    });

    it('should clear active cooldown', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 5000,
      });

      limiter.consume();
      limiter.consume(); // triggers cooldown

      expect(limiter.canProceed()).toBe(false);

      limiter.reset();

      expect(limiter.canProceed()).toBe(true);
      expect(limiter.remaining()).toBe(1);
    });

    it('should allow normal operation after reset', () => {
      const limiter = new RateLimiter({ maxRequests: 2 });

      limiter.consume();
      limiter.consume();

      limiter.reset();

      const result = limiter.consume();
      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // destroy()
  // ==========================================================================

  describe('destroy', () => {
    it('should clear state same as reset', () => {
      const limiter = new RateLimiter({ maxRequests: 2 });

      limiter.consume();
      limiter.consume();
      limiter.consume(); // cooldown

      limiter.destroy();

      expect(limiter.canProceed()).toBe(true);
      expect(limiter.remaining()).toBe(2);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle maxRequests of 1 correctly', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 5000,
        cooldownMs: 2000,
      });

      const first = limiter.consume();
      expect(first.allowed).toBe(true);

      const second = limiter.consume();
      expect(second.allowed).toBe(false);
      expect(second.retryAfterMs).toBe(2000);
    });

    it('should handle very short window correctly', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 100,
        cooldownMs: 50,
      });

      limiter.consume();
      limiter.consume();

      // Wait past window and cooldown
      vi.advanceTimersByTime(200);

      const result = limiter.consume();
      expect(result.allowed).toBe(true);
    });

    it('should handle very large maxRequests', () => {
      const limiter = new RateLimiter({ maxRequests: 1000 });

      // Consume many tokens
      for (let i = 0; i < 999; i++) {
        const result = limiter.consume();
        expect(result.allowed).toBe(true);
      }

      expect(limiter.remaining()).toBe(1);
    });

    it('should handle rapid consecutive calls', () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 60000,
        cooldownMs: 3000,
      });

      // Fire 5 rapid consumes at the same timestamp
      for (let i = 0; i < 5; i++) {
        const result = limiter.consume();
        expect(result.allowed).toBe(true);
      }

      // 6th should be denied
      const denied = limiter.consume();
      expect(denied.allowed).toBe(false);
    });

    it('should handle zero cooldownMs (immediate recovery after window)', () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 5000,
        cooldownMs: 0,
      });

      limiter.consume();
      limiter.consume();

      const denied = limiter.consume();
      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterMs).toBe(0);

      // Since cooldownMs is 0, cooldownUntil = now + 0 = now.
      // Next call should NOT be in cooldown.
      // But we still have the timestamps in the window.
      // Advance past the window
      vi.advanceTimersByTime(6000);

      const allowed = limiter.consume();
      expect(allowed.allowed).toBe(true);
    });

    it('should handle multiple cooldown triggers without stacking', () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        cooldownMs: 5000,
      });

      limiter.consume(); // allowed
      limiter.consume(); // denied, cooldown starts

      // Multiple denials during cooldown
      vi.advanceTimersByTime(1000);
      limiter.consume(); // still denied, should not extend cooldown

      vi.advanceTimersByTime(1000);
      limiter.consume(); // still denied

      // Original cooldown was 5s. We've advanced 2s. 3s remaining.
      vi.advanceTimersByTime(3001);

      // Cooldown expired. But window (60s) still has the original consume.
      expect(limiter.canProceed()).toBe(false); // window still full

      // Advance to clear the window (remaining ~55s)
      vi.advanceTimersByTime(56000);
      expect(limiter.canProceed()).toBe(true);
    });
  });

  // ==========================================================================
  // Concurrent-like Access Patterns
  // ==========================================================================

  describe('concurrent-like access', () => {
    it('should handle interleaved canProceed and consume calls', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });

      expect(limiter.canProceed()).toBe(true);
      limiter.consume();
      expect(limiter.canProceed()).toBe(true);
      limiter.consume();
      expect(limiter.canProceed()).toBe(false);
    });

    it('should correctly track after multiple reset cycles', () => {
      const limiter = new RateLimiter({ maxRequests: 1, cooldownMs: 1000 });

      // Cycle 1
      limiter.consume();
      limiter.consume(); // cooldown
      expect(limiter.canProceed()).toBe(false);

      limiter.reset();

      // Cycle 2
      const result = limiter.consume();
      expect(result.allowed).toBe(true);

      limiter.reset();

      // Cycle 3
      expect(limiter.remaining()).toBe(1);
    });
  });

  // ==========================================================================
  // Integration with Default Config
  // ==========================================================================

  describe('default configuration behavior', () => {
    it('should allow 10 messages per minute with defaults', () => {
      const limiter = new RateLimiter();

      // Send 10 messages rapidly
      for (let i = 0; i < 10; i++) {
        const result = limiter.consume();
        expect(result.allowed).toBe(true);
      }

      // 11th should be denied
      const denied = limiter.consume();
      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterMs).toBe(5000); // default cooldown
    });

    it('should recover after default cooldown (5s) and window (60s)', () => {
      const limiter = new RateLimiter();

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        limiter.consume();
      }
      limiter.consume(); // triggers cooldown

      // Advance past cooldown + window
      vi.advanceTimersByTime(61000);

      const result = limiter.consume();
      expect(result.allowed).toBe(true);
    });
  });
});
