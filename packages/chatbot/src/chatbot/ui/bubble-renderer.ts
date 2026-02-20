/**
 * BubbleRenderer - Floating chat bubble (FAB) component
 *
 * Renders the circular floating action button that toggles the chat window.
 * Displays an unread message count badge when there are unseen messages.
 *
 * Features:
 * - Configurable position (bottom-right, bottom-left)
 * - Unread message badge with count
 * - Entrance/exit animations (scale 0 -> 1)
 * - Hover scale effect (1.1)
 * - Toggle between chat icon and close (X) icon with crossfade
 * - Keyboard accessible (Enter/Space to toggle)
 * - ARIA roles: role="button", aria-expanded, aria-haspopup="dialog"
 * - aria-live badge for screen reader announcements of new messages
 * - Focus-visible outline for keyboard navigation (WCAG 2.4.7)
 *
 * @remarks
 * The bubble is only rendered in floating mode (when containerId is null).
 * In embedded mode, the chat window is always visible within the container.
 */

import type { BubbleStyles, BubblePosition } from '../../types';
import { I18nManager } from '../i18n-manager';

// ============================================================================
// SVG Icons
// ============================================================================

/**
 * Inline SVG for the chat bubble icon (speech bubble).
 * Displayed when the chat window is closed.
 */
const CHAT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/**
 * Inline SVG for the close (X) icon.
 * Displayed when the chat window is open.
 */
const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// ============================================================================
// BubbleRenderer Class
// ============================================================================

/**
 * Renders and manages the floating chat bubble (FAB) button.
 *
 * The bubble is a circular button fixed to the viewport corner. It displays
 * a chat icon when closed and an X icon when the chat window is open. An
 * unread message badge appears on top when there are unseen messages.
 *
 * @example
 * ```typescript
 * const bubble = new BubbleRenderer('bottom-right', styles, i18n);
 * const el = bubble.render(() => toggleChat());
 * bubble.updateBadge(3);
 * bubble.setActive(true);
 * bubble.destroy();
 * ```
 */
export class BubbleRenderer {
  /** Outer container element appended to document.body */
  private container: HTMLElement | null = null;

  /** The unread message badge element */
  private badge: HTMLElement | null = null;

  /** The main bubble button element */
  private bubble: HTMLButtonElement | null = null;

  /** Chat icon span (visible when chat is closed) */
  private chatIcon: HTMLSpanElement | null = null;

  /** Close icon span (visible when chat is open) */
  private closeIcon: HTMLSpanElement | null = null;

