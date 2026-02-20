/**
 * ErrorBoundary - Error isolation utilities for the chatbot widget
 *
 * Provides a comprehensive error containment system that ensures the chatbot
 * widget NEVER throws uncaught exceptions to the host page. All public widget
 * methods, user-provided callbacks, and timer callbacks are wrapped through
 * this boundary so that failures are caught, normalized, reported via the
 * configured error handler, and silently swallowed.
 *
 * Design goals:
 * - **Host page safety**: No widget error can crash or disrupt the host page.
 * - **Error normalization**: All thrown values (Error, string, object, unknown)
 *   are normalized into a consistent {@link ChatbotError} structure.
 * - **Debug observability**: When `debug` is enabled, errors are logged to
 *   console with full context for development troubleshooting.
 * - **Infinite loop prevention**: The error handler itself is wrapped to
 *   prevent re-entrant failures from propagating.
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
 * // Wrap timer
 * setTimeout(boundary.guardTimer(() => tick(), 'heartbeat'), 1000);
 * ```
 */

import type { ChatbotError, ChatbotErrorCode } from '../types';

// ============================================================================
// ErrorBoundary Class
// ============================================================================

/**
 * Error boundary for isolating widget errors from the host page.
 *
 * Instantiated once per widget instance and shared across all sub-systems.
 * The error handler is wired to the user-provided `onError` callback from
 * the widget configuration.
 */
export class ErrorBoundary {
  /**
   * User-provided error handler callback.
   * Set via {@link setErrorHandler} during widget initialization.
   * When null, errors are silently swallowed (only debug logging, if enabled).
   */
  private errorHandler: ((error: ChatbotError) => void) | null = null;

  /** Whether debug logging is enabled */
  private readonly debug: boolean;

  /**
   * Creates a new ErrorBoundary instance.
   *
   * @param debug - When `true`, caught errors are logged to `console.error`
   *   with the context label. Default: `false`.
   */
  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Sets the error handler callback.
   *
   * Typically wired to the user-provided `config.onError` callback during
   * widget initialization. The handler itself is invoked inside a try/catch
   * to prevent infinite error loops.
   *
   * @param handler - Callback invoked with a normalized {@link ChatbotError}
   *   when any guarded operation fails.
   */
  setErrorHandler(handler: (error: ChatbotError) => void): void {
    this.errorHandler = handler;
  }

  // --------------------------------------------------------------------------
  // Synchronous guard
  // --------------------------------------------------------------------------

  /**
   * Wraps a synchronous function call with error isolation.
   *
   * If the function throws, the error is caught, normalized into a
   * {@link ChatbotError}, reported via the error handler, and `undefined`
   * is returned. The host page is never exposed to the exception.
   *
   * @typeParam T - Return type of the wrapped function
   * @param fn - The function to execute safely
   * @param context - Optional label identifying the call site (e.g. 'open',
   *   'render'). Used in debug logs and error normalization.
   * @returns The function's return value on success, or `undefined` on failure
   *
   * @example
   * ```typescript
   * const state = boundary.guard(() => stateManager.getState(), 'getState');
   * if (!state) return defaultState; // graceful fallback
   * ```
   */
  guard<T>(fn: () => T, context?: string): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.handleError(error, context);
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Async guard
  // --------------------------------------------------------------------------

  /**
   * Wraps an asynchronous function call with error isolation.
   *
   * If the promise rejects, the error is caught, normalized into a
   * {@link ChatbotError}, reported via the error handler, and `undefined`
   * is returned. The host page never sees an unhandled promise rejection
   * from the widget.
   *
   * @typeParam T - Resolved type of the wrapped promise
   * @param fn - The async function to execute safely
   * @param context - Optional label identifying the call site (e.g. 'init',
   *   'sendMessage'). Used in debug logs and error normalization.
   * @returns The resolved value on success, or `undefined` on rejection
   *
   * @example
   * ```typescript
   * await boundary.guardAsync(async () => {
   *   await conversationService.sendMessage(id, { content: text });
   * }, 'sendMessage');
   * ```
   */
  async guardAsync<T>(fn: () => Promise<T>, context?: string): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.handleError(error, context);
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Callback wrapper
  // --------------------------------------------------------------------------

