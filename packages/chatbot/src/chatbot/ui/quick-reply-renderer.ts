/**
 * QuickReplyRenderer - Dedicated renderer for quick reply / suggested response buttons
 *
 * Provides a fully-featured, accessible, and animated component for displaying
 * quick reply options below bot messages. Supports three display modes
 * (scroll, wrap, stacked), staggered entrance animations, exit animations,
 * icon rendering (emoji or URL image), and full keyboard navigation.
 *
 * Features:
 * - Three display modes: `scroll` (horizontal pill row), `wrap` (multi-line),
 *   `stacked` (vertical full-width buttons)
 * - Staggered entrance animation: each button fades in from below with a 50 ms delay
 * - Exit animation: all buttons fade out simultaneously in 200 ms
 * - Click feedback: the activated button highlights; all others fade out
 * - Icon support: emoji rendered as inline text, URL images as 16 x 16 `<img>`
 * - Arrow-key / Home / End / Tab keyboard navigation (WCAG 2.1.1)
 * - Full ARIA annotation (role="group", role="button", aria-label, aria-disabled)
 * - Inline styles are applied in addition to CSS classes so the component works
 *   even before the CSSGenerator stylesheet is injected.
 *
 * @example
 * ```typescript
 * const renderer = new QuickReplyRenderer(quickReplyStyles, i18nManager);
 *
 * const container = renderer.render({
 *   replies: [{ id: '1', label: 'Yes', value: 'yes' }],
 *   onClick: (reply) => handleReply(reply),
 *   mode: 'scroll',
 *   animated: true,
 * });
 *
 * chatBody.appendChild(container);
 *
 * // Later — after user taps a button
 * await renderer.clear(true); // animated exit
 * renderer.destroy();
 * ```
 */

import type { QuickReply, QuickReplyStyles } from '../../types';
import type { I18nManager } from '../i18n-manager';

// ============================================================================
// Types
// ============================================================================

/**
 * Controls how quick reply buttons are laid out in their container.
 *
 * - `'scroll'` — Single horizontal row; overflowing buttons are accessible
 *   via horizontal scroll (default).
 * - `'wrap'` — Buttons wrap onto multiple lines using flex-wrap.
 * - `'stacked'` — Full-width vertical stack; best for important branching
 *   choices with longer labels.
 */
export type QuickReplyDisplayMode = 'scroll' | 'wrap' | 'stacked';

/**
 * Options for the {@link QuickReplyRenderer.render} method.
 */
export interface QuickReplyRenderOptions {
  /** Array of quick reply items to render. An empty array is a no-op. */
  replies: QuickReply[];
  /**
   * Callback invoked when the user activates a quick reply (click or keyboard).
   * Called before the activation animation completes.
   */
  onClick: (reply: QuickReply) => void;
  /**
   * Layout mode for the button group.
   * @default 'scroll'
   */
  mode?: QuickReplyDisplayMode;
  /**
   * Whether entrance and exit animations should be played.
   * Set to `false` for reduced-motion environments or snapshot tests.
   * @default true
   */
  animated?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Duration of the exit fade-out animation in milliseconds. */
const EXIT_ANIMATION_DURATION_MS = 200;

/** Stagger delay between each button's entrance animation in milliseconds. */
const ENTER_STAGGER_DELAY_MS = 50;

/** Duration of the entrance animation per button in milliseconds. */
const ENTER_ANIMATION_DURATION_MS = 250;

// ============================================================================
// QuickReplyRenderer Class
// ============================================================================

/**
 * Dedicated renderer for quick reply / suggested response buttons.
 *
 * Manages the full lifecycle of a quick reply group: creation, animation,
 * interaction, and cleanup. Designed to be used as an internal component by
 * {@link MessageRenderer}, but can also be embedded directly in custom
 * host applications.
 *
 * @remarks
 * A single `QuickReplyRenderer` instance can be reused across multiple
 * render / clear cycles. Call `render()` to display a new set of replies,
 * `clear()` to animate them out, and `render()` again for the next set.
 * Call `destroy()` only when the component is permanently removed.
 */
export class QuickReplyRenderer {
  /**
   * The outer container element created by {@link render}.
   * Null before the first call to `render()` or after `destroy()`.
   */
  private container: HTMLElement | null = null;

