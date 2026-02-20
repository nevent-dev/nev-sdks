/**
 * InputRenderer - Message input area component
 *
 * Renders the text input field and send button at the bottom of the chat window.
 * Handles user input, auto-growing textarea, keyboard shortcuts, and input
 * state management (disabled during sending).
 *
 * Features:
 * - Auto-growing textarea (min 1 line, max 4 lines)
 * - Send button with SVG arrow icon (circular, aligned right)
 * - Enter to send, Shift+Enter for new line
 * - Send button disabled when textarea is empty, primary color when text present
 * - Configurable placeholder text from config or i18n
 * - ARIA labels on textarea and button for accessibility
 * - Focus-visible outline for keyboard navigation
 * - Optional character count indicator (when maxLength is defined)
 * - Disabled state during message sending
 *
 * @remarks
 * The input area fires a callback when the user submits a message.
 * It does not directly interact with the API. The consumer is responsible
 * for clearing the input and re-enabling it after the message is sent.
 */

import type { InputStyles } from '../../types';
import { I18nManager } from '../i18n-manager';

// ============================================================================
// SVG Icons
// ============================================================================

/**
 * Inline SVG for the send button icon (arrow pointing up-right).
 */
const SEND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

// ============================================================================
// InputRenderer Class
// ============================================================================

/**
 * Renders and manages the message input area (textarea + send button).
 *
 * The input area sits in the chat window footer. It auto-grows as the user
 * types (up to 4 lines), sends on Enter (Shift+Enter for newlines), and
 * provides visual feedback when the input is empty or disabled.
 *
 * @example
 * ```typescript
 * const input = new InputRenderer(inputStyles, i18n);
 * const el = input.render({
 *   onSend: (text) => sendMessage(text),
 *   placeholder: 'Ask me anything...',
 * });
 * footer.appendChild(el);
 *
 * input.setDisabled(true);   // During send
 * input.clear();             // After send
 * input.setDisabled(false);  // Ready for next message
 * input.focus();
 * input.destroy();
 * ```
 */
export class InputRenderer {
  /** Outer container element for the input area */
  private container: HTMLElement | null = null;

  /** The auto-growing textarea element */
  private textarea: HTMLTextAreaElement | null = null;

  /** The circular send button */
  private sendButton: HTMLButtonElement | null = null;

  /** Callback for sending messages */
  private onSendCallback: ((text: string) => void) | null = null;

  /**
   * Creates a new InputRenderer instance.
   *
   * @param styles - Optional visual style overrides for the input area
   * @param i18n - Internationalization manager for translated labels/placeholders
   */
  constructor(
    private styles: InputStyles | undefined,
    private i18n: I18nManager,
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the input area with a textarea and send button.
   *
   * Creates the DOM structure:
   * - Container (flex row, padding, border-top)
   *   - Textarea (auto-growing, 1-4 lines)
   *   - Send button (circular icon button)
   *
   * @param options - Configuration for the input area
   * @param options.onSend - Callback invoked with the message text when user sends
   * @param options.placeholder - Optional placeholder text (falls back to i18n default)
   * @returns The input area container element
   */
  render(options: {
    onSend: (text: string) => void;
    placeholder?: string;
  }): HTMLElement {
    this.onSendCallback = options.onSend;

    // Container
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-input';
    this.applyContainerStyles();

    // Keyboard instructions hint element — referenced by aria-describedby on the
    // textarea so screen readers announce the shortcut info when textarea is focused.
    const hintId = 'nevent-chatbot-input-hint';
    const hintEl = document.createElement('span');
    hintEl.id = hintId;
    hintEl.className = 'nevent-chatbot-input-hint';
    // Visually hidden but readable by screen readers
    Object.assign(hintEl.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    hintEl.textContent = this.getKeyboardHint();
    this.container.appendChild(hintEl);

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'nevent-chatbot-input-field';
    this.textarea.placeholder = options.placeholder ?? this.i18n.t('inputPlaceholder');
    this.textarea.setAttribute('aria-label', this.i18n.t('inputPlaceholder'));
    // aria-describedby connects the keyboard shortcut instructions to the textarea
    this.textarea.setAttribute('aria-describedby', hintId);
    this.textarea.rows = 1;
    this.applyTextareaStyles();

    // Textarea event listeners
    this.textarea.addEventListener('input', this.handleInput.bind(this));
    this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));

    // Send button
    this.sendButton = document.createElement('button');
    this.sendButton.type = 'button';
    this.sendButton.className = 'nevent-chatbot-send-button';
    this.sendButton.setAttribute('aria-label', this.i18n.t('sendButton'));
    this.sendButton.innerHTML = SEND_ICON_SVG;
    this.sendButton.disabled = true;
    this.applySendButtonStyles(false);

    this.sendButton.addEventListener('click', this.handleSend.bind(this));

    // Assemble
    this.container.appendChild(this.textarea);
    this.container.appendChild(this.sendButton);

    return this.container;
  }

