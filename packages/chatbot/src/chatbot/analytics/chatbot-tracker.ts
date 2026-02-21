/**
 * ChatbotTracker - Analytics event tracking for chatbot interactions
 *
 * Wraps the {@link AnalyticsClient} from `@nevent/core` to provide
 * chatbot-specific event tracking. Uses `navigator.sendBeacon` for reliable
 * delivery with a `fetch` fallback, following the same pattern as the
 * newsletter `WidgetTracker`.
 *
 * Tracked events include:
 * - Widget lifecycle (impression, opened, closed)
 * - Conversation events (started, resumed)
 * - Message events (sent, received)
 * - Interaction events (quick reply clicked)
 * - Error events
 *
 * All tracking methods are fire-and-forget. Errors are caught silently so
 * that analytics failures never break widget functionality.
 *
 * @example
 * ```typescript
 * const tracker = new ChatbotTracker({
 *   chatbotId: 'bot-123',
 *   tenantId: 'tenant-456',
 *   analyticsUrl: 'https://events.neventapis.com',
 *   debug: false,
 * });
 *
 * // Observe bubble visibility for automatic impression tracking
 * tracker.observeImpression(bubbleElement);
 *
 * // Track interactions
 * tracker.trackOpen();
 * tracker.trackMessageSent('conv-abc', 42);
 *
 * // Clean up when the widget is destroyed
 * tracker.destroy();
 * ```
 */

import { AnalyticsClient } from '@nevent/core';
import type { AnalyticsEventParams } from '@nevent/core';

// ---------------------------------------------------------------------------
// Session ID helper (per-instance, not shared across widgets)
// ---------------------------------------------------------------------------

/**
 * Generates a UUID v4 string.
 *
 * Uses `crypto.randomUUID()` when available (modern browsers and Node 19+),
 * falling back to a Math.random-based implementation for older environments.
 *
 * @returns A UUID v4 string (e.g. `'110e8400-e29b-41d4-a716-446655440000'`)
 */
function generateUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// ---------------------------------------------------------------------------
// Constructor configuration
// ---------------------------------------------------------------------------

/**
 * Configuration required to instantiate a {@link ChatbotTracker}.
 */
export interface ChatbotTrackerConfig {
  /** Chatbot identifier from the Nevent platform. */
  chatbotId: string;
  /** Tenant identifier for multi-tenancy scoping. */
  tenantId: string;
  /** Analytics ingestion endpoint URL (e.g. `'https://events.neventapis.com'`). */
  analyticsUrl: string;
  /**
   * When `true`, each tracked event is logged to `console.debug`.
   * Defaults to `false`.
   */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// ChatbotTracker
// ---------------------------------------------------------------------------

/**
 * Chatbot-specific analytics tracker.
 *
 * Instantiate one tracker per widget instance. Each tracker generates its
 * own `sessionId` so that multiple widgets on the same page are tracked
 * independently.
 *
 * ### Deduplication
 * `trackImpression` and `trackOpen` are guarded by internal boolean flags so
 * that they fire at most once per widget instance lifetime, even if called
 * multiple times.
 *
 * ### Cleanup
 * Call {@link destroy} when the widget is unmounted to disconnect the
 * `IntersectionObserver` set up by {@link observeImpression}.
 */
export class ChatbotTracker {
  // Internal AnalyticsClient that handles sendBeacon / fetch delivery.
  private readonly client: AnalyticsClient;

  // Identifiers attached to every event.
  private readonly chatbotId: string;
  private readonly tenantId: string;

  /**
   * Unique session identifier for this widget instance.
   * Generated once at construction time via {@link generateUUID}.
   */
  private readonly sessionId: string;

  // Whether debug logging is enabled.
  private readonly debug: boolean;

  // Deduplication flags.
  private hasTrackedImpression = false;
  private hasTrackedOpen = false;

