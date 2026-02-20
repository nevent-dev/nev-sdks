/**
 * Sanitizer - HTML sanitization and URL validation utilities for Nevent SDKs
 *
 * Provides zero-dependency XSS prevention utilities suitable for sanitizing
 * HTML content in SDK widgets. Two sanitization strategies are supported:
 *
 * - **DOM-based** (browsers): Uses `DOMParser` to parse HTML into a DOM tree,
 *   walks all nodes, removes disallowed tags and attributes, validates URLs,
 *   then serializes back to a string.
 * - **Regex fallback** (SSR / environments without DOMParser): Applies a
 *   conservative strip-and-escape approach.
 *
 * @example
 * ```typescript
 * import { Sanitizer } from '@nevent/core';
 *
 * // Escape user input
 * const safe = Sanitizer.escapeHtml('<script>alert(1)</script>');
 * // '&lt;script&gt;alert(1)&lt;/script&gt;'
 *
 * // Sanitize HTML with whitelist
 * const clean = Sanitizer.sanitizeHtml('<b>Hello</b><script>alert(1)</script>');
 * // '<b>Hello</b>'
 *
 * // Validate a URL
 * Sanitizer.isValidUrl('https://example.com');  // true
 * Sanitizer.isValidUrl('javascript:alert(1)');   // false
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Default Whitelist Configuration
// ============================================================================

/**
 * Default set of HTML tag names permitted in sanitized output.
 * All other tags will be removed (but their text content preserved for
 * non-dangerous tags).
 */
const DEFAULT_ALLOWED_TAGS: ReadonlySet<string> = new Set([
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
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
]);

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
 * URI schemes permitted in `href` attributes.
 */
const ALLOWED_HREF_SCHEMES = /^(https?:|mailto:)/i;

/**
 * URI schemes permitted in `src` attributes (images only).
 */
const ALLOWED_SRC_SCHEMES = /^https:/i;

/**
 * Regex to detect dangerous URI schemes in attribute values.
 */
const DANGEROUS_SCHEME_PATTERN = /^\s*(javascript|data|vbscript):/i;

/**
 * Tags that must be completely removed including their text content.
 */
const REMOVE_WITH_CONTENT_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'meta',
  'link',
  'base',
  'frame',
  'frameset',
]);

// ============================================================================
// Sanitizer Class
// ============================================================================

/**
 * Static utility class for HTML sanitization and URL validation.
 *
 * All methods are static -- no instance is required.
 */
export class Sanitizer {
  /** Private constructor prevents instantiation */
  private constructor() {}

  // --------------------------------------------------------------------------
  // escapeHtml
  // --------------------------------------------------------------------------

  /**
   * Escapes HTML special characters in a plain-text string.
   *
   * Converts `&`, `<`, `>`, `"`, and `'` to their HTML entity equivalents.
   * Use this for inserting user-generated text into HTML contexts where
   * the content must not be interpreted as markup.
   *
   * @param text - Plain text string to escape
   * @returns HTML-escaped string safe for insertion as text content.
   *   Returns empty string for falsy or non-string input.
   *
   * @example
   * ```typescript
   * Sanitizer.escapeHtml('<script>alert(1)</script>');
   * // '&lt;script&gt;alert(1)&lt;/script&gt;'
   *
   * Sanitizer.escapeHtml('Hello "world" & \'you\'');
   * // 'Hello &quot;world&quot; &amp; &#39;you&#39;'
   * ```
   */
  static escapeHtml(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --------------------------------------------------------------------------
  // sanitizeHtml
  // --------------------------------------------------------------------------

  /**
   * Sanitizes an HTML string by removing dangerous tags and attributes while
   * preserving safe formatting markup.
   *
   * Uses `DOMParser` in browser environments for robust, spec-compliant
   * parsing. Falls back to a conservative regex-based approach in SSR
   * environments where `DOMParser` is unavailable.
   *
   * @param html - Raw HTML string to sanitize
   * @param allowedTags - Optional custom set of allowed tag names. If not
   *   provided, the default whitelist is used (b, i, em, strong, u, s, p,
   *   a, ul, ol, li, code, pre, blockquote, span, img, h1-h6, hr, br, strike).
   * @returns Sanitized HTML string safe for insertion via `innerHTML`.
   *   Returns empty string for falsy or non-string input.
   *
   * @example
   * ```typescript
   * Sanitizer.sanitizeHtml('<b>Hello</b><script>alert(1)</script>');
   * // '<b>Hello</b>'
   *
   * // Custom allowlist: only bold and italic
   * Sanitizer.sanitizeHtml('<b>Bold</b><a href="x">Link</a>', ['b', 'i']);
   * // '<b>Bold</b>Link'
   * ```
   */
  static sanitizeHtml(html: string, allowedTags?: string[]): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const tagSet = allowedTags
      ? new Set(allowedTags.map((t) => t.toLowerCase()))
      : DEFAULT_ALLOWED_TAGS;

    if (Sanitizer.isDomParserAvailable()) {
      return Sanitizer.sanitizeWithDomParser(html, tagSet);
    }

    return Sanitizer.sanitizeWithRegex(html, tagSet);
  }

