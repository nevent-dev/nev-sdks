/**
 * MessageSanitizer - XSS prevention for chatbot message content
 *
 * Sanitizes HTML content in bot messages to prevent cross-site scripting (XSS)
 * attacks without relying on external dependencies (zero-dependency design).
 *
 * Two sanitization strategies are supported:
 * - **DOM-based** (browsers): Uses `DOMParser` to parse HTML into a DOM tree,
 *   walks all nodes, removes disallowed tags and attributes, validates URLs,
 *   then serializes back to a string. This approach is robust against
 *   parser-differential attacks.
 * - **Regex fallback** (SSR / environments without DOMParser): Applies a
 *   conservative strip-and-escape approach, removing all tags not on the
 *   allowlist and escaping residual HTML entities.
 *
 * Allowed HTML elements (whitelist):
 * - Inline formatting: `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>`,
 *   `<strike>`, `<br>`, `<span>` (class only)
 * - Blocks: `<p>`, `<blockquote>`
 * - Lists: `<ul>`, `<ol>`, `<li>`
 * - Links: `<a>` (href — http/https/mailto only; target — _blank only; rel)
 * - Code: `<code>`, `<pre>`
 * - Media: `<img>` (src — https only; alt, width, height)
 *
 * Blocked:
 * - `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`,
 *   `<meta>`, `<link>`, `<base>`, `<svg>` (with embedded scripts), etc.
 * - All event handler attributes (`on*`)
 * - `javascript:`, `data:`, `vbscript:` URI schemes in href/src
 * - CSS `expression()` in style attributes
 *
 * @remarks
 * This sanitizer is purpose-built for the chatbot context. It is not a
 * general-purpose HTML sanitizer. For full-featured sanitization across an
 * entire application, consider DOMPurify.
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

// ============================================================================
// Whitelist Configuration
// ============================================================================

/**
 * Set of HTML tag names that are permitted in sanitized output.
 * All other tags will be removed (but their text content preserved).
 */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
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
]);

/**
 * Permitted attributes per tag name.
 * Tags not listed here are allowed zero attributes.
 * The wildcard key '*' is not used — each tag is explicit.
 */
const ALLOWED_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['a', new Set(['href', 'target', 'rel'])],
  ['img', new Set(['src', 'alt', 'width', 'height'])],
  ['span', new Set(['class'])],
  ['code', new Set(['class'])],
]);

/**
 * URI schemes permitted in `href` attributes.
 * All other schemes (javascript:, data:, vbscript:, etc.) are rejected.
 */
const ALLOWED_HREF_SCHEMES = /^(https?:|mailto:)/i;

/**
 * URI schemes permitted in `src` attributes (images only).
 * Only HTTPS is allowed for image sources to prevent mixed content.
 */
const ALLOWED_SRC_SCHEMES = /^https:/i;

/**
 * Regex to detect event handler attributes (on* attributes).
 * Used in the regex fallback path and in `isDangerous()`.
 */
const EVENT_HANDLER_ATTR_PATTERN = /\bon\w+\s*=/gi;

/**
 * Regex to detect dangerous URI schemes in attribute values.
 */
const DANGEROUS_SCHEME_PATTERN = /^\s*(javascript|data|vbscript):/i;