  /**
   * Map from reply ID to its corresponding button element.
   * Used for targeted operations like `highlight()`.
   */
  private buttons: Map<string, HTMLButtonElement> = new Map();

  /**
   * Ordered list of button elements for keyboard navigation.
   * Mirrors the iteration order of `this.buttons`.
   */
  private buttonList: HTMLButtonElement[] = [];

  /**
   * Whether the component is currently in an animated state.
   * Prevents concurrent animations from conflicting.
   */
  private isAnimating = false;

  /**
   * Cached primary color derived from styles, used for button and hover colors.
   * Falls back to the Nevent Indigo brand token.
   */
  private readonly primaryColor: string;

  /**
   * Creates a new QuickReplyRenderer.
   *
   * @param styles - Optional consumer-provided style overrides for the buttons.
   *   When not provided the component falls back to the CSS custom properties
   *   defined by {@link CSSGenerator} (`--nev-cb-qr-*`).
   * @param i18n - I18nManager instance used to produce accessible labels.
   */
  constructor(
    private readonly styles: QuickReplyStyles | undefined,
    private readonly i18n: I18nManager
  ) {
    // Derive a single primary color used across button states.
    // Priority: explicit borderColor > textColor > CSS var fallback.
    this.primaryColor =
      styles?.borderColor ?? styles?.textColor ?? 'var(--nev-cb-color-primary)';
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders a group of quick reply buttons and returns the container element.
   *
   * The caller is responsible for appending the returned element to the DOM.
   * Any previously rendered container is **not** removed — call `clear()`
   * first if needed, or use the container reference returned by a previous
   * `render()` call to remove it manually.
   *
   * @param options - Render configuration (replies, onClick, mode, animated).
   * @returns The container element holding all quick reply buttons. If
   *   `options.replies` is empty, the method returns an empty `<div>` that
   *   contains no buttons.
   *
   * @example
   * ```typescript
   * const el = renderer.render({
   *   replies: myReplies,
   *   onClick: handleReply,
   *   mode: 'wrap',
   *   animated: true,
   * });
   * messageListEl.appendChild(el);
   * ```
   */
  render(options: QuickReplyRenderOptions): HTMLElement {
    const { replies, onClick, mode = 'scroll', animated = true } = options;

    // Reset internal state for a fresh render
    this.buttons.clear();
    this.buttonList = [];
    this.isAnimating = false;

    // Create the outer container
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-quick-replies';
    // ARIA: role="group" identifies this as a related set of controls.
    // aria-label uses the i18n-resolved label for screen readers.
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', this.getGroupAriaLabel());

    // Apply container layout styles based on the chosen mode
    this.applyContainerStyles(this.container, mode);

    // Build each button
    for (const reply of replies) {
      const button = this.createButton(reply, onClick, mode, animated);
      this.buttons.set(reply.id, button);
      this.buttonList.push(button);
      this.container.appendChild(button);
    }

    // Attach keyboard navigation handler after all buttons are built
    this.attachKeyboardNavigation(this.container, this.buttonList);

    // Trigger staggered entrance animation if requested
    if (animated && replies.length > 0) {
      this.playEntranceAnimation(this.buttonList);
    }

    return this.container;
  }

  /**
   * Removes all quick reply buttons from the DOM, optionally with an exit animation.
   *
   * The returned Promise resolves after the animation completes (or immediately
   * if `animated` is false), so callers can await it before appending new content.
   *
   * @param animated - Whether to play the exit animation before removal.
   *   @default true
   * @returns Promise that resolves when the container has been removed from the DOM.
   *
   * @example
   * ```typescript
   * // Await exit before showing next reply set
   * await renderer.clear(true);
   * const newContainer = renderer.render({ replies: nextReplies, onClick });
   * chatBody.appendChild(newContainer);
   * ```
   */
  clear(animated = true): Promise<void> {
    return new Promise((resolve) => {
      if (!this.container) {
        resolve();
        return;
      }

      // If an exit animation is already in progress, just wait for it to finish
      // rather than starting a second concurrent animation.
      if (this.isAnimating) {
        resolve();
        return;
      }

      if (!animated) {
        this.removeContainer();
        resolve();
        return;
      }

      this.isAnimating = true;

      // Apply exit animation to all buttons simultaneously
      for (const button of this.buttonList) {
        Object.assign(button.style, {
          animation: `nevent-chatbot-qr-exit ${EXIT_ANIMATION_DURATION_MS}ms ease-in forwards`,
        });
      }

      // Also fade out the container itself for a clean disappearance
      Object.assign(this.container.style, {
        transition: `opacity ${EXIT_ANIMATION_DURATION_MS}ms ease-in`,
        opacity: '0',
      });

      // Remove from DOM after animation completes
      const timer = setTimeout(() => {
        this.removeContainer();
        this.isAnimating = false;
        resolve();
      }, EXIT_ANIMATION_DURATION_MS + 10); // +10 ms buffer for rendering

      // Stash timer reference so destroy() can clear it if called early
      this._exitTimer = timer;
    });
  }

  /**
   * Disables all quick reply buttons.
   *
   * Called after the user activates a reply to prevent double-submission.
   * Disabled buttons receive `aria-disabled="true"` and `pointer-events:none`.
   *
   * @example
   * ```typescript
   * renderer.disableAll();
   * // User cannot click any more buttons in this group
   * ```
   */
  disableAll(): void {
    for (const button of this.buttonList) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.style.opacity = '0.5';
      button.style.pointerEvents = 'none';
      button.style.cursor = 'not-allowed';
    }
  }

