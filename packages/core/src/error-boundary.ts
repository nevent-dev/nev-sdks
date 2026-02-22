/**
 * ErrorBoundary - Generic error isolation utilities for Nevent SDKs
 *
 * Provides a comprehensive error containment system that ensures SDK widgets
 * NEVER throw uncaught exceptions to the host page. All public widget methods,
 * user-provided callbacks, and timer callbacks are wrapped through this boundary
 * so that failures are caught, normalized, reported via a configured error
 * handler, and silently swallowed.
 *
 * Design goals:
 * - **Host page safety**: No SDK error can crash or disrupt the host page.
 * - **Error normalization**: All thrown values (Error, string, object, unknown)
 *   are normalized into a consistent {@link NormalizedError} structure.
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
 * const timerId = boundary.guardTimer(() => tick(), 1000, 'heartbeat');
 * ```
 *
 * @packageDocumentation
 */

import type { SentryReporter } from './sentry-reporter';

// ============================================================================
// Types
// ============================================================================

/**
 * A normalized error object produced by the ErrorBoundary.
 *
 * Every caught value (Error, string, object, unknown) is transformed into
 * this consistent shape for predictable error handling downstream.
 */
export interface NormalizedError {
  /** Machine-readable error code (e.g., 'UNKNOWN_ERROR', 'HTTP_500') */
  code: string;
  /** Human-readable error message, optionally prefixed with context */
  message: string;
  /** HTTP status code, if the original error carried one */
  status?: number;
  /** Arbitrary additional details from the original error */
  details?: Record<string, unknown>;
}

// ============================================================================
// ErrorBoundary Class
// ============================================================================

/**
 * Error boundary for isolating SDK errors from the host page.
 *
 * Instantiated once per widget/SDK instance and shared across all sub-systems.
 * The error handler is wired to the user-provided `onError` callback from
 * the widget configuration.
 */
export class ErrorBoundary {
  /**
   * User-provided error handler callback.
   * Set via {@link setErrorHandler} during widget initialization.
   * When null, errors are silently swallowed (only debug logging, if enabled).
   */
  private errorHandler: ((error: NormalizedError) => void) | null = null;

  /**
   * Optional Sentry reporter for automatic error tracking.
   * When set, all errors caught by the boundary are forwarded to Sentry
   * via {@link SentryReporter.captureException}.
   * Set via {@link setSentryReporter}.
   */
  private sentryReporter: SentryReporter | null = null;

  /** Whether debug logging is enabled */
  private readonly debug: boolean;

  /** Prefix used in debug console output */
  private readonly logPrefix: string;

  /**
   * Creates a new ErrorBoundary instance.
   *
   * @param debug - When `true`, caught errors are logged to `console.error`
   *   with the context label. Default: `false`.
   * @param logPrefix - Prefix for console log messages.
   *   Default: `'[Nevent]'`.
   */
  constructor(debug = false, logPrefix = '[Nevent]') {
    this.debug = debug;
    this.logPrefix = logPrefix;
  }

