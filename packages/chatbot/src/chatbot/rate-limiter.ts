/**
 * RateLimiter - Client-side sliding window rate limiter
 *
 * Prevents users from flooding the backend with excessive requests by
 * tracking request timestamps in a sliding window. When the maximum
 * number of requests within the window is reached, a cooldown period
 * is enforced before new requests are allowed.
 *
 * This is a client-side safety net, not a security boundary. The backend
 * enforces its own rate limits independently.
 *
 * Algorithm: **Sliding window** -- maintains a queue of request timestamps.
 * On each `consume()` or `canProceed()` call, expired timestamps (older
 * than `windowMs`) are pruned. If the remaining count is below
 * `maxRequests`, the request is allowed.
 *
 * When the limit is hit, a cooldown period (`cooldownMs`) begins. During
 * cooldown, all requests are denied regardless of the sliding window state.
 * The cooldown prevents rapid retries immediately after the window resets.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60000, cooldownMs: 5000 });
 *
 * const result = limiter.consume();
 * if (!result.allowed) {
 *   console.log(`Rate limited. Retry in ${result.retryAfterMs}ms`);
 * }
 *
 * // Cleanup on widget destroy
 * limiter.destroy();
 * ```
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the sliding window rate limiter.
 *
 * All fields have sensible defaults suitable for a chatbot widget where
 * typical user interaction is 5-15 messages per minute.
 */
export interface RateLimiterConfig {
  /**
   * Maximum number of requests allowed within the sliding window.
   * Default: 10
   */
  maxRequests: number;

  /**
   * Duration of the sliding window in milliseconds.
   * Requests older than this are pruned from the tracking queue.
   * Default: 60000 (1 minute)
   */
  windowMs: number;

  /**
   * Cooldown period in milliseconds after hitting the rate limit.
   * During cooldown, all requests are denied even if the sliding window
   * has capacity (prevents rapid retries).
   * Default: 5000 (5 seconds)
   */
  cooldownMs: number;
}

/**
 * Result returned by {@link RateLimiter.consume}.
 */
export interface ConsumeResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;

  /**
   * Milliseconds until the next request will be allowed.
   * Only present when `allowed` is `false`.
   */
  retryAfterMs?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default maximum requests per window */
const DEFAULT_MAX_REQUESTS = 10;

/** Default sliding window duration (1 minute) */
const DEFAULT_WINDOW_MS = 60_000;

/** Default cooldown after hitting the limit (5 seconds) */
const DEFAULT_COOLDOWN_MS = 5_000;

// ============================================================================
// RateLimiter Class
// ============================================================================

/**
 * Sliding window rate limiter for client-side request throttling.
 *
 * Thread-safe in the JavaScript single-threaded model. All operations are
 * synchronous and O(n) where n is the number of tracked timestamps (bounded
 * by `maxRequests`).
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * // Before sending a message
 * if (limiter.canProceed()) {
 *   const result = limiter.consume();
 *   if (result.allowed) {
 *     await sendMessage(text);
 *   }
 * }
 *
 * // On widget destroy
 * limiter.destroy();
 * ```
 */
export class RateLimiter {
  /** Configuration for this rate limiter instance */
  private readonly config: Readonly<RateLimiterConfig>;

  /**
   * Queue of request timestamps (milliseconds since epoch).
   * Maintained in chronological order. Pruned on each check.
   */
  private timestamps: number[] = [];

  /**
   * Timestamp when the cooldown period ends.
   * Zero when no cooldown is active.
   */
  private cooldownUntil = 0;

  /**
   * Creates a new RateLimiter instance.
   *
   * @param config - Optional partial configuration. Missing fields use defaults.
   *
   * @example
   * ```typescript
   * // Use all defaults (10 req/min, 5s cooldown)
   * const limiter = new RateLimiter();
   *
   * // Custom limits
   * const limiter = new RateLimiter({
   *   maxRequests: 5,
   *   windowMs: 30000,
   *   cooldownMs: 10000,
   * });
   * ```
   */
  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      maxRequests: config?.maxRequests ?? DEFAULT_MAX_REQUESTS,
      windowMs: config?.windowMs ?? DEFAULT_WINDOW_MS,
      cooldownMs: config?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Checks whether a request can proceed without consuming a token.
   *
   * Use this for read-only checks (e.g., to disable a UI button) without
   * affecting the rate limiter state. To actually consume a token, call
   * {@link consume} instead.
   *
   * @returns `true` if a request would be allowed right now, `false` otherwise
   *
   * @example
   * ```typescript
   * const sendButton = document.querySelector('#send');
   * sendButton.disabled = !limiter.canProceed();
   * ```
   */
  canProceed(): boolean {
    const now = Date.now();

    // Check cooldown first
    if (this.isInCooldown(now)) {
      return false;
    }

    // Prune expired timestamps
    this.prune(now);

    // Check if under the limit
    return this.timestamps.length < this.config.maxRequests;
  }

