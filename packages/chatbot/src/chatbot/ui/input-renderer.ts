/**
 * InputRenderer - Message input area component with file attachment support
 *
 * Renders the text input field, send button, and file attachment controls at
 * the bottom of the chat window. Handles user input, auto-growing textarea,
 * keyboard shortcuts, file selection, drag-and-drop, clipboard paste, and
 * input state management (disabled during sending).
 *
 * Features:
 * - Auto-growing textarea (min 1 line, max 4 lines)
 * - Send button with SVG arrow icon (circular, aligned right)
 * - Enter to send, Shift+Enter for new line
 * - Send button disabled when textarea is empty AND no attachments, primary color when content present
 * - Configurable placeholder text from config or i18n
 * - ARIA labels on textarea and button for accessibility
 * - Focus-visible outline for keyboard navigation
 * - Optional character count indicator (when maxLength is defined)
 * - Disabled state during message sending
 * - Attachment button (paperclip icon) for file selection
 * - Hidden file input with configurable `accept` attribute
 * - Drag-and-drop file support on the input area
 * - Clipboard paste support (Ctrl+V / Cmd+V for images)
 * - File preview strip above the textarea showing attached files
 * - Each preview shows: thumbnail (images), filename, file size, progress bar, remove button
 *
 * @remarks
 * The input area fires callbacks when the user submits a message or manages
 * file attachments. It does not directly interact with the API or
 * FileUploadService. The consumer (ChatbotWidget) is responsible for
 * coordinating uploads, clearing the input, and re-enabling it after send.
 */

import type { FileAttachment, InputStyles } from '../../types';
import { I18nManager } from '../i18n-manager';
import { MessageSanitizer } from '../message-sanitizer';

// ============================================================================
// SVG Icons
// ============================================================================

/**
 * Inline SVG for the send button icon (arrow pointing up-right).
 */
const SEND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

/**
 * Inline SVG for the attachment button icon (paperclip).
 */
const ATTACH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;

/**
 * Inline SVG for the remove/close icon on file previews (X mark).
 */
const REMOVE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/**
 * Inline SVG for generic file icon (used for non-image attachments).
 */
const FILE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

/**
 * Set of MIME types that can display an image thumbnail preview.
 */
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

// ============================================================================
// InputRenderer Class
// ============================================================================