  /**
   * Highlights the button corresponding to the given reply ID.
   *
   * The highlighted button receives the primary-color fill treatment
   * (background = primary, text = white) and a subtle scale transform.
   * All other buttons receive reduced opacity to draw focus to the selection.
   *
   * Used to provide feedback when a reply is being sent (e.g. "you chose this").
   *
   * @param replyId - The `id` of the {@link QuickReply} whose button should be highlighted.
   *
   * @example
   * ```typescript
   * renderer.highlight(selectedReply.id);
   * renderer.disableAll();
   * ```
   */
  highlight(replyId: string): void {
    const targetButton = this.buttons.get(replyId);
    if (!targetButton) return;

    const primaryColor = this.styles?.hoverBackgroundColor ?? this.primaryColor;
    const hoverTextColor = this.styles?.hoverTextColor ?? '#ffffff';

    for (const [id, button] of this.buttons.entries()) {
      if (id === replyId) {
        // Highlighted state: filled primary background, white text, subtle scale
        Object.assign(button.style, {
          backgroundColor: primaryColor,
          color: hoverTextColor,
          borderColor: primaryColor,
          transform: 'scale(1.02)',
          transition:
            'background-color 0.15s ease, color 0.15s ease, transform 0.15s ease',
          opacity: '1',
        });
      } else {
        // Other buttons fade to indicate this one was not chosen
        Object.assign(button.style, {
          opacity: '0.4',
          transition: 'opacity 0.15s ease',
        });
      }
    }
  }

  /**
   * Removes the container from the DOM and clears all internal references.
   *
   * Call this when the parent component (e.g. MessageRenderer) is being
   * destroyed to ensure no orphaned elements or event listeners remain.
   *
   * @example
   * ```typescript
   * // Inside MessageRenderer.destroy()
   * this.quickReplyRenderer.destroy();
   * ```
   */
  destroy(): void {
    if (this._exitTimer !== null) {
      clearTimeout(this._exitTimer);
      this._exitTimer = null;
    }
    this.removeContainer();
  }

  // --------------------------------------------------------------------------
  // Private: Internal timer reference for exit animation cleanup
  // --------------------------------------------------------------------------

  /** Handle for the pending exit animation setTimeout, if any. */
  private _exitTimer: ReturnType<typeof setTimeout> | null = null;

  // --------------------------------------------------------------------------
  // Private: DOM helpers
  // --------------------------------------------------------------------------

  /**
   * Removes the current container from the DOM and resets all related state.
   */
  private removeContainer(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.buttons.clear();
    this.buttonList = [];
  }

