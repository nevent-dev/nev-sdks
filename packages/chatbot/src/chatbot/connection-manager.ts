/**
 * ConnectionManager - Network connectivity monitoring and automatic reconnection
 *
 * Monitors the browser's network state and the reachability of the Nevent API.
 * When connectivity is lost or the API becomes unreachable, the manager
 * transitions through a defined set of statuses and drives the widget UI
 * to reflect the current state.
 *
 * Status lifecycle:
 * ```
 * 'connected'
 *   │
 *   ├─ browser offline event / ping failure
 *   │         │
 *   ▼         ▼
 * 'offline'  'reconnecting'
 *   │              │
 *   │ online evt   │ ping success → 'connected' (retries reset)
 *   │              │ ping failure → retry with exp. backoff
 *   │              │   └─ maxRetries exceeded → 'disconnected'
 *   └──────────────┘
 * ```
 *
 * Integration:
 * - Call `start()` after the widget is initialised.
 * - Call `reportFailure()` from `StreamingClient` / `ConversationService` catch blocks.
 * - Call `reportSuccess()` after any successful API response.
 * - Subscribe to status changes via `onStatusChange()` to update the UI.
 * - Call `destroy()` in the widget's `destroy()` lifecycle to clean up.
 *
 * @remarks
 * Heartbeat pings use a lightweight `HEAD` request to the API base URL.
 * The `ping()` method is also exposed publicly so callers can trigger an
 * on-demand check (e.g., after the browser comes back online).
 */

import { Logger } from '@nevent/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Current connectivity status of the chatbot widget.
 *
 * - `'connected'`    — API is reachable, widget operates normally.
 * - `'reconnecting'` — A failure was detected; actively attempting to reconnect.
 * - `'disconnected'` — Max retry attempts exhausted; user intervention required.
 * - `'offline'`      — Browser reports no network (`navigator.onLine === false`).
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'offline';

/**
 * Configuration options for the ConnectionManager.
 *
 * All fields are optional — sensible production-ready defaults are applied.
 */
export interface ConnectionManagerConfig {
  /**
   * Maximum number of reconnection attempts before transitioning to
   * `'disconnected'` and stopping automatic retries.
   * @default 5
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds between retry attempts.
   * The actual delay grows exponentially: `baseRetryDelay * 2^retryCount`.
   * @default 1000
   */
  baseRetryDelay?: number;

  /**
   * Upper bound on the retry delay in milliseconds.
   * Caps the exponential back-off to prevent excessively long waits.
   * @default 30000
   */
  maxRetryDelay?: number;

  /**
   * Interval in milliseconds between periodic heartbeat pings to the API.
   * Set to `0` to disable periodic heartbeats (only react to events and
   * explicit `reportFailure()` calls).
   * @default 30000
   */
  heartbeatInterval?: number;

  /**
   * Timeout in milliseconds for each heartbeat ping request.
   * If the API does not respond within this window, the ping is counted as
   * a failure.
   * @default 5000
   */
  heartbeatTimeout?: number;

  /**
   * Whether to automatically schedule reconnection retries after a failure.
   * When `false`, consumers must call `reconnect()` manually.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Enable verbose debug logging to the browser console.
   * @default false
   */
  debug?: boolean;
}

// ============================================================================
// ConnectionManager Class
// ============================================================================

/**
 * Manages connection lifecycle for the chatbot widget.
 *
 * Responsibilities:
 * 1. Listen for browser `online` / `offline` events.
 * 2. Run periodic heartbeat pings to the Nevent API.
 * 3. Implement exponential back-off with jitter when retrying after failures.
 * 4. Notify subscribers via `onStatusChange` whenever the status changes.
 * 5. Expose `reportFailure()` / `reportSuccess()` hooks for the HTTP layer.
 *
 * @example
 * ```typescript
 * const manager = new ConnectionManager(
 *   'https://api.nevent.es',
 *   { maxRetries: 5, heartbeatInterval: 30_000 }
 * );
 *
 * const unsub = manager.onStatusChange((status) => {
 *   console.log('Connection status:', status);
 * });
 *
 * manager.start();
 *
 * // Later, from a failed HTTP call:
 * manager.reportFailure();
 *
 * // On widget teardown:
 * manager.destroy();
 * unsub();
 * ```
 */
export class ConnectionManager {
  // --------------------------------------------------------------------------
  // Private state
  // --------------------------------------------------------------------------