/**
 * Renders and manages the message input area (textarea + send button + attachments).
 *
 * The input area sits in the chat window footer. It auto-grows as the user
 * types (up to 4 lines), sends on Enter (Shift+Enter for newlines), and
 * provides visual feedback when the input is empty or disabled.
 *
 * When file uploads are enabled, an attachment button (paperclip) is shown
 * next to the send button. Users can also drag files onto the input area or
 * paste images from the clipboard. Attached files are displayed in a
 * horizontal preview strip above the textarea.
 *
 * @example
 * ```typescript
 * const input = new InputRenderer(inputStyles, i18n);
 * const el = input.render({
 *   onSend: (text) => sendMessage(text),
 *   placeholder: 'Ask me anything...',
 *   fileUpload: {
 *     enabled: true,
 *     accept: 'image/*,application/pdf',
 *     maxFiles: 5,
 *     onFilesSelected: (files) => handleFiles(files),
 *     onFileRemoved: (id) => handleRemove(id),
 *   },
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
  /** Outer container element for the entire input area (preview strip + input row) */
  private container: HTMLElement | null = null;

  /** Inner row containing textarea and buttons */
  private inputRow: HTMLElement | null = null;

  /** The auto-growing textarea element */
  private textarea: HTMLTextAreaElement | null = null;

  /** The circular send button */
  private sendButton: HTMLButtonElement | null = null;

  /** The attachment (paperclip) button — null when file uploads are disabled */
  private attachButton: HTMLButtonElement | null = null;

  /** Hidden file input element — null when file uploads are disabled */
  private fileInput: HTMLInputElement | null = null;

  /** Container for the file preview strip above the textarea */
  private previewStrip: HTMLElement | null = null;

  /** Callback for sending messages */
  private onSendCallback: ((text: string) => void) | null = null;

  /** Callback fired on every keystroke for typing status notifications */
  private onTypingCallback: (() => void) | null = null;

  /** Callback fired when typing stops (input cleared or message sent) */
  private onStoppedTypingCallback: (() => void) | null = null;

  /** Callback when files are selected by the user */
  private onFilesSelectedCallback: ((files: File[]) => void) | null = null;

  /** Callback when a file is removed from the preview strip */
  private onFileRemovedCallback: ((attachmentId: string) => void) | null = null;

  /** Currently displayed file attachments in the preview strip */
  private attachments: FileAttachment[] = [];

  /** Whether file upload functionality is enabled */
  private fileUploadEnabled = false;

  /** Maximum number of files allowed (from FileUploadConfig) */
  private maxFiles = 5;

  /** Bound event handler references for cleanup */
  private boundHandlers: {
    dragover?: (e: DragEvent) => void;
    dragleave?: (e: DragEvent) => void;
    drop?: (e: DragEvent) => void;
    paste?: (e: ClipboardEvent) => void;
  } = {};

  /**
   * Creates a new InputRenderer instance.
   *
   * @param styles - Optional visual style overrides for the input area
   * @param i18n - Internationalization manager for translated labels/placeholders
   */
  constructor(
    private styles: InputStyles | undefined,
    private i18n: I18nManager
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Renders the input area with a textarea, send button, and optional
   * attachment controls.
   *
   * Creates the DOM structure:
   * - Container (flex column)
   *   - Preview strip (horizontal scroll, hidden when empty)
   *   - Input row (flex row, padding)
   *     - Attachment button (when file upload enabled)
   *     - Textarea (auto-growing, 1-4 lines)
   *     - Send button (circular icon button)
   *
   * @param options - Configuration for the input area
   * @param options.onSend - Callback invoked with the message text when user sends
   * @param options.placeholder - Optional placeholder text (falls back to i18n default)
   * @param options.fileUpload - Optional file upload configuration
   * @returns The input area container element
   */
  render(options: {
    onSend: (text: string) => void;
    placeholder?: string;
    /** Callback fired on every keystroke for typing status notifications */
    onTyping?: () => void;
    /** Callback fired when typing stops (input cleared or message sent) */
    onStoppedTyping?: () => void;
    fileUpload?: {
      enabled: boolean;
      accept: string;
      maxFiles: number;
      onFilesSelected: (files: File[]) => void;
      onFileRemoved: (attachmentId: string) => void;
    };
  }): HTMLElement {
    this.onSendCallback = options.onSend;
    this.onTypingCallback = options.onTyping ?? null;
    this.onStoppedTypingCallback = options.onStoppedTyping ?? null;

    // File upload configuration
    if (options.fileUpload?.enabled) {
      this.fileUploadEnabled = true;
      this.maxFiles = options.fileUpload.maxFiles;
      this.onFilesSelectedCallback = options.fileUpload.onFilesSelected;
      this.onFileRemovedCallback = options.fileUpload.onFileRemoved;
    }

    // Outer container (column layout: preview strip on top, input row below)
    this.container = document.createElement('div');
    this.container.className = 'nevent-chatbot-input';
    this.applyContainerStyles();

    // File preview strip (above textarea, hidden when empty)
    this.previewStrip = document.createElement('div');
    this.previewStrip.className = 'nevent-chatbot-file-preview-strip';
    this.previewStrip.setAttribute('role', 'list');
    this.previewStrip.setAttribute('aria-label', this.i18n.t('attachFile'));
    this.applyPreviewStripStyles();
    this.previewStrip.style.display = 'none';
    this.container.appendChild(this.previewStrip);

    // Input row (textarea + buttons)
    this.inputRow = document.createElement('div');
    this.inputRow.className = 'nevent-chatbot-input-row';
    this.applyInputRowStyles();

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
    this.inputRow.appendChild(hintEl);

    // Attachment button (paperclip) — only when file uploads enabled
    if (this.fileUploadEnabled) {
      this.attachButton = document.createElement('button');
      this.attachButton.type = 'button';
      this.attachButton.className = 'nevent-chatbot-attach-button';
      this.attachButton.setAttribute('aria-label', this.i18n.t('attachFile'));
      this.attachButton.innerHTML = ATTACH_ICON_SVG;
      this.applyAttachButtonStyles();
      this.attachButton.addEventListener(
        'click',
        this.handleAttachClick.bind(this)
      );
      this.inputRow.appendChild(this.attachButton);

      // Hidden file input
      this.fileInput = document.createElement('input');
      this.fileInput.type = 'file';
      this.fileInput.multiple = true;
      this.fileInput.accept = options.fileUpload!.accept;
      this.fileInput.className = 'nevent-chatbot-file-input';
      this.fileInput.setAttribute('aria-hidden', 'true');
      this.fileInput.tabIndex = -1;
      Object.assign(this.fileInput.style, {
        position: 'absolute',
        width: '0',
        height: '0',
        overflow: 'hidden',
        opacity: '0',
        pointerEvents: 'none',
      });
      this.fileInput.addEventListener(
        'change',
        this.handleFileInputChange.bind(this)
      );
      this.inputRow.appendChild(this.fileInput);
    }

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'nevent-chatbot-input-field';
    this.textarea.placeholder =
      options.placeholder ?? this.i18n.t('inputPlaceholder');
    this.textarea.setAttribute('aria-label', this.i18n.t('inputPlaceholder'));
    // aria-describedby connects the keyboard shortcut instructions to the textarea
    this.textarea.setAttribute('aria-describedby', hintId);
    this.textarea.rows = 1;
    this.applyTextareaStyles();

    // Textarea event listeners
    this.textarea.addEventListener('input', this.handleInput.bind(this));
    this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));

    // Clipboard paste support for images
    if (this.fileUploadEnabled) {
      this.boundHandlers.paste = this.handlePaste.bind(this);
      this.textarea.addEventListener('paste', this.boundHandlers.paste);
    }

    // Send button
    this.sendButton = document.createElement('button');
    this.sendButton.type = 'button';
    this.sendButton.className = 'nevent-chatbot-send-button';
    this.sendButton.setAttribute('aria-label', this.i18n.t('sendButton'));
    this.sendButton.innerHTML = SEND_ICON_SVG;
    this.sendButton.disabled = true;
    this.applySendButtonStyles(false);

    this.sendButton.addEventListener('click', this.handleSend.bind(this));

    // Assemble input row
    this.inputRow.appendChild(this.textarea);
    this.inputRow.appendChild(this.sendButton);

    this.container.appendChild(this.inputRow);

    // Drag-and-drop support on the entire input container
    if (this.fileUploadEnabled) {
      this.setupDragAndDrop();
    }

    return this.container;
  }

  /**
   * Sets focus on the textarea input field.
   */
  focus(): void {
    this.textarea?.focus();
  }

  /**
   * Disables or enables the textarea, send button, and attachment button.
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
    if (this.attachButton) {
      this.attachButton.disabled = disabled;
      this.attachButton.style.opacity = disabled ? '0.4' : '1';
    }
  }

  /**
   * Clears the textarea content, resets its height, removes all file
   * preview items from the preview strip, and notifies that typing
   * has stopped.
   */
  clear(): void {
    if (this.textarea) {
      this.textarea.value = '';
      this.resetTextareaHeight();
    }
    this.attachments = [];
    this.renderPreviews();
    this.updateSendButtonState();

    // Notify typing stopped when input is cleared
    this.onStoppedTypingCallback?.();
  }

  /**
   * Returns the current value of the textarea.
   *
   * @returns The text content of the textarea (untrimmed)
   */
  getValue(): string {
    return this.textarea?.value ?? '';
  }

  /**
   * Returns the current list of file attachments displayed in the preview strip.
   *
   * @returns Array of FileAttachment objects currently attached
   */
  getAttachments(): FileAttachment[] {
    return [...this.attachments];
  }

  /**
   * Adds file attachments to the preview strip and renders their previews.
   *
   * Called by the ChatbotWidget after validating files and creating
   * FileAttachment objects via FileUploadService.
   *
   * @param newAttachments - Array of FileAttachment objects to display
   */
  addAttachments(newAttachments: FileAttachment[]): void {
    this.attachments.push(...newAttachments);
    this.renderPreviews();
    this.updateSendButtonState();
  }

  /**
   * Updates a specific attachment's progress and status in the preview strip.
   *
   * Called by the ChatbotWidget during file upload to reflect progress
   * changes visually (progress bar fill, status icon).
   *
   * @param attachmentId - The ID of the attachment to update
   * @param updates - Partial FileAttachment fields to merge
   */
  updateAttachment(
    attachmentId: string,
    updates: Partial<FileAttachment>
  ): void {
    const index = this.attachments.findIndex((a) => a.id === attachmentId);
    if (index === -1) return;

    this.attachments[index] = { ...this.attachments[index]!, ...updates };
    this.updatePreviewItem(attachmentId);
  }

  /**
   * Removes a specific attachment from the preview strip.
   *
   * @param attachmentId - The ID of the attachment to remove
   */
  removeAttachment(attachmentId: string): void {
    this.attachments = this.attachments.filter((a) => a.id !== attachmentId);
    this.renderPreviews();
    this.updateSendButtonState();
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
      es: 'Pulsa Intro para enviar, Mayus+Intro para nueva linea.',
      en: 'Press Enter to send, Shift+Enter for a new line.',
      ca: 'Prem Intro per enviar, Maj+Intro per nova linia.',
      pt: 'Pressione Enter para enviar, Shift+Enter para nova linha.',
    };
    return hints[locale] ?? hints['en']!;
  }

  /**
   * Removes the input area from the DOM and cleans up event listeners and references.
   */
  destroy(): void {
    // Remove drag-and-drop event listeners
    if (this.container && this.boundHandlers.dragover) {
      this.container.removeEventListener(
        'dragover',
        this.boundHandlers.dragover
      );
    }
    if (this.container && this.boundHandlers.dragleave) {
      this.container.removeEventListener(
        'dragleave',
        this.boundHandlers.dragleave
      );
    }
    if (this.container && this.boundHandlers.drop) {
      this.container.removeEventListener('drop', this.boundHandlers.drop);
    }

    this.container?.remove();
    this.container = null;
    this.inputRow = null;
    this.textarea = null;
    this.sendButton = null;
    this.attachButton = null;
    this.fileInput = null;
    this.previewStrip = null;
    this.onSendCallback = null;
    this.onTypingCallback = null;
    this.onStoppedTypingCallback = null;
    this.onFilesSelectedCallback = null;
    this.onFileRemovedCallback = null;
    this.attachments = [];
    this.boundHandlers = {};
  }

  // --------------------------------------------------------------------------
  // Private: Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Handles textarea input events.
   * Auto-grows the textarea height, updates the send button state, and
   * fires the typing callback for typing status notifications.
   */
  private handleInput(): void {
    this.autoGrow();
    this.updateSendButtonState();

    // Notify typing status service on every keystroke
    if (this.textarea && this.textarea.value.length > 0) {
      this.onTypingCallback?.();
    } else {
      // Input was cleared (e.g., user deleted all text) — notify stopped
      this.onStoppedTypingCallback?.();
    }
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
   * Trims the message, validates it's non-empty or has attachments,
   * invokes the send callback, and notifies that typing has stopped.
   */
  private handleSend(): void {
    if (!this.textarea || !this.onSendCallback) return;

    const text = this.textarea.value.trim();
    const hasAttachments = this.attachments.length > 0;

    // Allow sending with text, attachments, or both
    if (!text && !hasAttachments) return;

    // User is sending — notify typing stopped immediately
    this.onStoppedTypingCallback?.();

    this.onSendCallback(text);
  }

  /**
   * Handles click on the attachment (paperclip) button.
   * Opens the hidden file input dialog.
   */
  private handleAttachClick(): void {
    if (this.attachments.length >= this.maxFiles) return;
    this.fileInput?.click();
  }

  /**
   * Handles file selection from the hidden file input element.
   * Extracts selected files and delegates to the files selected callback.
   *
   * @param event - The change event from the file input
   */
  private handleFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.processSelectedFiles(files);

    // Reset the file input so the same file can be selected again
    input.value = '';
  }

  /**
   * Handles clipboard paste events on the textarea.
   * Extracts image files from the clipboard data and delegates to the
   * files selected callback.
   *
   * @param event - The clipboard event
   */
  private handlePaste(event: ClipboardEvent): void {
    if (!event.clipboardData) return;

    const items = Array.from(event.clipboardData.items);
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      event.preventDefault();
      this.processSelectedFiles(files);
    }
  }

  /**
   * Processes files from any input source (file input, drag-drop, paste).
   * Limits to the maximum allowed files and delegates to the callback.
   *
   * @param files - Array of File objects selected by the user
   */
  private processSelectedFiles(files: File[]): void {
    if (!this.onFilesSelectedCallback) return;

    // Limit to remaining available slots
    const remainingSlots = this.maxFiles - this.attachments.length;
    if (remainingSlots <= 0) return;

    const filesToProcess = files.slice(0, remainingSlots);
    this.onFilesSelectedCallback(filesToProcess);
  }

  // --------------------------------------------------------------------------
  // Private: Drag and Drop
  // --------------------------------------------------------------------------

  /**
   * Sets up drag-and-drop event listeners on the input container.
   * Shows a visual drop zone indicator when dragging files over the area.
   */
  private setupDragAndDrop(): void {
    if (!this.container) return;

    let dragCounter = 0;

    this.boundHandlers.dragover = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    this.boundHandlers.dragleave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        this.container?.classList.remove('nevent-chatbot-input--dragover');
      }
    };

    this.boundHandlers.drop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      this.container?.classList.remove('nevent-chatbot-input--dragover');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        this.processSelectedFiles(files);
      }
    };

    this.container.addEventListener('dragover', this.boundHandlers.dragover);
    this.container.addEventListener('dragenter', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      this.container?.classList.add('nevent-chatbot-input--dragover');
    });
    this.container.addEventListener('dragleave', this.boundHandlers.dragleave);
    this.container.addEventListener('drop', this.boundHandlers.drop);
  }

  // --------------------------------------------------------------------------
  // Private: File Preview Strip
  // --------------------------------------------------------------------------

  /**
   * Renders all file previews in the preview strip.
   * Replaces the current preview strip content with updated items.
   */
  private renderPreviews(): void {
    if (!this.previewStrip) return;

    // Clear existing previews
    this.previewStrip.innerHTML = '';

    if (this.attachments.length === 0) {
      this.previewStrip.style.display = 'none';
      return;
    }

    this.previewStrip.style.display = 'flex';

    for (const attachment of this.attachments) {
      const item = this.createPreviewItem(attachment);
      this.previewStrip.appendChild(item);
    }
  }

  /**
   * Creates a single file preview item element.
   *
   * The preview item contains:
   * - A thumbnail (for image files) or a file type icon (for non-images)
   * - The filename (XSS-escaped via MessageSanitizer.escapeHtml)
   * - The file size in human-readable format
   * - A progress bar (visible during upload)
   * - A remove button (X icon)
   *
   * @param attachment - The FileAttachment to create a preview for
   * @returns The preview item DOM element
   */
  private createPreviewItem(attachment: FileAttachment): HTMLElement {
    const item = document.createElement('div');
    item.className = 'nevent-chatbot-file-preview-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-attachment-id', attachment.id);
    this.applyPreviewItemStyles(item);

    // Thumbnail or file icon
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'nevent-chatbot-file-preview-thumb';
    this.applyThumbnailContainerStyles(thumbnailContainer);

    if (attachment.thumbnailUrl && IMAGE_MIME_TYPES.has(attachment.type)) {
      const img = document.createElement('img');
      img.src = attachment.thumbnailUrl;
      img.alt = MessageSanitizer.escapeHtml(attachment.name);
      Object.assign(img.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '4px',
      });
      thumbnailContainer.appendChild(img);
    } else {
      thumbnailContainer.innerHTML = FILE_ICON_SVG;
      Object.assign(thumbnailContainer.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666666',
      });
    }
    item.appendChild(thumbnailContainer);

    // File info (name + size)
    const info = document.createElement('div');
    info.className = 'nevent-chatbot-file-preview-info';
    Object.assign(info.style, {
      flex: '1',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'nevent-chatbot-file-preview-name';
    nameEl.textContent = attachment.name;
    nameEl.title = attachment.name;
    Object.assign(nameEl.style, {
      fontSize: '12px',
      fontWeight: '500',
      color: '#333333',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '120px',
    });
    info.appendChild(nameEl);

    const sizeEl = document.createElement('span');
    sizeEl.className = 'nevent-chatbot-file-preview-size';
    sizeEl.textContent = this.formatFileSize(attachment.size);
    Object.assign(sizeEl.style, {
      fontSize: '10px',
      color: '#888888',
    });
    info.appendChild(sizeEl);

    item.appendChild(info);

    // Progress bar (visible during upload)
    const progressContainer = document.createElement('div');
    progressContainer.className = 'nevent-chatbot-file-preview-progress';
    progressContainer.setAttribute('role', 'progressbar');
    progressContainer.setAttribute('aria-valuemin', '0');
    progressContainer.setAttribute('aria-valuemax', '100');
    progressContainer.setAttribute(
      'aria-valuenow',
      String(attachment.progress)
    );
    progressContainer.setAttribute(
      'aria-label',
      `${this.i18n.t('uploading')} ${MessageSanitizer.escapeHtml(attachment.name)}`
    );
    Object.assign(progressContainer.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      height: '3px',
      backgroundColor: '#e0e0e0',
      borderRadius: '0 0 6px 6px',
      overflow: 'hidden',
      display: attachment.status === 'uploading' ? 'block' : 'none',
    });

    const progressBar = document.createElement('div');
    progressBar.className = 'nevent-chatbot-file-preview-progress-bar';
    Object.assign(progressBar.style, {
      height: '100%',
      backgroundColor: '#007bff',
      borderRadius: '0 0 6px 6px',
      transition: 'width 0.2s ease',
      width: `${attachment.progress}%`,
    });
    progressContainer.appendChild(progressBar);
    item.appendChild(progressContainer);

    // Status overlay for error state
    if (attachment.status === 'error') {
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'nevent-chatbot-file-preview-error';
      Object.assign(errorOverlay.style, {
        position: 'absolute',
        inset: '0',
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 0, 0, 0.3)',
        pointerEvents: 'none',
      });
      item.appendChild(errorOverlay);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nevent-chatbot-file-preview-remove';
    removeBtn.setAttribute(
      'aria-label',
      `${this.i18n.t('removeFile')} ${MessageSanitizer.escapeHtml(attachment.name)}`
    );
    removeBtn.innerHTML = REMOVE_ICON_SVG;
    this.applyRemoveButtonStyles(removeBtn);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onFileRemovedCallback?.(attachment.id);
    });
    item.appendChild(removeBtn);

    return item;
  }

  /**
   * Updates a single preview item in the strip without re-rendering everything.
   * Used for progress updates during file upload.
   *
   * @param attachmentId - The ID of the attachment whose preview needs updating
   */
  private updatePreviewItem(attachmentId: string): void {
    if (!this.previewStrip) return;

    const attachment = this.attachments.find((a) => a.id === attachmentId);
    if (!attachment) return;

    const existingItem = this.previewStrip.querySelector(
      `[data-attachment-id="${attachmentId}"]`
    );
    if (!existingItem) return;

    // Update progress bar
    const progressContainer = existingItem.querySelector(
      '.nevent-chatbot-file-preview-progress'
    ) as HTMLElement | null;
    if (progressContainer) {
      progressContainer.setAttribute(
        'aria-valuenow',
        String(attachment.progress)
      );
      progressContainer.style.display =
        attachment.status === 'uploading' ? 'block' : 'none';

      const progressBar = progressContainer.querySelector(
        '.nevent-chatbot-file-preview-progress-bar'
      ) as HTMLElement | null;
      if (progressBar) {
        progressBar.style.width = `${attachment.progress}%`;
      }
    }

    // Update error state
    const existingError = existingItem.querySelector(
      '.nevent-chatbot-file-preview-error'
    );
    if (attachment.status === 'error' && !existingError) {
      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'nevent-chatbot-file-preview-error';
      Object.assign(errorOverlay.style, {
        position: 'absolute',
        inset: '0',
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 0, 0, 0.3)',
        pointerEvents: 'none',
      });
      existingItem.appendChild(errorOverlay);
    } else if (attachment.status !== 'error' && existingError) {
      existingError.remove();
    }
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
    this.textarea.style.overflowY =
      this.textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
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
   * based on whether the textarea has content or files are attached.
   */
  private updateSendButtonState(): void {
    if (!this.textarea || !this.sendButton) return;

    const hasTextContent = this.textarea.value.trim().length > 0;
    const hasAttachments = this.attachments.length > 0;
    const hasContent = hasTextContent || hasAttachments;

    this.sendButton.disabled = !hasContent;
    this.applySendButtonStyles(hasContent);
  }

  // --------------------------------------------------------------------------
  // Private: Utility
  // --------------------------------------------------------------------------

  /**
   * Formats a file size in bytes into a human-readable string.
   *
   * @param bytes - File size in bytes
   * @returns Formatted string (e.g., '1.5 MB', '256 KB', '100 B')
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);

    return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i] ?? 'B'}`;
  }

  // --------------------------------------------------------------------------
  // Private: Style Application
  // --------------------------------------------------------------------------

  /**
   * Applies styles to the outer container (flex column layout).
   */
  private applyContainerStyles(): void {
    if (!this.container) return;

    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    });
  }

  /**
   * Applies styles to the input row (flex row with padding).
   */
  private applyInputRowStyles(): void {
    if (!this.inputRow) return;

    Object.assign(this.inputRow.style, {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '8px',
      padding: '12px',
    });
  }

  /**
   * Applies styles to the file preview strip container.
   */
  private applyPreviewStripStyles(): void {
    if (!this.previewStrip) return;

    Object.assign(this.previewStrip.style, {
      display: 'flex',
      gap: '8px',
      padding: '8px 12px 0 12px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'thin',
    });
  }

  /**
   * Applies styles to a single file preview item.
   *
   * @param item - The preview item element
   */
  private applyPreviewItemStyles(item: HTMLElement): void {
    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      backgroundColor: '#f5f5f5',
      borderRadius: '6px',
      border: '1px solid #e0e0e0',
      position: 'relative',
      minWidth: '160px',
      maxWidth: '200px',
      flexShrink: '0',
    });
  }

  /**
   * Applies styles to the thumbnail container in a file preview item.
   *
   * @param container - The thumbnail container element
   */
  private applyThumbnailContainerStyles(container: HTMLElement): void {
    Object.assign(container.style, {
      width: '36px',
      height: '36px',
      minWidth: '36px',
      borderRadius: '4px',
      overflow: 'hidden',
      backgroundColor: '#eeeeee',
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
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
   * @param hasContent - Whether the textarea has non-empty content or attachments
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

  /**
   * Applies styles to the attachment (paperclip) button.
   */
  private applyAttachButtonStyles(): void {
    if (!this.attachButton) return;

    Object.assign(this.attachButton.style, {
      width: '36px',
      height: '36px',
      minWidth: '36px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      transition: 'background-color 0.2s ease, color 0.2s ease',
      backgroundColor: 'transparent',
      color: '#666666',
      lineHeight: '0',
      flexShrink: '0',
    });
  }

  /**
   * Applies styles to the remove button on a file preview item.
   *
   * @param btn - The remove button element
   */
  private applyRemoveButtonStyles(btn: HTMLButtonElement): void {
    Object.assign(btn.style, {
      width: '20px',
      height: '20px',
      minWidth: '20px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      backgroundColor: '#dddddd',
      color: '#666666',
      transition: 'background-color 0.15s ease',
      flexShrink: '0',
      position: 'absolute',
      top: '-6px',
      right: '-6px',
    });
  }
}