  /**
   * Sets focus on the textarea input field.
   */
  focus(): void {
    this.textarea?.focus();
  }

  /**
   * Disables or enables the textarea and send button.
   * Used during message sending to prevent duplicate submissions.
   *
   * @param disabled - Whether the input should be disabled
   */
  setDisabled(disabled: boolean): void {
    if (this.textarea) {
      this.textarea.disabled = disabled;
      this.textarea.style.opacity = disabled ? '0.6' : '1';
    }
    if (this.sendButton) {
      this.sendButton.disabled = disabled;
      this.sendButton.style.opacity = disabled ? '0.4' : '';
    }
  }

  /**
   * Clears the textarea content and resets its height.
   */
  clear(): void {
    if (this.textarea) {
      this.textarea.value = '';
      this.resetTextareaHeight();
      this.updateSendButtonState();
    }
  }

  /**
   * Returns the current value of the textarea.
   *
   * @returns The text content of the textarea (untrimmed)
   */
  getValue(): string {
    return this.textarea?.value ?? '';
  }

  // --------------------------------------------------------------------------
  // Private: Accessibility Helpers
  // --------------------------------------------------------------------------

  /**
   * Returns a localized keyboard usage hint for the textarea.
   * Announced by screen readers via aria-describedby when the field is focused.
   *
   * @returns Localized keyboard hint string
   */
  private getKeyboardHint(): string {
    const locale = this.i18n.getLocale ? this.i18n.getLocale() : 'en';
    const hints: Record<string, string> = {
      es: 'Pulsa Intro para enviar, Mayús+Intro para nueva línea.',
      en: 'Press Enter to send, Shift+Enter for a new line.',
      ca: 'Prem Intro per enviar, Maj+Intro per nova línia.',
      pt: 'Pressione Enter para enviar, Shift+Enter para nova linha.',
    };
    return hints[locale] ?? hints['en']!;
  }

  /**
   * Removes the input area from the DOM and cleans up event listeners and references.
   */
  destroy(): void {
    this.container?.remove();
    this.container = null;
    this.textarea = null;
    this.sendButton = null;
    this.onSendCallback = null;
  }

  // --------------------------------------------------------------------------
  // Private: Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Handles textarea input events.
   * Auto-grows the textarea height and updates the send button state.
   */
  private handleInput(): void {
    this.autoGrow();
    this.updateSendButtonState();
  }

  /**
   * Handles keyboard events on the textarea.
   * Enter sends the message; Shift+Enter inserts a newline.
   *
   * @param event - The keyboard event
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleSend();
    }
  }

  /**
   * Handles the send action (click or Enter key).
   * Trims the message, validates it's non-empty, and invokes the callback.
   */
  private handleSend(): void {
    if (!this.textarea || !this.onSendCallback) return;

    const text = this.textarea.value.trim();
    if (!text) return;

    this.onSendCallback(text);
  }

  // --------------------------------------------------------------------------
  // Private: Textarea Auto-Grow
  // --------------------------------------------------------------------------