  /**
   * Attempts to consume a rate limit token.
   *
   * If the request is allowed, the current timestamp is recorded in the
   * sliding window. If denied, the result includes `retryAfterMs` indicating
   * how long the caller should wait before retrying.
   *
   * @returns A {@link ConsumeResult} indicating whether the request is allowed
   *
   * @example
   * ```typescript
   * const result = limiter.consume();
   * if (result.allowed) {
   *   await api.sendMessage(text);
   * } else {
   *   showCooldownMessage(result.retryAfterMs);
   * }
   * ```
   */
  consume(): ConsumeResult {
    const now = Date.now();

    // Check cooldown first
    if (this.isInCooldown(now)) {
      return {
        allowed: false,
        retryAfterMs: this.cooldownUntil - now,
      };
    }

    // Prune expired timestamps
    this.prune(now);

    // Check if under the limit
    if (this.timestamps.length >= this.config.maxRequests) {
      // Limit reached -- activate cooldown
      this.cooldownUntil = now + this.config.cooldownMs;

      return {
        allowed: false,
        retryAfterMs: this.config.cooldownMs,
      };
    }

    // Record the request timestamp
    this.timestamps.push(now);

    return { allowed: true };
  }

  /**
   * Returns the number of remaining requests allowed in the current window.
   *
   * Prunes expired timestamps before counting. Does not consume a token.
   *
   * @returns Number of requests still available (0 when at limit or in cooldown)
   */
  remaining(): number {
    const now = Date.now();

    if (this.isInCooldown(now)) {
      return 0;
    }

    this.prune(now);
    return Math.max(0, this.config.maxRequests - this.timestamps.length);
  }

  /**
   * Resets the rate limiter to its initial state.
   *
   * Clears all tracked timestamps and cancels any active cooldown.
   * Use this when starting a new conversation or after the user has
   * been idle for an extended period.
   *
   * @example
   * ```typescript
   * await widget.clearConversation();
   * limiter.reset();
   * ```
   */
  reset(): void {
    this.timestamps = [];
    this.cooldownUntil = 0;
  }

  /**
   * Destroys the rate limiter and releases all resources.
   *
   * Equivalent to {@link reset} but signals end-of-lifecycle. The instance
   * should not be used after calling this method.
   */
  destroy(): void {
    this.reset();
  }

  // --------------------------------------------------------------------------
  // Private: Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Checks whether the rate limiter is currently in a cooldown period.
   *
   * @param now - Current timestamp in milliseconds
   * @returns `true` if cooldown is active, `false` otherwise
   */
  private isInCooldown(now: number): boolean {
    if (this.cooldownUntil <= 0) {
      return false;
    }

    if (now >= this.cooldownUntil) {
      // Cooldown has expired -- clear it and allow the sliding window
      // to be evaluated normally.
      this.cooldownUntil = 0;
      return false;
    }

    return true;
  }

  /**
   * Removes timestamps that have fallen outside the sliding window.
   *
   * Iterates from the oldest entry forward and removes all entries older
   * than `now - windowMs`. This is O(k) where k is the number of expired
   * entries, which is bounded by `maxRequests`.
   *
   * @param now - Current timestamp in milliseconds
   */
  private prune(now: number): void {
    const windowStart = now - this.config.windowMs;

    // Find the first index within the window
    let firstValid = 0;
    while (firstValid < this.timestamps.length) {
      const ts = this.timestamps[firstValid];
      if (ts !== undefined && ts > windowStart) {
        break;
      }
      firstValid++;
    }

    // Remove expired entries from the front
    if (firstValid > 0) {
      this.timestamps = this.timestamps.slice(firstValid);
    }
  }
}