  /** Current connection status. */
  private status: ConnectionStatus = 'connected';

  /** Number of consecutive reconnection attempts made so far. */
  private retryCount: number = 0;

  /** Handle for the scheduled retry timer. */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Handle for the periodic heartbeat interval. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Bound reference for the `online` event so it can be removed. */
  private onlineHandler: (() => void) | null = null;

  /** Bound reference for the `offline` event so it can be removed. */
  private offlineHandler: (() => void) | null = null;

  /** Set of subscriber callbacks notified on every status change. */
  private listeners: Set<(status: ConnectionStatus) => void> = new Set();

  /** Whether the manager has been started and not yet destroyed. */
  private running: boolean = false;

  /** Logger instance for debug / error output. */
  private readonly logger: Logger;

  // --------------------------------------------------------------------------
  // Resolved configuration (with defaults applied)
  // --------------------------------------------------------------------------

  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private readonly maxRetryDelay: number;
  private readonly heartbeatInterval: number;
  private readonly heartbeatTimeout: number;
  private readonly autoReconnect: boolean;

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new ConnectionManager instance.
   *
   * The manager does not begin monitoring until `start()` is called.
   *
   * @param apiUrl - Base URL of the Nevent API used for heartbeat pings
   *   (e.g. `'https://api.nevent.es'`).  A trailing slash is stripped.
   * @param config - Optional configuration overrides.
   */
  constructor(
    private readonly apiUrl: string,
    config: ConnectionManagerConfig = {},
  ) {
    this.maxRetries = config.maxRetries ?? 5;
    this.baseRetryDelay = config.baseRetryDelay ?? 1000;
    this.maxRetryDelay = config.maxRetryDelay ?? 30_000;
    this.heartbeatInterval = config.heartbeatInterval ?? 30_000;
    this.heartbeatTimeout = config.heartbeatTimeout ?? 5_000;
    this.autoReconnect = config.autoReconnect ?? true;

    this.logger = new Logger('[NeventChatbot:ConnectionManager]', config.debug ?? false);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Starts connection monitoring.
   *
   * Registers browser `online` / `offline` event listeners and, if
   * `heartbeatInterval > 0`, starts the periodic ping timer.
   *
   * Safe to call multiple times — calling `start()` on an already-running
   * manager is a no-op.
   *
   * @example
   * ```typescript
   * manager.start(); // Begin monitoring
   * ```
   */
  start(): void {
    if (this.running) {
      this.logger.debug('ConnectionManager already running — start() ignored');
      return;
    }

    this.running = true;

    // Reflect the initial browser state immediately.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
    }

    // Register browser network event handlers.
    this.onlineHandler = this.handleOnline.bind(this);
    this.offlineHandler = this.handleOffline.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }

