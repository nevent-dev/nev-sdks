/**
 * RichContentRenderer - Rich message content renderer for the chatbot widget
 *
 * Renders structured rich content types beyond plain text bubbles:
 * - **Card**: Visual block with an optional header image, title, description,
 *   and a row of action buttons at the bottom.
 * - **Carousel**: Horizontally-scrollable sequence of cards with optional
 *   prev/next navigation arrows and keyboard arrow-key support.
 * - **Image**: Standalone image with lazy loading, error fallback, and
 *   click-to-open-in-new-tab behaviour.
 * - **ButtonGroup**: Vertical stack of action buttons (url, postback, phone).
 *
 * Security model:
 * - All image URLs are validated via `MessageSanitizer.isAllowedImageUrl()` —
 *   only `https:` scheme is accepted.
 * - Title and description text is HTML-escaped via `MessageSanitizer.escapeHtml()`.
 * - Button labels are HTML-escaped.
 * - Button URLs are validated; `tel:` is accepted only for `phone` type buttons.
 * - `postback` buttons never navigate; they fire the `onAction` callback.
 *
 * @remarks
 * This renderer has no DOM side effects — every method returns a standalone
 * `HTMLElement` that the caller appends wherever needed.  The caller is
 * responsible for lifecycle management (removing the element on clear/destroy).
 */

import type { RichContent, ActionButton, ActionButtonType } from '../../types';
import { I18nManager } from '../i18n-manager';
import { MessageSanitizer } from '../message-sanitizer';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of buttons rendered in a ButtonGroup (excess is truncated). */
const MAX_BUTTON_GROUP_BUTTONS = 5;

/** Fixed width (px) of each card inside a carousel. */
const CAROUSEL_CARD_WIDTH = 260;

/** SVG icon for external link (url) action buttons. */
const ICON_URL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

/** SVG icon for postback (send-message) action buttons. */
const ICON_POSTBACK = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

/** SVG icon for phone (call) action buttons. */
const ICON_PHONE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

/** SVG icon for copy action buttons. */
const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/** SVG for broken-image fallback placeholder. */
const ICON_BROKEN_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

/** Chevron-left SVG for carousel nav button. */
const ICON_CHEVRON_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;

/** Chevron-right SVG for carousel nav button. */
const ICON_CHEVRON_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

// ============================================================================
// RichContentRenderer Class
// ============================================================================

/**
 * Renders rich message content (cards, carousels, images, button groups) into
 * DOM elements ready for insertion into the chatbot message list.
 *
 * @example
 * ```typescript
 * const renderer = new RichContentRenderer(MessageSanitizer, i18n);
 *
 * const cardEl = renderer.render(cardContent, (action) => {
 *   if (action.type === 'postback') sendMessage(action.value);
 * });
 * bubbleElement.appendChild(cardEl);
 * ```
 */
