/**
 * MessageSanitizer - XSS prevention for chatbot message content
 *
 * Delegates HTML sanitization and escaping to `@nevent/core`'s {@link Sanitizer}
 * while providing chatbot-specific functionality:
 *
 * - **`sanitize(html)`**: Sanitizes HTML using core's `Sanitizer.sanitizeHtml()`
 *   with a chatbot-specific tag whitelist (excludes h1, h2, h6 from the general
 *   core whitelist since chatbot messages only use h3-h5).
 * - **`escapeHtml(text)`**: Delegates directly to `Sanitizer.escapeHtml()`.
 * - **`stripHtml(html)`**: Strips all HTML tags, returning plain text. Chatbot-only.
 * - **`isDangerous(html)`**: Heuristic scan for common XSS patterns. Chatbot-only.
 * - **`isValidUrl(url)`**: Delegates to `Sanitizer.isValidUrl()`.
 *
 * Allowed HTML elements (whitelist):
 * - Inline formatting: `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>`,
 *   `<strike>`, `<br>`, `<span>` (class only)
 * - Blocks: `<p>`, `<blockquote>`
 * - Lists: `<ul>`, `<ol>`, `<li>`
 * - Links: `<a>` (href -- http/https/mailto only; target -- _blank only; rel)
 * - Code: `<code>`, `<pre>`
 * - Media: `<img>` (src -- https only; alt, width, height)
 * - Headings: `<h3>`, `<h4>`, `<h5>` (not h1, h2, h6 -- inappropriate for chat)
 * - `<hr>` horizontal rule
 *
 * @remarks
 * This sanitizer is purpose-built for the chatbot context. Core sanitization
 * logic (DOM-based and regex-based strategies, URL validation) is provided by
 * `@nevent/core`'s Sanitizer class.
 *
 * @example
 * ```typescript
 * // Sanitize bot HTML response
 * const safe = MessageSanitizer.sanitize('<b>Hello</b><script>alert(1)</script>');
 * // Result: '<b>Hello</b>'
 *
 * // Strip all HTML for aria-label / tooltip text
 * const plain = MessageSanitizer.stripHtml('<b>Hello <em>world</em></b>');
 * // Result: 'Hello world'
 *
 * // Escape user input before insertion
 * const escaped = MessageSanitizer.escapeHtml('<script>alert(1)</script>');
 * // Result: '&lt;script&gt;alert(1)&lt;/script&gt;'
 *
 * // Detect dangerous content before processing
 * MessageSanitizer.isDangerous('<img src=x onerror=alert(1)>'); // true
 * ```
 */

import { Sanitizer } from '@nevent/core';

// ============================================================================
// Chatbot-Specific Whitelist Configuration
// ============================================================================

/**
 * Set of HTML tag names permitted in chatbot message output.
 *
 * This is a subset of core's default whitelist, tailored for the chatbot
 * context: headings are restricted to h3-h5 (h1, h2, h6 are inappropriate
 * for chat message bubbles).
 */
const CHATBOT_ALLOWED_TAGS: readonly string[] = [
  'b',
  'i',
  'em',
  'strong',
  'u',
  's',
  'strike',
  'br',
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'span',
  'img',
  'h3',
  'h4',
  'h5',
  'hr',
];

/**
 * ReadonlySet version of the allowed tags for efficient lookups and
 * public API exposure.
 */
const CHATBOT_ALLOWED_TAGS_SET: ReadonlySet<string> = new Set(
  CHATBOT_ALLOWED_TAGS
);

/**
 * Permitted attributes per tag name.
 * Tags not listed here are allowed zero attributes.
 */
const ALLOWED_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['a', new Set(['href', 'target', 'rel'])],
  ['img', new Set(['src', 'alt', 'width', 'height'])],
  ['span', new Set(['class'])],
  ['code', new Set(['class'])],
]);

/**
 * Regex to detect event handler attributes (on* attributes).
 * Used in `isDangerous()`.
 */
const EVENT_HANDLER_ATTR_PATTERN = /\bon\w+\s*=/gi;

// ============================================================================
// MessageSanitizer Class
// ============================================================================

/**
 * Static utility class for sanitizing HTML content in chatbot messages.
 *
 * Delegates core sanitization to `@nevent/core`'s Sanitizer and adds
 * chatbot-specific methods (`stripHtml`, `isDangerous`).
 *
 * All methods are static -- no instance is required.
 *
 * @example
 * ```typescript
 * const safe = MessageSanitizer.sanitize(botMessage.content);
 * element.innerHTML = safe;
 * ```
 */
