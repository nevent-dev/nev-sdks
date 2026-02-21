/**
 * FontLoader - Dynamic font loading for the chatbot widget
 *
 * Manages Google Fonts and custom `@font-face` loading for the chatbot widget.
 * All injected `<link>` and `<style>` elements are tracked internally so they
 * can be cleaned up when the widget is destroyed via `destroy()`.
 *
 * Architecture:
 * - Google Fonts are loaded by injecting a `<link rel="stylesheet">` pointing to
 *   the Google Fonts CDN with `display=swap` for progressive enhancement.
 * - Custom fonts are loaded by injecting a `<style>` with `@font-face` rules.
 * - Both mechanisms are idempotent: a font is only loaded once even if the method
 *   is called multiple times with the same family name.
 * - The `isFontLoaded` check uses the browser's `document.fonts` API when
 *   available, falling back to a registry-based check.
 *
 * Security:
 * - Google Font family names are validated and sanitised before embedding in
 *   the URL to prevent injection.
 * - Custom font URLs are not further validated here — callers are responsible
 *   for ensuring URLs come from trusted sources.
 *
 * Usage:
 * ```typescript
 * const loader = new FontLoader();
 *
 * // Load a Google Font with specific weights
 * await loader.loadGoogleFont('Inter', [400, 500, 600, 700]);
 *
 * // Load a custom @font-face font
 * loader.loadCustomFont({
 *   family: 'MyBrandFont',
 *   type: 'CUSTOM_FONT',
 *   files: {
 *     '400': 'https://cdn.example.com/font-regular.woff2',
 *     '700': 'https://cdn.example.com/font-bold.woff2',
 *   },
 * });
 *
 * // Check if loaded
 * loader.isFontLoaded('Inter'); // true
 *
 * // Clean up on widget destroy
 * loader.destroy();
 * ```
 */