  /**
   * Sets the error handler callback.
   *
   * Typically wired to the user-provided `config.onError` callback during
   * widget initialization. The handler itself is invoked inside a try/catch
   * to prevent infinite error loops.
   *
   * @param handler - Callback invoked with a {@link NormalizedError}
   *   when any guarded operation fails.
   */
  setErrorHandler(handler: (error: NormalizedError) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Attaches a {@link SentryReporter} for automatic error forwarding.
   *
   * When set, every error caught by the boundary guard methods is
   * automatically reported to Sentry via `captureException`. The Sentry
   * call is fire-and-forget and wrapped in its own try/catch, so a failure
   * in the reporter never affects the error boundary's own behavior.
   *
   * Pass `null` to detach the reporter (e.g. during widget destroy).
   *
   * @param reporter - A {@link SentryReporter} instance, or `null` to detach
   */
  setSentryReporter(reporter: SentryReporter | null): void {
    this.sentryReporter = reporter;
  }

  // --------------------------------------------------------------------------
  // Synchronous guard
  // --------------------------------------------------------------------------

  /**
   * Wraps a synchronous function call with error isolation.
   *
   * If the function throws, the error is caught, normalized into a
   * {@link NormalizedError}, reported via the error handler, and `undefined`
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
   * {@link NormalizedError}, reported via the error handler, and `undefined`
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
   *   await apiClient.post('/data', payload);
   * }, 'sendData');
   * ```
   */
  async guardAsync<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T | undefined> {
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
   * safeOnMessage(data); // never throws even if user code is buggy
   * ```
   */
  wrapCallback<T extends (...args: unknown[]) => unknown>(
    fn: T | undefined | null,
    context?: string
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
   * Wraps a callback in error isolation and starts a recurring interval timer.
   *
   * Timer callbacks run outside the normal synchronous call stack, so
   * uncaught errors in them would bubble up as unhandled exceptions on the
   * host page. This wrapper ensures they are caught and reported.
   *
   * @param fn - The timer callback function
   * @param interval - Interval in milliseconds for setInterval
   * @param context - Optional label for error reporting (e.g. 'heartbeat',
   *   'reconnect')
   * @returns The interval ID (can be passed to `clearInterval`)
   *
   * @example
   * ```typescript
   * const timerId = boundary.guardTimer(() => pollStatus(), 5000, 'polling');
   * // Later: clearInterval(timerId);
   * ```
   */
  guardTimer(fn: () => void, interval: number, context?: string): number {
    const safeFn = () => {
      try {
        fn();
      } catch (error) {
        this.handleError(error, `timer:${context ?? 'unknown'}`);
      }
    };

    return setInterval(safeFn, interval) as unknown as number;
  }

  // --------------------------------------------------------------------------
  // Error normalization (static)
  // --------------------------------------------------------------------------

  /**
   * Normalizes any thrown value into a consistent {@link NormalizedError}.
   *
   * Handles all possible thrown value types:
   * - `Error` instances: extracts `message` and checks for `code` property
   * - Objects with `code` and `message`: treated as pre-formed error
   * - Strings: used directly as the error message
   * - Other primitives: converted to string via `String()`
   * - `null`/`undefined`: produces a generic "Unknown error" message
   *
   * @param error - The caught value (can be anything: Error, string, object, etc.)
   * @param context - Optional context label prepended to the error message
   * @returns A normalized {@link NormalizedError} object
   *
   * @example
   * ```typescript
   * try {
   *   riskyOperation();
   * } catch (e) {
   *   const normalized = ErrorBoundary.normalize(e, 'riskyOperation');
   *   // normalized.code === 'UNKNOWN_ERROR'
   *   // normalized.message === 'riskyOperation: <original message>'
   * }
   * ```
   */
  static normalize(error: unknown, context?: string): NormalizedError {
    const prefix = context ? `${context}: ` : '';

    // Case 1: Already an error-like object with code and message
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error
    ) {
      const errorObj = error as {
        code: string;
        message: string;
        status?: number;
        details?: Record<string, unknown>;
      };
      const result: NormalizedError = {
        code: errorObj.code,
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
      message:
        prefix + (error != null ? String(error) : 'Unknown error occurred'),
    };
  }

  // --------------------------------------------------------------------------
  // Private: centralized error handling
  // --------------------------------------------------------------------------

  /**
   * Centralized error handler invoked by all guard methods.
   *
   * 1. Normalizes the error into a {@link NormalizedError}.
   * 2. Logs to console if debug mode is enabled.
   * 3. Invokes the registered error handler (itself wrapped in try/catch
   *    to prevent infinite loops if the handler throws).
   *
   * @param error - The caught value
   * @param context - Optional context label for logging and normalization
   */
  private handleError(error: unknown, context?: string): void {
    const normalized = ErrorBoundary.normalize(error, context);

    if (this.debug) {
      console.error(
        `${this.logPrefix} Error in ${context ?? 'unknown'}:`,
        error
      );
    }

    // Forward to Sentry reporter (fire-and-forget, never throws)
    try {
      this.sentryReporter?.captureException(error, {
        boundary_context: context ?? 'unknown',
        normalized_code: normalized.code,
      });
    } catch {
      // Silent: Sentry reporting failure must never affect the boundary
    }

    // Fire error handler -- wrapped to prevent infinite loops
    try {
      this.errorHandler?.(normalized);
    } catch {
      // Error handler itself threw -- silently swallow to prevent recursion.
      // In debug mode, log this meta-error separately.
      if (this.debug) {
        console.error(
          `${this.logPrefix} Error handler itself threw -- swallowed`
        );
      }
    }
  }
}