    // Start periodic heartbeat pings.
    if (this.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        void this.runHeartbeat();
      }, this.heartbeatInterval);
    }

    this.logger.debug('ConnectionManager started', {
      maxRetries: this.maxRetries,
      heartbeatInterval: this.heartbeatInterval,
      autoReconnect: this.autoReconnect,
    });
  }

  /**
   * Stops connection monitoring without fully destroying the instance.
   *
   * Clears all timers and removes event listeners. A stopped manager can be
   * restarted by calling `start()` again.
   */
  stop(): void {
    this.clearRetryTimer();
    this.clearHeartbeatTimer();
    this.removeWindowListeners();
    this.running = false;
    this.logger.debug('ConnectionManager stopped');
  }

  /**
   * Returns the current connection status.
   *
   * @returns One of `'connected'`, `'reconnecting'`, `'disconnected'`, or `'offline'`.
   *
   * @example
   * ```typescript
   * if (manager.getStatus() === 'connected') {
   *   // Safe to send messages
   * }
   * ```
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Subscribes to connection status changes.
   *
   * The listener is invoked synchronously on the same tick when the status
   * changes.  The returned function unsubscribes the listener when called.
   *
   * @param listener - Callback that receives the new `ConnectionStatus`.
   * @returns Unsubscribe function — call it to stop receiving notifications.
   *
   * @example
   * ```typescript
   * const unsub = manager.onStatusChange((status) => {
   *   console.log('Status:', status);
   * });
   *
   * // Later:
   * unsub();
   * ```
   */
  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Reports a connection failure from the HTTP layer (StreamingClient or
   * ConversationService).
   *
   * If the browser is already known to be offline, the call is ignored
   * because the `offline` event handler already manages that path.
   *
   * When `autoReconnect` is `true`, scheduling the first retry attempt is
   * handled automatically.
   *
   * @example
   * ```typescript
   * try {
   *   await conversationService.sendMessage(id, req);
   * } catch {
   *   connectionManager.reportFailure();
   * }
   * ```
   */
  reportFailure(): void {
    if (this.status === 'offline') return; // Already in offline mode.
    if (this.status === 'reconnecting') return; // Already retrying.

    this.logger.debug('Failure reported by HTTP layer');
    this.setStatus('reconnecting');

    if (this.autoReconnect) {
      this.scheduleRetry();
    }
  }

  /**
   * Reports a successful API response, resetting the retry counter and
   * transitioning back to `'connected'` if the manager was in any
   * degraded state.
   *
   * @example
   * ```typescript
   * const response = await conversationService.sendMessage(id, req);
   * connectionManager.reportSuccess();
   * ```
   */
  reportSuccess(): void {
    if (this.status === 'connected') return; // Already connected — no-op.

    this.logger.debug('Success reported by HTTP layer — resetting retries');
    this.clearRetryTimer();
    this.retryCount = 0;
    this.setStatus('connected');
  }

  /**
   * Manually triggers an immediate reconnection attempt.
   *
   * Cancels any pending retry timer and immediately pings the API.  The
   * manager transitions to `'reconnecting'` while the ping is in-flight.
   * Returns `true` if the ping succeeds, `false` otherwise.
   *
   * @returns Promise that resolves to `true` on success, `false` on failure.
   *
   * @example
   * ```typescript
   * const ok = await manager.reconnect();
   * if (ok) console.log('Back online!');
   * ```
   */
  async reconnect(): Promise<boolean> {
    this.clearRetryTimer();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.logger.debug('reconnect() called but browser is offline');
      this.setStatus('offline');
      return false;
    }

    this.setStatus('reconnecting');
    const ok = await this.ping();

    if (ok) {
      this.retryCount = 0;
      this.setStatus('connected');
    } else {
      this.retryCount += 1;
      if (this.retryCount >= this.maxRetries) {
        this.setStatus('disconnected');
      } else if (this.autoReconnect) {
        this.scheduleRetry();
      }
    }

    return ok;
  }

  /**
   * Checks whether the Nevent API is currently reachable.
   *
   * Sends a lightweight `HEAD` request to the base API URL.  The request is
   * aborted after `heartbeatTimeout` milliseconds if no response is received.
   *
   * Any HTTP response (even a 4xx / 5xx) is treated as "reachable" because
   * the server is responding.  Only a network failure or timeout returns
   * `false`.
   *
   * @returns Promise that resolves to `true` if the API responded, `false`
   *   on network error or timeout.
   *
   * @example
   * ```typescript
   * const reachable = await manager.ping();
   * console.log('API reachable:', reachable);
   * ```
   */
  async ping(): Promise<boolean> {
    const url = this.apiUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.heartbeatTimeout);

    this.logger.debug('Pinging API', { url });

    try {
      // HEAD request: no body, low bandwidth, just checks server reachability.
      await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // Bypass any cached response so we actually hit the network.
        cache: 'no-store',
      });
      this.logger.debug('Ping succeeded');
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.debug('Ping timed out', { timeoutMs: this.heartbeatTimeout });
      } else {
        this.logger.debug('Ping failed', { error });
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Stops all monitoring, clears timers, removes event listeners, and
   * removes all subscribers.  After calling `destroy()`, the instance
   * should not be used.
   *
   * @example
   * ```typescript
   * widget.destroy() {
   *   this.connectionManager.destroy();
   * }
   * ```
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.logger.debug('ConnectionManager destroyed');
  }

  // --------------------------------------------------------------------------
  // Private: Status Management
  // --------------------------------------------------------------------------

  /**
   * Updates the internal status and notifies all subscribers.
   * If the status has not changed, the notification is suppressed.
   *
   * @param newStatus - The status to transition to.
   */
  private setStatus(newStatus: ConnectionStatus): void {
    if (newStatus === this.status) return;

    const previous = this.status;
    this.status = newStatus;

    this.logger.debug('Status changed', { previous, current: newStatus });

    for (const listener of this.listeners) {
      try {
        listener(newStatus);
      } catch (err) {
        this.logger.error('Status change listener threw an error', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private: Browser Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Handles the browser `online` event.
   *
   * Immediately attempts a reconnection ping to verify API reachability
   * rather than blindly transitioning to `'connected'` — the browser can
   * report `online` while the API is still unreachable (e.g., captive portal).
   */
  private handleOnline(): void {
    this.logger.debug('Browser reports: online');
    void this.reconnect();
  }

  /**
   * Handles the browser `offline` event.
   *
   * Cancels any pending retry timer and transitions immediately to `'offline'`.
   */
  private handleOffline(): void {
    this.logger.debug('Browser reports: offline');
    this.clearRetryTimer();
    this.retryCount = 0;
    this.setStatus('offline');
  }

  // --------------------------------------------------------------------------
  // Private: Heartbeat
  // --------------------------------------------------------------------------

  /**
   * Performs a single heartbeat ping cycle.
   *
   * If the ping fails and the manager is currently `'connected'`, it
   * transitions to `'reconnecting'` and schedules the first retry.
   * If the ping succeeds while reconnecting, resets state to `'connected'`.
   */
  private async runHeartbeat(): Promise<void> {
    if (!this.running) return;

    // Skip heartbeat if we are already trying to reconnect or are offline.
    if (this.status === 'reconnecting' || this.status === 'offline') return;

    const ok = await this.ping();

    if (!ok && this.status === 'connected') {
      this.logger.debug('Heartbeat failed — transitioning to reconnecting');
      this.setStatus('reconnecting');
      if (this.autoReconnect) {
        this.scheduleRetry();
      }
    }
    // Success while 'connected' is the happy path — no state change needed.
  }

  // --------------------------------------------------------------------------
  // Private: Exponential Back-off Retry
  // --------------------------------------------------------------------------

  /**
   * Schedules the next reconnection attempt using exponential back-off with
   * random jitter to avoid the "thundering herd" problem when many clients
   * reconnect simultaneously.
   *
   * Delay formula:
   * ```
   * delay = min(baseRetryDelay * 2^retryCount + jitter, maxRetryDelay)
   * jitter ∈ [0, 1000) ms   (random)
   * ```
   */
  private scheduleRetry(): void {
    this.clearRetryTimer();

    if (this.retryCount >= this.maxRetries) {
      this.logger.debug('Max retries reached — giving up', {
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
      });
      this.setStatus('disconnected');
      return;
    }

    const delay = this.getRetryDelay();
    this.logger.debug('Scheduling retry', {
      attempt: this.retryCount + 1,
      maxRetries: this.maxRetries,
      delayMs: Math.round(delay),
    });

    this.retryTimer = setTimeout(() => {
      void this.executeRetry();
    }, delay);
  }

  /**
   * Executes a single retry attempt: pings the API and either resets to
   * `'connected'` or schedules the next retry.
   */
  private async executeRetry(): Promise<void> {
    if (!this.running) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.logger.debug('Retry skipped — browser is offline');
      this.setStatus('offline');
      return;
    }

    this.logger.debug('Executing retry attempt', { retryCount: this.retryCount });

    const ok = await this.ping();

    if (ok) {
      this.logger.debug('Reconnection succeeded', { attempts: this.retryCount + 1 });
      this.retryCount = 0;
      this.setStatus('connected');
    } else {
      this.retryCount += 1;
      this.logger.debug('Retry failed', {
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
      });

      if (this.retryCount >= this.maxRetries) {
        this.setStatus('disconnected');
      } else {
        this.scheduleRetry();
      }
    }
  }

  /**
   * Calculates the delay for the next retry using exponential back-off with
   * uniformly distributed random jitter in [0, 1000) ms.
   *
   * @returns Delay in milliseconds, capped at `maxRetryDelay`.
   */
  private getRetryDelay(): number {
    const exponential = this.baseRetryDelay * Math.pow(2, this.retryCount);
    const jitter = Math.random() * 1000;
    return Math.min(exponential + jitter, this.maxRetryDelay);
  }

  // --------------------------------------------------------------------------
  // Private: Cleanup Helpers
  // --------------------------------------------------------------------------

  /**
   * Clears the pending retry timer, if any.
   */
  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Clears the periodic heartbeat timer, if any.
   */
  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Removes the `online` and `offline` event listeners from `window`.
   */
  private removeWindowListeners(): void {
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
        this.offlineHandler = null;
      }
    }
  }
}