  // --------------------------------------------------------------------------
  // Private: Button creation
  // --------------------------------------------------------------------------

  /**
   * Creates a single styled quick reply button element.
   *
   * Handles both emoji icons (rendered as inline text) and URL icons
   * (rendered as a 16 x 16 `<img>` with proper alt text).
   *
   * @param reply - The quick reply data object.
   * @param onClick - Callback to invoke when the button is activated.
   * @param mode - Layout mode, used to determine button width.
   * @param animated - Whether entrance animation classes should be set up.
   * @returns The constructed `<button>` element.
   */
  private createButton(
    reply: QuickReply,
    onClick: (reply: QuickReply) => void,
    mode: QuickReplyDisplayMode,
    animated: boolean
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nevent-chatbot-quick-reply-button';

    // ARIA: role="button" is implicit for <button>, but aria-label provides
    // the full accessible name including any icon context.
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', reply.label);

    // Render icon if present
    if (reply.icon) {
      const iconEl = this.createIconElement(reply.icon, reply.label);
      button.appendChild(iconEl);
    }

    // Label text node
    const labelNode = document.createTextNode(reply.label);
    button.appendChild(labelNode);

    // Apply base visual styles
    this.applyButtonStyles(button, mode, animated);

    // Hover / focus interactions
    this.attachButtonInteractions(button);

    // Click handler: highlight this button, then invoke the callback
    button.addEventListener('click', () => {
      this.highlight(reply.id);
      onClick(reply);
    });

    return button;
  }

  /**
   * Creates the icon element for a quick reply button.
   *
   * Detection logic:
   * - If the string starts with `http://` or `https://`, treat as an image URL.
   * - Otherwise, treat as an emoji or short text rendered as a `<span>`.
   *
   * @param icon - The icon value from {@link QuickReply.icon}.
   * @param altText - Accessible alt text used if the icon is an image.
   * @returns The icon element (`<span>` or `<img>`).
   */
  private createIconElement(
    icon: string,
    altText: string
  ): HTMLElement | HTMLImageElement {
    const isUrl = icon.startsWith('http://') || icon.startsWith('https://');

    if (isUrl) {
      const img = document.createElement('img');
      img.className = 'nevent-chatbot-quick-reply-icon';
      img.src = icon;
      img.alt = altText;
      img.width = 16;
      img.height = 16;
      // Inline styles ensure correct sizing even before the stylesheet loads
      Object.assign(img.style, {
        width: '16px',
        height: '16px',
        objectFit: 'contain',
        verticalAlign: 'middle',
        marginRight: '6px',
        flexShrink: '0',
        display: 'inline-block',
      });
      return img;
    }

    // Emoji or text icon
    const span = document.createElement('span');
    span.className = 'nevent-chatbot-quick-reply-icon';
    span.textContent = icon;
    // aria-hidden prevents screen readers from reading the emoji
    // (the button's aria-label already includes the full accessible name).
    span.setAttribute('aria-hidden', 'true');
    Object.assign(span.style, {
      marginRight: '6px',
      display: 'inline-block',
      flexShrink: '0',
      lineHeight: '1',
      fontSize: '1em',
      verticalAlign: 'middle',
    });
    return span;
  }

  // --------------------------------------------------------------------------
  // Private: Style application
  // --------------------------------------------------------------------------

  /**
   * Applies layout and overflow styles to the container element based on mode.
   *
   * @param container - The container div element.
   * @param mode - The chosen display mode.
   */
  private applyContainerStyles(
    container: HTMLElement,
    mode: QuickReplyDisplayMode
  ): void {
    const base: Partial<CSSStyleDeclaration> = {
      display: 'flex',
      gap: '8px',
      padding: '8px 16px',
    };

    switch (mode) {
      case 'scroll':
        Object.assign(base, {
          flexWrap: 'nowrap',
          overflowX: 'auto',
          // Hide scrollbar visually while preserving scrollability
          // (scrollbar-width is a string property in the CSSOM but valid CSS)
        });
        container.style.setProperty('scrollbar-width', 'none');
        // WebKit scrollbar hide is applied via CSS class (css-generator)
        break;

      case 'wrap':
        Object.assign(base, {
          flexWrap: 'wrap',
          overflowX: 'visible',
        });
        break;

      case 'stacked':
        Object.assign(base, {
          flexDirection: 'column',
          flexWrap: 'nowrap',
        });
        break;
    }

    Object.assign(container.style, base);
  }

