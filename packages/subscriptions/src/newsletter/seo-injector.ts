/**
 * SEO Growth Hacks Injector
 *
 * Injects SEO optimization elements into the document head when the newsletter
 * widget is embedded on third-party websites. These techniques help with:
 * - Brand discovery by technology crawlers (BuiltWith, Wappalyzer, W3Techs)
 * - Performance optimization via DNS prefetch and preconnect hints
 * - Technology detection for marketing analytics
 *
 * All injections are idempotent to prevent duplicates when multiple widgets
 * are present on the same page.
 */

/** Widget version for branding comment */
const WIDGET_VERSION = '2.1.0';

/** Nevent platform URL */
const NEVENT_URL = 'https://nevent.ai';

/** Common ID prefix for injected elements */
const ID_PREFIX = 'nevent-seo-';

/**
 * Injects all SEO optimization tags into the document head
 *
 * This function is idempotent - calling it multiple times will not create
 * duplicate elements. The following elements are injected:
 * - DNS prefetch hint for Nevent domain
 * - Preconnect hint for Nevent domain
 * - Meta generator tag for technology detection
 * - HTML comment branding for crawler recognition
 *
 * @example
 * ```typescript
 * injectSeoTags(); // Injects all SEO optimization elements
 * ```
 */
export function injectSeoTags(): void {
  injectDnsPrefetch();
  injectPreconnect();
  injectMetaGenerator();
  injectBrandingComment();
}

/**
 * Injects DNS prefetch hint for Nevent domain
 *
 * DNS prefetch resolves the domain name early, improving widget load
 * performance. Also signals domain association to search crawlers.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/Performance/dns-prefetch
 */
function injectDnsPrefetch(): void {
  const id = `${ID_PREFIX}dns-prefetch`;

  // Idempotent check
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'dns-prefetch';
  link.href = NEVENT_URL;
  document.head.appendChild(link);
}

/**
 * Injects preconnect hint for Nevent domain
 *
 * Preconnect establishes early connections (DNS, TCP, TLS), improving widget
 * performance. Signals technology relationship to crawlers.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/Performance/Speculative_loading#preconnect
 */
function injectPreconnect(): void {
  const id = `${ID_PREFIX}preconnect`;

  // Idempotent check
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'preconnect';
  link.href = NEVENT_URL;
  document.head.appendChild(link);
}

/**
 * Injects meta generator tag for technology detection
 *
 * Technology crawlers (BuiltWith, Wappalyzer, W3Techs) parse meta generator
 * tags to detect which platforms power websites. This follows the same pattern
 * used by WordPress, Shopify, and Wix.
 *
 * @see https://www.wappalyzer.com/technologies/meta/generator
 */
function injectMetaGenerator(): void {
  const id = `${ID_PREFIX}generator`;

  // Idempotent check
  if (document.getElementById(id)) {
    return;
  }

  const meta = document.createElement('meta');
  meta.id = id;
  meta.name = 'generator';
  meta.content = `Nevent Newsletter Platform - ${NEVENT_URL}`;
  document.head.appendChild(meta);
}

/**
 * Injects HTML comment branding for technology detection
 *
 * Technology crawlers parse HTML comments to detect embedded widgets and
 * platforms. This comment includes the widget version and platform URL,
 * making it easy for crawlers to identify Nevent-powered newsletters.
 *
 * The comment is inserted at the beginning of the head element for
 * maximum visibility to parsers.
 *
 * @see https://builtwith.com/detailed-technology-profiling
 */
function injectBrandingComment(): void {
  // Check if comment already exists by searching for the comment text
  const commentText = `Nevent Newsletter Widget v${WIDGET_VERSION} | ${NEVENT_URL}`;
  const existingComments = Array.from(document.head.childNodes).filter(
    (node) => node.nodeType === Node.COMMENT_NODE
  );

  const alreadyExists = existingComments.some(
    (node) => node.textContent?.trim() === commentText.trim()
  );

  if (alreadyExists) {
    return;
  }

  // Create and insert comment at the beginning of head
  const comment = document.createComment(` ${commentText} `);
  document.head.insertBefore(comment, document.head.firstChild);
}