/**
 * Tags that must be completely removed including their text content
 * (as opposed to tags that are stripped but whose content is preserved).
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
// MessageSanitizer Class
// ============================================================================

/**
 * Static utility class for sanitizing HTML content in chatbot messages.
 *
 * All methods are static — no instance is required. The class cannot be
 * instantiated externally (private constructor).
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
  static readonly ALLOWED_TAGS: ReadonlySet<string> = ALLOWED_TAGS;

  /**
   * Permitted attributes per tag name.
   * Exposed as a static readonly property for testability and introspection.
   */
  static readonly ALLOWED_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = ALLOWED_ATTRIBUTES;

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Sanitizes an HTML string by removing dangerous tags and attributes while
   * preserving safe formatting markup.
   *
   * Uses `DOMParser` in browser environments for robust, spec-compliant
   * parsing. Falls back to a conservative regex-based approach in SSR
   * environments where `DOMParser` is unavailable.
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
   *
   * MessageSanitizer.sanitize('<img src="https://cdn.example.com/img.png" alt="Photo">');
   * // '<img src="https://cdn.example.com/img.png" alt="Photo">'
   *
   * MessageSanitizer.sanitize('<a href="https://nevent.es" target="_blank">Link</a>');
   * // '<a href="https://nevent.es" target="_blank" rel="noopener noreferrer">Link</a>'
   * ```
   */
  static sanitize(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    if (MessageSanitizer.isDomParserAvailable()) {
      return MessageSanitizer.sanitizeWithDomParser(html);
    }

    return MessageSanitizer.sanitizeWithRegex(html);
  }

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
   *
   * MessageSanitizer.stripHtml('<ul><li>Item 1</li><li>Item 2</li></ul>');
   * // 'Item 1Item 2'
   * ```
   */
  static stripHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    if (MessageSanitizer.isDomParserAvailable()) {
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
   * Escapes HTML special characters in a plain-text string.
   *
   * Converts `&`, `<`, `>`, `"`, and `'` to their HTML entity equivalents.
   * Use this for inserting user-generated text into HTML contexts where
   * the content must not be interpreted as markup.
   *
   * @param text - Plain text string to escape
   * @returns HTML-escaped string safe for insertion as text content
   *
   * @example
   * ```typescript
   * MessageSanitizer.escapeHtml('<script>alert(1)</script>');
   * // '&lt;script&gt;alert(1)&lt;/script&gt;'
   *
   * MessageSanitizer.escapeHtml('Hello "world" & \'you\'');
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

  /**
   * Checks whether an HTML string contains potentially dangerous content.
   *
   * This is a heuristic scan — it detects common XSS patterns but is not
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
   * MessageSanitizer.isDangerous('<a href="javascript:void(0)">');  // true
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
    if (/\bhref\s*=\s*["']?\s*(javascript|data|vbscript):/i.test(html)) return true;
    if (/\bsrc\s*=\s*["']?\s*(javascript|data|vbscript):/i.test(html)) return true;

    // Detect SVG with embedded event handlers or scripts
    if (/<svg[\s>]/i.test(html) && (/<script/i.test(html) || /\bon\w+/i.test(html))) return true;

    // Detect iframe, object, embed
    if (/<(iframe|object|embed|applet)[\s>]/i.test(html)) return true;

    return false;
  }

  // --------------------------------------------------------------------------
  // DOM-Based Sanitization (browser environments)
  // --------------------------------------------------------------------------

  /**
   * Sanitizes HTML using the browser's native `DOMParser`.
   *
   * Parses the HTML into a full document, walks the node tree recursively,
   * removes disallowed elements (preserving their text content where safe),
   * strips disallowed attributes, validates URL values, and serializes the
   * sanitized `<body>` back to an HTML string.
   *
   * @param html - Raw HTML string
   * @returns Sanitized HTML string
   */
  private static sanitizeWithDomParser(html: string): string {
    let doc: Document;

    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch {
      // DOMParser threw — fall back to regex sanitization
      return MessageSanitizer.sanitizeWithRegex(html);
    }

    // Process the body element in-place
    MessageSanitizer.walkAndSanitize(doc.body);

    return doc.body.innerHTML;
  }

  /**
   * Recursively walks a DOM node tree, sanitizing each element in-place.
   *
   * Processing order:
   * 1. Collect child nodes into a snapshot array (modification-safe iteration)
   * 2. For each element child:
   *    a. If the tag must be removed with content, remove the entire subtree
   *    b. If the tag is not in the allowlist, replace it with its children
   *    c. If the tag is allowed, sanitize its attributes and recurse
   *
   * @param node - The DOM node to walk (typically `document.body`)
   */
  private static walkAndSanitize(node: Node): void {
    // Snapshot children array — NodeList is live and mutates as we remove nodes
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

        // Allowed tag: sanitize its attributes, then recurse into children
        if (ALLOWED_TAGS.has(tagName)) {
          MessageSanitizer.sanitizeElement(element);
          MessageSanitizer.walkAndSanitize(element);
          continue;
        }

        // Disallowed tag but not dangerous: unwrap (keep text content)
        MessageSanitizer.unwrapElement(element, node);
      }
      // Text nodes and comment nodes are left as-is
      // (text content is safe; comments are inert)
    }
  }

  /**
   * Sanitizes the attributes of a single DOM element in-place.
   *
   * For each attribute:
   * - If the attribute is not in the allowlist for this tag → remove it
   * - If the attribute value contains a dangerous URI scheme → remove it
   * - For `<a>` tags: enforce `rel="noopener noreferrer"` on external links
   *
   * @param element - The DOM element whose attributes to sanitize
   */
  private static sanitizeElement(element: Element): void {
    const tagName = element.tagName.toLowerCase();
    const allowedAttrs = ALLOWED_ATTRIBUTES.get(tagName) ?? new Set<string>();

    // Snapshot attribute names (NamedNodeMap is live)
    const attrNames = Array.from(element.attributes).map((a) => a.name);

    for (const attrName of attrNames) {
      const lowerAttr = attrName.toLowerCase();

      // Remove event handlers unconditionally
      if (lowerAttr.startsWith('on')) {
        element.removeAttribute(attrName);
        continue;
      }

      // Remove attributes not in the allowlist for this tag
      if (!allowedAttrs.has(lowerAttr)) {
        element.removeAttribute(attrName);
        continue;
      }

      const attrValue = element.getAttribute(attrName) ?? '';

      // Validate href attribute
      if (lowerAttr === 'href') {
        if (!MessageSanitizer.isAllowedHref(attrValue)) {
          element.removeAttribute(attrName);
          continue;
        }
      }

      // Validate src attribute (images)
      if (lowerAttr === 'src') {
        if (!MessageSanitizer.isAllowedSrc(attrValue)) {
          element.removeAttribute(attrName);
          continue;
        }
      }

      // Enforce target="_blank" only (no other target values)
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
        // External links must have rel="noopener noreferrer"
        element.setAttribute('rel', 'noopener noreferrer');
        // Ensure target="_blank" for external links (optional but common)
        if (!element.hasAttribute('target')) {
          element.setAttribute('target', '_blank');
        }
      }
    }
  }

  /**
   * Replaces a DOM element with its child nodes, effectively "unwrapping" it.
   *
   * Used for disallowed (but non-dangerous) tags: the tag itself is removed
   * but its text and sub-element content is preserved in the parent.
   *
   * @param element - The element to unwrap
   * @param parent - The parent node to insert the children into
   */
  private static unwrapElement(element: Element, parent: Node): void {
    // First recurse into the element's children before reparenting
    MessageSanitizer.walkAndSanitize(element);

    // Move all children to the parent, before the element
    const fragment = element.ownerDocument?.createDocumentFragment() ?? null;
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
   * where `DOMParser` is unavailable (e.g., Node.js SSR).
   *
   * Strategy:
   * 1. Remove all tags that should be stripped with their content entirely
   * 2. Remove all event handler attributes
   * 3. Remove entire tags (with their attributes) that are not on the allowlist
   * 4. For allowed tags, strip disallowed attributes
   * 5. Validate and remove dangerous href/src values
   *
   * @param html - Raw HTML string
   * @returns Sanitized HTML string
   *
   * @remarks
   * Regex-based sanitization is inherently less robust than DOM-based
   * sanitization. It may be bypassed by crafted inputs that exploit HTML
   * parser ambiguities. Use only when DOMParser is unavailable.
   */
  private static sanitizeWithRegex(html: string): string {
    let result = html;

    // Step 1: Remove entire dangerous tags including their content
    for (const tag of REMOVE_WITH_CONTENT_TAGS) {
      result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
      result = result.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'gi'), '');
    }

    // Step 2: Remove all event handler attributes (on*)
    result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Step 3: Remove script/style content even without proper closing tags
    result = result.replace(/<script[^>]*>[\s\S]*?(<\/script>|$)/gi, '');
    result = result.replace(/<style[^>]*>[\s\S]*?(<\/style>|$)/gi, '');

    // Step 4: Strip disallowed HTML tags (keep their text content)
    result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (ALLOWED_TAGS.has(tag)) {
        // Keep allowed tag — but strip disallowed attributes within it
        return MessageSanitizer.sanitizeTagAttributes(match, tag);
      }
      // Remove the tag but keep its content (unwrap effect)
      return '';
    });

    return result;
  }

  /**
   * Sanitizes the attribute string within a single HTML tag (regex path).
   *
   * Reconstructs the tag with only permitted attributes and validated values.
   *
   * @param tagString - Full HTML tag string (e.g., `<a href="..." onclick="...">`)
   * @param tagName - Lowercase tag name (e.g., `'a'`)
   * @returns Sanitized tag string with only allowed attributes
   */
  private static sanitizeTagAttributes(tagString: string, tagName: string): string {
    const allowedAttrs = ALLOWED_ATTRIBUTES.get(tagName);
    if (!allowedAttrs || allowedAttrs.size === 0) {
      // Tag allows no attributes — return bare tag
      const isVoid = tagName === 'br' || tagName === 'img' || tagName === 'hr';
      const isSelfClosing = /\/>$/.test(tagString);
      return isVoid || isSelfClosing ? `<${tagName}>` : tagString.startsWith('</') ? `</${tagName}>` : `<${tagName}>`;
    }

    // Extract all attribute key=value pairs
    const attrRegex = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

    // Determine if this is a closing tag
    if (tagString.startsWith('</')) {
      return `</${tagName}>`;
    }

    const builtAttrs: string[] = [];
    let attrMatch: RegExpExecArray | null;

    // Reset and scan from after the opening < tag-name
    const attrSection = tagString.replace(/^<\w+/, '').replace(/\/?>$/, '');
    attrRegex.lastIndex = 0;

    while ((attrMatch = attrRegex.exec(attrSection)) !== null) {
      const attrName = (attrMatch[1] ?? '').toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

      // Skip event handlers
      if (attrName.startsWith('on')) continue;

      // Skip attributes not in allowlist
      if (!allowedAttrs.has(attrName)) continue;

      // Validate href
      if (attrName === 'href' && !MessageSanitizer.isAllowedHref(attrValue)) continue;

      // Validate src
      if (attrName === 'src' && !MessageSanitizer.isAllowedSrc(attrValue)) continue;

      // Validate target
      if (attrName === 'target' && attrValue !== '_blank') continue;

      builtAttrs.push(`${attrName}="${MessageSanitizer.escapeHtml(attrValue)}"`);
    }

    // Enforce rel on <a> with href
    if (tagName === 'a' && builtAttrs.some((a) => a.startsWith('href='))) {
      builtAttrs.push('rel="noopener noreferrer"');
      if (!builtAttrs.some((a) => a.startsWith('target='))) {
        builtAttrs.push('target="_blank"');
      }
    }

    const isSelfClosing = tagName === 'br' || tagName === 'img' || tagName === 'hr';
    const attrsStr = builtAttrs.length > 0 ? ' ' + builtAttrs.join(' ') : '';

    return isSelfClosing ? `<${tagName}${attrsStr}>` : `<${tagName}${attrsStr}>`;
  }

  // --------------------------------------------------------------------------
  // URL Validation Helpers
  // --------------------------------------------------------------------------

  /**
   * Validates that an `href` attribute value uses an allowed URI scheme.
   *
   * Allowed schemes: `http:`, `https:`, `mailto:`
   * Blocked: `javascript:`, `data:`, `vbscript:`, and all other schemes.
   *
   * Empty hrefs (anchor links like `#section`) are permitted.
   *
   * @param value - The raw attribute value to validate
   * @returns `true` if the URL is safe to use as an href
   */
  private static isAllowedHref(value: string): boolean {
    const trimmed = value.trim();

    // Detect dangerous scheme even with obfuscation (e.g., "jAvAsCrIpT:", whitespace)
    const normalized = trimmed.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();

    if (DANGEROUS_SCHEME_PATTERN.test(normalized)) return false;

    // Allow empty hrefs (fragment anchors) and relative URLs
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/')) return true;

    // Require http/https/mailto for absolute URLs
    return ALLOWED_HREF_SCHEMES.test(trimmed);
  }

  /**
   * Validates that a `src` attribute value uses an allowed URI scheme.
   *
   * Only `https:` is permitted for image sources to prevent mixed content
   * and data-exfiltration via `data:` URLs.
   *
   * @param value - The raw attribute value to validate
   * @returns `true` if the URL is safe to use as an img src
   */
  private static isAllowedSrc(value: string): boolean {
    const trimmed = value.trim();

    if (!trimmed) return false;

    // Reject dangerous schemes
    const normalized = trimmed.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
    if (DANGEROUS_SCHEME_PATTERN.test(normalized)) return false;

    return ALLOWED_SRC_SCHEMES.test(trimmed);
  }

  // --------------------------------------------------------------------------
  // Environment Detection
  // --------------------------------------------------------------------------

  /**
   * Checks whether `DOMParser` is available in the current environment.
   *
   * Returns `true` in browser environments; `false` in Node.js/SSR without
   * a DOM polyfill.
   *
   * @returns `true` if `DOMParser` can be safely instantiated
   */
  private static isDomParserAvailable(): boolean {
    return typeof DOMParser !== 'undefined';
  }
}
