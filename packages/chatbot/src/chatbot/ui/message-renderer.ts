/**
 * MessageRenderer - Chat message list and bubble component
 *
 * Renders the scrollable message list and individual message bubbles. Handles
 * user messages (right-aligned), bot messages (left-aligned), and system messages
 * (centered). Manages scroll behavior, date separators, quick replies, welcome
 * messages, and empty states.
 *
 * Features:
 * - User messages: right-aligned, primary color bubble, white text
 * - Bot messages: left-aligned, light gray bubble, dark text
 * - System messages: centered, small muted text, no bubble
 * - Relative timestamps ("Just now", "5 min ago", "Yesterday 14:30")
 * - Message status indicators (user only): sending, sent, delivered, error
 * - Welcome message with special centered styling
 * - Quick reply buttons: horizontal scrollable row of pill buttons
 * - Auto-scroll to bottom on new messages (only if already at bottom)
 * - "Scroll to bottom" floating button when messages are out of view
 * - Date separators ("Today", "Yesterday", "12/02/2026")
 * - XSS-safe: bot messages sanitized with MessageSanitizer.sanitize()
 * - User messages escaped with MessageSanitizer.escapeHtml()
 * - Map-based element tracking for efficient message updates
 *
 * @remarks
 * This renderer manages its own scroll container and message element map.
 * It does not interact with the API directly -- the consumer calls addMessage()
 * and updateMessage() with ChatMessage objects.
 */

import type {
  ActionButton,
  ChatMessage,
  FileAttachment,
  MessageStyles,
  QuickReply,
  QuickReplyStyles,
} from '../../types';
import { I18nManager } from '../i18n-manager';
import { MarkdownRenderer } from '../markdown-renderer';
import { MessageSanitizer } from '../message-sanitizer';
import { QuickReplyRenderer } from './quick-reply-renderer';
import { RichContentRenderer } from './rich-content-renderer';
import { VirtualScroller } from './virtual-scroller';
import type { VirtualItem } from './virtual-scroller';

// ============================================================================
// Status Icons (Unicode characters for compactness)
// ============================================================================

/** Status indicator for "sending" state */
const STATUS_SENDING = '\u23F3'; // hourglass
/** Status indicator for "sent" state (single check) */
const STATUS_SENT = '\u2713';
/** Status indicator for "delivered" state (double check) */
const STATUS_DELIVERED = '\u2713\u2713';
/** Status indicator for "error" state */
const STATUS_ERROR = '\u274C';

/** Scroll-to-bottom arrow SVG icon */
const SCROLL_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

/**
 * Number of messages that triggers the transition from direct DOM rendering
 * to virtual scrolling. Below this threshold all messages live in the DOM
 * simultaneously (zero virtualization overhead). At or above this threshold,
 * only the visible messages plus an overscan buffer are rendered.
 */
const VIRTUAL_SCROLL_ACTIVATION_THRESHOLD = 50;

// ============================================================================
// MessageRenderer Class
// ============================================================================

/**
 * Renders and manages the chat message list, individual message bubbles,
 * quick replies, welcome messages, and scroll behavior.
 *
 * Quick replies are rendered via the dedicated {@link QuickReplyRenderer}
 * component, which provides animations, multiple display modes, icon support,
 * and full keyboard navigation. The public API (`renderQuickReplies` /
 * `clearQuickReplies`) is unchanged for backward compatibility.
 *
 * Rich content messages (cards, carousels, images, button groups) are delegated
 * to {@link RichContentRenderer} when a message has `type === 'rich'` and a
 * `richContent` payload.
 *
 * @example
 * ```typescript
 * const renderer = new MessageRenderer(messageStyles, quickReplyStyles, i18n, MessageSanitizer);
 * const el = renderer.render();
 * bodyContainer.appendChild(el);
 *
 * renderer.addMessage(userMessage);
 * renderer.addMessage(botMessage, (action) => handleAction(action));
 * renderer.renderQuickReplies(replies, (reply) => handleQuickReply(reply));
 * renderer.scrollToBottom(true);
 * renderer.destroy();
 * ```
 */
export class MessageRenderer {
  /** Outer scroll container element */
  private container: HTMLElement | null = null;

  /** Map of messageId -> DOM element for efficient updates */
  private messageElements: Map<string, HTMLElement> = new Map();

  /** Reference to the scroll container (same as container for now) */
  private scrollContainer: HTMLElement | null = null;

  /**
   * Dedicated quick reply renderer.
   * Manages the full lifecycle of quick reply button groups including
   * animations, keyboard navigation, and accessibility.
   */
  private quickReplyRenderer: QuickReplyRenderer;

  /**
   * Dedicated rich content renderer.
   * Renders card, carousel, image and button-group message types.
   */
  private richContentRenderer: RichContentRenderer;

  /**
   * The current quick reply container element appended by the quick reply renderer.
   * Tracked separately so we can insert new messages before it.
   */
  private quickReplyContainer: HTMLElement | null = null;

  /** Scroll-to-bottom floating button */
  private scrollButton: HTMLButtonElement | null = null;

  /**
   * Screen-reader-only live region for announcing status changes
   * (e.g. "Message sent", "New message from bot"). Hidden visually
   * but read aloud by assistive technology (WCAG 4.1.3).
   */
  private srAnnouncer: HTMLElement | null = null;

  /** Track the last rendered date for date separator logic */
  private lastRenderedDate: string | null = null;

  /**
   * Virtual scroller instance for high-performance rendering of long
   * message lists. Null until the activation threshold is crossed, at
   * which point all existing messages are migrated into the scroller.
   */
  private virtualScroller: VirtualScroller | null = null;

  /**
   * Count of messages rendered in direct DOM mode (before virtualization).
   * Used to detect when the activation threshold is crossed so we can
   * migrate to virtual scrolling.
   */
  private directMessageCount = 0;

