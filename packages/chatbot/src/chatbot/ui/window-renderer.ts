/**
 * WindowRenderer - Main chat window container component
 *
 * Renders the chat window that contains the header, message list body,
 * input footer area, and typing indicator. Manages the window's open/close
 * animation and positioning relative to the bubble.
 *
 * Features:
 * - Slide-in/slide-out animation (translateY + opacity)
 * - Responsive: fullscreen on mobile viewports (< 480px)
 * - Configurable dimensions, colors, and border radius
 * - Header with avatar, title, subtitle, close button, and new conversation button
 * - Body container for message list insertion (flex-grow, overflow-y auto)
 * - Footer container for input insertion (border-top)
 * - Loading state with spinner overlay in the body (role="status", aria-live)
 * - ARIA: role="dialog", aria-modal="true", aria-labelledby for accessible name
 * - Focus management: exposes getFocusableElements() for focus trap in ChatbotWidget
 *
 * @remarks
 * The window is rendered as a child of document.body for floating mode.
 * Position is calculated relative to the bubble position + 16px gap.
 */

import type { WindowStyles, HeaderStyles } from '../../types';
import type { ChatbotTracker } from '../analytics/chatbot-tracker';
import { I18nManager } from '../i18n-manager';

// ============================================================================
// SVG Icons
// ============================================================================

/** Close button X icon for the header */
const CLOSE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/** New conversation icon (plus in a chat bubble) */
const NEW_CONVERSATION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