  // IntersectionObserver reference so we can disconnect it on destroy().
  private intersectionObserver: IntersectionObserver | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new `ChatbotTracker` instance.
   *
   * @param config - Tracker configuration. See {@link ChatbotTrackerConfig}.
   */
  constructor(config: ChatbotTrackerConfig) {
    this.chatbotId = config.chatbotId;
    this.tenantId = config.tenantId;
    this.debug = config.debug ?? false;
    this.sessionId = generateUUID();

    this.client = new AnalyticsClient({
      endpoint: config.analyticsUrl,
      enabled: true,
      debug: this.debug,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the base event parameters shared by all chatbot events.
   *
   * Includes `event_category`, `event_label` (chatbotId), `tenant_id`,
   * `session_id`, and `interaction: false` as the default — individual
   * methods override `interaction` when appropriate.
   *
   * @returns Partial {@link AnalyticsEventParams} with common fields.
   */
  private baseParams(): Partial<AnalyticsEventParams> {
    return {
      event_category: 'chatbot',
      event_label: this.chatbotId,
      tenant_id: this.tenantId,
      interaction: false,
      // Extra chatbot-specific fields carried as custom keys:
      chatbot_id: this.chatbotId,
      session_id: this.sessionId,
    };
  }

  // ---------------------------------------------------------------------------
  // Public tracking methods
  // ---------------------------------------------------------------------------

  /**
   * Tracks a widget impression event.
   *
   * Fires at most once per tracker instance (deduplication). Intended to be
   * called automatically by {@link observeImpression} when the chat bubble
   * enters the viewport.
   *
   * Event name: `chatbot.impression`
   */
  trackImpression(): void {
    if (this.hasTrackedImpression) return;
    this.hasTrackedImpression = true;

    this.client.track('chatbot.impression', {
      ...this.baseParams(),
      interaction: false,
    });
  }

  /**
   * Tracks the chat window being opened by the user.
   *
   * Fires at most once per tracker instance (deduplication). Subsequent calls
   * after the first open are silently ignored.
   *
   * Event name: `chatbot.open`
   */
  trackOpen(): void {
    if (this.hasTrackedOpen) return;
    this.hasTrackedOpen = true;

    this.client.track('chatbot.open', {
      ...this.baseParams(),
      interaction: true,
    });
  }

  /**
   * Tracks the chat window being closed by the user.
   *
   * @param durationMs - How long (in milliseconds) the chat window was open
   *   before being closed. Used to compute engagement duration on the server.
   *
   * Event name: `chatbot.close`
   */
  trackClose(durationMs: number): void {
    this.client.track('chatbot.close', {
      ...this.baseParams(),
      interaction: true,
      duration_ms: durationMs,
    });
  }

  /**
   * Tracks a user message being sent.
   *
   * @param conversationId - The active conversation identifier.
   * @param messageLength - Character count of the sent message. Sent as a
   *   signal for engagement quality without capturing PII content.
   *
   * Event name: `chatbot.message.sent`
   */
  trackMessageSent(conversationId: string, messageLength: number): void {
    this.client.track('chatbot.message.sent', {
      ...this.baseParams(),
      interaction: true,
      conversation_id: conversationId,
      message_length: messageLength,
    });
  }

  /**
   * Tracks a bot message being received by the client.
   *
   * @param conversationId - The active conversation identifier.
   * @param responseTimeMs - Round-trip latency in milliseconds from the user
   *   sending a message to the bot response arriving.
   *
   * Event name: `chatbot.message.received`
   */
  trackMessageReceived(conversationId: string, responseTimeMs: number): void {
    this.client.track('chatbot.message.received', {
      ...this.baseParams(),
      interaction: false,
      conversation_id: conversationId,
      response_time_ms: responseTimeMs,
    });
  }

  /**
   * Tracks a quick reply button being clicked.
   *
   * @param conversationId - The active conversation identifier.
   * @param replyId - Unique identifier of the quick reply option.
   * @param replyLabel - Display label of the clicked quick reply. Used for
   *   reporting popular reply choices without requiring a join query.
   *
   * Event name: `chatbot.quick_reply.click`
   */
  trackQuickReplyClick(
    conversationId: string,
    replyId: string,
    replyLabel: string
  ): void {
    this.client.track('chatbot.quick_reply.click', {
      ...this.baseParams(),
      interaction: true,
      conversation_id: conversationId,
      reply_id: replyId,
      reply_label: replyLabel,
    });
  }

  /**
   * Tracks an error occurring within the widget.
   *
   * @param errorCode - Machine-readable error code (e.g. `'NETWORK_ERROR'`).
   * @param errorMessage - Human-readable description of what went wrong.
   * @param conversationId - Optional conversation ID when the error is
   *   conversation-scoped (e.g. a message-send failure).
   *
   * Event name: `chatbot.error`
   */
  trackError(
    errorCode: string,
    errorMessage: string,
    conversationId?: string
  ): void {
    this.client.track('chatbot.error', {
      ...this.baseParams(),
      interaction: false,
      error_code: errorCode,
      error_message: errorMessage,
      ...(conversationId !== undefined && {
        conversation_id: conversationId,
      }),
    });
  }

  /**
   * Tracks a brand-new conversation being created.
   *
   * Should be called immediately after the server assigns a conversation ID,
   * before the welcome message is shown.
   *
   * @param conversationId - The newly created conversation identifier.
   *
   * Event name: `chatbot.conversation.start`
   */
  trackConversationStart(conversationId: string): void {
    this.client.track('chatbot.conversation.start', {
      ...this.baseParams(),
      interaction: false,
      conversation_id: conversationId,
    });
  }

  /**
   * Tracks a conversation being resumed from localStorage persistence.
   *
   * Called when the widget detects a previously stored conversation and
   * restores it rather than creating a new one.
   *
   * @param conversationId - The resumed conversation identifier.
   * @param messageCount - Number of messages already present in the restored
   *   conversation. Helps differentiate shallow from deep resumptions.
   *
   * Event name: `chatbot.conversation.resume`
   */
  trackConversationResume(conversationId: string, messageCount: number): void {
    this.client.track('chatbot.conversation.resume', {
      ...this.baseParams(),
      interaction: false,
      conversation_id: conversationId,
      message_count: messageCount,
    });
  }

  // ---------------------------------------------------------------------------
  // Viewport observation
  // ---------------------------------------------------------------------------

  /**
   * Sets up an `IntersectionObserver` on the given element to automatically
   * call {@link trackImpression} when the element becomes at least 50% visible
   * in the viewport.
   *
   * The observer is disconnected after the first intersection to avoid firing
   * the impression event multiple times during scroll.
   *
   * If `IntersectionObserver` is not available in the current environment
   * (e.g. older browsers, SSR, tests without jsdom), the method returns
   * silently without throwing.
   *
   * @param element - The DOM element to observe (typically the chat bubble).
   *
   * @example
   * ```typescript
   * tracker.observeImpression(document.getElementById('chatbot-bubble')!);
   * ```
   */
  observeImpression(element: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            this.trackImpression();
            // Disconnect immediately — impression fires only once.
            this.intersectionObserver?.disconnect();
            this.intersectionObserver = null;
          }
        }
      },
      { threshold: 0.5 }
    );

    this.intersectionObserver.observe(element);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Cleans up all resources held by this tracker instance.
   *
   * Disconnects the `IntersectionObserver` created by {@link observeImpression}
   * (if any). Should be called when the widget is destroyed to prevent memory
   * leaks in long-lived SPAs.
   */
  destroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
  }
}