  // --------------------------------------------------------------------------
  // isValidUrl
  // --------------------------------------------------------------------------

  /**
   * Validates whether a URL string is safe to use.
   *
   * Only `http:`, `https:`, and `mailto:` schemes are allowed.
   * Rejects `javascript:`, `data:`, `vbscript:`, and all other schemes.
   *
   * @param url - The URL string to validate
   * @returns `true` if the URL uses an allowed scheme, `false` otherwise
   *
   * @example
   * ```typescript
   * Sanitizer.isValidUrl('https://example.com');       // true
   * Sanitizer.isValidUrl('http://example.com/path');    // true
   * Sanitizer.isValidUrl('mailto:user@example.com');    // true
   * Sanitizer.isValidUrl('javascript:alert(1)');        // false
   * Sanitizer.isValidUrl('data:text/html,<h1>Hi</h1>');// false
   * Sanitizer.isValidUrl('');                           // false
   * ```
   */
  static isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const trimmed = url.trim();
    if (!trimmed) return false;

    // Normalize: remove control characters and whitespace for obfuscation detection
    const normalized = trimmed
      .replace(/[\s\u0000-\u001f]/g, '')
      .toLowerCase();

    // Reject dangerous schemes
    if (DANGEROUS_SCHEME_PATTERN.test(normalized)) return false;