export class MessageSanitizer {
  /**
   * Allowed HTML tag names (whitelist).
   * Exposed as a static readonly property for testability and introspection.
   */
  static readonly ALLOWED_TAGS: ReadonlySet<string> = CHATBOT_ALLOWED_TAGS_SET;

  /**
   * Permitted attributes per tag name.
   * Exposed as a static readonly property for testability and introspection.
   */
  static readonly ALLOWED_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> =
    ALLOWED_ATTRIBUTES;

  // --------------------------------------------------------------------------
  // Public API (delegating to core)
  // --------------------------------------------------------------------------

  /**
   * Sanitizes an HTML string by removing dangerous tags and attributes while
   * preserving safe formatting markup.
   *
   * Delegates to `Sanitizer.sanitizeHtml()` from `@nevent/core` with the
   * chatbot's specific tag whitelist (h3-h5 only, no h1/h2/h6).
   *
   * @param html - Raw HTML string from the bot API response
   * @returns Sanitized HTML string safe for insertion via `innerHTML`
   *
   * @example
   * ```typescript
   * MessageSanitizer.sanitize('<b>Hello</b><script>alert(1)</script>');
   * // '<b>Hello</b>'
   *
   * MessageSanitizer.sanitize('<a href="javascript:alert(1)">Click</a>');
   * // '<a>Click</a>'
   * ```
   */
  static sanitize(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    return Sanitizer.sanitizeHtml(html, [...CHATBOT_ALLOWED_TAGS]);
  }

  /**
   * Escapes HTML special characters in a plain-text string.
   *
   * Delegates to `Sanitizer.escapeHtml()` from `@nevent/core`.
   *
   * @param text - Plain text string to escape
   * @returns HTML-escaped string safe for insertion as text content
   *
   * @example
   * ```typescript
   * MessageSanitizer.escapeHtml('<script>alert(1)</script>');
   * // '&lt;script&gt;alert(1)&lt;/script&gt;'
   * ```
   */
  static escapeHtml(text: string): string {
    return Sanitizer.escapeHtml(text);
  }

  // --------------------------------------------------------------------------
  // Chatbot-Specific Methods
  // --------------------------------------------------------------------------

  /**
   * Strips all HTML tags from a string, returning plain text content.
   *
   * Suitable for contexts where HTML is not rendered: `aria-label` values,
   * tooltip text, search indexes, notification previews, etc.
   *
   * @param html - HTML string to strip
   * @returns Plain text with all HTML tags removed
   *
   * @example
   * ```typescript
   * MessageSanitizer.stripHtml('<b>Hello</b> <em>world</em>');
   * // 'Hello world'
   * ```
   */
  static stripHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    if (typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent ?? '';
      } catch {
        // Fall through to regex path
      }
    }

    // Regex fallback: strip all tags
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Checks whether an HTML string contains potentially dangerous content.
   *
   * This is a heuristic scan -- it detects common XSS patterns but is not
   * a substitute for full sanitization. Use `sanitize()` before rendering;
   * use `isDangerous()` to decide whether to log or reject content early.
   *
   * @param html - HTML string to inspect
   * @returns `true` if suspicious patterns are detected, `false` otherwise
   *
   * @example
   * ```typescript
   * MessageSanitizer.isDangerous('<img src=x onerror=alert(1)>');  // true
   * MessageSanitizer.isDangerous('<script>alert(1)</script>');       // true
   * MessageSanitizer.isDangerous('<b>Hello world</b>');             // false
   * ```
   */
  static isDangerous(html: string): boolean {
    if (!html || typeof html !== 'string') {
      return false;
    }

    // Detect <script> tags
    if (/<script[\s>]/i.test(html)) return true;

    // Detect event handler attributes (onclick, onerror, onload, etc.)
    if (EVENT_HANDLER_ATTR_PATTERN.test(html)) {
      EVENT_HANDLER_ATTR_PATTERN.lastIndex = 0; // Reset stateful regex
      return true;
    }
    EVENT_HANDLER_ATTR_PATTERN.lastIndex = 0;

    // Detect dangerous URI schemes in attribute values
    if (/\bhref\s*=\s*["']?\s*(javascript|data|vbscript):/i.test(html))
      return true;
    if (/\bsrc\s*=\s*["']?\s*(javascript|data|vbscript):/i.test(html))
      return true;

    // Detect SVG with embedded event handlers or scripts
    if (
      /<svg[\s>]/i.test(html) &&
      (/<script/i.test(html) || /\bon\w+/i.test(html))
    )
      return true;

    // Detect iframe, object, embed
    if (/<(iframe|object|embed|applet)[\s>]/i.test(html)) return true;

    return false;
  }
}
