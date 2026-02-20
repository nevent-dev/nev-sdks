/**
 * TypingRenderer - Bot typing indicator animation component
 *
 * Renders an animated typing indicator (three bouncing dots) displayed
 * when the chatbot is processing a response. Provides visual feedback
 * that the bot is "thinking".
 *
 * Features:
 * - Three-dot bounce animation (CSS-only, no JS timers)
 * - Each dot bounces with a 0.2s stagger delay
 * - Smooth fade in/out transitions (opacity + translateY)
 * - Configurable dot color and size via MessageStyles
 * - "Thinking..." label below dots (translated via i18n)
 * - ARIA live region for screen reader announcements
 * - Initially hidden, toggled via show()/hide()
 *
 * @remarks
 * The typing indicator is positioned at the bottom of the message list,
 * aligned to the left (same side as bot messages). It uses a style tag
 * injected into the document head for the keyframe animation.
 */

import type { MessageStyles } from '../../types';
import { I18nManager } from '../i18n-manager';

// ============================================================================
// Animation Constants
// ============================================================================

/** Unique ID for the typing animation style tag to prevent duplicate injection */
const TYPING_ANIMATION_STYLE_ID = 'nevent-chatbot-typing-animation';

/**
 * CSS keyframe animation for the bouncing dots.
 * Each dot translates up by 6px and back, creating a wave effect.
 */
const TYPING_KEYFRAMES = `
@keyframes nevent-chatbot-dot-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-6px);
  }
}
`;

// ============================================================================
// TypingRenderer Class
// ============================================================================

/**
 * Renders and controls the bot typing indicator animation.
 *
 * The indicator appears as a message bubble aligned to the left (bot side)
 * containing three animated dots and a label. It uses CSS-only animation
 * for performance and accessibility.
 *
 * @example
 * ```typescript
 * const typing = new TypingRenderer(messageStyles, i18n);
 * const el = typing.render();
 * messageList.appendChild(el);
 *
 * typing.show();  // Fade in the indicator
 * typing.hide();  // Fade out the indicator
 * typing.destroy();
 * ```
 */
export class TypingRenderer {
  /** The outer container element for the typing indicator */
  private container: HTMLElement | null = null;

  /**
   * Creates a new TypingRenderer instance.
   *
   * @param styles - Optional message styles for consistent bot-bubble appearance
   * @param i18n - Internationalization manager for the "Thinking..." label
   * @param shadowRoot - Optional shadow root for injecting animation styles
   *   inside the shadow boundary instead of document.head
   */
  constructor(
    private styles: MessageStyles | undefined,
    private i18n: I18nManager,
    private shadowRoot?: ShadowRoot,
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the typing indicator element (initially hidden).
   *
   * Creates the DOM structure:
   * - Container (flex row, left-aligned like bot messages)
   *   - Bubble (background matching bot bubble color)
   *     - 3 dot spans with staggered animation delay
   *   - Label ("Thinking..." text, muted and small)
   *
   * Also injects the keyframe animation CSS into the document head
   * if not already present.
   *
   * @returns The typing indicator container element (initially hidden)
   */
  render(): HTMLElement {
    // Inject keyframe animation CSS (once per page)
    this.injectAnimationStyles();

    // Container - positioned like a bot message (left-aligned).
    // role="status" is the implicit ARIA role for aria-live="polite" regions.
    // aria-atomic="true" ensures the whole label is re-read when visibility changes.
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-typing';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    this.container.setAttribute('aria-label', this.i18n.t('typingIndicator'));
    this.applyContainerStyles();

    // Inner bubble (matches bot message bubble appearance)
    const bubble = document.createElement('div');
    bubble.className = 'nevent-chatbot-typing-bubble';
    this.applyBubbleStyles(bubble);

    // Create 3 decorative dots — hidden from AT (the container aria-label suffices)
    const dotSize = 8;
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'nevent-chatbot-typing-dot';
      dot.setAttribute('aria-hidden', 'true');
      this.applyDotStyles(dot, dotSize, i);
      bubble.appendChild(dot);
    }

    this.container.appendChild(bubble);

    // Label below dots — visible for sighted users; hidden from AT because
    // the container's aria-label already conveys the same information.
    const label = document.createElement('span');
    label.className = 'nevent-chatbot-typing-label';
    label.textContent = this.i18n.t('typingIndicator');
    label.setAttribute('aria-hidden', 'true');
    this.applyLabelStyles(label);
    this.container.appendChild(label);

    return this.container;
  }