export class RichContentRenderer {
  /**
   * Creates a new RichContentRenderer.
   *
   * @param sanitizer - Static MessageSanitizer class used for URL validation
   *   and HTML escaping.  Injected for testability.
   * @param i18n - Internationalization manager for localized accessible labels.
   */
  constructor(
    private readonly sanitizer: typeof MessageSanitizer,
    private readonly i18n: I18nManager
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders rich content based on its `type` field.
   *
   * Delegates to the appropriate specific renderer method.  If the type is
   * unrecognised an empty `<div>` is returned so that the caller never
   * receives `null` or `undefined`.
   *
   * @param content - The rich content payload to render.
   * @param onAction - Optional callback invoked when an {@link ActionButton}
   *   is activated.  Receives the full `ActionButton` object.
   * @returns A fully-constructed `HTMLElement` for the given content type.
   */
  render(
    content: RichContent,
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    switch (content.type) {
      case 'card':
        return this.renderCard(content, onAction);
      case 'carousel':
        return this.renderCarousel(content, onAction);
      case 'image':
        return this.renderImage(content);
      case 'button_group':
        return this.renderButtonGroup(content, onAction);
      default:
        // Graceful fallback: return an empty container so rendering never breaks.
        return document.createElement('div');
    }
  }

  /**
   * Renders a single card component.
   *
   * Structure:
   * ```
   * .nevent-chatbot-card
   *   [.nevent-chatbot-card-image]   ← optional header image
   *   .nevent-chatbot-card-body
   *     [.nevent-chatbot-card-title]       ← optional
   *     [.nevent-chatbot-card-description] ← optional, max 3 lines
   *   [.nevent-chatbot-card-actions]  ← optional button row
   *     .nevent-chatbot-card-action × n
   * ```
   *
   * @param content - Card-type `RichContent` payload.
   * @param onAction - Callback for button interactions.
   * @returns Card `HTMLElement`.
   */
  renderCard(
    content: RichContent,
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'nevent-chatbot-card';

    // ---------- Image ----------
    if (content.imageUrl) {
      const imgWrapper = this.buildCardImage(
        content.imageUrl,
        content.alt ?? content.title ?? ''
      );
      card.appendChild(imgWrapper);
    }

    // ---------- Body ----------
    const hasBody = content.title || content.description;
    if (hasBody) {
      const body = document.createElement('div');
      body.className = 'nevent-chatbot-card-body';

      if (content.title) {
        const title = document.createElement('div');
        title.className = 'nevent-chatbot-card-title';
        title.textContent = content.title; // textContent auto-escapes
        body.appendChild(title);
      }

      if (content.description) {
        const desc = document.createElement('div');
        desc.className = 'nevent-chatbot-card-description';
        desc.textContent = content.description;
        body.appendChild(desc);
      }

      card.appendChild(body);
    }

    // ---------- Actions ----------
    if (content.buttons && content.buttons.length > 0) {
      const actions = this.buildCardActions(content.buttons, onAction);
      card.appendChild(actions);
    }

    return card;
  }

  /**
   * Renders a carousel: a horizontally-scrollable row of card elements with
   * optional prev/next navigation arrows and keyboard arrow-key support.
   *
   * If `content.items` is empty or absent, an empty carousel wrapper is
   * returned (the caller may choose to skip rendering it).
   *
   * Accessibility:
   * - The scroll region has `role="region"` + `aria-label`.
   * - Arrow buttons have descriptive `aria-label` values.
   * - Left/Right arrow keys navigate the carousel when focus is inside.
   *
   * @param content - Carousel-type `RichContent` with `items` array.
   * @param onAction - Callback forwarded to each card's action buttons.
   * @returns Carousel wrapper `HTMLElement`.
   */
  renderCarousel(
    content: RichContent,
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'nevent-chatbot-carousel-wrapper';

    const items = content.items ?? [];
    if (items.length === 0) return wrapper;

    // ---------- Scroll track ----------
    const track = document.createElement('div');
    track.className = 'nevent-chatbot-carousel';
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', this.getCarouselAriaLabel());

    items.forEach((item) => {
      const card = this.renderCard(item, onAction);
      // Override the card width for carousel items via an inline style so that
      // the standard card max-width (280 px) is replaced with the carousel
      // fixed-width (260 px).
      card.style.width = `${CAROUSEL_CARD_WIDTH}px`;
      card.style.flexShrink = '0';
      track.appendChild(card);
    });

    // ---------- Navigation arrows ----------
    const prevBtn = this.buildCarouselNavButton('prev');
    const nextBtn = this.buildCarouselNavButton('next');

    // Scroll handler: move by one card-width + gap on each click
    const scrollStep = CAROUSEL_CARD_WIDTH + 12;

    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -scrollStep, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: scrollStep, behavior: 'smooth' });
    });

    // Update arrow visibility on scroll
    const updateNavVisibility = () => {
      prevBtn.style.display = track.scrollLeft > 0 ? 'flex' : 'none';
      const maxScroll = track.scrollWidth - track.clientWidth;
      nextBtn.style.display =
        track.scrollLeft < maxScroll - 4 ? 'flex' : 'none';
    };

    track.addEventListener('scroll', updateNavVisibility, { passive: true });

    // Keyboard navigation: ArrowLeft / ArrowRight when focus is within carousel
    track.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        track.scrollBy({ left: -scrollStep, behavior: 'smooth' });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        track.scrollBy({ left: scrollStep, behavior: 'smooth' });
      }
    });

    wrapper.appendChild(prevBtn);
    wrapper.appendChild(track);
    wrapper.appendChild(nextBtn);

    // Initialise nav visibility after the element is in the DOM via rAF
    requestAnimationFrame(() => {
      updateNavVisibility();
    });

    return wrapper;
  }

  /**
   * Renders a standalone image component.
   *
   * Security: only `https:` image URLs are rendered; other URLs are silently
   * rejected and the broken-image placeholder is shown instead.
   *
   * Features:
   * - Lazy loading via `loading="lazy"`.
   * - Grey placeholder background while loading.
   * - Broken-image SVG fallback on load error.
   * - Click opens the image in a new tab (for accessible image viewing).
   *
   * @param content - Image-type `RichContent` with `url` and optional `alt`.
   * @returns Image container `HTMLElement`.
   */
  renderImage(content: RichContent): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-chatbot-rich-image-wrapper';

    const rawUrl = content.url ?? '';

    // Security: only https image URLs are permitted
    const isValidUrl = rawUrl.trim().startsWith('https://');

    if (!isValidUrl) {
      // Show broken image placeholder immediately
      container.appendChild(this.buildBrokenImagePlaceholder());
      return container;
    }

    const img = document.createElement('img');
    img.className = 'nevent-chatbot-rich-image';
    img.src = rawUrl;
    img.alt = content.alt ?? '';
    img.loading = 'lazy';
    img.decoding = 'async';

    // Click: open in new tab
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    });
    img.setAttribute(
      'aria-label',
      content.alt ? content.alt : this.getOpenImageLabel()
    );
    img.setAttribute('role', 'link');
    img.setAttribute('tabindex', '0');

    // Keyboard activation
    img.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.open(rawUrl, '_blank', 'noopener,noreferrer');
      }
    });

    // Error fallback
    img.addEventListener('error', () => {
      container.innerHTML = '';
      container.appendChild(this.buildBrokenImagePlaceholder());
    });

    container.appendChild(img);
    return container;
  }

  /**
   * Renders a vertical group of action buttons.
   *
   * At most {@link MAX_BUTTON_GROUP_BUTTONS} buttons are rendered; excess items
   * are silently truncated to keep the UI clean.
   *
   * Each button variant:
   * - `url` — opens `value` in a new tab (external link icon)
   * - `postback` — fires `onAction` callback (send icon)
   * - `phone` — creates a `tel:` link (phone icon)
   * - `copy` — copies `value` to clipboard (copy icon)
   *
   * @param content - ButtonGroup-type `RichContent` with `buttons` array.
   * @param onAction - Callback invoked when a `postback` button is clicked.
   * @returns Button group `HTMLElement`.
   */
  renderButtonGroup(
    content: RichContent,
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'nevent-chatbot-button-group';

    const buttons = (content.buttons ?? []).slice(0, MAX_BUTTON_GROUP_BUTTONS);

    buttons.forEach((btn) => {
      const buttonEl = this.buildActionButton(
        btn,
        onAction,
        /* isCardAction */ false
      );
      group.appendChild(buttonEl);
    });

    return group;
  }

  // --------------------------------------------------------------------------
  // Private: Card internals
  // --------------------------------------------------------------------------

  /**
   * Builds the card image element with placeholder and error states.
   *
   * Uses `sanitizer.escapeHtml` to produce a safe value for the `alt` attribute
   * when assigning via `setAttribute`.  The `src` URL is validated against the
   * `https:` scheme only (matching {@link MessageSanitizer}'s image policy).
   *
   * @param url - The image URL (must start with `https://`).
   * @param altText - Alternative text for accessibility.
   * @returns Image wrapper div or broken-image placeholder if URL is invalid.
   */
  private buildCardImage(url: string, altText: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'nevent-chatbot-card-image-wrapper';

    // Security guard — only https image URLs (same policy as MessageSanitizer.isAllowedSrc)
    if (!url.trim().startsWith('https://')) {
      wrapper.appendChild(this.buildBrokenImagePlaceholder());
      return wrapper;
    }

    // Use sanitizer.escapeHtml to produce a safe alt attribute value when
    // the alt text contains characters that could break HTML attribute context.
    const safeAlt = this.sanitizer.escapeHtml(altText);

    const img = document.createElement('img');
    img.className = 'nevent-chatbot-card-image';
    img.src = url;
    // Use the pre-escaped alt text; setting via setAttribute uses the HTML-escaped
    // value produced by sanitizer.escapeHtml() to prevent attribute injection.
    img.setAttribute('alt', safeAlt);
    img.loading = 'lazy';
    img.decoding = 'async';

    img.addEventListener('error', () => {
      wrapper.innerHTML = '';
      wrapper.appendChild(this.buildBrokenImagePlaceholder());
    });

    wrapper.appendChild(img);
    return wrapper;
  }

  /**
   * Builds the card actions row containing one button per `ActionButton`.
   *
   * In cards, buttons span the full width and have a top-border separator
   * between them.
   *
   * @param buttons - Array of action button definitions.
   * @param onAction - Callback forwarded to each button.
   * @returns Actions container element.
   */
  private buildCardActions(
    buttons: ActionButton[],
    onAction?: (action: ActionButton) => void
  ): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'nevent-chatbot-card-actions';

    buttons.forEach((btn, idx) => {
      if (idx > 0) {
        // Separator between buttons
        const sep = document.createElement('div');
        sep.className = 'nevent-chatbot-card-action-separator';
        actions.appendChild(sep);
      }
      const buttonEl = this.buildActionButton(
        btn,
        onAction,
        /* isCardAction */ true
      );
      actions.appendChild(buttonEl);
    });

    return actions;
  }

  // --------------------------------------------------------------------------
  // Private: Shared action button builder
  // --------------------------------------------------------------------------

  /**
   * Builds a single action button element for either a card or a button group.
   *
   * The rendered element is always a `<button>` or `<a>` depending on type:
   * - `url` → `<a href="..." target="_blank" rel="noopener noreferrer">`
   * - `phone` → `<a href="tel:...">`
   * - `postback` → `<button>` (fires `onAction`)
   * - `copy` → `<button>` (copies to clipboard)
   *
   * @param btn - The action button definition.
   * @param onAction - Postback/copy callback.
   * @param isCardAction - When `true`, card-specific CSS class is applied.
   * @returns Interactive button or anchor element.
   */
  private buildActionButton(
    btn: ActionButton,
    onAction: ((action: ActionButton) => void) | undefined,
    isCardAction: boolean
  ): HTMLElement {
    const baseClass = isCardAction
      ? 'nevent-chatbot-card-action'
      : 'nevent-chatbot-action-button';

    const safeLabel = btn.label; // will be set as textContent — auto-escaped

    switch (btn.type as ActionButtonType) {
      case 'url': {
        const safeHref = this.sanitizeUrl(btn.value);
        const anchor = document.createElement('a');
        anchor.className = baseClass;
        anchor.href = safeHref ?? '#';
        anchor.rel = 'noopener noreferrer';
        anchor.target = '_blank';
        if (!safeHref) anchor.removeAttribute('href');
        this.populateButtonContent(anchor, safeLabel, ICON_URL);
        return anchor;
      }

      case 'phone': {
        const safePhone = this.sanitizePhoneNumber(btn.value);
        const anchor = document.createElement('a');
        anchor.className = baseClass;
        if (safePhone) {
          anchor.href = `tel:${safePhone}`;
        }
        this.populateButtonContent(anchor, safeLabel, ICON_PHONE);
        return anchor;
      }

      case 'postback': {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = baseClass;
        this.populateButtonContent(button, safeLabel, ICON_POSTBACK);

        button.addEventListener('click', () => {
          onAction?.(btn);
        });
        return button;
      }

      case 'copy': {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = baseClass;
        this.populateButtonContent(button, safeLabel, ICON_COPY);

        button.addEventListener('click', () => {
          void navigator.clipboard?.writeText(btn.value).catch(() => {
            // Clipboard API may be unavailable in some embedder contexts; silently ignore.
          });
          onAction?.(btn);
        });
        return button;
      }

      default: {
        // Unknown type: render as disabled button to avoid invisible elements
        const button = document.createElement('button');
        button.type = 'button';
        button.className = baseClass;
        button.disabled = true;
        button.textContent = safeLabel;
        return button;
      }
    }
  }

  /**
   * Sets the inner content of a button element: an icon span + label span.
   *
   * Using separate spans allows for consistent flex layout with the icon
   * always on the left.  The label is set via `textContent` (not innerHTML)
   * to prevent XSS.
   *
   * @param el - The button or anchor element to populate.
   * @param label - Plain-text button label.
   * @param iconSvg - SVG markup string for the icon (trusted internal constant).
   */
  private populateButtonContent(
    el: HTMLElement,
    label: string,
    iconSvg: string
  ): void {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'nevent-chatbot-action-button-icon';
    iconSpan.innerHTML = iconSvg; // trusted internal SVG constant
    iconSpan.setAttribute('aria-hidden', 'true');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'nevent-chatbot-action-button-label';
    labelSpan.textContent = label; // textContent prevents XSS

    el.appendChild(iconSpan);
    el.appendChild(labelSpan);
  }

  // --------------------------------------------------------------------------
  // Private: Carousel nav builder
  // --------------------------------------------------------------------------

  /**
   * Builds a carousel navigation arrow button (prev or next).
   *
   * @param direction - `'prev'` for left arrow, `'next'` for right arrow.
   * @returns Styled `<button>` element (initially hidden for prev).
   */
  private buildCarouselNavButton(
    direction: 'prev' | 'next'
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nevent-chatbot-carousel-nav nevent-chatbot-carousel-nav--${direction}`;
    btn.setAttribute('aria-label', this.getCarouselNavAriaLabel(direction));
    btn.innerHTML =
      direction === 'prev' ? ICON_CHEVRON_LEFT : ICON_CHEVRON_RIGHT;

    // Start hidden; visibility is managed by updateNavVisibility
    btn.style.display = 'none';

    return btn;
  }

  // --------------------------------------------------------------------------
  // Private: Broken image placeholder
  // --------------------------------------------------------------------------

  /**
   * Builds a placeholder element shown when an image fails to load or has
   * an invalid URL.
   *
   * @returns Placeholder `HTMLElement` with broken-image icon.
   */
  private buildBrokenImagePlaceholder(): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'nevent-chatbot-image-broken';
    placeholder.setAttribute('aria-label', this.getBrokenImageLabel());
    placeholder.innerHTML = ICON_BROKEN_IMAGE;
    return placeholder;
  }

  // --------------------------------------------------------------------------
  // Private: URL / phone sanitisation
  // --------------------------------------------------------------------------

  /**
   * Sanitizes a URL for use in an `<a href>`.
   *
   * Only `https:` and `http:` absolute URLs are permitted.
   * Relative paths, `javascript:`, `data:`, and other schemes are rejected.
   *
   * @param value - Raw URL string from the `ActionButton.value` field.
   * @returns Sanitized URL string, or `null` if the URL is invalid/unsafe.
   */
  private sanitizeUrl(value: string): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();

    // Reject dangerous schemes (case-insensitive, handles obfuscation)
    // eslint-disable-next-line no-control-regex
    const normalized = trimmed.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
    if (/^(javascript|data|vbscript):/.test(normalized)) return null;

    // Only allow https:// and http:// absolute URLs for action buttons
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    return null;
  }

  /**
   * Sanitizes a phone number for use in a `tel:` href.
   *
   * Strips all characters except digits, `+`, `(`, `)`, `-`, and spaces.
   * Returns `null` if the cleaned value is empty.
   *
   * @param value - Raw phone value from the `ActionButton.value` field.
   * @returns Cleaned phone string, or `null` if empty after sanitisation.
   */
  private sanitizePhoneNumber(value: string): string | null {
    if (!value || typeof value !== 'string') return null;
    // Allow only safe characters in tel: links
    const cleaned = value.replace(/[^\d+\-().# ]/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  // --------------------------------------------------------------------------
  // Private: Localised accessible labels
  // --------------------------------------------------------------------------

  /**
   * Returns a localised aria-label for the carousel scroll region.
   *
   * @returns Localised carousel label string.
   */
  private getCarouselAriaLabel(): string {
    const locale = this.i18n.getLocale();
    const labels: Record<string, string> = {
      es: 'Carrusel de tarjetas',
      en: 'Card carousel',
      ca: 'Carrusel de targetes',
      pt: 'Carrossel de cartões',
    };
    return labels[locale] ?? 'Card carousel';
  }

  /**
   * Returns a localised aria-label for a carousel nav button.
   *
   * @param direction - `'prev'` or `'next'`.
   * @returns Localised nav button label string.
   */
  private getCarouselNavAriaLabel(direction: 'prev' | 'next'): string {
    const locale = this.i18n.getLocale();

    if (direction === 'prev') {
      const labels: Record<string, string> = {
        es: 'Tarjeta anterior',
        en: 'Previous card',
        ca: 'Targeta anterior',
        pt: 'Cartão anterior',
      };
      return labels[locale] ?? 'Previous card';
    }

    const labels: Record<string, string> = {
      es: 'Tarjeta siguiente',
      en: 'Next card',
      ca: 'Targeta següent',
      pt: 'Próximo cartão',
    };
    return labels[locale] ?? 'Next card';
  }

  /**
   * Returns a localised aria-label for clicking on a standalone image.
   *
   * @returns Localised "open image" label string.
   */
  private getOpenImageLabel(): string {
    const locale = this.i18n.getLocale();
    const labels: Record<string, string> = {
      es: 'Abrir imagen en nueva pestaña',
      en: 'Open image in new tab',
      ca: 'Obrir imatge en una nova pestanya',
      pt: 'Abrir imagem em nova aba',
    };
    return labels[locale] ?? 'Open image in new tab';
  }

  /**
   * Returns a localised accessible description for the broken-image placeholder.
   *
   * @returns Localised broken-image label string.
   */
  private getBrokenImageLabel(): string {
    const locale = this.i18n.getLocale();
    const labels: Record<string, string> = {
      es: 'Imagen no disponible',
      en: 'Image not available',
      ca: 'Imatge no disponible',
      pt: 'Imagem não disponível',
    };
    return labels[locale] ?? 'Image not available';
  }
}
