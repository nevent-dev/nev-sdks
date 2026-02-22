/**
 * TypingStatusService - Bidirectional typing status management
 *
 * Manages both directions of typing notifications:
 *
 * **Client → Server (user typing):**
 * Sends lightweight REST notifications when the user starts/stops typing in
 * the input field. Uses debounce to avoid spamming the server and an
 * auto-stop timeout to handle cases where the user walks away mid-typing.
 * All requests are fire-and-forget (never block the UI, never retry on error).
 *
 * **Server → Client (agent/bot typing):**
 * Handles `TYPING_START` and `TYPING_STOP` SSE events from the server,
 * parsing the {@link TypingStatusEvent} payload and notifying the UI layer
 * via a callback so it can show/hide the typing indicator with agent names.
 *
 * REST endpoint for user typing notifications:
 * - `POST {apiUrl}/chatbot/typing`
 * - Body: `{ threadId: string, isTyping: boolean }`
 * - Header: `X-Tenant-ID: {tenantId}`
 * - Fire-and-forget: response is ignored, errors are swallowed
 * - Uses `navigator.sendBeacon()` as fallback on page unload
 *
 * @example
 * ```typescript
 * const service = new TypingStatusService(
 *   { enabled: true, debounceMs: 2000, timeoutMs: 5000 },
 *   'https://api.nevent.es',
 *   'tenant-123',
 *   () => conversationId,
 *   'server-token',
 * );
 *
 * // Called on every keystroke
 * service.notifyTyping();
 *
 * // Called when user sends a message
 * service.notifyStoppedTyping();
 *
 * // Handle incoming server events
 * service.handleServerTypingEvent({ isTyping: true, displayName: 'Carlos' });
 *
 * // Cleanup
 * service.destroy();
 * ```
 */

import { Logger } from '@nevent/core';
import type { TypingStatusConfig, TypingStatusEvent } from '../types';

// ============================================================================
// Constants
// ============================================================================

/** Default debounce interval in milliseconds between typing notifications. */
const DEFAULT_DEBOUNCE_MS = 2000;

/** Default auto-stop timeout in milliseconds after inactivity. */
const DEFAULT_TIMEOUT_MS = 5000;

// ============================================================================
// Types
// ============================================================================

/**
 * Callback invoked when a server-side typing status event is received.
 *
 * @param event - The typing status event payload from the server
 */
export type TypingStatusCallback = (event: TypingStatusEvent) => void;

// ============================================================================
// TypingStatusService Class
// ============================================================================

/**
 * Manages bidirectional typing status notifications between the chatbot
 * widget and the Nevent backend.
 *
 * Responsibilities:
 * 1. **User typing → server**: Debounced REST notifications on keystrokes.
 * 2. **Server → UI**: Parse SSE typing events and invoke the UI callback.
 * 3. **Lifecycle**: Clean up timers and send a final stop on destroy.
 */
export class TypingStatusService {
  /**
   * Timer for debouncing rapid keystrokes.
   * Prevents sending more than one typing notification per `debounceMs`.
   */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Timer for auto-stopping typing after inactivity.
   * If no keystroke occurs within `timeoutMs`, a stop notification is sent.
   */
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** Whether the user is currently reported as typing to the server. */
  private isCurrentlyTyping = false;

  /** Resolved configuration with defaults applied. */
  private readonly config: Required<TypingStatusConfig>;

  /** Base API URL for typing notification requests. */
  private readonly apiUrl: string;

  /** Tenant ID sent as X-Tenant-ID header. */
  private readonly tenantId: string;

  /** Bearer token for Authorization header. */
  private readonly token: string;

  /** Function that returns the current thread/conversation ID (may be null). */
  private readonly getThreadId: () => string | null;

  /** Callback invoked when server typing events are received. */
  private onServerTypingCallback: TypingStatusCallback | null = null;

  /** Logger for debug output. */
  private readonly logger: Logger;

  /** Whether the service has been destroyed. */
  private destroyed = false;