  /**
   * Applies base visual styles to a quick reply button.
   *
   * Reads from the consumer-provided {@link QuickReplyStyles} when available,
   * falling back to CSS custom properties for theme integration.
   *
   * @param button - The button element.
   * @param mode - Layout mode, determines width behavior.
   * @param animated - Whether the button should start invisible for entrance animation.
   */
  private applyButtonStyles(
    button: HTMLButtonElement,
    mode: QuickReplyDisplayMode,
    animated: boolean
  ): void {
    const s = this.styles;

    // Resolve token values, prefer explicit styles over CSS vars
    const bgColor = s?.backgroundColor ?? 'transparent';
    const textColor = s?.textColor ?? 'var(--nev-cb-qr-color)';
    const borderColor = s?.borderColor ?? 'var(--nev-cb-qr-border)';
    const fontSize = s?.fontSize ?? 'var(--nev-cb-font-size-sm)';
    // Always pill-shaped (borderRadius: 999px) — this is the design specification.
    const borderRadius = s?.borderRadius ?? '999px';

    const baseStyles: Partial<CSSStyleDeclaration> = {
      border: `1.5px solid ${borderColor}`,
      borderRadius,
      padding: '6px 14px',
      fontSize,
      color: textColor,
      backgroundColor: bgColor,
      cursor: 'pointer',
      fontFamily: 'var(--nev-cb-font-family)',
      display: 'inline-flex',
      alignItems: 'center',
      transition:
        'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease, transform 0.15s ease',
    };

    if (mode === 'stacked') {
      // Full-width in stacked mode
      Object.assign(baseStyles, {
        width: '100%',
        justifyContent: 'center',
        whiteSpace: 'normal',
        flexShrink: '0',
      });
    } else {
      Object.assign(baseStyles, {
        whiteSpace: 'nowrap',
        flexShrink: '0',
      });
    }

    // If animated, start invisible so the entrance animation can fade in
    if (animated) {
      Object.assign(baseStyles, {
        opacity: '0',
        transform: 'translateY(8px)',
      });
    }

    Object.assign(button.style, baseStyles);
  }

  /**
   * Attaches mouse/pointer hover interaction handlers to a button.
   *
   * Uses inline styles rather than CSS classes to guarantee the interactions
   * work even when the CSSGenerator stylesheet has not been injected.
   *
   * @param button - The button element to decorate.
   */
  private attachButtonInteractions(button: HTMLButtonElement): void {
    const s = this.styles;
    const hoverBg = s?.hoverBackgroundColor ?? this.primaryColor;
    const hoverColor = s?.hoverTextColor ?? '#ffffff';
    const normalBg = s?.backgroundColor ?? 'transparent';
    const normalColor = s?.textColor ?? 'var(--nev-cb-qr-color)';
    const normalBorder = s?.borderColor ?? 'var(--nev-cb-qr-border)';

    button.addEventListener('mouseenter', () => {
      if (button.disabled) return;
      button.style.backgroundColor = hoverBg;
      button.style.color = hoverColor;
      button.style.borderColor = hoverBg;
    });

    button.addEventListener('mouseleave', () => {
      if (button.disabled) return;
      // Only reset if not in the highlighted state (opacity is 1 and bg is primary)
      if (button.style.opacity !== '0.4') {
        button.style.backgroundColor = normalBg;
        button.style.color = normalColor;
        button.style.borderColor = normalBorder;
      }
    });

    // Active / pressed state
    button.addEventListener('mousedown', () => {
      if (button.disabled) return;
      // Slightly darker — achieved by reducing opacity briefly
      button.style.opacity = '0.85';
    });

    button.addEventListener('mouseup', () => {
      if (button.disabled) return;
      button.style.opacity = '1';
    });
  }

  // --------------------------------------------------------------------------
  // Private: Keyboard Navigation
  // --------------------------------------------------------------------------

