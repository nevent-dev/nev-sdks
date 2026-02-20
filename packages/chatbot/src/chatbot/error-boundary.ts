/**
 * ErrorBoundary - Chatbot-specific error boundary extending core
 *
 * Thin wrapper around `@nevent/core`'s {@link CoreErrorBoundary} that adapts
 * it for the chatbot widget's needs:
 *
 * - Uses `[NeventChatbot]` as the log prefix for debug console output.
 * - Provides a chatbot-specific `guardTimer()` signature that returns a
 *   wrapped `() => void` function (suitable for `setTimeout`), rather than
 *   core's `guardTimer()` which creates a `setInterval` and returns its ID.
 * - Re-types `setErrorHandler()` and `normalize()` to use {@link ChatbotError}
 *   instead of core's generic `NormalizedError`. The underlying logic is
 *   identical since `ChatbotError` is structurally compatible with
 *   `NormalizedError`.
 *
 * All other functionality (guard, guardAsync, wrapCallback) is inherited
 * directly from core's ErrorBoundary without modification.
 *
 * @example
 * ```typescript
 * const boundary = new ErrorBoundary(true); // debug mode
 * boundary.setErrorHandler((err) => analytics.track('error', err));
 *
 * // Synchronous guard
 * const result = boundary.guard(() => dangerousOperation(), 'render');
 *
 * // Async guard
 * const data = await boundary.guardAsync(() => fetchData(), 'fetchConfig');
 *
 * // Wrap user callback
 * const safeOnOpen = boundary.wrapCallback(config.onOpen, 'onOpen');
 *
 * // Wrap timer (chatbot-specific: returns a function for setTimeout)
 * setTimeout(boundary.guardTimer(() => tick(), 'heartbeat'), 1000);
 * ```
 */

import { ErrorBoundary as CoreErrorBoundary } from '@nevent/core';
import type { NormalizedError } from '@nevent/core';
import type { ChatbotError } from '../types';

// ============================================================================
// ErrorBoundary Class
// ============================================================================

/**
 * Chatbot-specific error boundary extending core's ErrorBoundary.
 *
 * Instantiated once per widget instance and shared across all sub-systems.
 * The error handler is wired to the user-provided `onError` callback from
 * the widget configuration.
 *
 * Differences from core's ErrorBoundary:
 * - `setErrorHandler()` accepts `(error: ChatbotError) => void` callbacks.
 * - `guardTimer(fn, context)` returns `() => void` for use with `setTimeout`.
 * - `normalize()` returns `ChatbotError` (structurally identical to `NormalizedError`).
 * - Uses `[NeventChatbot]` log prefix for debug output.
 */
export class ErrorBoundary extends CoreErrorBoundary {
  /**
   * Creates a new ErrorBoundary instance.
   *
   * @param debug - When `true`, caught errors are logged to `console.error`
   *   with the context label. Default: `false`.
   */
  constructor(debug = false) {
    super(debug, '[NeventChatbot]');
  }

  // --------------------------------------------------------------------------
  // Error handler (re-typed for ChatbotError)
  // --------------------------------------------------------------------------

  /**
   * Sets the error handler callback.
   *
   * Overrides the core signature to accept `ChatbotError` instead of
   * `NormalizedError`, since the chatbot uses typed error codes.
   *
   * @param handler - Callback invoked with a {@link ChatbotError} when any
   *   guarded operation fails.
   */
  override setErrorHandler(handler: (error: ChatbotError) => void): void {
    // ChatbotError is structurally compatible with NormalizedError.
    // The cast is safe because the error objects passed to the handler always
    // have the same shape (code, message, status?, details?).
    super.setErrorHandler(handler as (error: NormalizedError) => void);
  }

  // --------------------------------------------------------------------------
  // Timer wrapper (chatbot-specific override)
  // --------------------------------------------------------------------------

  /**
   * Wraps a timer callback (setTimeout/setInterval) for error isolation.
   *
   * This override provides a different signature from core's `guardTimer`:
   * - **Chatbot**: `guardTimer(fn, context?) => () => void` -- returns a
   *   wrapped function suitable for passing to `setTimeout` or `setInterval`.
   * - **Core**: `guardTimer(fn, interval, context?) => number` -- creates an
   *   interval timer and returns its ID.
   *
   * Timer callbacks run outside the normal synchronous call stack, so
   * uncaught errors in them would bubble up as unhandled exceptions on the
   * host page. This wrapper ensures they are caught and reported.
   *
   * @param fn - The timer callback function
   * @param context - Optional label for error reporting (e.g. 'autoOpenTimer',
   *   'reconnectTimer')
   * @returns A safe wrapper function suitable for setTimeout/setInterval
   *
   * @example
   * ```typescript
   * setTimeout(
   *   boundary.guardTimer(() => widget.open(), 'autoOpen'),
   *   3000,
   * );
   * ```
   */
  override guardTimer(fn: () => void, context?: string): () => void;
  override guardTimer(fn: () => void, interval: number, context?: string): number;
  override guardTimer(fn: () => void, intervalOrContext?: number | string, context?: string): number | (() => void) {
    // When called with chatbot signature: guardTimer(fn, context?)
    // The second argument is either a string (context) or undefined.
    if (typeof intervalOrContext === 'string' || intervalOrContext === undefined) {
      const ctx = intervalOrContext;
      return () => {
        try {
          fn();
        } catch (error) {
          // Delegate to core's guard which catches errors and calls handleError.
          this.guard(() => {
            throw error;
          }, `timer:${ctx ?? 'unknown'}`);
        }
      };
    }

    // Fallback: when called with core's signature (unlikely in chatbot code)
    return super.guardTimer(fn, intervalOrContext, context);
  }

  // --------------------------------------------------------------------------
  // Error normalization (static, typed for ChatbotError)
  // --------------------------------------------------------------------------

  /**
   * Normalizes any thrown value into a consistent {@link ChatbotError}.
   *
   * Delegates to core's `ErrorBoundary.normalize()` and casts the result
   * to `ChatbotError`, which is structurally identical to `NormalizedError`
   * (both have `code: string`, `message: string`, `status?: number`,
   * `details?: Record<string, unknown>`).
   *
   * @param error - The caught value (can be anything: Error, string, object, etc.)
   * @param context - Optional context label prepended to the error message
   * @returns A normalized {@link ChatbotError} object
   *
   * @example
   * ```typescript
   * try {
   *   riskyOperation();
   * } catch (e) {
   *   const chatbotError = ErrorBoundary.normalize(e, 'riskyOperation');
   *   // chatbotError.code === 'UNKNOWN_ERROR'
   *   // chatbotError.message === 'riskyOperation: <original message>'
   * }
   * ```
   */
  static override normalize(error: unknown, context?: string): ChatbotError {
    const normalized: NormalizedError = CoreErrorBoundary.normalize(error, context);
    return normalized as ChatbotError;
  }
}