/** Lightning bolt icon for the "Powered by Nevent" branding footer */
const BRANDING_ICON_SVG = `<svg class="nevent-chatbot-branding-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

// ============================================================================
// WindowRenderer Class
// ============================================================================

/**
 * Renders and manages the main chat window container.
 *
 * The window is composed of three sections:
 * - **Header**: Title, subtitle, avatar, close button, new conversation button
 * - **Body**: Scrollable area where messages are rendered (accessed via getBody())
 * - **Footer**: Area where the input field is rendered (accessed via getFooter())
 *
 * @example
 * ```typescript
 * const window = new WindowRenderer(windowStyles, headerStyles, i18n);
 * const el = window.render({
 *   title: 'Support Chat',
 *   subtitle: 'Online',
 *   avatar: 'https://cdn.example.com/bot.png',
 *   onClose: () => handleClose(),
 *   onNewConversation: () => handleNew(),
 * });
 * document.body.appendChild(el);
 *
 * window.open();   // Slide in
 * window.close();  // Slide out
 * window.destroy();
 * ```
 */
export class WindowRenderer {
  /** The outer window container element */
  private window: HTMLElement | null = null;

  /** The header bar element */
  private header: HTMLElement | null = null;

  /** The scrollable message body area */
  private body: HTMLElement | null = null;

  /** The footer area for input */
  private footer: HTMLElement | null = null;

  /** Title text element reference for dynamic updates */
  private titleElement: HTMLElement | null = null;

  /** Subtitle text element reference for dynamic updates */
  private subtitleElement: HTMLElement | null = null;

  /** Loading overlay element */
  private loadingOverlay: HTMLElement | null = null;

  /** Track whether the window is currently visible */
  private isVisible = false;

  /**
   * Creates a new WindowRenderer instance.
   *
   * @param styles - Optional visual style overrides for the window container
   * @param headerStyles - Optional visual style overrides for the header bar
   * @param i18n - Internationalization manager for translated labels
   * @param shadowRoot - Optional shadow root for injecting animation styles
   *   inside the shadow boundary instead of document.head
   */
  constructor(
    private styles: WindowStyles | undefined,
    private headerStyles: HeaderStyles | undefined,
    private i18n: I18nManager,
    private shadowRoot?: ShadowRoot
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the complete chat window with header, body, footer, and
   * optional "Powered by Nevent" branding sections.
   *
   * The window starts hidden (display: none, opacity: 0). Call `open()` to
   * animate it into view.
   *
   * @param options - Configuration for the window content
   * @param options.title - Header title text (e.g., bot name)
   * @param options.subtitle - Optional subtitle (e.g., "Online", "Connecting...")
   * @param options.avatar - Optional avatar image URL
   * @param options.onClose - Callback when the close button is clicked
   * @param options.onNewConversation - Callback when the new conversation button is clicked
   * @param options.showBranding - Whether to render the "Powered by Nevent" footer.
   *   Defaults to `true`. White-label clients set this to `false`.
   * @param options.tenantId - Tenant identifier for UTM attribution tracking
   * @param options.tracker - Optional analytics tracker for branding click events
   * @returns The chat window container element
   */
  render(options: {
    title: string;
    subtitle?: string;
    avatar?: string;
    onClose: () => void;
    onNewConversation: () => void;
    showBranding?: boolean;
    tenantId?: string;
    tracker?: ChatbotTracker | null;
  }): HTMLElement {
    // Window container — ARIA dialog with labelled-by pointing to the title element.
    // We use a stable ID so aria-labelledby works when title updates dynamically.
    const dialogTitleId = 'nevent-chatbot-dialog-title';
    this.window = document.createElement('div');
    this.window.className = 'nevent-chatbot-window';
    this.window.setAttribute('role', 'dialog');
    // aria-labelledby references the visible title element (preferred over aria-label)
    this.window.setAttribute('aria-labelledby', dialogTitleId);
    this.window.setAttribute('aria-modal', 'true');
    this.applyWindowStyles();

    // Header
    this.header = this.createHeader(options);
    this.window.appendChild(this.header);

    // Body (message list area)
    this.body = document.createElement('div');
    this.body.className = 'nevent-chatbot-body';
    this.applyBodyStyles();
    this.window.appendChild(this.body);

    // Loading overlay (initially hidden)
    this.loadingOverlay = this.createLoadingOverlay();
    this.body.appendChild(this.loadingOverlay);

    // Footer (input area)
    this.footer = document.createElement('div');
    this.footer.className = 'nevent-chatbot-footer';
    this.applyFooterStyles();
    this.window.appendChild(this.footer);

    // Branding footer ("Powered by Nevent")
    // Rendered below the input footer, just above the window border.
    // Visible by default; white-label clients disable it via showBranding: false.
    if (options.showBranding !== false) {
      const branding = this.createBrandingFooter(
        options.tenantId ?? '',
        options.tracker ?? null
      );
      this.window.appendChild(branding);
    }

    return this.window;
  }

  /**
   * Returns the body container element where messages should be inserted.
   *
   * @returns The scrollable body element, or throws if render() was not called
   * @throws {Error} If render() has not been called yet
   */
  getBody(): HTMLElement {
    if (!this.body) {
      throw new Error(
        'WindowRenderer: render() must be called before getBody()'
      );
    }
    return this.body;
  }

  /**
   * Returns the footer container element where the input should be inserted.
   *
   * @returns The footer element, or throws if render() was not called
   * @throws {Error} If render() has not been called yet
   */
  getFooter(): HTMLElement {
    if (!this.footer) {
      throw new Error(
        'WindowRenderer: render() must be called before getFooter()'
      );
    }
    return this.footer;
  }

  /**
   * Opens the chat window with a slide-in animation.
   *
   * Transitions from translateY(20px) + opacity(0) to translateY(0) + opacity(1)
   * over 200ms with ease-out timing.
   */
  open(): void {
    if (!this.window || this.isVisible) return;

    this.isVisible = true;
    this.window.style.display = 'flex';

    // Force reflow before transitioning
    void this.window.offsetHeight;

    this.window.style.opacity = '1';
    this.window.style.transform = 'translateY(0)';
  }

  /**
   * Closes the chat window with a slide-out animation.
   *
   * Transitions to translateY(20px) + opacity(0) over 150ms with ease-in timing,
   * then sets display to 'none' after the animation completes.
   */
  close(): void {
    if (!this.window || !this.isVisible) return;

    this.isVisible = false;
    this.window.style.opacity = '0';
    this.window.style.transform = 'translateY(20px)';

    setTimeout(() => {
      if (this.window && !this.isVisible) {
        this.window.style.display = 'none';
      }
    }, 150);
  }

  /**
   * Updates the header title and optional subtitle text dynamically.
   *
   * @param title - New title text
   * @param subtitle - Optional new subtitle text (pass undefined to hide)
   */
  updateHeader(title: string, subtitle?: string): void {
    if (this.titleElement) {
      this.titleElement.textContent = title;
      // aria-labelledby already points to this element; no extra aria-label needed.
    }
    if (this.subtitleElement) {
      this.subtitleElement.textContent = subtitle ?? '';
      this.subtitleElement.style.display = subtitle ? 'block' : 'none';
    }
  }

  /**
   * Returns all currently focusable elements within the chat window.
   *
   * Used by the focus trap in ChatbotWidget to cycle Tab/Shift+Tab within
   * the dialog when it is open, per WCAG 2.1 SC 2.1.2 (No Keyboard Trap).
   *
   * @returns Ordered array of focusable HTMLElement instances
   */
  getFocusableElements(): HTMLElement[] {
    if (!this.window) return [];

    const selector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(
      this.window.querySelectorAll<HTMLElement>(selector)
    ).filter(
      (el) =>
        !el.closest('[style*="display: none"]') &&
        !el.closest('[style*="display:none"]')
    );
  }

  /**
   * Shows or hides a loading state (spinner) in the body area.
   *
   * @param loading - Whether to show the loading overlay
   */
  setLoading(loading: boolean): void {
    if (!this.loadingOverlay) return;

    this.loadingOverlay.style.display = loading ? 'flex' : 'none';
  }

  /**
   * Removes the window from the DOM and cleans up all references.
   */
  destroy(): void {
    this.window?.remove();
    this.window = null;
    this.header = null;
    this.body = null;
    this.footer = null;
    this.titleElement = null;
    this.subtitleElement = null;
    this.loadingOverlay = null;
    this.isVisible = false;
  }

  // --------------------------------------------------------------------------
  // Private: Header Creation
  // --------------------------------------------------------------------------

  /**
   * Creates the header bar with avatar, title, subtitle, and action buttons.
   *
   * @param options - Header content configuration
   * @returns The header element
   */
  private createHeader(options: {
    title: string;
    subtitle?: string;
    avatar?: string;
    onClose: () => void;
    onNewConversation: () => void;
  }): HTMLElement {
    const header = document.createElement('div');
    header.className = 'nevent-chatbot-header';
    this.applyHeaderStyles(header);

    // Left side: avatar + text
    const headerLeft = document.createElement('div');
    Object.assign(headerLeft.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flex: '1',
      minWidth: '0',
    });

    // Avatar
    const showAvatar = this.headerStyles?.showAvatar !== false;
    if (showAvatar && options.avatar) {
      const avatar = document.createElement('img');
      avatar.className = 'nevent-chatbot-header-avatar';
      avatar.src = options.avatar;
      avatar.alt = options.title;
      Object.assign(avatar.style, {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: '0',
      });
      avatar.onerror = () => {
        avatar.style.display = 'none';
      };
      headerLeft.appendChild(avatar);
    }

    // Text container
    const textContainer = document.createElement('div');
    Object.assign(textContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      minWidth: '0',
    });

    // Title — ID must match aria-labelledby on the dialog container.
    this.titleElement = document.createElement('span');
    this.titleElement.id = 'nevent-chatbot-dialog-title';
    this.titleElement.className = 'nevent-chatbot-header-title';
    this.titleElement.textContent = options.title;
    this.applyTitleStyles(this.titleElement);
    textContainer.appendChild(this.titleElement);

    // Subtitle
    this.subtitleElement = document.createElement('span');
    this.subtitleElement.className = 'nevent-chatbot-header-subtitle';
    this.applySubtitleStyles(this.subtitleElement);
    if (!options.subtitle) {
      this.subtitleElement.style.display = 'none';
    } else {
      if (options.subtitle === this.i18n.t('statusOnline')) {
        const dot = document.createElement('span');
        dot.className = 'nevent-chatbot-status-dot';
        this.subtitleElement.appendChild(dot);
      }
      this.subtitleElement.appendChild(
        document.createTextNode(options.subtitle)
      );
    }
    textContainer.appendChild(this.subtitleElement);

    headerLeft.appendChild(textContainer);
    header.appendChild(headerLeft);

    // Right side: action buttons
    const headerRight = document.createElement('div');
    Object.assign(headerRight.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexShrink: '0',
    });

    // New conversation button
    const newConvButton = this.createHeaderButton(
      NEW_CONVERSATION_SVG,
      this.i18n.t('newConversation'),
      options.onNewConversation
    );
    headerRight.appendChild(newConvButton);

    // Close button — uses 'minimizeChat' aria-label to distinguish it from the
    // FAB bubble button (which uses 'closeChat' when the window is open).
    // This prevents duplicate aria-labels when both elements are visible, which
    // would create ambiguity for screen reader users (WCAG 2.4.6).
    const showClose = this.headerStyles?.showCloseButton !== false;
    if (showClose) {
      const closeButton = this.createHeaderButton(
        CLOSE_ICON_SVG,
        this.i18n.t('minimizeChat'),
        options.onClose
      );
      headerRight.appendChild(closeButton);
    }

    header.appendChild(headerRight);

    return header;
  }

  /**
   * Creates an icon button for the header (close, new conversation).
   *
   * @param iconSvg - SVG markup for the button icon
   * @param ariaLabel - Accessible label for the button
   * @param onClick - Click event handler
   * @returns The button element
   */
  private createHeaderButton(
    iconSvg: string,
    ariaLabel: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nevent-chatbot-header-button';
    button.setAttribute('aria-label', ariaLabel);
    button.innerHTML = iconSvg;

    const textColor = this.headerStyles?.textColor ?? '#ffffff';

    Object.assign(button.style, {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '6px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: textColor,
      opacity: '0.8',
      transition: 'opacity 0.15s ease, background-color 0.15s ease',
      lineHeight: '0',
    });

    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
      button.style.backgroundColor = 'rgba(255,255,255,0.15)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.opacity = '0.8';
      button.style.backgroundColor = 'transparent';
    });
    // Focus visibility is handled by CSS :focus-visible rules in CSSGenerator.
    // No inline JS focus/blur handlers needed — they interfere with :focus-visible
    // by setting outline:none on blur which overrides the CSS selector (WCAG 2.4.7).
    button.addEventListener('click', onClick);

    return button;
  }

  // --------------------------------------------------------------------------
  // Private: Branding Footer
  // --------------------------------------------------------------------------

  /**
   * Creates the "Powered by Nevent" branding footer element.
   *
   * The branding links to nevent.es with UTM parameters for attribution:
   * - `utm_source=chatbot_widget` - identifies the traffic source as the chatbot
   * - `utm_medium=powered_by` - identifies the medium as the branding link
   * - `utm_campaign=plg` - Product-Led Growth campaign
   * - `utm_content={tenantId}` - identifies which tenant's widget generated the click
   *
   * A click event is tracked via the analytics tracker when provided.
   *
   * @param tenantId - Tenant ID for UTM content attribution
   * @param tracker - Optional analytics tracker for click event tracking
   * @returns The branding footer element
   */
  private createBrandingFooter(
    tenantId: string,
    tracker: ChatbotTracker | null
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-chatbot-branding';

    const utmParams = new URLSearchParams({
      utm_source: 'chatbot_widget',
      utm_medium: 'powered_by',
      utm_campaign: 'plg',
      utm_content: tenantId,
    });

    const link = document.createElement('a');
    link.href = `https://nevent.ai?${utmParams.toString()}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'nevent-chatbot-branding-link';
    link.setAttribute('aria-label', this.i18n.t('brandingAriaLabel'));

    // SVG icon (lightning bolt)
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = BRANDING_ICON_SVG;
    iconSpan.style.display = 'inline-flex';
    iconSpan.style.alignItems = 'center';
    link.appendChild(iconSpan);

    // "Powered by " text node
    const textNode = document.createTextNode(
      `${this.i18n.t('poweredBy').replace('Nevent', '').trim()} `
    );
    link.appendChild(textNode);

    // "Nevent" in bold
    const strong = document.createElement('strong');
    strong.textContent = 'Nevent';
    link.appendChild(strong);

    // Track branding clicks for attribution analytics
    link.addEventListener('click', () => {
      if (tracker) {
        tracker.trackBrandingClick(window.location.href);
      }
    });

    container.appendChild(link);
    return container;
  }

  // --------------------------------------------------------------------------
  // Private: Loading Overlay
  // --------------------------------------------------------------------------

  /**
   * Creates the loading overlay with a CSS spinner.
   * Displayed centered within the body area.
   *
   * @returns The loading overlay element (initially hidden)
   */
  private createLoadingOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'nevent-chatbot-loading';
    // role="status" + aria-live="polite" announces loading state to screen readers.
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', this.i18n.t('statusConnecting'));

    Object.assign(overlay.style, {
      display: 'none',
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.8)',
      zIndex: '1',
    });

    // Spinner element
    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
      width: '32px',
      height: '32px',
      border: '3px solid #e0e0e0',
      // Use explicit backgroundColor if set, otherwise fall back to CSS custom property value
      borderTopColor:
        this.headerStyles?.backgroundColor ??
        'var(--nev-cb-header-bg, #007bff)',
      borderRadius: '50%',
      animation: 'nevent-chatbot-spin 0.8s linear infinite',
    });

    // Inject spinner keyframes into the shadow root (or document.head as fallback).
    // ShadowRoot does not have getElementById, so use querySelector by id.
    const animTarget: ParentNode = this.shadowRoot ?? document.head;
    const animParent: Node = this.shadowRoot ?? document.head;
    if (!animTarget.querySelector('#nevent-chatbot-spin-animation')) {
      const style = document.createElement('style');
      style.id = 'nevent-chatbot-spin-animation';
      style.textContent = `@keyframes nevent-chatbot-spin { to { transform: rotate(360deg); } }`;
      animParent.appendChild(style);
    }

    overlay.appendChild(spinner);
    return overlay;
  }

  // --------------------------------------------------------------------------
  // Private: Style Application
  // --------------------------------------------------------------------------

  /**
   * Applies styles to the outer window container.
   * Handles fixed positioning, dimensions, shadow, border radius, and
   * the initial hidden state for the open animation.
   */
  private applyWindowStyles(): void {
    if (!this.window) return;

    const s = this.styles;
    const width = s?.width ?? 380;
    const height = s?.height ?? 520;
    const borderRadius = s?.borderRadius ?? 16;
    const shadow = s?.shadow ?? '0 8px 32px rgba(0,0,0,0.15)';
    const bgColor = s?.backgroundColor ?? '#ffffff';
    const bottom = s?.bottom ?? 90;
    const sideOffset = s?.right ?? 20;

    Object.assign(this.window.style, {
      position: 'fixed',
      bottom: `${bottom}px`,
      right: `${sideOffset}px`,
      width: `${width}px`,
      maxHeight: `${height}px`,
      height: `${height}px`,
      backgroundColor: bgColor,
      borderRadius: `${borderRadius}px`,
      boxShadow: shadow,
      display: 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: '9998',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      // Initial state for open animation
      opacity: '0',
      transform: 'translateY(20px)',
      transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
    });
  }

  /**
   * Applies styles to the header bar section.
   *
   * @param header - The header element to style
   */
  private applyHeaderStyles(header: HTMLElement): void {
    const h = this.headerStyles;
    const height = h?.height ?? 64;

    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      height: `${height}px`,
      minHeight: `${height}px`,
      // Only apply backgroundColor as inline style when explicitly configured.
      // When not set, the CSS class rule uses var(--nev-cb-header-bg) which
      // derives from var(--nev-cb-color-primary), respecting brandColor theming.
      ...(h?.backgroundColor ? { backgroundColor: h.backgroundColor } : {}),
      borderRadius: `${this.styles?.borderRadius ?? 16}px ${this.styles?.borderRadius ?? 16}px 0 0`,
      flexShrink: '0',
    });
  }

  /**
   * Applies styles to the header title text.
   *
   * @param el - The title span element
   */
  private applyTitleStyles(el: HTMLElement): void {
    const h = this.headerStyles;

    Object.assign(el.style, {
      color: h?.textColor ?? '#ffffff',
      fontSize: h?.fontSize ?? '16px',
      fontWeight: '600',
      lineHeight: '1.3',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });

    if (h?.font?.family) {
      el.style.fontFamily = `'${h.font.family}', -apple-system, BlinkMacSystemFont, sans-serif`;
    }
  }

  /**
   * Applies styles to the header subtitle text.
   *
   * @param el - The subtitle span element
   */
  private applySubtitleStyles(el: HTMLElement): void {
    const h = this.headerStyles;

    Object.assign(el.style, {
      color: h?.subtitleColor ?? 'rgba(255,255,255,0.8)',
      fontSize: '12px',
      lineHeight: '1.3',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  }

  /**
   * Applies styles to the scrollable body/message area.
   */
  private applyBodyStyles(): void {
    if (!this.body) return;

    Object.assign(this.body.style, {
      flex: '1',
      overflowY: 'auto',
      overflowX: 'hidden',
      position: 'relative',
      backgroundColor: this.styles?.backgroundColor ?? '#ffffff',
    });
  }

  /**
   * Applies styles to the footer/input area.
   */
  private applyFooterStyles(): void {
    if (!this.footer) return;

    Object.assign(this.footer.style, {
      borderTop: '1px solid #e8e8e8',
      flexShrink: '0',
      backgroundColor: this.styles?.backgroundColor ?? '#ffffff',
      borderRadius: `0 0 ${this.styles?.borderRadius ?? 16}px ${this.styles?.borderRadius ?? 16}px`,
    });
  }
}