  /**
   * Creates a new MessageRenderer instance.
   *
   * @param styles - Optional visual style overrides for message bubbles
   * @param quickReplyStyles - Optional visual style overrides for quick reply buttons
   * @param i18n - Internationalization manager for timestamps and labels
   * @param sanitizer - Static MessageSanitizer class for XSS prevention
   */
  constructor(
    private styles: MessageStyles | undefined,
    quickReplyStyles: QuickReplyStyles | undefined,
    private i18n: I18nManager,
    private sanitizer: typeof MessageSanitizer
  ) {
    this.quickReplyRenderer = new QuickReplyRenderer(quickReplyStyles, i18n);
    this.richContentRenderer = new RichContentRenderer(sanitizer, i18n);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the message list scroll container.
   *
   * Creates a scrollable div that will contain all message bubbles,
   * date separators, and quick replies. Attaches a scroll event listener
   * for the "scroll to bottom" button visibility.
   *
   * @returns The scroll container element
   */
  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-messages';
    // role="log" is the correct ARIA landmark for a chat message log.
    // aria-live="polite" causes screen readers to announce new messages
    // without interrupting current speech (WCAG 4.1.3).
    this.container.setAttribute('role', 'log');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-relevant', 'additions');
    this.container.setAttribute('aria-label', this.i18n.t('defaultTitle'));
    this.scrollContainer = this.container;

    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      overflowY: 'auto',
      overflowX: 'hidden',
      height: '100%',
      boxSizing: 'border-box',
    });

    // Screen-reader announcer — invisible live region for status updates.
    // Uses aria-live="assertive" for important status changes like error messages,
    // and is updated programmatically when messages are sent or received.
    this.srAnnouncer = document.createElement('div');
    this.srAnnouncer.className = 'nevent-chatbot-sr-only';
    this.srAnnouncer.setAttribute('role', 'status');
    this.srAnnouncer.setAttribute('aria-live', 'polite');
    this.srAnnouncer.setAttribute('aria-atomic', 'true');
    this.container.appendChild(this.srAnnouncer);

    // Listen for scroll events to toggle scroll-to-bottom button
    this.container.addEventListener('scroll', () => {
      this.updateScrollButtonVisibility();
    });

    return this.container;
  }

  /**
   * Adds a message to the message list.
   *
   * Handles date separator insertion, message bubble creation, auto-scrolling,
   * and element tracking. Bot message content is sanitized; user message content
   * is HTML-escaped.
   *
   * When `message.type === 'rich'` and `message.richContent` is present, the
   * rich content is rendered via {@link RichContentRenderer} instead of plain
   * text. The `onAction` callback is forwarded to action buttons so that
   * `postback` buttons can send messages back to the chat.
   *
   * @param message - The ChatMessage to render and append
   * @param onAction - Optional callback invoked when a rich content action
   *   button (e.g. postback) is activated
   */
  addMessage(
    message: ChatMessage,
    onAction?: (action: ActionButton) => void
  ): void {
    if (!this.container) return;

    const wasAtBottom = this.isScrolledToBottom();

    // --- Virtual scrolling path ---
    if (this.virtualScroller) {
      // Already in virtual mode: append to the scroller
      this.maybeInsertDateSeparatorVirtual(message.timestamp);
      this.virtualScroller.appendItem({
        id: message.id,
        renderFn: () => this.createMessageElement(message, onAction),
      });
      this.messageElements.set(message.id, null as unknown as HTMLElement); // Track existence

      if (wasAtBottom) {
        this.virtualScroller.scrollToBottom(true);
      }
      return;
    }

    // --- Check if we should transition to virtual mode ---
    this.directMessageCount++;
    if (this.directMessageCount >= VIRTUAL_SCROLL_ACTIVATION_THRESHOLD) {
      this.migrateToVirtual(message, onAction);
      return;
    }

    // --- Direct DOM path (below threshold) ---
    // Insert date separator if needed
    this.maybeInsertDateSeparator(message.timestamp);

    // Create and append message element
    const messageEl = this.createMessageElement(message, onAction);
    this.messageElements.set(message.id, messageEl);

    // Insert before quick reply container if it exists
    if (
      this.quickReplyContainer &&
      this.container.contains(this.quickReplyContainer)
    ) {
      this.container.insertBefore(messageEl, this.quickReplyContainer);
    } else {
      this.container.appendChild(messageEl);
    }

    // Auto-scroll if user was already at bottom
    if (wasAtBottom) {
      this.scrollToBottom(true);
    }
  }

  /**
   * Adds an empty bot message placeholder to the message list for streaming.
   *
   * Called at the start of a streaming response before any tokens have arrived.
   * The message bubble is created with empty content and a pulsing cursor
   * (`nevent-chatbot-streaming-cursor` class) so the user sees visual feedback
   * that the bot is generating a response.
   *
   * The message is tracked in `messageElements` so subsequent calls to
   * {@link updateMessageContent} and {@link finalizeStreamingMessage} can
   * update it in place without rebuilding the DOM.
   *
   * @param message - A ChatMessage with empty `content` and `status: 'sending'`.
   *   The `id` field is used as the tracking key for incremental updates.
   */
  addStreamingMessage(message: ChatMessage): void {
    if (!this.container) return;

    const wasAtBottom = this.isScrolledToBottom();

    // Insert date separator if needed (streaming messages are always "now")
    this.maybeInsertDateSeparator(message.timestamp);

    // Build the message wrapper with the same layout as a regular bot message
    const wrapper = document.createElement('div');
    wrapper.className =
      'nevent-chatbot-message nevent-chatbot-message--assistant nevent-chatbot-message--streaming';
    wrapper.setAttribute('data-message-id', message.id);
    wrapper.setAttribute('data-role', 'assistant');
    wrapper.setAttribute('role', 'article');
    wrapper.setAttribute('aria-label', this.getBotLabel(this.i18n.getLocale()));
    wrapper.setAttribute('aria-setsize', '-1');
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.setAttribute('aria-atomic', 'false');

    this.applyMessageWrapperStyles(wrapper, false);

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'nevent-chatbot-message-bubble';
    this.applyBubbleStyles(bubble, false);

    // Content element — starts empty; filled by updateMessageContent()
    const content = document.createElement('div');
    content.className = 'nevent-chatbot-message-content';
    this.applyContentStyles(content, false);

    // Streaming cursor — a blinking caret shown while tokens arrive
    const cursor = document.createElement('span');
    cursor.className = 'nevent-chatbot-streaming-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    Object.assign(cursor.style, {
      display: 'inline-block',
      width: '2px',
      height: '1em',
      backgroundColor: 'currentColor',
      marginLeft: '1px',
      verticalAlign: 'text-bottom',
      animation: 'nevent-chatbot-blink 0.8s step-end infinite',
    });

    content.appendChild(cursor);
    bubble.appendChild(content);
    wrapper.appendChild(bubble);

    // Metadata row (empty timestamp placeholder — filled on finalize)
    const meta = document.createElement('div');
    meta.className = 'nevent-chatbot-message-meta';
    this.applyMetaStyles(meta, false);
    wrapper.appendChild(meta);

    this.messageElements.set(message.id, wrapper);

    // Insert before quick reply container if present
    if (
      this.quickReplyContainer &&
      this.container.contains(this.quickReplyContainer)
    ) {
      this.container.insertBefore(wrapper, this.quickReplyContainer);
    } else {
      this.container.appendChild(wrapper);
    }

    if (wasAtBottom) {
      this.scrollToBottom(true);
    }
  }

  /**
   * Updates the text content of a streaming bot message incrementally.
   *
   * Called for every `message.delta` SSE event. Efficiently replaces only the
   * text node inside the content element without rebuilding the surrounding DOM
   * structure. The streaming cursor element is preserved and re-appended after
   * the content update.
   *
   * This method is intentionally lightweight so it can be called on every token
   * without causing layout thrash:
   * - It does NOT re-apply styles (already applied in `addStreamingMessage`)
   * - It does NOT rebuild the bubble or wrapper elements
   * - It reuses the existing content element found via the tracked wrapper
   *
   * @param messageId - The ID of the streaming message to update.
   *   Must have been previously created via {@link addStreamingMessage}.
   * @param content - The full accumulated text so far (not just the latest token).
   *   Passing the full accumulated string avoids any desync between calls.
   * @param isMarkdown - When `true`, the content is rendered through
   *   {@link MarkdownRenderer} for live markdown previewing. Set to `true` for
   *   most bot responses. Set to `false` for plain-text-only responses.
   */
  updateMessageContent(
    messageId: string,
    content: string,
    isMarkdown: boolean
  ): void {
    const wrapper = this.messageElements.get(messageId);
    if (!wrapper) return;

    const contentEl = wrapper.querySelector<HTMLElement>(
      '.nevent-chatbot-message-content'
    );
    if (!contentEl) return;

    // Detach the cursor before updating innerHTML so it is not lost
    const cursorEl = contentEl.querySelector<HTMLElement>(
      '.nevent-chatbot-streaming-cursor'
    );
    if (cursorEl) cursorEl.remove();

    if (content) {
      if (isMarkdown && MarkdownRenderer.containsMarkdown(content)) {
        contentEl.innerHTML = MarkdownRenderer.render(content);
      } else {
        contentEl.innerHTML = this.sanitizer.sanitize(content);
      }
    }

    // Re-append the cursor at the end of the updated content
    if (cursorEl) {
      contentEl.appendChild(cursorEl);
    }

    // If the user is near the bottom, keep scrolled to show new tokens
    if (this.isScrolledToBottom()) {
      this.scrollToBottom(false);
    }
  }

  /**
   * Finalizes a streaming message once the `message.complete` SSE event arrives.
   *
   * Performs these steps:
   * 1. Removes the streaming cursor element from the content bubble.
   * 2. Sets the final canonical content (from the server's `complete` payload).
   * 3. Adds the message timestamp to the metadata row.
   * 4. Removes the `nevent-chatbot-message--streaming` modifier class so CSS
   *    transitions reset to the standard delivered state.
   *
   * After this call the message element is identical to one produced by
   * {@link addMessage} and will update correctly via {@link updateMessage}.
   *
   * @param messageId - The ID of the streaming message to finalize.
   *   Must have been previously created via {@link addStreamingMessage}.
   * @param finalContent - The canonical full message text from the server.
   *   This may differ slightly from the accumulated streaming text (e.g. if the
   *   server applies post-processing). The server value is authoritative.
   */
  finalizeStreamingMessage(messageId: string, finalContent: string): void {
    const wrapper = this.messageElements.get(messageId);
    if (!wrapper) return;

    // Remove streaming modifier class — returns element to standard styling
    wrapper.classList.remove('nevent-chatbot-message--streaming');

    const contentEl = wrapper.querySelector<HTMLElement>(
      '.nevent-chatbot-message-content'
    );
    if (contentEl) {
      // Remove cursor
      const cursorEl = contentEl.querySelector(
        '.nevent-chatbot-streaming-cursor'
      );
      cursorEl?.remove();

      // Set final content with full markdown rendering
      if (finalContent) {
        if (MarkdownRenderer.containsMarkdown(finalContent)) {
          contentEl.innerHTML = MarkdownRenderer.render(finalContent);
        } else {
          contentEl.innerHTML = this.sanitizer.sanitize(finalContent);
        }
      }
    }

    // Fill in the timestamp that was left blank during streaming
    const metaEl = wrapper.querySelector<HTMLElement>(
      '.nevent-chatbot-message-meta'
    );
    if (metaEl) {
      const timestampEl = document.createElement('span');
      timestampEl.className = 'nevent-chatbot-message-timestamp';
      timestampEl.textContent = this.formatTimestamp(new Date().toISOString());
      metaEl.appendChild(timestampEl);
    }

    // Update aria-label with the actual content for screen readers
    const locale = this.i18n.getLocale();
    wrapper.setAttribute(
      'aria-label',
      `${this.getBotLabel(locale)}: ${finalContent}`
    );

    this.scrollToBottom(true);
  }

  /**
   * Updates the delivery status indicator of a bot message.
   *
   * Used by the streaming path to set a message to 'error' state when
   * the stream fails mid-generation. Only updates bot messages — user
   * message status is handled by {@link updateMessage}.
   *
   * @param messageId - The ID of the message to update
   * @param status - The new status to display
   */
  updateMessageStatus(messageId: string, status: ChatMessage['status']): void {
    const wrapper = this.messageElements.get(messageId);
    if (!wrapper) return;

    // Remove streaming cursor if still present (error during generation)
    const contentEl = wrapper.querySelector('.nevent-chatbot-message-content');
    if (contentEl) {
      const cursorEl = contentEl.querySelector(
        '.nevent-chatbot-streaming-cursor'
      );
      cursorEl?.remove();
    }

    wrapper.classList.remove('nevent-chatbot-message--streaming');

    if (status === 'error') {
      // Mark as an alert for screen readers (WCAG 4.1.3 — Status Messages)
      wrapper.setAttribute('role', 'alert');
      wrapper.setAttribute('aria-live', 'assertive');

      // Add a visible error indicator to the bubble
      const bubble = wrapper.querySelector<HTMLElement>(
        '.nevent-chatbot-message-bubble'
      );
      if (bubble) {
        Object.assign(bubble.style, {
          borderLeft: '3px solid #ef4444',
          opacity: '0.85',
        });
      }
    }
  }

  /**
   * Updates an existing message in the list.
   *
   * Typically used to update delivery status (sending -> sent -> delivered)
   * or to replace a message's content.
   *
   * @param messageId - The ID of the message to update
   * @param updates - Partial ChatMessage fields to update
   */
  updateMessage(messageId: string, updates: Partial<ChatMessage>): void {
    let existingEl = this.messageElements.get(messageId);

    // In virtual mode, the element may be rendered by the VirtualScroller.
    // Fall back to a DOM query if the tracked reference is null.
    if (!existingEl && this.container) {
      existingEl =
        this.container.querySelector<HTMLElement>(
          `[data-message-id="${messageId}"]`
        ) ?? undefined;
    }
    if (!existingEl || !this.container) return;

    // Find the original message data from the element's data attributes
    const role = existingEl.getAttribute('data-role') as ChatMessage['role'];

    // Update status indicator if status changed
    if (updates.status !== undefined && role === 'user') {
      const statusEl = existingEl.querySelector(
        '.nevent-chatbot-message-status'
      );
      if (statusEl) {
        statusEl.textContent = this.getStatusIndicator(updates.status);
      }
    }

    // Update content if changed
    if (updates.content !== undefined) {
      const contentEl = existingEl.querySelector(
        '.nevent-chatbot-message-content'
      );
      if (contentEl) {
        if (role === 'assistant') {
          // Use MarkdownRenderer for bot messages that contain markdown syntax;
          // fall back to plain sanitization otherwise.
          contentEl.innerHTML = MarkdownRenderer.containsMarkdown(
            updates.content
          )
            ? MarkdownRenderer.render(updates.content)
            : this.sanitizer.sanitize(updates.content);
        } else if (role === 'user') {
          contentEl.innerHTML = this.sanitizer.escapeHtml(updates.content);
        } else {
          contentEl.textContent = updates.content;
        }
      }
    }
  }

  /**
   * Announces a message to screen readers via the visually-hidden live region.
   *
   * The announcement text is set, then cleared after a short delay so that
   * repeated identical messages are still announced (AT ignores unchanged
   * live region content).
   *
   * @param text - The announcement text for assistive technology
   */
  announce(text: string): void {
    if (!this.srAnnouncer) return;

    this.srAnnouncer.textContent = text;

    // Clear after a delay so repeated identical messages are announced
    setTimeout(() => {
      if (this.srAnnouncer) {
        this.srAnnouncer.textContent = '';
      }
    }, 1000);
  }

  /**
   * Renders a welcome message at the top of the message list.
   *
   * The welcome message is displayed centered with a special icon,
   * distinct from regular messages.
   *
   * @param text - The welcome message text
   */
  renderWelcome(text: string): void {
    if (!this.container) return;

    const welcomeEl = document.createElement('div');
    welcomeEl.className = 'nevent-chatbot-welcome';

    Object.assign(welcomeEl.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '24px 32px',
      gap: '8px',
    });

    // Welcome icon (waving hand emoji alternative - chat icon)
    const icon = document.createElement('div');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${this.styles?.botBubbleColor ?? '#e0e0e0'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    Object.assign(icon.style, { lineHeight: '0' });
    welcomeEl.appendChild(icon);

    // Welcome text
    const textEl = document.createElement('p');
    textEl.className = 'nevent-chatbot-welcome-text';
    textEl.innerHTML = this.sanitizer.sanitize(text);
    Object.assign(textEl.style, {
      margin: '0',
      fontSize: '14px',
      lineHeight: '1.5',
      color: this.styles?.botTextColor ?? '#333333',
      maxWidth: '280px',
    });
    welcomeEl.appendChild(textEl);

    this.container.appendChild(welcomeEl);
  }

  /**
   * Renders quick reply buttons below the last bot message.
   *
   * Delegates to {@link QuickReplyRenderer} which provides staggered entrance
   * animations, multiple layout modes, icon support, and full keyboard
   * navigation (Arrow keys, Home, End, Tab).
   *
   * Any previously rendered quick replies are cleared synchronously before
   * the new ones are appended.
   *
   * @param replies - Array of QuickReply options to display
   * @param onClick - Callback invoked with the selected QuickReply when activated
   * @param mode - Layout mode ('scroll' | 'wrap' | 'stacked'). Defaults to 'scroll'.
   */
  renderQuickReplies(
    replies: QuickReply[],
    onClick: (reply: QuickReply) => void,
    mode: 'scroll' | 'wrap' | 'stacked' = 'scroll'
  ): void {
    if (!this.container || replies.length === 0) return;

    // Remove existing quick replies first (synchronous, no animation on replace)
    this.clearQuickReplies();

    // Delegate rendering to the dedicated QuickReplyRenderer
    this.quickReplyContainer = this.quickReplyRenderer.render({
      replies,
      onClick: (reply) => {
        onClick(reply);
      },
      mode,
      animated: true,
    });

    this.container.appendChild(this.quickReplyContainer);

    // Auto-scroll to show quick replies
    if (this.isScrolledToBottom()) {
      this.scrollToBottom(true);
    }
  }

  /**
   * Removes the quick reply buttons from the message list.
   *
   * Delegates to {@link QuickReplyRenderer.clear} for a clean DOM removal.
   * This method is synchronous (no animation); for an animated exit use
   * `this.quickReplyRenderer.clear(true)` directly.
   */
  clearQuickReplies(): void {
    if (this.quickReplyContainer) {
      // Synchronous clear without exit animation — used when immediately
      // replacing with a new set of replies or clearing on message send.
      this.quickReplyRenderer.clear(false);
      this.quickReplyContainer = null;
    }
  }

  /**
   * Removes all messages, date separators, and quick replies from the list.
   * Resets internal tracking state.
   */
  clear(): void {
    // Destroy virtual scroller if active
    if (this.virtualScroller) {
      this.virtualScroller.clear();
      this.virtualScroller.destroy();
      this.virtualScroller = null;
    }

    if (this.container) {
      this.container.innerHTML = '';

      // Re-create the screen-reader announcer after clearing
      this.srAnnouncer = document.createElement('div');
      this.srAnnouncer.className = 'nevent-chatbot-sr-only';
      this.srAnnouncer.setAttribute('role', 'status');
      this.srAnnouncer.setAttribute('aria-live', 'polite');
      this.srAnnouncer.setAttribute('aria-atomic', 'true');
      this.container.appendChild(this.srAnnouncer);
    }
    this.messageElements.clear();
    this.quickReplyContainer = null;
    this.scrollButton = null;
    this.lastRenderedDate = null;
    this.directMessageCount = 0;
  }

  /**
   * Scrolls the message list to the bottom.
   *
   * @param smooth - Whether to use smooth scrolling animation (default: false)
   */
  scrollToBottom(smooth = false): void {
    if (this.virtualScroller) {
      this.virtualScroller.scrollToBottom(smooth);
      return;
    }

    if (!this.scrollContainer) return;

    this.scrollContainer.scrollTo({
      top: this.scrollContainer.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  /**
   * Checks whether the scroll position is at or near the bottom.
   *
   * @returns true if the user is within 50px of the bottom
   */
  isScrolledToBottom(): boolean {
    if (this.virtualScroller) {
      return this.virtualScroller.isAtBottom();
    }

    if (!this.scrollContainer) return true;

    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
    return scrollHeight - scrollTop - clientHeight < 50;
  }

  /**
   * Renders a floating "scroll to bottom" button at the bottom-center of the container.
   *
   * The button appears when the user has scrolled up and there are unseen messages.
   *
   * @param onClick - Callback invoked when the button is clicked
   */
  renderScrollButton(onClick: () => void): void {
    if (this.scrollButton || !this.container) return;

    this.scrollButton = document.createElement('button');
    this.scrollButton.type = 'button';
    this.scrollButton.className = 'nevent-chatbot-scroll-button';
    this.scrollButton.setAttribute('aria-label', this.getScrollToBottomLabel());
    this.scrollButton.innerHTML = SCROLL_DOWN_SVG;

    Object.assign(this.scrollButton.style, {
      position: 'sticky',
      bottom: '8px',
      alignSelf: 'center',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      cursor: 'pointer',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      zIndex: '2',
      color: '#666666',
      lineHeight: '0',
      transition: 'opacity 0.15s ease',
      flexShrink: '0',
    });

    this.scrollButton.addEventListener('click', onClick);
    this.container.appendChild(this.scrollButton);
  }

  /**
   * Renders an empty state message when no conversation is active.
   * Displays a centered placeholder with a subtle icon and text.
   */
  renderEmptyState(): void {
    if (!this.container) return;

    const emptyEl = document.createElement('div');
    emptyEl.className = 'nevent-chatbot-empty';

    Object.assign(emptyEl.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 32px',
      textAlign: 'center',
      flex: '1',
    });

    const icon = document.createElement('div');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d0d0d0" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    Object.assign(icon.style, { lineHeight: '0', marginBottom: '12px' });
    emptyEl.appendChild(icon);

    const text = document.createElement('p');
    text.textContent = this.i18n.t('inputPlaceholder');
    Object.assign(text.style, {
      margin: '0',
      fontSize: '14px',
      color: '#999999',
    });
    emptyEl.appendChild(text);

    this.container.appendChild(emptyEl);
  }

  /**
   * Returns a localized aria-label for the scroll-to-bottom button.
   *
   * @returns Localized scroll to bottom label
   */
  private getScrollToBottomLabel(): string {
    const locale = this.i18n.getLocale();
    const labels: Record<string, string> = {
      es: 'Ir al final de la conversación',
      en: 'Scroll to bottom',
      ca: 'Anar al final de la conversa',
      pt: 'Ir para o final da conversa',
    };
    return labels[locale] ?? 'Scroll to bottom';
  }

  /**
   * Returns a localized "You said:" label for user messages.
   * Used as the accessible prefix in aria-label on message articles.
   *
   * @param locale - Active locale code
   * @returns Localized sender label string
   */
  private getUserLabel(locale: string): string {
    const labels: Record<string, string> = {
      es: 'Tú dijiste',
      en: 'You said',
      ca: 'Has dit',
      pt: 'Você disse',
    };
    return labels[locale] ?? 'You said';
  }

  /**
   * Returns a localized "Bot said:" label for assistant messages.
   * Used as the accessible prefix in aria-label on message articles.
   *
   * @param locale - Active locale code
   * @returns Localized sender label string
   */
  private getBotLabel(locale: string): string {
    const labels: Record<string, string> = {
      es: 'El bot dijo',
      en: 'Bot said',
      ca: 'El bot ha dit',
      pt: 'O bot disse',
    };
    return labels[locale] ?? 'Bot said';
  }

  /**
   * Removes the message list from the DOM and cleans up all references.
   *
   * Also destroys the internal {@link QuickReplyRenderer} to release any
   * pending animation timers and DOM references.
   */
  destroy(): void {
    // Destroy virtual scroller if active
    if (this.virtualScroller) {
      this.virtualScroller.destroy();
      this.virtualScroller = null;
    }

    // Destroy the quick reply renderer first to cancel any pending timers
    this.quickReplyRenderer.destroy();
    this.container?.remove();
    this.container = null;
    this.scrollContainer = null;
    this.messageElements.clear();
    this.quickReplyContainer = null;
    this.scrollButton = null;
    this.srAnnouncer = null;
    this.lastRenderedDate = null;
    this.directMessageCount = 0;
  }

  // --------------------------------------------------------------------------
  // Private: Virtual Scrolling
  // --------------------------------------------------------------------------

  /**
   * Migrates all existing direct-DOM messages into the VirtualScroller and
   * appends the new triggering message.
   *
   * This is called exactly once when the message count crosses the
   * {@link VIRTUAL_SCROLL_ACTIVATION_THRESHOLD}. Existing DOM elements are
   * replaced by the VirtualScroller's managed content area.
   *
   * @param triggerMessage - The message whose addition triggered the migration
   * @param onAction - Optional action callback for the triggering message
   */
  private migrateToVirtual(
    triggerMessage: ChatMessage,
    onAction?: (action: ActionButton) => void
  ): void {
    if (!this.scrollContainer) return;

    // Collect all existing message elements and their data before clearing
    const existingItems: VirtualItem[] = [];
    const existingNodeOrder: string[] = [];

    // Walk the DOM children to preserve insertion order (messages + date separators)
    if (this.container) {
      const children = Array.from(this.container.children);
      for (const child of children) {
        const el = child as HTMLElement;
        const messageId = el.getAttribute('data-message-id');

        if (messageId && this.messageElements.has(messageId)) {
          // This is a message element — wrap it in a VirtualItem
          const capturedEl = el;
          existingItems.push({
            id: messageId,
            renderFn: () => capturedEl.cloneNode(true) as HTMLElement,
          });
          existingNodeOrder.push(messageId);
        } else if (el.classList.contains('nevent-chatbot-date-separator')) {
          // Date separator — wrap as a virtual item with a synthetic ID
          const separatorId = `__separator_${existingItems.length}`;
          const capturedSep = el;
          existingItems.push({
            id: separatorId,
            renderFn: () => capturedSep.cloneNode(true) as HTMLElement,
          });
        }
        // Skip quick reply container, scroll button, welcome, empty state
      }
    }

    // Initialize the virtual scroller targeting the scroll container
    this.virtualScroller = new VirtualScroller({
      container: this.scrollContainer,
      estimatedItemHeight: 80,
      overscan: 5,
      activationThreshold: VIRTUAL_SCROLL_ACTIVATION_THRESHOLD,
    });
    this.virtualScroller.init();

    // Remove all existing message elements and date separators from the container.
    // Keep the scroll button and quick reply container intact.
    if (this.container) {
      const toRemove: HTMLElement[] = [];
      const children = Array.from(this.container.children);
      for (const child of children) {
        const el = child as HTMLElement;
        if (
          el.getAttribute('data-message-id') ||
          el.classList.contains('nevent-chatbot-date-separator') ||
          el.classList.contains('nevent-chatbot-welcome')
        ) {
          toRemove.push(el);
        }
      }
      for (const el of toRemove) {
        el.remove();
      }
    }

    // Load all existing items into the virtual scroller
    this.virtualScroller.setItems(existingItems);

    // Add the triggering message
    this.maybeInsertDateSeparatorVirtual(triggerMessage.timestamp);
    this.virtualScroller.appendItem({
      id: triggerMessage.id,
      renderFn: () => this.createMessageElement(triggerMessage, onAction),
    });

    // Track existence in messageElements map
    this.messageElements.set(triggerMessage.id, null as unknown as HTMLElement);

    // Scroll to bottom after migration
    this.virtualScroller.scrollToBottom(false);
  }

  /**
   * Virtual-mode equivalent of {@link maybeInsertDateSeparator}.
   *
   * Instead of inserting a DOM element directly, appends a date separator
   * as a VirtualItem to the virtual scroller.
   *
   * @param timestamp - ISO 8601 timestamp of the message about to be added
   */
  private maybeInsertDateSeparatorVirtual(timestamp: string): void {
    if (!this.virtualScroller) return;

    const dateKey = this.getDateKey(timestamp);
    if (dateKey === this.lastRenderedDate) return;

    this.lastRenderedDate = dateKey;
    const label = this.formatDateSeparator(timestamp);
    const separatorId = `__separator_${dateKey}_${Date.now()}`;

    this.virtualScroller.appendItem({
      id: separatorId,
      renderFn: () => this.createDateSeparatorElement(label),
    });
  }

  /**
   * Creates a date separator DOM element with the given label text.
   *
   * Extracted from {@link maybeInsertDateSeparator} for reuse in both
   * direct and virtual rendering paths.
   *
   * @param label - Formatted date label ("Today", "Yesterday", "DD/MM/YYYY")
   * @returns The date separator element
   */
  private createDateSeparatorElement(label: string): HTMLElement {
    const separator = document.createElement('div');
    separator.className = 'nevent-chatbot-date-separator';

    Object.assign(separator.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 16px',
      gap: '12px',
    });

    // Left line
    const leftLine = document.createElement('span');
    Object.assign(leftLine.style, {
      flex: '1',
      height: '1px',
      backgroundColor: '#e0e0e0',
    });
    separator.appendChild(leftLine);

    // Date label
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    Object.assign(labelEl.style, {
      fontSize: '11px',
      color: '#999999',
      whiteSpace: 'nowrap',
      fontWeight: '500',
    });
    separator.appendChild(labelEl);

    // Right line
    const rightLine = document.createElement('span');
    Object.assign(rightLine.style, {
      flex: '1',
      height: '1px',
      backgroundColor: '#e0e0e0',
    });
    separator.appendChild(rightLine);

    return separator;
  }

  // --------------------------------------------------------------------------
  // Private: Message Element Creation
  // --------------------------------------------------------------------------

  /**
   * Creates a complete message bubble element for a ChatMessage.
   *
   * The structure depends on the message role:
   * - user: right-aligned bubble with status indicator
   * - assistant: left-aligned bubble with sanitized HTML content
   * - system: centered text without bubble
   *
   * When the message has `type === 'rich'` and a `richContent` payload, the
   * bubble content is delegated to {@link RichContentRenderer} rather than
   * rendering plain text.  The `onAction` callback is forwarded so that rich
   * content action buttons (e.g. postback) can trigger chat interactions.
   *
   * @param message - The chat message to render
   * @param onAction - Optional callback for rich content action buttons
   * @returns The message wrapper element
   */
  private createMessageElement(
    message: ChatMessage,
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `nevent-chatbot-message nevent-chatbot-message--${message.role}`;
    wrapper.setAttribute('data-message-id', message.id);
    wrapper.setAttribute('data-role', message.role);

    if (message.role === 'system') {
      // System messages are purely informational; role="note" is appropriate.
      wrapper.setAttribute('role', 'note');
      return this.createSystemMessage(wrapper, message);
    }

    // role="article" identifies each message as a standalone item in the log
    // (WCAG 1.3.1 Info and Relationships).
    wrapper.setAttribute('role', 'article');

    // Accessible label tells screen readers who sent the message and its content
    // for navigation purposes (e.g. when using heading/article shortcuts).
    const locale = this.i18n.getLocale();
    const senderLabel =
      message.role === 'user'
        ? this.getUserLabel(locale)
        : this.getBotLabel(locale);
    wrapper.setAttribute('aria-label', `${senderLabel}: ${message.content}`);
    wrapper.setAttribute('aria-setsize', '-1'); // Unknown total; use -1 per spec

    const isUser = message.role === 'user';
    this.applyMessageWrapperStyles(wrapper, isUser);

    // Bubble container
    const bubble = document.createElement('div');
    bubble.className = 'nevent-chatbot-message-bubble';
    this.applyBubbleStyles(bubble, isUser);

    // Message content — rich or plain text
    if (!isUser && message.type === 'rich' && message.richContent) {
      // Rich content: delegate rendering to RichContentRenderer.
      // Wrapped in try/catch so malformed rich content data does not crash the
      // entire message list — falls back to plain text rendering on failure.
      let richEl: HTMLElement | null = null;
      try {
        richEl = this.richContentRenderer.render(message.richContent, onAction);
      } catch {
        // Rich content rendering failed — fall through to plain text fallback
        richEl = null;
      }

      if (richEl) {
        // The bubble padding is reset so that cards/carousels can bleed to the edges.
        bubble.style.padding = '0';
        bubble.style.overflow = 'hidden';
        bubble.style.backgroundColor = 'transparent';
        bubble.appendChild(richEl);
      } else {
        // Fallback: render as plain text when rich content rendering fails
        const fallbackContent = document.createElement('div');
        fallbackContent.className = 'nevent-chatbot-message-content';
        fallbackContent.textContent = message.content;
        this.applyContentStyles(fallbackContent, false);
        bubble.appendChild(fallbackContent);
      }
    } else {
      const content = document.createElement('div');
      content.className = 'nevent-chatbot-message-content';

      if (isUser) {
        content.innerHTML = this.sanitizer.escapeHtml(message.content);
      } else if (
        message.type === 'text' &&
        MarkdownRenderer.containsMarkdown(message.content)
      ) {
        // Bot text messages with markdown syntax are rendered through the
        // lightweight MarkdownRenderer which converts markdown to sanitized HTML.
        content.innerHTML = MarkdownRenderer.render(message.content);
      } else {
        content.innerHTML = this.sanitizer.sanitize(message.content);
      }

      this.applyContentStyles(content, isUser);
      bubble.appendChild(content);
    }

    wrapper.appendChild(bubble);

    // File attachments (rendered below the text bubble if present)
    if (message.attachments && message.attachments.length > 0) {
      const attachmentsEl = this.createAttachmentsElement(
        message.attachments,
        isUser
      );
      wrapper.appendChild(attachmentsEl);
    }

    // Metadata row (timestamp + status)
    const meta = document.createElement('div');
    meta.className = 'nevent-chatbot-message-meta';
    this.applyMetaStyles(meta, isUser);

    // Timestamp
    const showTimestamp = this.styles?.showTimestamp !== false;
    if (showTimestamp) {
      const timestamp = document.createElement('span');
      timestamp.className = 'nevent-chatbot-message-timestamp';
      timestamp.textContent = this.formatTimestamp(message.timestamp);
      meta.appendChild(timestamp);
    }

    // Status indicator (user messages only)
    if (isUser && message.status) {
      const status = document.createElement('span');
      status.className = 'nevent-chatbot-message-status';
      status.textContent = this.getStatusIndicator(message.status);
      Object.assign(status.style, { marginLeft: '4px' });
      meta.appendChild(status);
    }

    wrapper.appendChild(meta);

    return wrapper;
  }

  /**
   * Creates a system message element (centered, no bubble).
   *
   * @param wrapper - The message wrapper element
   * @param message - The system message data
   * @returns The styled wrapper element
   */
  private createSystemMessage(
    wrapper: HTMLElement,
    message: ChatMessage
  ): HTMLElement {
    Object.assign(wrapper.style, {
      display: 'flex',
      justifyContent: 'center',
      padding: '4px 16px',
    });

    const text = document.createElement('span');
    text.className = 'nevent-chatbot-message-content';
    text.textContent = message.content;
    Object.assign(text.style, {
      fontSize: '12px',
      color: this.styles?.systemMessageColor ?? '#888888',
      textAlign: 'center',
    });

    wrapper.appendChild(text);
    return wrapper;
  }

  // --------------------------------------------------------------------------
  // Private: Attachment Rendering
  // --------------------------------------------------------------------------

  /**
   * Creates a container element displaying all file attachments for a message.
   *
   * Renders image attachments as clickable thumbnails and non-image attachments
   * as file cards with an icon, filename, and file size. Each attachment links
   * to its CDN URL for downloading.
   *
   * @param attachments - Array of FileAttachment objects to render
   * @param isUser - Whether this is a user message (affects alignment and colors)
   * @returns Container element with all attachment items
   */
  private createAttachmentsElement(
    attachments: FileAttachment[],
    isUser: boolean
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-chatbot-message-attachments';
    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', this.i18n.t('attachFile'));

    Object.assign(container.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginTop: '4px',
      maxWidth: this.styles?.maxWidth ?? '80%',
    });

    for (const attachment of attachments) {
      const item = this.createAttachmentItem(attachment, isUser);
      container.appendChild(item);
    }

    return container;
  }

  /**
   * Creates a single attachment item element.
   *
   * For image attachments with a URL or thumbnailUrl, renders a clickable
   * thumbnail image. For non-image files, renders a card with a file icon,
   * filename, and size.
   *
   * @param attachment - The FileAttachment to render
   * @param isUser - Whether this is a user message
   * @returns The attachment item element
   */
  private createAttachmentItem(
    attachment: FileAttachment,
    isUser: boolean
  ): HTMLElement {
    const item = document.createElement('div');
    item.className = 'nevent-chatbot-message-attachment-item';
    item.setAttribute('role', 'listitem');

    const isImage = attachment.type.startsWith('image/');
    const displayUrl = attachment.url ?? attachment.thumbnailUrl;

    if (isImage && displayUrl) {
      return this.createImageAttachment(item, attachment, displayUrl, isUser);
    }

    return this.createFileAttachment(item, attachment, isUser);
  }

  /**
   * Creates an image attachment element with a clickable thumbnail.
   *
   * @param item - The container element
   * @param attachment - The file attachment data
   * @param imageUrl - The URL to display as the thumbnail
   * @param isUser - Whether this is a user message
   * @returns The styled image attachment element
   */
  private createImageAttachment(
    item: HTMLElement,
    attachment: FileAttachment,
    imageUrl: string,
    _isUser: boolean
  ): HTMLElement {
    Object.assign(item.style, {
      borderRadius: '8px',
      overflow: 'hidden',
      cursor: attachment.url ? 'pointer' : 'default',
    });

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = MessageSanitizer.escapeHtml(attachment.name);
    img.loading = 'lazy';
    Object.assign(img.style, {
      display: 'block',
      maxWidth: '200px',
      maxHeight: '200px',
      borderRadius: '8px',
      objectFit: 'cover',
    });

    if (attachment.url) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute(
        'aria-label',
        `${MessageSanitizer.escapeHtml(attachment.name)} (${this.formatAttachmentSize(attachment.size)})`
      );
      link.appendChild(img);
      item.appendChild(link);
    } else {
      item.appendChild(img);
    }

    // Upload progress overlay
    if (attachment.status === 'uploading') {
      const overlay = this.createUploadOverlay(attachment);
      item.style.position = 'relative';
      item.appendChild(overlay);
    }

    return item;
  }

  /**
   * Creates a non-image file attachment element with icon, name, and size.
   *
   * @param item - The container element
   * @param attachment - The file attachment data
   * @param isUser - Whether this is a user message
   * @returns The styled file attachment element
   */
  private createFileAttachment(
    item: HTMLElement,
    attachment: FileAttachment,
    isUser: boolean
  ): HTMLElement {
    const bgColor = isUser ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)';
    const textColor = isUser
      ? (this.styles?.userTextColor ?? '#ffffff')
      : (this.styles?.botTextColor ?? '#333333');

    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: bgColor,
      borderRadius: '8px',
      textDecoration: 'none',
      position: 'relative',
    });

    // File icon
    const iconContainer = document.createElement('div');
    iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${textColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    Object.assign(iconContainer.style, {
      lineHeight: '0',
      flexShrink: '0',
    });
    item.appendChild(iconContainer);

    // File info
    const info = document.createElement('div');
    Object.assign(info.style, {
      flex: '1',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
    });

    const nameEl = document.createElement('span');
    nameEl.textContent = attachment.name;
    nameEl.title = attachment.name;
    Object.assign(nameEl.style, {
      fontSize: '13px',
      fontWeight: '500',
      color: textColor,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    info.appendChild(nameEl);

    const sizeEl = document.createElement('span');
    sizeEl.textContent = this.formatAttachmentSize(attachment.size);
    Object.assign(sizeEl.style, {
      fontSize: '11px',
      color: isUser ? 'rgba(255,255,255,0.7)' : '#888888',
    });
    info.appendChild(sizeEl);

    item.appendChild(info);

    // Download link (wraps the whole card if URL is available)
    if (attachment.url) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        window.open(attachment.url!, '_blank', 'noopener,noreferrer');
      });
      item.setAttribute('role', 'link');
      item.setAttribute('tabindex', '0');
      item.setAttribute(
        'aria-label',
        `${MessageSanitizer.escapeHtml(attachment.name)} (${this.formatAttachmentSize(attachment.size)})`
      );
    }

    // Upload progress overlay
    if (attachment.status === 'uploading') {
      const overlay = this.createUploadOverlay(attachment);
      item.appendChild(overlay);
    }

    return item;
  }

  /**
   * Creates a semi-transparent upload progress overlay for an attachment.
   *
   * Shows a circular progress indicator and percentage text on top of the
   * attachment preview or file card.
   *
   * @param attachment - The uploading file attachment
   * @returns The progress overlay element
   */
  private createUploadOverlay(attachment: FileAttachment): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'nevent-chatbot-attachment-upload-overlay';
    overlay.setAttribute('role', 'progressbar');
    overlay.setAttribute('aria-valuemin', '0');
    overlay.setAttribute('aria-valuemax', '100');
    overlay.setAttribute('aria-valuenow', String(attachment.progress));
    overlay.setAttribute(
      'aria-label',
      `${this.i18n.t('uploading')} ${MessageSanitizer.escapeHtml(attachment.name)}`
    );

    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      borderRadius: 'inherit',
      color: '#ffffff',
      fontSize: '13px',
      fontWeight: '600',
    });

    overlay.textContent = `${attachment.progress}%`;

    return overlay;
  }

  /**
   * Formats a file size in bytes into a human-readable string.
   *
   * @param bytes - File size in bytes
   * @returns Formatted string (e.g., '1.5 MB', '256 KB')
   */
  private formatAttachmentSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);

    return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i] ?? 'B'}`;
  }

  // --------------------------------------------------------------------------
  // Private: Date Separators
  // --------------------------------------------------------------------------

  /**
   * Inserts a date separator if the message date differs from the last rendered date.
   *
   * Formats the date as "Today", "Yesterday", or "DD/MM/YYYY" using the
   * current locale from i18n.
   *
   * @param timestamp - ISO 8601 timestamp of the message
   */
  private maybeInsertDateSeparator(timestamp: string): void {
    if (!this.container) return;

    const dateKey = this.getDateKey(timestamp);
    if (dateKey === this.lastRenderedDate) return;

    this.lastRenderedDate = dateKey;
    const label = this.formatDateSeparator(timestamp);

    const separator = document.createElement('div');
    separator.className = 'nevent-chatbot-date-separator';

    Object.assign(separator.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 16px',
      gap: '12px',
    });

    // Left line
    const leftLine = document.createElement('span');
    Object.assign(leftLine.style, {
      flex: '1',
      height: '1px',
      backgroundColor: '#e0e0e0',
    });
    separator.appendChild(leftLine);

    // Date label
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    Object.assign(labelEl.style, {
      fontSize: '11px',
      color: '#999999',
      whiteSpace: 'nowrap',
      fontWeight: '500',
    });
    separator.appendChild(labelEl);

    // Right line
    const rightLine = document.createElement('span');
    Object.assign(rightLine.style, {
      flex: '1',
      height: '1px',
      backgroundColor: '#e0e0e0',
    });
    separator.appendChild(rightLine);

    // Insert before quick replies if present, else append
    if (
      this.quickReplyContainer &&
      this.container.contains(this.quickReplyContainer)
    ) {
      this.container.insertBefore(separator, this.quickReplyContainer);
    } else {
      this.container.appendChild(separator);
    }
  }

  /**
   * Returns a date key string (YYYY-MM-DD) for grouping messages by day.
   *
   * @param timestamp - ISO 8601 timestamp
   * @returns Date key string
   */
  private getDateKey(timestamp: string): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /**
   * Formats a date separator label: "Today", "Yesterday", or "DD/MM/YYYY".
   *
   * @param timestamp - ISO 8601 timestamp
   * @returns Formatted date label
   */
  private formatDateSeparator(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday = this.isSameDay(date, now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = this.isSameDay(date, yesterday);

    if (isToday) {
      // Use "Hoy" / "Today" depending on locale
      const locale = this.i18n.getLocale();
      const todayLabels: Record<string, string> = {
        es: 'Hoy',
        en: 'Today',
        ca: 'Avui',
        pt: 'Hoje',
      };
      return todayLabels[locale] ?? 'Today';
    }

    if (isYesterday) {
      return this.i18n.t('yesterday');
    }

    // Format as DD/MM/YYYY
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Checks if two dates fall on the same calendar day.
   *
   * @param a - First date
   * @param b - Second date
   * @returns true if both dates are the same day
   */
  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // --------------------------------------------------------------------------
  // Private: Timestamp Formatting
  // --------------------------------------------------------------------------

  /**
   * Formats a message timestamp as a relative or absolute time string.
   *
   * Logic:
   * - Less than 1 minute: "Just now" (i18n)
   * - Less than 1 hour: "X min ago" (i18n)
   * - Less than 24 hours: "Xh ago" (i18n)
   * - Yesterday: "Yesterday HH:MM"
   * - Older: "DD/MM HH:MM"
   *
   * @param timestamp - ISO 8601 timestamp string
   * @returns Formatted timestamp string
   */
  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMinutes < 1) {
      return this.i18n.t('justNow');
    }

    if (diffMinutes < 60) {
      return this.i18n.format('minutesAgo', { n: diffMinutes });
    }

    if (diffHours < 24) {
      return this.i18n.format('hoursAgo', { n: diffHours });
    }

    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (this.isSameDay(date, yesterday)) {
      return `${this.i18n.t('yesterday')} ${timeStr}`;
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${timeStr}`;
  }

  // --------------------------------------------------------------------------
  // Private: Status Indicators
  // --------------------------------------------------------------------------

  /**
   * Maps a MessageStatus to its visual indicator character.
   *
   * @param status - The message delivery status
   * @returns Unicode indicator string
   */
  private getStatusIndicator(status: ChatMessage['status']): string {
    switch (status) {
      case 'sending':
        return STATUS_SENDING;
      case 'sent':
        return STATUS_SENT;
      case 'delivered':
        return STATUS_DELIVERED;
      case 'error':
        return STATUS_ERROR;
      default:
        return '';
    }
  }

  // --------------------------------------------------------------------------
  // Private: Scroll Management
  // --------------------------------------------------------------------------

  /**
   * Updates the visibility of the "scroll to bottom" button based on scroll position.
   */
  private updateScrollButtonVisibility(): void {
    if (!this.scrollButton) return;

    const atBottom = this.isScrolledToBottom();
    this.scrollButton.style.display = atBottom ? 'none' : 'flex';
  }

  // --------------------------------------------------------------------------
  // Private: Style Application
  // --------------------------------------------------------------------------

  /**
   * Applies layout styles to the message wrapper element.
   *
   * @param wrapper - The message wrapper div
   * @param isUser - Whether this is a user message (right-aligned)
   */
  private applyMessageWrapperStyles(
    wrapper: HTMLElement,
    isUser: boolean
  ): void {
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      padding: '2px 16px',
    });
  }

  /**
   * Applies visual styles to the message bubble element.
   *
   * @param bubble - The bubble div element
   * @param isUser - Whether this is a user message
   */
  private applyBubbleStyles(bubble: HTMLElement, isUser: boolean): void {
    const s = this.styles;
    const bgColor = isUser
      ? (s?.userBubbleColor ?? '#007bff')
      : (s?.botBubbleColor ?? '#F0F0F0');
    const borderRadius = s?.borderRadius ?? 16;
    const maxWidth = s?.maxWidth ?? '80%';
    const padding = s?.padding ?? '10px 14px';

    // Asymmetric border radius:
    // User: 16px 16px 4px 16px (bottom-right is tight)
    // Bot:  16px 16px 16px 4px (bottom-left is tight)
    const radiusStr = isUser
      ? `${borderRadius}px ${borderRadius}px 4px ${borderRadius}px`
      : `${borderRadius}px ${borderRadius}px ${borderRadius}px 4px`;

    Object.assign(bubble.style, {
      backgroundColor: bgColor,
      borderRadius: radiusStr,
      padding,
      maxWidth,
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
    });
  }

  /**
   * Applies styles to the message content element.
   *
   * @param content - The content div element
   * @param isUser - Whether this is a user message
   */
  private applyContentStyles(content: HTMLElement, isUser: boolean): void {
    const s = this.styles;
    const textColor = isUser
      ? (s?.userTextColor ?? '#ffffff')
      : (s?.botTextColor ?? '#333333');
    const fontSize = s?.fontSize ?? '14px';
    const lineHeight = s?.lineHeight ?? '1.5';

    Object.assign(content.style, {
      color: textColor,
      fontSize,
      lineHeight,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });

    if (s?.font?.family) {
      content.style.fontFamily = `'${s.font.family}', -apple-system, BlinkMacSystemFont, sans-serif`;
    }
  }

  /**
   * Applies styles to the metadata row (timestamp + status).
   *
   * @param meta - The metadata div element
   * @param isUser - Whether this is a user message (affects alignment)
   */
  private applyMetaStyles(meta: HTMLElement, isUser: boolean): void {
    Object.assign(meta.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      fontSize: '11px',
      color: '#999999',
      marginTop: '2px',
      padding: '0 2px',
    });
  }
}