  /**
   * Creates a new BubbleRenderer instance.
   *
   * @param position - Viewport corner position ('bottom-right' or 'bottom-left')
   * @param styles - Optional visual style overrides for the bubble
   * @param i18n - Internationalization manager for translated ARIA labels
   */
  constructor(
    private position: BubblePosition,
    private styles: BubbleStyles | undefined,
    private i18n: I18nManager,
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the bubble into the specified target or document body.
   *
   * Creates the DOM structure: container > button > (chatIcon, closeIcon, badge).
   * Applies inline styles from the user's configuration on top of defaults.
   * Registers click and keyboard event listeners.
   *
   * @param onClick - Callback invoked when the bubble is clicked or activated via keyboard
   * @param target - Optional parent node to append the bubble to. When using
   *   Shadow DOM this should be the shadow root. Defaults to `document.body`.
   * @returns The outer container element appended to the target
   */
  render(onClick: () => void, target?: Node): HTMLElement {
    // Create outer container
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-bubble-container';
    this.applyContainerStyles();

    // Create the button
    this.bubble = document.createElement('button');
    this.bubble.className = 'nevent-chatbot-bubble';
    // role="button" is implicit on <button> but kept for explicitness
    this.bubble.setAttribute('role', 'button');
    this.bubble.setAttribute('aria-label', this.i18n.t('openChat'));
    this.bubble.setAttribute('aria-expanded', 'false');
    // Informs AT that activating the button opens a dialog
    this.bubble.setAttribute('aria-haspopup', 'dialog');
    this.bubble.type = 'button';
    this.applyBubbleStyles();

    // Chat icon (visible by default)
    this.chatIcon = document.createElement('span');
    this.chatIcon.className = 'nevent-chatbot-bubble-icon nevent-chatbot-bubble-icon--chat';
    this.chatIcon.innerHTML = CHAT_ICON_SVG;
    this.applyChatIconStyles(true);

    // Close icon (hidden by default)
    this.closeIcon = document.createElement('span');
    this.closeIcon.className = 'nevent-chatbot-bubble-icon nevent-chatbot-bubble-icon--close';
    this.closeIcon.innerHTML = CLOSE_ICON_SVG;
    this.applyCloseIconStyles(false);

    // Badge — aria-live so screen readers announce new message counts.
    // role="status" is polite; aria-atomic ensures the whole count is read.
    this.badge = document.createElement('span');
    this.badge.className = 'nevent-chatbot-badge';
    this.badge.setAttribute('aria-live', 'polite');
    this.badge.setAttribute('aria-atomic', 'true');
    this.applyBadgeStyles();
    this.badge.style.display = 'none';

    // Assemble DOM
    this.bubble.appendChild(this.chatIcon);
    this.bubble.appendChild(this.closeIcon);
    this.bubble.appendChild(this.badge);
    this.container.appendChild(this.bubble);

    // Event listeners
    this.bubble.addEventListener('click', onClick);

    // Hover effect
    this.bubble.addEventListener('mouseenter', () => {
      if (this.bubble) {
        this.bubble.style.transform = 'scale(1.1)';
      }
    });
    this.bubble.addEventListener('mouseleave', () => {
      if (this.bubble) {
        this.bubble.style.transform = 'scale(1)';
      }
    });

    // Append to specified target (shadow root) or document.body as fallback
    const mountPoint = target ?? document.body;
    mountPoint.appendChild(this.container);

    // Trigger entrance animation (scale 0 -> 1)
    requestAnimationFrame(() => {
      if (this.bubble) {
        this.bubble.style.transform = 'scale(1)';
      }
    });

    return this.container;
  }

  /**
   * Updates the unread message count badge.
   *
   * When count is 0, the badge is hidden. When count > 0, the badge is
   * displayed with the number. Counts above 99 are displayed as "99+".
   *
   * @param count - Number of unread messages (0 hides the badge)
   */
  updateBadge(count: number): void {
    if (!this.badge) return;

    if (count <= 0) {
      this.badge.style.display = 'none';
      this.badge.textContent = '';
    } else {
      this.badge.style.display = 'flex';
      this.badge.textContent = count > 99 ? '99+' : String(count);
    }
  }

  /**
   * Toggles between chat icon and close (X) icon with opacity crossfade.
   *
   * When active (chat is open), shows the X icon and hides the chat icon.
   * Also updates the aria-label and aria-expanded attributes.
   *
   * @param isOpen - Whether the chat window is currently open
   */
  setActive(isOpen: boolean): void {
    if (!this.bubble || !this.chatIcon || !this.closeIcon) return;

    this.bubble.setAttribute('aria-expanded', String(isOpen));
    this.bubble.setAttribute(
      'aria-label',
      isOpen ? this.i18n.t('closeChat') : this.i18n.t('openChat'),
    );

    this.applyChatIconStyles(!isOpen);
    this.applyCloseIconStyles(isOpen);
  }

  /**
   * Shows or hides the entire bubble container.
   *
   * @param visible - Whether the bubble should be visible
   */
  setVisible(visible: boolean): void {
    if (!this.container) return;

    this.container.style.display = visible ? 'block' : 'none';
  }

  /**
   * Removes the bubble from the DOM and cleans up references.
   */
  destroy(): void {
    this.container?.remove();
    this.container = null;
    this.bubble = null;
    this.badge = null;
    this.chatIcon = null;
    this.closeIcon = null;
  }

  // --------------------------------------------------------------------------
  // Private Style Application
  // --------------------------------------------------------------------------

  /**
   * Applies positioning styles to the outer container.
   * The container is fixed at the specified viewport corner.
   */
  private applyContainerStyles(): void {
    if (!this.container) return;

    const s = this.styles;
    const bottomOffset = s?.bottom ?? 20;
    const sideOffset = s?.right ?? 20;

    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: `${bottomOffset}px`,
      zIndex: '9999',
    });