  /**
   * Wraps a user-provided callback for error isolation.
   *
   * If the user's callback throws, the error is caught and reported but
   * does NOT break the widget's internal flow. If the callback is `undefined`
   * or `null`, a no-op function is returned.
   *
   * @typeParam T - The callback function signature
   * @param fn - The user-provided callback, or `undefined`/`null`
   * @param context - Optional label for error reporting (e.g. 'onOpen',
   *   'onMessage')
   * @returns A safe wrapper function with the same signature as `T`
   *
   * @example
   * ```typescript
   * const safeOnMessage = boundary.wrapCallback(config.onMessage, 'onMessage');
   * safeOnMessage(botMessage); // never throws even if user code is buggy
   * ```
   */
  wrapCallback<T extends (...args: unknown[]) => unknown>(
    fn: T | undefined | null,
    context?: string,
  ): T {
    if (!fn) return (() => {}) as unknown as T;

    return ((...args: unknown[]) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(error, `callback:${context ?? 'unknown'}`);
        return undefined;
      }
    }) as unknown as T;
  }

  // --------------------------------------------------------------------------
  // Timer wrapper
  // --------------------------------------------------------------------------

  /**
   * Wraps a timer callback (setTimeout/setInterval) for error isolation.
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
  guardTimer(fn: () => void, context?: string): () => void {
    return () => {
      try {
        fn();
      } catch (error) {
        this.handleError(error, `timer:${context ?? 'unknown'}`);
      }
    };
  }

  // --------------------------------------------------------------------------
  // Error normalization (static)
  // --------------------------------------------------------------------------

  /**
   * Normalizes any thrown value into a consistent {@link ChatbotError}.
   *
   * Handles all possible thrown value types:
   * - `Error` instances: extracts `message` and checks for `code` property
   * - Objects with `code` and `message`: treated as pre-formed ChatbotError
   * - Strings: used directly as the error message
   * - Other primitives: converted to string via `String()`
   * - `null`/`undefined`: produces a generic "Unknown error" message
   *
   * @param error - The caught value (can be anything: Error, string, object, etc.)
   * @param context - Optional context label appended to the error message
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
  static normalize(error: unknown, context?: string): ChatbotError {
    const prefix = context ? `${context}: ` : '';

    // Case 1: Already a ChatbotError-like object with code and message
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error
    ) {
      const errorObj = error as { code: string; message: string; status?: number; details?: Record<string, unknown> };
      const result: ChatbotError = {
        code: errorObj.code as ChatbotErrorCode,
        message: prefix + String(errorObj.message),
      };
      if (errorObj.status !== undefined) {
        result.status = errorObj.status;
      }
      if (errorObj.details !== undefined) {
        result.details = errorObj.details;
      }
      return result;
    }

    // Case 2: Standard Error instance
    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: prefix + error.message,
      };
    }

    // Case 3: String
    if (typeof error === 'string') {
      return {
        code: 'UNKNOWN_ERROR',
        message: prefix + error,
      };
    }

    // Case 4: null, undefined, or other primitive
    return {
      code: 'UNKNOWN_ERROR',
      message: prefix + (error != null ? String(error) : 'Unknown error occurred'),
    };
  }

  // --------------------------------------------------------------------------
  // Private: centralized error handling
  // --------------------------------------------------------------------------

  /**
   * Centralized error handler invoked by all guard methods.
   *
   * 1. Normalizes the error into a {@link ChatbotError}.
   * 2. Logs to console if debug mode is enabled.
   * 3. Invokes the registered error handler (itself wrapped in try/catch
   *    to prevent infinite loops if the handler throws).
   *
   * @param error - The caught value
   * @param context - Optional context label for logging and normalization
   */
  private handleError(error: unknown, context?: string): void {
    const chatbotError = ErrorBoundary.normalize(error, context);

    if (this.debug) {
      // eslint-disable-next-line no-console
      console.error(`[NeventChatbot] Error in ${context ?? 'unknown'}:`, error);
    }

    // Fire error handler — wrapped to prevent infinite loops
    try {
      this.errorHandler?.(chatbotError);
    } catch {
      // Error handler itself threw — silently swallow to prevent recursion.
      // In debug mode, log this meta-error separately.
      if (this.debug) {
        // eslint-disable-next-line no-console
        console.error('[NeventChatbot] Error handler itself threw — swallowed');
      }
    }
  }
}