import type { FontConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Base URL for the Google Fonts CSS2 API.
 * Uses v2 API for variable font weight support.
 */
const GOOGLE_FONTS_BASE_URL = 'https://fonts.googleapis.com/css2';

/**
 * Default font weights to load when none are specified.
 * Covers regular, medium, semi-bold, and bold — sufficient for most UI use cases.
 */
const DEFAULT_FONT_WEIGHTS = [400, 500, 600, 700];

/**
 * Attribute used to identify chatbot-owned font `<style>` elements.
 * Allows `destroy()` to remove only elements it created.
 */
const FONT_STYLE_ATTR = 'data-nevent-chatbot-font';

/**
 * Attribute used to identify chatbot-owned Google Fonts `<link>` elements.
 */
const GOOGLE_FONT_LINK_ATTR = 'data-nevent-chatbot-gfont';

// ============================================================================
// FontLoader Class
// ============================================================================

/**
 * Manages dynamic font loading for the chatbot widget.
 *
 * Responsibilities:
 * 1. Load Google Fonts by injecting `<link>` tags pointing to the CDN.
 * 2. Load custom `@font-face` fonts by injecting `<style>` tags.
 * 3. Track all injected elements for cleanup on `destroy()`.
 * 4. Provide idempotent loading (calling load twice for the same family is safe).
 *
 * @example
 * ```typescript
 * const loader = new FontLoader();
 * await loader.loadGoogleFont('Inter', [400, 700]);
 * loader.loadCustomFont({ family: 'MyFont', type: 'CUSTOM_FONT', files: { '400': 'url' } });
 * loader.destroy(); // Removes all injected elements
 * ```
 */
export class FontLoader {
  /**
   * Set of font family names that have been loaded (or are being loaded).
   * Used to prevent duplicate requests.
   */
  private loadedFonts: Set<string> = new Set();

  /**
   * All `<style>` elements injected for custom `@font-face` rules.
   * Stored for cleanup on `destroy()`.
   */
  private styleElements: HTMLStyleElement[] = [];

  /**
   * All `<link>` elements injected for Google Fonts.
   * Stored for cleanup on `destroy()`.
   */
  private linkElements: HTMLLinkElement[] = [];

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Loads a Google Font by family name.
   *
   * Injects a `<link rel="stylesheet">` tag pointing to the Google Fonts CDN.
   * The link includes `display=swap` so text is visible while the font loads.
   * Multiple weights can be requested in a single call; they are included in
   * the URL as a comma-separated weight list.
   *
   * If the font has already been loaded by this `FontLoader` instance, this
   * method returns immediately without injecting a duplicate element.
   *
   * @param family  - Font family name (e.g. 'Inter', 'Roboto', 'Open Sans').
   *   Spaces are normalised with `+` for URL encoding.
   * @param weights - Array of numeric font weights to load. Defaults to
   *   `[400, 500, 600, 700]` when not specified.
   * @returns Promise that resolves when the font stylesheet has been fetched,
   *   or immediately when the font is already loaded. The promise does NOT
   *   guarantee the font is ready to render — use `document.fonts.ready` or
   *   `FontFaceSet.load()` for that.
   *
   * @example
   * ```typescript
   * // Load Inter with four weights
   * await loader.loadGoogleFont('Inter', [400, 500, 600, 700]);
   *
   * // Load Roboto with default weights
   * await loader.loadGoogleFont('Roboto');
   * ```
   */
  async loadGoogleFont(family: string, weights?: number[]): Promise<void> {
    const sanitised = this.sanitiseFontFamily(family);
    if (!sanitised) return;

    // Idempotency check — uses the sanitised family as the key
    if (this.loadedFonts.has(`gfont:${sanitised}`)) return;

    const resolvedWeights =
      weights && weights.length > 0 ? weights : DEFAULT_FONT_WEIGHTS;

    // Build Google Fonts v2 URL
    // Format: https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap
    const urlFamily = sanitised.replace(/ /g, '+');
    const weightList = resolvedWeights
      .filter((w) => w > 0 && w <= 1000)
      .sort((a, b) => a - b)
      .join(';');

    const url = `${GOOGLE_FONTS_BASE_URL}?family=${urlFamily}:wght@${weightList}&display=swap`;

    // Check for an existing <link> with the same href (injected by another widget instance)
    if (document.querySelector(`link[href="${url}"]`)) {
      this.loadedFonts.add(`gfont:${sanitised}`);
      return;
    }

    return new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.setAttribute(GOOGLE_FONT_LINK_ATTR, sanitised);

      link.onload = () => {
        this.loadedFonts.add(`gfont:${sanitised}`);
        resolve();
      };

      // Resolve even on error — degraded gracefully to system font
      link.onerror = () => {
        resolve();
      };

      document.head.appendChild(link);
      this.linkElements.push(link);
    });
  }

  /**
   * Loads a custom font via a `@font-face` CSS rule injected into the document.
   *
   * Reads the font file URLs from `config.files` (keyed by weight, e.g.
   * `{ '400': 'url', '700': 'url' }`) and builds one `@font-face` rule per
   * file. The format is inferred from the URL extension:
   * - `.woff2` → `format('woff2')`
   * - `.woff`  → `format('woff')`
   * - `.ttf`   → `format('truetype')`
   * - `.otf`   → `format('opentype')`
   * - other    → no format hint
   *
   * If `config.family` is not set, or `config.files` is empty, this method
   * is a no-op.
   *
   * When a `shadowRoot` is provided, the `@font-face` rules are injected into
   * both `document.head` (for the browser's global font registry) and the
   * shadow root (for cross-browser Shadow DOM compatibility — some browsers
   * do not inherit `@font-face` from the outer document into shadow trees).
   *
   * @param config - Font configuration from the `FontConfig` type.
   *   `config.family` is required; `config.files` must contain at least one URL.
   * @param shadowRoot - Optional shadow root to also inject @font-face into.
   *
   * @example
   * ```typescript
   * loader.loadCustomFont({
   *   family: 'BrandFont',
   *   type: 'CUSTOM_FONT',
   *   files: {
   *     '400': 'https://cdn.example.com/brand-regular.woff2',
   *     '700': 'https://cdn.example.com/brand-bold.woff2',
   *   },
   * }, shadowRoot);
   * ```
   */
  loadCustomFont(config: FontConfig, shadowRoot?: ShadowRoot): void {
    if (!config.family) return;
    if (!config.files || Object.keys(config.files).length === 0) return;

    const family = config.family;
    const key = `custom:${family}`;

    // Idempotency check
    if (this.loadedFonts.has(key)) return;

    // Build @font-face rules — one per weight/file entry
    const rules: string[] = [];

    for (const [weight, url] of Object.entries(config.files)) {
      if (!url) continue;

      const format = this.inferFontFormat(url);
      const formatHint = format ? ` format('${format}')` : '';
      const numericWeight = parseInt(weight, 10) || 400;

      rules.push(
        `@font-face{` +
          `font-family:'${this.escapeCssString(family)}';` +
          `src:url('${this.escapeCssUrl(url)}')${formatHint};` +
          `font-weight:${numericWeight};` +
          `font-display:swap;` +
          `}`
      );
    }

    if (rules.length === 0) return;

    // Check if a <style> for this font already exists (multiple widget instances)
    const existingId = `nevent-cb-font-${this.slugify(family)}`;
    if (document.getElementById(existingId)) {
      this.loadedFonts.add(key);
      return;
    }

    const cssText = rules.join('');

    // Inject into document.head (global font registry)
    const style = document.createElement('style');
    style.id = existingId;
    style.setAttribute(FONT_STYLE_ATTR, family);
    style.textContent = cssText;
    document.head.appendChild(style);
    this.styleElements.push(style);

    // Also inject into shadow root for cross-browser compatibility.
    // Some browsers (notably older versions of Firefox and Safari) do not
    // inherit @font-face from the outer document into shadow trees.
    if (shadowRoot) {
      const shadowStyle = document.createElement('style');
      shadowStyle.id = `${existingId}-shadow`;
      shadowStyle.setAttribute(FONT_STYLE_ATTR, family);
      shadowStyle.textContent = cssText;
      shadowRoot.appendChild(shadowStyle);
      this.styleElements.push(shadowStyle);
    }

    this.loadedFonts.add(key);
  }

  /**
   * Checks whether a given font family has been loaded by this `FontLoader` instance.
   *
   * When the browser's `FontFaceSet` API is available (most modern browsers),
   * this also checks `document.fonts.check()` to detect fonts loaded by other
   * means (e.g. a pre-existing stylesheet on the page).
   *
   * @param family - Font family name to check (case-sensitive)
   * @returns `true` when the font is considered loaded
   *
   * @example
   * ```typescript
   * await loader.loadGoogleFont('Inter');
   * loader.isFontLoaded('Inter'); // true
   * ```
   */
  isFontLoaded(family: string): boolean {
    // Check our internal registry first (fastest path)
    if (
      this.loadedFonts.has(`gfont:${family}`) ||
      this.loadedFonts.has(`custom:${family}`)
    ) {
      return true;
    }

    // Fallback: ask the browser's FontFaceSet (if available)
    try {
      if (typeof document !== 'undefined' && document.fonts) {
        return document.fonts.check(`12px '${family}'`);
      }
    } catch {
      // FontFaceSet.check() can throw in some environments — ignore
    }

    return false;
  }

  /**
   * Removes all `<link>` and `<style>` elements injected by this instance
   * and clears the loaded-fonts registry.
   *
   * Should be called when the chatbot widget is destroyed to ensure no
   * orphaned font elements remain in the document.
   *
   * @example
   * ```typescript
   * loader.destroy();
   * // All injected font elements are removed from the DOM
   * ```
   */
  destroy(): void {
    for (const link of this.linkElements) {
      link.remove();
    }
    for (const style of this.styleElements) {
      style.remove();
    }

    this.linkElements = [];
    this.styleElements = [];
    this.loadedFonts.clear();
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Sanitises a font family name for use in a URL and CSS identifier.
   *
   * - Strips characters that are not letters, digits, spaces, or hyphens.
   * - Trims leading and trailing whitespace.
   * - Returns `null` if the result is empty (invalid family name).
   *
   * @param family - Raw font family name from consumer config
   * @returns Sanitised family name, or `null` if invalid
   */
  private sanitiseFontFamily(family: string): string | null {
    // Allow letters (including Unicode), digits, spaces, and hyphens
    // This covers all valid Google Font names
    const sanitised = family.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
    return sanitised.length > 0 ? sanitised : null;
  }

  /**
   * Infers the CSS `format()` hint string from a font file URL.
   *
   * @param url - Font file URL
   * @returns CSS format string (e.g. `'woff2'`), or `null` if unknown
   */
  private inferFontFormat(url: string): string | null {
    const lower = url.toLowerCase().split('?')[0] ?? '';
    if (lower.endsWith('.woff2')) return 'woff2';
    if (lower.endsWith('.woff')) return 'woff';
    if (lower.endsWith('.ttf')) return 'truetype';
    if (lower.endsWith('.otf')) return 'opentype';
    if (lower.endsWith('.eot')) return 'embedded-opentype';
    return null;
  }

  /**
   * Escapes a string for safe use inside a CSS single-quoted string value.
   * Replaces backslashes and single quotes with CSS escape sequences.
   *
   * @param str - String to escape
   * @returns CSS-safe escaped string
   */
  private escapeCssString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Escapes a URL for safe embedding in a CSS `url()` function.
   * Removes dangerous characters to prevent CSS injection.
   *
   * @param url - URL to escape
   * @returns Escaped URL string
   */
  private escapeCssUrl(url: string): string {
    // Strip characters that could break out of a CSS url() or cause injection
    return url.replace(/['"\\]/g, '');
  }

  /**
   * Converts a font family name to a safe HTML id / slug.
   *
   * @param family - Font family name
   * @returns Lowercase hyphen-separated slug (e.g. 'Open Sans' → 'open-sans')
   */
  private slugify(family: string): string {
    return family
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