    if (this.position === 'bottom-left') {
      this.container.style.left = `${sideOffset}px`;
      this.container.style.right = 'auto';
    } else {
      this.container.style.right = `${sideOffset}px`;
      this.container.style.left = 'auto';
    }
  }

  /**
   * Applies visual styles to the bubble button element.
   * User-provided BubbleStyles are applied as inline styles on top of defaults.
   */
  private applyBubbleStyles(): void {
    if (!this.bubble) return;

    const s = this.styles;
    const size = s?.size ?? 56;
    const bgColor = s?.backgroundColor ?? '#007bff';
    const iconColor = s?.iconColor ?? '#ffffff';
    const shadow = s?.shadow ?? '0 4px 12px rgba(0,0,0,0.15)';
    const borderRadius = s?.borderRadius ?? size / 2;

    Object.assign(this.bubble.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${borderRadius}px`,
      backgroundColor: bgColor,
      color: iconColor,
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: shadow,
      position: 'relative',
      overflow: 'visible',
      padding: '0',
      // Do NOT set outline:none — let CSS handle :focus-visible (see css-generator)
      // Entrance animation: starts at scale(0), transitions to scale(1)
      transform: 'scale(0)',
      transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease',
    });

    // Keyboard focus: show ring only on :focus-visible (not on mouse click).
    // We use a JS fallback because inline styles cannot use :focus-visible.
    // Attach to focusin/focusout so the ring is driven by CSS class in css-generator.
    // The actual CSS rule is generated in CSSGenerator.generateBubbleStyles().
    this.bubble.addEventListener('focus', () => {
      if (this.bubble) {
        this.bubble.style.boxShadow = `${shadow}, 0 0 0 3px rgba(0,123,255,0.5)`;
      }
    });
    this.bubble.addEventListener('blur', () => {
      if (this.bubble) {
        this.bubble.style.boxShadow = shadow;
      }
    });
  }

  /**
   * Applies styles to the chat icon span for crossfade transition.
   *
   * @param visible - Whether the chat icon should be visible
   */
  private applyChatIconStyles(visible: boolean): void {
    if (!this.chatIcon) return;

    Object.assign(this.chatIcon.style, {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: visible ? '1' : '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: visible ? 'auto' : 'none',
      lineHeight: '0',
    });
  }

  /**
   * Applies styles to the close icon span for crossfade transition.
   *
   * @param visible - Whether the close icon should be visible
   */
  private applyCloseIconStyles(visible: boolean): void {
    if (!this.closeIcon) return;

    Object.assign(this.closeIcon.style, {
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: visible ? '1' : '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: visible ? 'auto' : 'none',
      lineHeight: '0',
    });
  }

  /**
   * Applies styles to the unread badge element.
   * Badge is a small circle with the count, positioned at the top-right of the bubble.
   */
  private applyBadgeStyles(): void {
    if (!this.badge) return;

    const s = this.styles;
    const badgeColor = s?.badgeColor ?? '#ff4444';
    const badgeTextColor = s?.badgeTextColor ?? '#ffffff';

    Object.assign(this.badge.style, {
      position: 'absolute',
      top: '-4px',
      right: '-4px',
      minWidth: '20px',
      height: '20px',
      borderRadius: '10px',
      backgroundColor: badgeColor,
      color: badgeTextColor,
      fontSize: '11px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 5px',
      boxSizing: 'border-box',
      lineHeight: '1',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
  }
}