    // Must start with http:, https:, or mailto:
    return ALLOWED_HREF_SCHEMES.test(trimmed);
  }

  // --------------------------------------------------------------------------
  // DOM-Based Sanitization (browser environments)
  // --------------------------------------------------------------------------

  /**
   * Sanitizes HTML using the browser's native `DOMParser`.
   *
   * @param html - Raw HTML string
   * @param allowedTagSet - Set of allowed tag names
   * @returns Sanitized HTML string
   */
  private static sanitizeWithDomParser(
    html: string,
    allowedTagSet: ReadonlySet<string>,
  ): string {
    let doc: Document;

    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
      return Sanitizer.sanitizeWithRegex(html, allowedTagSet);
    }

    Sanitizer.walkAndSanitize(doc.body, allowedTagSet);

    return doc.body.innerHTML;
  }

  /**
   * Recursively walks a DOM node tree, sanitizing each element in-place.
   *
   * @param node - The DOM node to walk (typically `document.body`)
   * @param allowedTagSet - Set of allowed tag names
   */
  private static walkAndSanitize(
    node: Node,
    allowedTagSet: ReadonlySet<string>,
  ): void {
    const children = Array.from(node.childNodes);

    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element;
        const tagName = element.tagName.toLowerCase();

        // Remove entirely (including content) dangerous container tags
        if (REMOVE_WITH_CONTENT_TAGS.has(tagName)) {
          element.parentNode?.removeChild(element);
          continue;
        }

        // Allowed tag: sanitize attributes, then recurse
        if (allowedTagSet.has(tagName)) {
          Sanitizer.sanitizeElement(element);
          Sanitizer.walkAndSanitize(element, allowedTagSet);
          continue;
        }

        // Disallowed tag but not dangerous: unwrap (keep text content)
        Sanitizer.unwrapElement(element, node, allowedTagSet);
      }
    }
  }

  /**
   * Sanitizes the attributes of a single DOM element in-place.
   *
   * @param element - The DOM element whose attributes to sanitize
   */
  private static sanitizeElement(element: Element): void {
    const tagName = element.tagName.toLowerCase();
    const allowedAttrs =
      ALLOWED_ATTRIBUTES.get(tagName) ?? new Set<string>();

    const attrNames = Array.from(element.attributes).map((a) => a.name);

    for (const attrName of attrNames) {
      const lowerAttr = attrName.toLowerCase();

      // Remove event handlers unconditionally
      if (lowerAttr.startsWith('on')) {
        element.removeAttribute(attrName);
        continue;
      }

      // Remove attributes not in the allowlist
      if (!allowedAttrs.has(lowerAttr)) {
        element.removeAttribute(attrName);
        continue;
      }

      const attrValue = element.getAttribute(attrName) ?? '';

      // Validate href attribute
      if (lowerAttr === 'href') {
        if (!Sanitizer.isAllowedHref(attrValue)) {
          element.removeAttribute(attrName);
          continue;
        }
      }

      // Validate src attribute (images)
      if (lowerAttr === 'src') {
        if (!Sanitizer.isAllowedSrc(attrValue)) {
          element.removeAttribute(attrName);
          continue;
        }
      }

      // Enforce target="_blank" only
      if (lowerAttr === 'target') {
        if (attrValue !== '_blank') {
          element.removeAttribute(attrName);
          continue;
        }
      }
    }

    // Enforce security attributes on <a> links
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href) {
        element.setAttribute('rel', 'noopener noreferrer');
        if (!element.hasAttribute('target')) {
          element.setAttribute('target', '_blank');
        }
      }
    }
  }

  /**
   * Replaces a DOM element with its child nodes, effectively "unwrapping" it.
   *
   * @param element - The element to unwrap
   * @param parent - The parent node to insert the children into
   * @param allowedTagSet - Set of allowed tag names
   */
  private static unwrapElement(
    element: Element,
    parent: Node,
    allowedTagSet: ReadonlySet<string>,
  ): void {
    Sanitizer.walkAndSanitize(element, allowedTagSet);

    const fragment =
      element.ownerDocument?.createDocumentFragment() ?? null;
    if (!fragment) {
      element.parentNode?.removeChild(element);
      return;
    }

    while (element.firstChild) {
      fragment.appendChild(element.firstChild);
    }

    parent.insertBefore(fragment, element);
    parent.removeChild(element);
  }

  // --------------------------------------------------------------------------
  // Regex-Based Sanitization (SSR / non-browser environments)
  // --------------------------------------------------------------------------

  /**
   * Sanitizes HTML using regular expressions as a fallback for environments
   * where `DOMParser` is unavailable.
   *
   * @param html - Raw HTML string
   * @param allowedTagSet - Set of allowed tag names
   * @returns Sanitized HTML string
   */
  private static sanitizeWithRegex(
    html: string,
    allowedTagSet: ReadonlySet<string>,
  ): string {
    let result = html;

    // Step 1: Remove entire dangerous tags including their content
    for (const tag of REMOVE_WITH_CONTENT_TAGS) {
      result = result.replace(
        new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'),
        '',
      );
      result = result.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), '');
    }

    // Step 2: Remove all event handler attributes
    result = result.replace(
      /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
      '',
    );

    // Step 3: Remove script/style even without proper closing tags
    result = result.replace(
      /<script[^>]*>[\s\S]*?(<\/script>|$)/gi,
      '',
    );
    result = result.replace(/<style[^>]*>[\s\S]*?(<\/style>|$)/gi, '');

    // Step 4: Strip disallowed tags (keep text content)
    result = result.replace(
      /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g,
      (match, tagName: string) => {
        const tag = tagName.toLowerCase();
        if (allowedTagSet.has(tag)) {
          return Sanitizer.sanitizeTagAttributesRegex(match, tag);
        }
        return '';
      },
    );

    return result;
  }

  /**
   * Sanitizes the attribute string within a single HTML tag (regex path).
   *
   * @param tagString - Full HTML tag string
   * @param tagName - Lowercase tag name
   * @returns Sanitized tag string with only allowed attributes
   */
  private static sanitizeTagAttributesRegex(
    tagString: string,
    tagName: string,
  ): string {
    const allowedAttrs = ALLOWED_ATTRIBUTES.get(tagName);
    if (!allowedAttrs || allowedAttrs.size === 0) {
      const isVoid =
        tagName === 'br' || tagName === 'img' || tagName === 'hr';
      return isVoid || /\/>$/.test(tagString)
        ? `<${tagName}>`
        : tagString.startsWith('</')
          ? `</${tagName}>`
          : `<${tagName}>`;
    }

    if (tagString.startsWith('</')) {
      return `</${tagName}>`;
    }

    const builtAttrs: string[] = [];
    const attrRegex =
      /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

    const attrSection = tagString
      .replace(/^<\w+/, '')
      .replace(/\/?>$/, '');
    attrRegex.lastIndex = 0;

    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrSection)) !== null) {
      const attrName = (attrMatch[1] ?? '').toLowerCase();
      const attrValue =
        attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

      if (attrName.startsWith('on')) continue;
      if (!allowedAttrs.has(attrName)) continue;
      if (
        attrName === 'href' &&
        !Sanitizer.isAllowedHref(attrValue)
      )
        continue;
      if (
        attrName === 'src' &&
        !Sanitizer.isAllowedSrc(attrValue)
      )
        continue;
      if (attrName === 'target' && attrValue !== '_blank') continue;

      builtAttrs.push(`${attrName}="${Sanitizer.escapeHtml(attrValue)}"`);
    }

    // Enforce rel on <a> with href
    if (
      tagName === 'a' &&
      builtAttrs.some((a) => a.startsWith('href='))
    ) {
      builtAttrs.push('rel="noopener noreferrer"');
      if (!builtAttrs.some((a) => a.startsWith('target='))) {
        builtAttrs.push('target="_blank"');
      }
    }

    const attrsStr =
      builtAttrs.length > 0 ? ' ' + builtAttrs.join(' ') : '';

    return `<${tagName}${attrsStr}>`;
  }

  // --------------------------------------------------------------------------
  // URL Validation Helpers (private)
  // --------------------------------------------------------------------------

  /**
   * Validates that an `href` attribute value uses an allowed URI scheme.
   *
   * @param value - The raw attribute value to validate
   * @returns `true` if the URL is safe to use as an href
   */
  private static isAllowedHref(value: string): boolean {
    const trimmed = value.trim();
    const normalized = trimmed
      .replace(/[\s\u0000-\u001f]/g, '')
      .toLowerCase();

    if (DANGEROUS_SCHEME_PATTERN.test(normalized)) return false;

    // Allow empty hrefs (fragment anchors) and relative URLs
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/'))
      return true;

    return ALLOWED_HREF_SCHEMES.test(trimmed);
  }

  /**
   * Validates that a `src` attribute value uses an allowed URI scheme.
   *
   * @param value - The raw attribute value to validate
   * @returns `true` if the URL is safe to use as an img src
   */
  private static isAllowedSrc(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;

    const normalized = trimmed
      .replace(/[\s\u0000-\u001f]/g, '')
      .toLowerCase();
    if (DANGEROUS_SCHEME_PATTERN.test(normalized)) return false;

    return ALLOWED_SRC_SCHEMES.test(trimmed);
  }

  // --------------------------------------------------------------------------
  // Environment Detection
  // --------------------------------------------------------------------------

  /**
   * Checks whether `DOMParser` is available in the current environment.
   *
   * @returns `true` if `DOMParser` can be safely instantiated
   */
  private static isDomParserAvailable(): boolean {
    return typeof DOMParser !== 'undefined';
  }
}