  /**
   * Shows the typing indicator with a smooth fade-in animation.
   *
   * Transitions from opacity 0 + translateY(4px) to opacity 1 + translateY(0).
   */
  show(): void {
    if (!this.container) return;

    this.container.style.display = 'flex';
    // Force reflow before transitioning
    void this.container.offsetHeight;
    this.container.style.opacity = '1';
    this.container.style.transform = 'translateY(0)';
  }

  /**
   * Hides the typing indicator with a smooth fade-out animation.
   *
   * After the transition completes (200ms), sets display to 'none'.
   */
  hide(): void {
    if (!this.container) return;

    this.container.style.opacity = '0';
    this.container.style.transform = 'translateY(4px)';

    setTimeout(() => {
      if (this.container) {
        this.container.style.display = 'none';
      }
    }, 200);
  }

  /**
   * Removes the typing indicator from the DOM and cleans up references.
   *
   * Does not remove the shared keyframe style tag, as other instances
   * may still be using it.
   */
  destroy(): void {
    this.container?.remove();
    this.container = null;
  }

  // --------------------------------------------------------------------------
  // Private Style Application
  // --------------------------------------------------------------------------

  /**
   * Injects the CSS keyframe animation into the document head.
   * Uses a unique ID to prevent duplicate style tags.
   */
  private injectAnimationStyles(): void {
    // Inject into the shadow root when available, otherwise into document.head.
    // ShadowRoot does not have getElementById, so use querySelector by id.
    const searchTarget: ParentNode = this.shadowRoot ?? document;
    const appendTarget: Node = this.shadowRoot ?? document.head;

    if (searchTarget.querySelector(`#${TYPING_ANIMATION_STYLE_ID}`)) return;

    const style = document.createElement('style');
    style.id = TYPING_ANIMATION_STYLE_ID;
    style.textContent = TYPING_KEYFRAMES;
    appendTarget.appendChild(style);
  }

  /**
   * Applies styles to the outer container.
   * The container is hidden initially and uses flex-column layout.
   */
  private applyContainerStyles(): void {
    if (!this.container) return;

    Object.assign(this.container.style, {
      display: 'none',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '4px',
      padding: '4px 16px',
      // Transition for smooth fade in/out
      opacity: '0',
      transform: 'translateY(4px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
    });
  }

  /**
   * Applies bot-bubble-like styles to the inner bubble containing the dots.
   *
   * @param bubble - The bubble div element
   */
  private applyBubbleStyles(bubble: HTMLElement): void {
    const bgColor = this.styles?.botBubbleColor ?? '#F0F0F0';

    Object.assign(bubble.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '12px 16px',
      backgroundColor: bgColor,
      borderRadius: '16px 16px 16px 4px',
    });
  }

  /**
   * Applies styles and animation to a single dot element.
   *
   * @param dot - The dot span element
   * @param size - Dot diameter in pixels
   * @param index - Dot index (0, 1, 2) for staggered animation delay
   */
  private applyDotStyles(dot: HTMLElement, size: number, index: number): void {
    const dotColor = this.styles?.systemMessageColor ?? '#999999';
    const delay = index * 0.2;

    Object.assign(dot.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundColor: dotColor,
      display: 'inline-block',
      animation: `nevent-chatbot-dot-bounce 1.2s infinite ease-in-out`,
      animationDelay: `${delay}s`,
    });
  }

  /**
   * Applies styles to the "Thinking..." label below the dots.
   *
   * @param label - The label span element
   */
  private applyLabelStyles(label: HTMLElement): void {
    const textColor = this.styles?.systemMessageColor ?? '#999999';

    Object.assign(label.style, {
      fontSize: '11px',
      color: textColor,
      paddingLeft: '4px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
  }
}