  /**
   * Attaches keyboard navigation event listeners to the container element.
   *
   * Supported keys:
   * - `ArrowRight` / `ArrowDown` — move focus to the next button
   * - `ArrowLeft` / `ArrowUp` — move focus to the previous button
   * - `Home` — move focus to the first button
   * - `End` — move focus to the last button
   * - `Tab` — native tab behavior (exits the group), not overridden
   * - `Enter` / `Space` — natively activates the focused button (no override needed)
   *
   * WCAG 2.1.1 — all functionality available from keyboard.
   * WCAG 4.1.2 — name, role, value properly exposed.
   *
   * @param container - The container element to attach the listener to.
   * @param buttons - Ordered list of button elements for index calculation.
   */
  private attachKeyboardNavigation(
    container: HTMLElement,
    buttons: HTMLButtonElement[]
  ): void {
    if (buttons.length === 0) return;

    container.addEventListener('keydown', (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      // In Shadow DOM, document.activeElement points to the shadow host, not
      // the inner focused element.  Use the container's root node (which is the
      // ShadowRoot when inside Shadow DOM) to get the correct active element.
      const rootNode = container.getRootNode() as Document | ShadowRoot;
      const focused = (rootNode.activeElement ??
        document.activeElement) as HTMLButtonElement | null;
      if (!focused) return;

      const idx = buttons.indexOf(focused);
      if (idx === -1) return;

      let targetIdx: number | null = null;

      switch (keyEvent.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          targetIdx = (idx + 1) % buttons.length;
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
          targetIdx = (idx - 1 + buttons.length) % buttons.length;
          break;

        case 'Home':
          targetIdx = 0;
          break;

        case 'End':
          targetIdx = buttons.length - 1;
          break;

        default:
          return; // Allow other keys (Tab, Enter, Space) to bubble normally
      }

      keyEvent.preventDefault();
      buttons[targetIdx]?.focus();
    });
  }

  // --------------------------------------------------------------------------
  // Private: Animations
  // --------------------------------------------------------------------------

  /**
   * Plays a staggered entrance animation on the given buttons.
   *
   * Each button fades in and slides up from a translated position, with a
   * 50 ms delay between consecutive buttons to create a cascade effect.
   *
   * Uses CSS animation if the `nevent-chatbot-qr-enter` keyframe is defined
   * (injected by {@link CSSGenerator}). Falls back to a JS-driven style
   * transition so the animation works even without the stylesheet.
   *
   * @param buttons - Ordered list of buttons to animate.
   */
  private playEntranceAnimation(buttons: HTMLButtonElement[]): void {
    buttons.forEach((button, index) => {
      const delay = index * ENTER_STAGGER_DELAY_MS;

      // Schedule the reveal after the per-button stagger delay
      setTimeout(() => {
        // Use the CSS animation if keyframes are available, otherwise use
        // a simple JS-driven style transition as a progressive enhancement.
        button.style.animation = `nevent-chatbot-qr-enter ${ENTER_ANIMATION_DURATION_MS}ms ease-out forwards`;
        button.style.animationDelay = '0ms'; // delay already applied via setTimeout

        // Fallback for environments without the keyframe defined:
        // Force-set the final visible state so the button appears regardless.
        setTimeout(() => {
          if (button.style.opacity === '0') {
            Object.assign(button.style, {
              opacity: '1',
              transform: 'translateY(0)',
              animation: 'none',
            });
          }
        }, ENTER_ANIMATION_DURATION_MS + 50);
      }, delay);
    });
  }

  // --------------------------------------------------------------------------
  // Private: Accessibility label helpers
  // --------------------------------------------------------------------------

  /**
   * Returns a localized aria-label for the quick reply group container.
   *
   * @returns Translated label string for the role="group" element.
   */
  private getGroupAriaLabel(): string {
    const locale = this.i18n.getLocale();
    const labels: Record<string, string> = {
      es: 'Respuestas rápidas',
      en: 'Quick replies',
      ca: 'Respostes ràpides',
      pt: 'Respostas rápidas',
    };
    return labels[locale] ?? 'Quick replies';
  }
}