  /**
   * Creates a new TypingStatusService instance.
   *
   * @param config - Typing status configuration (debounce, timeout, enabled)
   * @param apiUrl - Base URL of the Nevent API
   * @param tenantId - Tenant identifier for X-Tenant-ID header
   * @param getThreadId - Function returning the current conversation/thread ID
   * @param token - Bearer token for authorization
   * @param debug - Whether to enable debug logging
   */
  constructor(
    config: TypingStatusConfig | undefined,
    apiUrl: string,
    tenantId: string,
    getThreadId: () => string | null,
    token: string,
    debug = false
  ) {
    this.config = {
      enabled: config?.enabled ?? true,
      debounceMs: config?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.tenantId = tenantId;
    this.getThreadId = getThreadId;
    this.token = token;
    this.logger = new Logger('[NeventChatbot:TypingStatus]', debug);
  }

  // --------------------------------------------------------------------------
  // Public API: User → Server (client typing notifications)
  // --------------------------------------------------------------------------

  /**
   * Notifies the server that the user is typing.
   *
   * Called on every keystroke in the input field. The actual network request
   * is debounced: the first call sends a notification immediately, and
   * subsequent calls within `debounceMs` are suppressed.
   *
   * An inactivity timeout (`timeoutMs`) automatically sends a "stopped
   * typing" notification if no further keystrokes occur.
   *
   * This method is fire-and-forget: it never blocks the UI and swallows
   * all network errors.
   */
  notifyTyping(): void {
    if (!this.config.enabled || this.destroyed) return;

    // Reset the inactivity timeout on every keystroke
    this.resetTimeoutTimer();

    // If not currently typing, send start immediately
    if (!this.isCurrentlyTyping) {
      this.isCurrentlyTyping = true;
      this.sendTypingNotification(true);
      this.startDebounceTimer();
      return;
    }

    // Already typing: debounce timer prevents spamming.
    // The timeout timer above ensures we send stop eventually.
  }

  /**
   * Notifies the server that the user has stopped typing.
   *
   * Called when the user sends a message, clears the input, or navigates
   * away. Sends the stop notification immediately and clears all timers.
   */
  notifyStoppedTyping(): void {
    if (!this.config.enabled || this.destroyed) return;

    if (this.isCurrentlyTyping) {
      this.isCurrentlyTyping = false;
      this.sendTypingNotification(false);
    }

    this.clearAllTimers();
  }

  // --------------------------------------------------------------------------
  // Public API: Server → Client (agent/bot typing events)
  // --------------------------------------------------------------------------

  /**
   * Registers a callback for server-side typing status events.
   *
   * The callback is invoked whenever a `TYPING_START` or `TYPING_STOP`
   * SSE event is received from the server, passing the parsed
   * {@link TypingStatusEvent} payload.
   *
   * @param callback - Function to invoke with the typing event
   */
  onServerTyping(callback: TypingStatusCallback): void {
    this.onServerTypingCallback = callback;
  }

  /**
   * Handles an incoming typing status event from the SSE stream.
   *
   * Called by the StreamingClient or ChatbotWidget when a `TYPING_START`
   * or `TYPING_STOP` event is received. Parses the event and forwards it
   * to the registered callback.
   *
   * @param event - The typing status event from the server
   */
  handleServerTypingEvent(event: TypingStatusEvent): void {
    if (this.destroyed) return;

    this.logger.debug('Server typing event received', {
      isTyping: event.isTyping,
      displayName: event.displayName,
      agentId: event.agentId,
    });

    this.onServerTypingCallback?.(event);
  }

  // --------------------------------------------------------------------------
  // Public API: Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Destroys the service and releases all resources.
   *
   * Clears all active timers. If the user was mid-typing, sends a final
   * "stopped typing" notification as a best-effort using
   * `navigator.sendBeacon()` to survive page unload.
   */
  destroy(): void {
    if (this.destroyed) return;

    this.logger.debug('Destroying TypingStatusService');

    // Send stop if currently typing (best-effort via sendBeacon)
    if (this.isCurrentlyTyping) {
      this.sendTypingNotificationBeacon(false);
      this.isCurrentlyTyping = false;
    }

    this.clearAllTimers();
    this.onServerTypingCallback = null;
    this.destroyed = true;
  }

  // --------------------------------------------------------------------------
  // Private: Timer Management
  // --------------------------------------------------------------------------

  /**
   * Starts the debounce timer that suppresses repeat notifications.
   * When the timer fires, the debounce window resets, allowing the next
   * keystroke to trigger a fresh notification.
   */
  private startDebounceTimer(): void {
    this.clearDebounceTimer();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
    }, this.config.debounceMs);
  }

  /**
   * Resets the inactivity timeout. If no further keystrokes occur within
   * `timeoutMs`, a "stopped typing" notification is sent automatically.
   */
  private resetTimeoutTimer(): void {
    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      if (this.isCurrentlyTyping) {
        this.isCurrentlyTyping = false;
        this.sendTypingNotification(false);
        this.clearDebounceTimer();
      }
    }, this.config.timeoutMs);
  }

  /**
   * Clears the debounce timer.
   */
  private clearDebounceTimer(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Clears the inactivity timeout timer.
   */
  private clearTimeoutTimer(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Clears both debounce and timeout timers.
   */
  private clearAllTimers(): void {
    this.clearDebounceTimer();
    this.clearTimeoutTimer();
  }

  // --------------------------------------------------------------------------
  // Private: Network (Fire-and-Forget)
  // --------------------------------------------------------------------------

  /**
   * Sends a typing notification to the server via fetch.
   *
   * The request is fire-and-forget: the response is not awaited and errors
   * are caught and logged without propagation. This ensures that typing
   * notifications never block the UI or interfere with the chat experience.
   *
   * @param isTyping - Whether the user is currently typing
   */
  private sendTypingNotification(isTyping: boolean): void {
    const threadId = this.getThreadId();
    if (!threadId) {
      this.logger.debug('No threadId available — skipping typing notification');
      return;
    }

    const url = `${this.apiUrl}/chatbot/typing`;
    const body = JSON.stringify({ threadId, isTyping });

    this.logger.debug('Sending typing notification', { threadId, isTyping });

    // Fire-and-forget: don't await, don't retry
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.tenantId,
        Authorization: `Bearer ${this.token}`,
      },
      body,
      // Use 'keepalive' so the request survives page navigation
      keepalive: true,
    }).catch((error) => {
      // Swallow all errors — typing status is non-critical
      this.logger.debug('Typing notification failed (non-fatal)', error);
    });
  }

  /**
   * Sends a typing notification using `navigator.sendBeacon()`.
   *
   * Used as a last-resort fallback during page unload (beforeunload/destroy)
   * when a standard fetch might not complete. sendBeacon guarantees the
   * request is queued for delivery even if the page is being torn down.
   *
   * @param isTyping - Whether the user is currently typing
   */
  private sendTypingNotificationBeacon(isTyping: boolean): void {
    const threadId = this.getThreadId();
    if (!threadId) return;

    const url = `${this.apiUrl}/chatbot/typing`;
    const body = JSON.stringify({
      threadId,
      isTyping,
      tenantId: this.tenantId,
    });

    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
        this.logger.debug('Typing stop sent via sendBeacon');
      } else {
        // Fallback to regular fetch if sendBeacon is unavailable
        this.sendTypingNotification(isTyping);
      }
    } catch {
      // Swallow: best-effort only
      this.logger.debug('sendBeacon failed (non-fatal)');
    }
  }
}