  /**
   * Auto-grows the textarea height based on content.
   * Grows from 1 line (min) to 4 lines (max), then enables scrolling.
   */
  private autoGrow(): void {
    if (!this.textarea) return;

    // Reset height to auto to get the correct scrollHeight
    this.textarea.style.height = 'auto';

    // Calculate line height (approx 20px per line)
    const lineHeight = 20;
    const maxLines = 4;
    const maxHeight = lineHeight * maxLines;

    const newHeight = Math.min(this.textarea.scrollHeight, maxHeight);
    this.textarea.style.height = `${newHeight}px`;

    // Enable/disable scrolling based on content height
    this.textarea.style.overflowY = this.textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  /**
   * Resets the textarea to its single-line height.
   */
  private resetTextareaHeight(): void {
    if (!this.textarea) return;

    this.textarea.style.height = 'auto';
    this.textarea.style.overflowY = 'hidden';
  }

  // --------------------------------------------------------------------------
  // Private: Send Button State
  // --------------------------------------------------------------------------

  /**
   * Updates the send button's enabled state and visual appearance
   * based on whether the textarea has content.
   */
  private updateSendButtonState(): void {
    if (!this.textarea || !this.sendButton) return;

    const hasContent = this.textarea.value.trim().length > 0;
    this.sendButton.disabled = !hasContent;
    this.applySendButtonStyles(hasContent);
  }

  // --------------------------------------------------------------------------
  // Private: Style Application
  // --------------------------------------------------------------------------

  /**
   * Applies styles to the outer container (flex row layout with padding).
   */
  private applyContainerStyles(): void {
    if (!this.container) return;

    Object.assign(this.container.style, {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      padding: '12px',
    });
  }

  /**
   * Applies styles to the auto-growing textarea.
   */
  private applyTextareaStyles(): void {
    if (!this.textarea) return;

    const s = this.styles;

    Object.assign(this.textarea.style, {
      flex: '1',
      resize: 'none',
      border: `1px solid ${s?.borderColor ?? '#e0e0e0'}`,
      borderRadius: s?.borderRadius ?? '24px',
      padding: s?.padding ?? '10px 16px',
      fontSize: s?.fontSize ?? '14px',
      lineHeight: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: s?.textColor ?? '#333333',
      backgroundColor: s?.backgroundColor ?? '#ffffff',
      // Do NOT set outline:none — let CSS :focus-visible rules handle focus indication (WCAG 2.4.7)
      overflowY: 'hidden',
      maxHeight: '80px',
      minHeight: '20px',
      transition: 'border-color 0.2s ease',
      boxSizing: 'border-box',
    });

    if (s?.font?.family) {
      this.textarea.style.fontFamily = `'${s.font.family}', -apple-system, BlinkMacSystemFont, sans-serif`;
    }

    // Focus styles
    const focusBorderColor = s?.focusBorderColor ?? '#007bff';
    this.textarea.addEventListener('focus', () => {
      if (this.textarea) {
        this.textarea.style.borderColor = focusBorderColor;
        this.textarea.style.boxShadow = `0 0 0 2px ${focusBorderColor}33`;
      }
    });
    this.textarea.addEventListener('blur', () => {
      if (this.textarea) {
        this.textarea.style.borderColor = s?.borderColor ?? '#e0e0e0';
        this.textarea.style.boxShadow = 'none';
      }
    });
  }

  /**
   * Applies styles to the send button based on whether it has content.
   *
   * @param hasContent - Whether the textarea has non-empty content
   */
  private applySendButtonStyles(hasContent: boolean): void {
    if (!this.sendButton) return;

    const s = this.styles;
    const activeColor = s?.sendButtonColor ?? '#007bff';
    const iconColor = s?.sendButtonIconColor ?? '#ffffff';

    Object.assign(this.sendButton.style, {
      width: '36px',
      height: '36px',
      minWidth: '36px',
      borderRadius: '50%',
      border: 'none',
      cursor: hasContent ? 'pointer' : 'default',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      transition: 'background-color 0.2s ease, opacity 0.2s ease',
      backgroundColor: hasContent ? activeColor : '#e0e0e0',
      color: hasContent ? iconColor : '#999999',
      opacity: hasContent ? '1' : '0.6',
      lineHeight: '0',
      flexShrink: '0',
    });
  }
}
