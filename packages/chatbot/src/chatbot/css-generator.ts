/**
 * CSSGenerator - Dynamic CSS generation for the chatbot widget
 *
 * Generates a complete, scoped stylesheet for the chatbot widget based on the
 * active theme mode, user-provided style overrides, and a z-index configuration.
 * The generated CSS uses CSS custom properties (design tokens) to enable
 * zero-JS runtime theme switching and easy consumer overrides.
 *
 * Architecture:
 * - All color, spacing, typography, and shadow values live in CSS custom properties
 *   declared on `.nevent-chatbot-root`.
 * - Component rules reference only those custom properties — never hardcoded values.
 * - Dark theme overrides are applied via `[data-theme="dark"]` attribute selector.
 * - System-preference auto mode uses `@media (prefers-color-scheme: dark)` with
 *   `[data-theme="auto"]`.
 * - User-provided `ChatbotStyles` properties are mapped to property overrides on
 *   `.nevent-chatbot-root` so they win over theme defaults without `!important`.
 * - Responsive mobile fullscreen layout is provided via `@media (max-width: 480px)`.
 *
 * Usage:
 * ```typescript
 * const generator = new CSSGenerator('light', styles, 9999);
 * generator.inject();                          // Injects <style id="nevent-chatbot-styles"> into <head>
 * generator.setTheme('dark');                  // Swaps data-theme attribute at runtime
 * generator.setThemePreset('midnight');        // Apply a named theme preset
 * generator.setThemeTokens({ '--nev-cb-color-primary': '#FF0000' }); // Apply token overrides
 * generator.setThemeFromColor('#6366F1');      // Auto-generate theme from brand color
 * generator.injectCustomCSS('.foo{color:red}'); // Inject consumer custom CSS
 * generator.removeCustomCSS();                 // Remove injected custom CSS
 * generator.remove();                          // Removes the injected style element
 * const css = generator.generateCSS();         // Returns CSS as a string (SSR / testing)
 * ```
 *
 * @remarks
 * All generated CSS is scoped under `.nevent-chatbot-root` to prevent style
 * leakage into the host page. This class has no dependency on the DOM for
 * CSS generation — `generateCSS()` works in SSR environments.
 */

import type { ChatbotStyles, ThemeMode } from '../types';
import { getThemePreset, generateThemeFromColor } from './theme-presets';

// ============================================================================
// Constants
// ============================================================================

/** Unique id of the injected <style> element, used for idempotent injection. */
const STYLE_ELEMENT_ID = 'nevent-chatbot-styles';

/**
 * Unique id of the injected <style> element for consumer custom CSS.
 * Kept separate from the generated stylesheet so it can be updated
 * independently without regenerating the entire widget stylesheet.
 */
const CUSTOM_STYLE_ELEMENT_ID = 'nevent-chatbot-custom-styles';

/** The root CSS class scoping all widget styles. */
const ROOT_CLASS = '.nevent-chatbot-root';

/** Mobile breakpoint below which the chat window goes fullscreen. */
const MOBILE_BREAKPOINT = 480;

// ============================================================================
// CSSGenerator Class
// ============================================================================

/**
 * Generates and manages the complete CSS stylesheet for the chatbot widget.
 *
 * Responsibilities:
 * 1. Define design token custom properties for light and dark themes.
 * 2. Map user-provided `ChatbotStyles` to property overrides.
 * 3. Provide base component styles referencing only custom properties.
 * 4. Inject / remove a single `<style>` element in the document head.
 * 5. Support runtime theme switching via a `data-theme` attribute on the root.
 */
export class CSSGenerator {
  /** Reference to the injected `<style>` element, null when not injected. */
  private styleElement: HTMLStyleElement | null = null;

  /**
   * Whether the stylesheet has been injected into the document.
   * Exposed as a readonly getter so callers can check injection state
   * without re-injecting unnecessarily.
   */
  private _injected: boolean = false;

  /**
   * Runtime CSS custom property token overrides applied to the root element
   * inline (via `style` attribute).  Populated by `setThemePreset`,
   * `setThemeTokens`, and `setThemeFromColor`.  Merged on top of the base
   * theme tokens defined in the stylesheet.
   *
   * Keys are `--nev-cb-*` custom property names; values are raw CSS values.
   */
  private runtimeTokens: Record<string, string> = {};

  /**
   * Reference to the custom CSS `<style>` element injected via `injectCustomCSS`.
   * Null when no custom CSS is active.
   */
  private customStyleElement: HTMLStyleElement | null = null;

  /**
   * The target node where `<style>` elements are injected.
   * When a `ShadowRoot` is provided, styles live inside the shadow boundary
   * for full CSS isolation.  Falls back to `document.head` when null.
   */
  private styleTarget: ShadowRoot | null = null;

  /**
   * Creates a new CSSGenerator instance.
   *
   * @param theme - Initial theme mode ('light' | 'dark' | 'auto').
   * @param styles - Optional consumer-provided style overrides (`ChatbotStyles`).
   * @param zIndex - CSS z-index used for the widget layer (default: 9999).
   */
  constructor(
    private theme: ThemeMode,
    private styles: ChatbotStyles | undefined,
    private zIndex: number
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Injects the complete widget stylesheet into the provided target or
   * `document.head`.
   *
   * When a `ShadowRoot` is provided, the `<style>` element is appended inside
   * the shadow boundary so that widget CSS is fully isolated from the host
   * page (and vice-versa).  This is the recommended mode for production use.
   *
   * If a `<style>` element with id `nevent-chatbot-styles` already exists in
   * the target it is replaced, making this method idempotent and safe to call
   * multiple times (e.g. when the widget is re-initialised on a SPA route
   * change).
   *
   * @param target - Optional `ShadowRoot` to inject styles into.  When
   *   omitted the styles are injected into `document.head` (legacy behavior).
   *
   * @example
   * ```typescript
   * // Inject into shadow root for style isolation
   * generator.inject(shadowRoot);
   *
   * // Legacy: inject into document.head
   * generator.inject();
   * ```
   */
  inject(target?: ShadowRoot): void {
    // Store the target for later use by injectCustomCSS and remove.
    this.styleTarget = target ?? null;

    const parent: Node = target ?? document.head;

    // Remove any previously injected element so we always start fresh.
    // ShadowRoot does not have getElementById, so fall back to querySelector.
    const existing = target
      ? target.querySelector(`#${STYLE_ELEMENT_ID}`)
      : document.getElementById(STYLE_ELEMENT_ID);
    if (existing) {
      existing.remove();
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = STYLE_ELEMENT_ID;
    this.styleElement.textContent = this.generateCSS();

    parent.appendChild(this.styleElement);
    this._injected = true;
  }

  /**
   * Returns whether the stylesheet is currently injected into the document.
   *
   * @returns `true` if `inject()` has been called and `remove()` has not been
   *   called since, `false` otherwise.
   */
  get isInjected(): boolean {
    return this._injected;
  }

  /**
   * Removes the injected `<style>` element from the document and resets
   * internal state. Also removes any custom CSS element injected via
   * `injectCustomCSS`, and clears runtime token overrides from the root.
   * Safe to call even when `inject()` has not been called.
   *
   * @example
   * ```typescript
   * generator.remove();
   * // The <style> element is gone from the DOM
   * ```
   */
  remove(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    } else {
      // Handle the case where the element was injected before this instance was
      // created (e.g. server-side injection restored in the browser).
      // Check the stored target first, then fall back to document.
      const parent: ParentNode = this.styleTarget ?? document;
      const existing = parent.querySelector(`#${STYLE_ELEMENT_ID}`);
      existing?.remove();
    }
    this._injected = false;
    this.styleTarget = null;

    // Also remove the custom CSS element if present
    this.removeCustomCSS();
  }

  /**
   * Updates the active theme at runtime by setting the `data-theme` attribute
   * on the widget root element. The CSS custom properties defined for the new
   * theme take effect immediately without re-injecting the stylesheet.
   *
   * The method also stores the new theme so that a subsequent call to
   * `inject()` can re-generate CSS with any theme-dependent values.
   *
   * @param theme - New theme mode to apply.
   *
   * @example
   * ```typescript
   * generator.setTheme('dark');
   * // Root element gains data-theme="dark" and dark tokens activate
   * ```
   */
  setTheme(theme: ThemeMode): void {
    this.theme = theme;

    const searchRoot: ParentNode = this.styleTarget ?? document;
    const root = searchRoot.querySelector(ROOT_CLASS) as HTMLElement | null;
    if (root) {
      root.setAttribute('data-theme', this.theme);
    }
  }

  /**
   * Applies a named theme preset to the widget at runtime.
   *
   * Looks up the preset in the global registry (including any presets registered
   * via `registerThemePreset`). If found, applies all of its tokens as inline
   * style properties on the root element, overriding the base theme layer.
   *
   * Does nothing and returns `false` if the preset name is not registered.
   *
   * @param presetName - Name of the preset to apply (e.g. `'midnight'`, `'ocean'`).
   * @returns `true` if the preset was found and applied, `false` otherwise.
   *
   * @example
   * ```typescript
   * generator.setThemePreset('midnight');
   * // Deep-purple midnight theme is now active
   *
   * generator.setThemePreset('unknown'); // false — no-op
   * ```
   */
  setThemePreset(presetName: string): boolean {
    const preset = getThemePreset(presetName);
    if (!preset) return false;

    this.applyRuntimeTokens(preset.tokens);
    return true;
  }

  /**
   * Applies a custom set of CSS token overrides to the widget root element.
   *
   * Each key must be a `--nev-cb-*` custom property name; values are raw CSS
   * values (colors, px strings, etc.). The tokens are applied as inline styles
   * on `.nevent-chatbot-root` so they win over the base theme layer.
   *
   * Calling this method multiple times merges tokens — each call extends the
   * accumulated overrides rather than replacing them. To reset all token
   * overrides, call `clearRuntimeTokens()`.
   *
   * @param tokens - Record of CSS custom property names to raw CSS values.
   *
   * @example
   * ```typescript
   * generator.setThemeTokens({
   *   '--nev-cb-color-primary': '#FF0000',
   *   '--nev-cb-header-bg': '#FF0000',
   * });
   * ```
   */
  setThemeTokens(tokens: Record<string, string>): void {
    this.applyRuntimeTokens(tokens);
  }

  /**
   * Generates a full theme from a single brand color and applies it at runtime.
   *
   * Delegates to `generateThemeFromColor` (from `theme-presets.ts`) to compute
   * a complete set of complementary design tokens using HSL color manipulation.
   * The resulting tokens are applied as inline styles on the root element.
   *
   * If `brandColor` cannot be parsed as a hex color, this method is a no-op
   * and returns `false`.
   *
   * @param brandColor - Brand color as a hex string (e.g. `'#6366F1'`).
   * @returns `true` if the theme was generated and applied, `false` on parse failure.
   *
   * @example
   * ```typescript
   * generator.setThemeFromColor('#6366F1');
   * // A full light-mode theme complementary to indigo is now active
   * ```
   */
  setThemeFromColor(brandColor: string): boolean {
    const tokens = generateThemeFromColor(brandColor);
    if (Object.keys(tokens).length === 0) return false;

    this.applyRuntimeTokens(tokens);
    return true;
  }

  /**
   * Clears all runtime token overrides applied via `setThemePreset`,
   * `setThemeTokens`, or `setThemeFromColor`.
   *
   * Removes all inline CSS custom properties from the root element,
   * restoring it to the base theme defined in the injected stylesheet.
   *
   * @example
   * ```typescript
   * generator.clearRuntimeTokens();
   * // Root element inline styles are cleared; base theme is restored
   * ```
   */
  clearRuntimeTokens(): void {
    this.runtimeTokens = {};

    const searchRoot: ParentNode = this.styleTarget ?? document;
    const root = searchRoot.querySelector(ROOT_CLASS) as HTMLElement | null;
    if (!root) return;

    // Remove only the custom property inline styles, leaving other inline styles intact
    const style = root.style;
    for (const prop of Array.from(style)) {
      if (prop.startsWith('--nev-cb-')) {
        style.removeProperty(prop);
      }
    }
  }

  /**
   * Injects additional custom CSS provided by the consumer into the document.
   *
   * The CSS is placed in a separate `<style id="nevent-chatbot-custom-styles">`
   * element appended AFTER the base widget stylesheet, so it can override any
   * generated rule without requiring `!important`.
   *
   * Calling this method replaces any previously injected custom CSS.
   *
   * **Security:** The following patterns are stripped from the CSS before
   * injection to prevent XSS and CSS injection attacks:
   * - `@import` rules (could load external malicious stylesheets)
   * - `expression(...)` (IE-era CSS expression execution)
   * - `url(javascript:...)` (javascript: URL in CSS properties)
   * - `behavior:` (IE-specific HTC behaviour attachment)
   *
   * @param css - Raw CSS string provided by the consumer. Must be plain CSS;
   *   preprocessed formats (SCSS, Less) are not supported.
   *
   * @example
   * ```typescript
   * generator.injectCustomCSS(`
   *   .nevent-chatbot-bubble {
   *     border: 2px solid gold;
   *   }
   * `);
   * ```
   */
  injectCustomCSS(css: string, target?: ShadowRoot): void {
    const sanitised = this.sanitiseCustomCSS(css);

    // Remove any previously injected custom style element
    this.removeCustomCSS();

    if (!sanitised.trim()) return;

    // Use the explicitly provided target, or fall back to the stored styleTarget
    // (set during inject()), or document.head as last resort.
    const parent: Node = target ?? this.styleTarget ?? document.head;

    this.customStyleElement = document.createElement('style');
    this.customStyleElement.id = CUSTOM_STYLE_ELEMENT_ID;
    this.customStyleElement.textContent = sanitised;
    parent.appendChild(this.customStyleElement);
  }

  /**
   * Removes the consumer-injected custom CSS `<style>` element from the document.
   *
   * Safe to call even when no custom CSS has been injected (no-op).
   *
   * @example
   * ```typescript
   * generator.removeCustomCSS();
   * // Custom CSS element is removed; base widget styles remain
   * ```
   */
  removeCustomCSS(): void {
    if (this.customStyleElement) {
      this.customStyleElement.remove();
      this.customStyleElement = null;
    } else {
      // Also remove any element injected by a previous instance.
      // Check the shadow root first, then fall back to document.
      const parent: ParentNode = this.styleTarget ?? document;
      parent.querySelector(`#${CUSTOM_STYLE_ELEMENT_ID}`)?.remove();
    }
  }

  /**
   * Generates the complete CSS stylesheet as a plain string.
   *
   * This method has no side effects and does not require a DOM. It is safe
   * to call in SSR / Node environments and is also used internally by
   * `inject()` to produce the stylesheet text.
   *
   * The generated CSS is intentionally minified (no unnecessary whitespace)
   * to reduce payload size in production.
   *
   * @returns Complete CSS string ready for injection or testing.
   *
   * @example
   * ```typescript
   * const css = generator.generateCSS();
   * // Use in tests, SSR <style> tags, or Shadow DOM adoptedStyleSheets
   * ```
   */
  generateCSS(): string {
    const parts: string[] = [
      this.generateLightTokens(),
      this.generateDarkTokens(),
      this.generateAutoTokens(),
      this.generateUserOverrides(),
      this.generateBaseReset(),
      this.generateBubbleStyles(),
      this.generateWindowStyles(),
      this.generateHeaderStyles(),
      this.generateBodyStyles(),
      this.generateFooterStyles(),
      this.generateMessageStyles(),
      this.generateQuickReplyStyles(),
      this.generateInputStyles(),
      this.generateFileUploadStyles(),
      this.generateTypingStyles(),
      this.generateRichContentStyles(),
      this.generateMarkdownStyles(),
      this.generateUtilityStyles(),
      this.generateKeyframes(),
      this.generateResponsiveStyles(),
      this.generateAccessibilityStyles(),
      this.generateCustomCSS(),
    ];

    // Join with no separator — each block already has no trailing whitespace.
    return parts.filter(Boolean).join('');
  }

  // --------------------------------------------------------------------------
  // Private: Runtime Token Helpers
  // --------------------------------------------------------------------------

  /**
   * Merges new tokens into the runtime token registry and applies all
   * accumulated tokens as inline CSS custom properties on the root element.
   *
   * Applied tokens win over the theme layer in the injected stylesheet because
   * inline styles have higher specificity than `<style>` rules.
   *
   * @param tokens - Tokens to merge into the current runtime overrides
   */
  private applyRuntimeTokens(tokens: Record<string, string>): void {
    // Merge into accumulated registry
    Object.assign(this.runtimeTokens, tokens);

    const searchRoot: ParentNode = this.styleTarget ?? document;
    const root = searchRoot.querySelector(ROOT_CLASS) as HTMLElement | null;
    if (!root) return;

    // Apply every accumulated token as an inline style
    for (const [prop, value] of Object.entries(this.runtimeTokens)) {
      root.style.setProperty(prop, value);
    }
  }

  /**
   * Sanitises a raw CSS string provided by the consumer before injection.
   *
   * Strips patterns that could be used for XSS or CSS injection:
   * - `@import` rules — could load external malicious stylesheets
   * - `expression(...)` — IE-era JS execution via CSS
   * - `url(javascript:...)` — javascript: protocol in CSS url()
   * - `behavior:` — IE-specific HTC behaviour attachment
   *
   * @param css - Raw CSS string from the consumer
   * @returns Sanitised CSS string safe for injection
   */
  private sanitiseCustomCSS(css: string): string {
    return (
      css
        // Strip @import rules (single-line and multi-line)
        .replace(/@import\s[^;]+;/gi, '')
        // Strip IE expression() — could execute arbitrary JS
        .replace(/expression\s*\([^)]*\)/gi, '')
        // Strip url(javascript:...) — prevent JS via CSS
        .replace(/url\s*\(\s*(['"]?)javascript:/gi, 'url($1about:')
        // Strip IE behaviour binding
        .replace(/behavior\s*:/gi, '_behavior_disabled_:')
    );
  }

  // --------------------------------------------------------------------------
  // Private: Design Token Blocks
  // --------------------------------------------------------------------------

  /**
   * Generates CSS custom properties for the light theme (default).
   * All tokens are declared on the root class so they cascade to every child.
   *
   * @returns CSS block string with light-theme design tokens.
   */
  private generateLightTokens(): string {
    const z = this.zIndex;
    return (
      `${ROOT_CLASS}{` +
      // Colors
      `--nev-cb-color-primary:#6366F1;` +
      `--nev-cb-color-primary-hover:#4F46E5;` +
      `--nev-cb-color-bg:#FFFFFF;` +
      `--nev-cb-color-bg-secondary:#F9FAFB;` +
      `--nev-cb-color-surface:#F3F4F6;` +
      `--nev-cb-color-text:#111827;` +
      `--nev-cb-color-text-secondary:#6B7280;` +
      `--nev-cb-color-text-muted:#9CA3AF;` +
      `--nev-cb-color-border:#E5E7EB;` +
      `--nev-cb-color-error:#EF4444;` +
      `--nev-cb-color-success:#10B981;` +
      `--nev-cb-color-badge:#EF4444;` +
      // Typography
      `--nev-cb-font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
      `--nev-cb-font-size-xs:11px;` +
      `--nev-cb-font-size-sm:13px;` +
      `--nev-cb-font-size-base:14px;` +
      `--nev-cb-font-size-lg:16px;` +
      `--nev-cb-font-size-xl:18px;` +
      // Spacing
      `--nev-cb-spacing-xs:4px;` +
      `--nev-cb-spacing-sm:8px;` +
      `--nev-cb-spacing-md:12px;` +
      `--nev-cb-spacing-lg:16px;` +
      `--nev-cb-spacing-xl:24px;` +
      // Borders
      `--nev-cb-radius-sm:8px;` +
      `--nev-cb-radius-md:12px;` +
      `--nev-cb-radius-lg:16px;` +
      `--nev-cb-radius-full:9999px;` +
      // Shadows
      `--nev-cb-shadow-sm:0 1px 3px rgba(0,0,0,0.1);` +
      `--nev-cb-shadow-md:0 4px 16px rgba(0,0,0,0.12);` +
      `--nev-cb-shadow-lg:0 8px 32px rgba(0,0,0,0.15);` +
      // Animation
      `--nev-cb-transition-fast:150ms ease;` +
      `--nev-cb-transition-normal:200ms ease;` +
      `--nev-cb-transition-slow:300ms ease;` +
      // Z-index
      `--nev-cb-z-index:${z};` +
      // Component-level tokens (derived, can be overridden individually)
      `--nev-cb-bubble-bg:var(--nev-cb-color-primary);` +
      `--nev-cb-bubble-icon-color:#ffffff;` +
      `--nev-cb-bubble-size:56px;` +
      `--nev-cb-bubble-shadow:var(--nev-cb-shadow-md);` +
      `--nev-cb-badge-bg:var(--nev-cb-color-badge);` +
      `--nev-cb-badge-color:#ffffff;` +
      `--nev-cb-header-bg:var(--nev-cb-color-primary);` +
      `--nev-cb-header-text:#ffffff;` +
      `--nev-cb-header-subtitle:rgba(255,255,255,0.8);` +
      `--nev-cb-msg-user-bg:var(--nev-cb-color-primary);` +
      `--nev-cb-msg-user-color:#ffffff;` +
      `--nev-cb-msg-bot-bg:var(--nev-cb-color-surface);` +
      `--nev-cb-msg-bot-color:var(--nev-cb-color-text);` +
      `--nev-cb-msg-system-color:var(--nev-cb-color-text-muted);` +
      `--nev-cb-input-bg:var(--nev-cb-color-bg);` +
      `--nev-cb-input-color:var(--nev-cb-color-text);` +
      `--nev-cb-input-border:var(--nev-cb-color-border);` +
      `--nev-cb-input-placeholder:var(--nev-cb-color-text-muted);` +
      `--nev-cb-input-focus-border:var(--nev-cb-color-primary);` +
      `--nev-cb-send-btn-bg:var(--nev-cb-color-primary);` +
      `--nev-cb-send-btn-color:#ffffff;` +
      `--nev-cb-qr-bg:transparent;` +
      `--nev-cb-qr-color:var(--nev-cb-color-primary);` +
      `--nev-cb-qr-border:var(--nev-cb-color-primary);` +
      `--nev-cb-qr-hover-bg:var(--nev-cb-color-primary);` +
      `--nev-cb-qr-hover-color:#ffffff;` +
      `--nev-cb-typing-dot-color:var(--nev-cb-color-text-muted);` +
      `--nev-cb-typing-bg:var(--nev-cb-color-surface);` +
      `--nev-cb-loading-bg:rgba(255,255,255,0.8);` +
      `--nev-cb-scroll-btn-bg:var(--nev-cb-color-bg);` +
      `--nev-cb-scroll-btn-border:var(--nev-cb-color-border);` +
      `}`
    );
  }

  /**
   * Generates CSS custom property overrides for the dark theme.
   * Applied when the root element has `data-theme="dark"`.
   *
   * @returns CSS block string with dark-theme token overrides.
   */
  private generateDarkTokens(): string {
    return (
      `${ROOT_CLASS}[data-theme="dark"]{` +
      `--nev-cb-color-primary:#818CF8;` +
      `--nev-cb-color-primary-hover:#6366F1;` +
      `--nev-cb-color-bg:#1F2937;` +
      `--nev-cb-color-bg-secondary:#111827;` +
      `--nev-cb-color-surface:#374151;` +
      `--nev-cb-color-text:#F9FAFB;` +
      `--nev-cb-color-text-secondary:#D1D5DB;` +
      `--nev-cb-color-text-muted:#9CA3AF;` +
      `--nev-cb-color-border:#374151;` +
      `--nev-cb-shadow-sm:0 1px 3px rgba(0,0,0,0.3);` +
      `--nev-cb-shadow-md:0 4px 16px rgba(0,0,0,0.4);` +
      `--nev-cb-shadow-lg:0 8px 32px rgba(0,0,0,0.5);` +
      `--nev-cb-loading-bg:rgba(31,41,55,0.8);` +
      `}`
    );
  }

  /**
   * Generates CSS custom property overrides for the auto theme.
   * Applied when the root element has `data-theme="auto"` AND the user's
   * OS preference is dark, via `@media (prefers-color-scheme: dark)`.
   *
   * @returns CSS block string with auto dark-theme media query.
   */
  private generateAutoTokens(): string {
    return (
      `@media (prefers-color-scheme:dark){` +
      `${ROOT_CLASS}[data-theme="auto"]{` +
      `--nev-cb-color-primary:#818CF8;` +
      `--nev-cb-color-primary-hover:#6366F1;` +
      `--nev-cb-color-bg:#1F2937;` +
      `--nev-cb-color-bg-secondary:#111827;` +
      `--nev-cb-color-surface:#374151;` +
      `--nev-cb-color-text:#F9FAFB;` +
      `--nev-cb-color-text-secondary:#D1D5DB;` +
      `--nev-cb-color-text-muted:#9CA3AF;` +
      `--nev-cb-color-border:#374151;` +
      `--nev-cb-shadow-sm:0 1px 3px rgba(0,0,0,0.3);` +
      `--nev-cb-shadow-md:0 4px 16px rgba(0,0,0,0.4);` +
      `--nev-cb-shadow-lg:0 8px 32px rgba(0,0,0,0.5);` +
      `--nev-cb-loading-bg:rgba(31,41,55,0.8);` +
      `}}`
    );
  }

  /**
   * Maps consumer-provided `ChatbotStyles` to CSS custom property overrides.
   *
   * Each optional field in `ChatbotStyles` (e.g. `bubble.backgroundColor`)
   * is translated to the corresponding design token on `.nevent-chatbot-root`.
   * This approach lets consumers override only what they need while the rest
   * falls through to the theme defaults.
   *
   * @returns CSS override block, or empty string when no styles are provided.
   */
  private generateUserOverrides(): string {
    const s = this.styles;
    if (!s) return '';

    const props: string[] = [];

    // -- Global overrides -------------------------------------------------------
    if (s.fontFamily) {
      props.push(`--nev-cb-font-family:${s.fontFamily};`);
    }
    if (s.fontSize) {
      props.push(`--nev-cb-font-size-base:${s.fontSize};`);
    }
    if (s.borderRadius) {
      // Consumer passes a string like "12px" or "8"
      const r = s.borderRadius;
      props.push(`--nev-cb-radius-md:${r};`);
      props.push(`--nev-cb-radius-lg:${r};`);
    }

    // -- Bubble overrides -------------------------------------------------------
    if (s.bubble?.backgroundColor) {
      props.push(`--nev-cb-bubble-bg:${s.bubble.backgroundColor};`);
    }
    if (s.bubble?.iconColor) {
      props.push(`--nev-cb-bubble-icon-color:${s.bubble.iconColor};`);
    }
    if (s.bubble?.size !== undefined) {
      props.push(`--nev-cb-bubble-size:${s.bubble.size}px;`);
    }
    if (s.bubble?.shadow) {
      props.push(`--nev-cb-bubble-shadow:${s.bubble.shadow};`);
    }
    if (s.bubble?.badgeColor) {
      props.push(`--nev-cb-badge-bg:${s.bubble.badgeColor};`);
    }
    if (s.bubble?.badgeTextColor) {
      props.push(`--nev-cb-badge-color:${s.bubble.badgeTextColor};`);
    }

    // -- Header overrides -------------------------------------------------------
    if (s.header?.backgroundColor) {
      props.push(`--nev-cb-header-bg:${s.header.backgroundColor};`);
      // Cascade header colour to component-level tokens derived from it
      props.push(`--nev-cb-msg-user-bg:${s.header.backgroundColor};`);
      props.push(`--nev-cb-send-btn-bg:${s.header.backgroundColor};`);
      props.push(`--nev-cb-qr-color:${s.header.backgroundColor};`);
      props.push(`--nev-cb-qr-border:${s.header.backgroundColor};`);
      props.push(`--nev-cb-qr-hover-bg:${s.header.backgroundColor};`);
      props.push(`--nev-cb-input-focus-border:${s.header.backgroundColor};`);
    }
    if (s.header?.textColor) {
      props.push(`--nev-cb-header-text:${s.header.textColor};`);
    }
    if (s.header?.subtitleColor) {
      props.push(`--nev-cb-header-subtitle:${s.header.subtitleColor};`);
    }
    if (s.header?.font?.family) {
      props.push(`--nev-cb-font-family:'${s.header.font.family}',sans-serif;`);
    }

    // -- Window overrides -------------------------------------------------------
    if (s.window?.backgroundColor) {
      props.push(`--nev-cb-color-bg:${s.window.backgroundColor};`);
    }
    if (s.window?.shadow) {
      props.push(`--nev-cb-shadow-lg:${s.window.shadow};`);
    }
    if (s.window?.borderRadius !== undefined) {
      props.push(`--nev-cb-radius-lg:${s.window.borderRadius}px;`);
    }

    // -- Message overrides ------------------------------------------------------
    if (s.messages?.userBubbleColor) {
      props.push(`--nev-cb-msg-user-bg:${s.messages.userBubbleColor};`);
    }
    if (s.messages?.userTextColor) {
      props.push(`--nev-cb-msg-user-color:${s.messages.userTextColor};`);
    }
    if (s.messages?.botBubbleColor) {
      props.push(`--nev-cb-msg-bot-bg:${s.messages.botBubbleColor};`);
      // Keep typing bubble consistent with bot bubble
      props.push(`--nev-cb-typing-bg:${s.messages.botBubbleColor};`);
    }
    if (s.messages?.botTextColor) {
      props.push(`--nev-cb-msg-bot-color:${s.messages.botTextColor};`);
    }
    if (s.messages?.systemMessageColor) {
      props.push(`--nev-cb-msg-system-color:${s.messages.systemMessageColor};`);
      props.push(`--nev-cb-typing-dot-color:${s.messages.systemMessageColor};`);
    }
    if (s.messages?.font?.family) {
      props.push(
        `--nev-cb-font-family:'${s.messages.font.family}',sans-serif;`
      );
    }
    if (s.messages?.fontSize) {
      props.push(`--nev-cb-font-size-base:${s.messages.fontSize};`);
    }
    if (s.messages?.borderRadius !== undefined) {
      props.push(`--nev-cb-radius-lg:${s.messages.borderRadius}px;`);
    }

    // -- Input overrides --------------------------------------------------------
    if (s.input?.backgroundColor) {
      props.push(`--nev-cb-input-bg:${s.input.backgroundColor};`);
    }
    if (s.input?.textColor) {
      props.push(`--nev-cb-input-color:${s.input.textColor};`);
    }
    if (s.input?.borderColor) {
      props.push(`--nev-cb-input-border:${s.input.borderColor};`);
    }
    if (s.input?.placeholderColor) {
      props.push(`--nev-cb-input-placeholder:${s.input.placeholderColor};`);
    }
    if (s.input?.focusBorderColor) {
      props.push(`--nev-cb-input-focus-border:${s.input.focusBorderColor};`);
    }
    if (s.input?.sendButtonColor) {
      props.push(`--nev-cb-send-btn-bg:${s.input.sendButtonColor};`);
    }
    if (s.input?.sendButtonIconColor) {
      props.push(`--nev-cb-send-btn-color:${s.input.sendButtonIconColor};`);
    }
    if (s.input?.font?.family) {
      props.push(`--nev-cb-font-family:'${s.input.font.family}',sans-serif;`);
    }

    // -- Quick reply overrides --------------------------------------------------
    if (s.quickReplies?.backgroundColor) {
      props.push(`--nev-cb-qr-bg:${s.quickReplies.backgroundColor};`);
    }
    if (s.quickReplies?.textColor) {
      props.push(`--nev-cb-qr-color:${s.quickReplies.textColor};`);
    }
    if (s.quickReplies?.borderColor) {
      props.push(`--nev-cb-qr-border:${s.quickReplies.borderColor};`);
    }
    if (s.quickReplies?.hoverBackgroundColor) {
      props.push(
        `--nev-cb-qr-hover-bg:${s.quickReplies.hoverBackgroundColor};`
      );
    }
    if (s.quickReplies?.hoverTextColor) {
      props.push(`--nev-cb-qr-hover-color:${s.quickReplies.hoverTextColor};`);
    }

    // -- Typing indicator overrides --------------------------------------------
    if (s.typingIndicator?.dotColor) {
      props.push(`--nev-cb-typing-dot-color:${s.typingIndicator.dotColor};`);
    }
    if (s.typingIndicator?.backgroundColor) {
      props.push(`--nev-cb-typing-bg:${s.typingIndicator.backgroundColor};`);
    }

    if (props.length === 0) return '';
    return `${ROOT_CLASS}{${props.join('')}}`;
  }

  // --------------------------------------------------------------------------
  // Private: Base Reset
  // --------------------------------------------------------------------------

  /**
   * Generates a minimal CSS reset scoped to the widget root.
   * Ensures box-sizing, font inheritance, and layout isolation without
   * affecting the host page's global styles.
   *
   * @returns CSS reset block string.
   */
  private generateBaseReset(): string {
    return (
      // Shadow DOM :host reset — ensures the shadow host does not inherit
      // styles from the outer page and renders as a neutral container.
      `:host{all:initial;display:contents;}` +
      `${ROOT_CLASS},${ROOT_CLASS} *,${ROOT_CLASS} *::before,${ROOT_CLASS} *::after{box-sizing:border-box;}` +
      `${ROOT_CLASS}{` +
      `font-family:var(--nev-cb-font-family);` +
      `font-size:var(--nev-cb-font-size-base);` +
      `line-height:1.5;` +
      `color:var(--nev-cb-color-text);` +
      `-webkit-font-smoothing:antialiased;` +
      `-moz-osx-font-smoothing:grayscale;` +
      `}`
    );
  }

  // --------------------------------------------------------------------------
  // Private: Component Style Blocks
  // --------------------------------------------------------------------------

  /**
   * Generates styles for the floating chat bubble (FAB) and its unread badge.
   *
   * Uses component-level tokens derived from the design token layer, so all
   * user overrides propagate automatically.
   *
   * @returns CSS block string for bubble component.
   */
  private generateBubbleStyles(): string {
    return (
      // Bubble container (positions the button at the viewport corner)
      `.nevent-chatbot-bubble-container{` +
      `position:fixed;` +
      `z-index:var(--nev-cb-z-index);` +
      `}` +
      // Bubble button
      `.nevent-chatbot-bubble{` +
      `width:var(--nev-cb-bubble-size);` +
      `height:var(--nev-cb-bubble-size);` +
      `border-radius:var(--nev-cb-radius-full);` +
      `background-color:var(--nev-cb-bubble-bg);` +
      `color:var(--nev-cb-bubble-icon-color);` +
      `border:none;` +
      `cursor:pointer;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `box-shadow:var(--nev-cb-bubble-shadow);` +
      `position:relative;` +
      `overflow:visible;` +
      `padding:0;` +
      // Do NOT set outline:none — :focus-visible rules in generateAccessibilityStyles() handle focus (WCAG 2.4.7)
      `transform:scale(0);` +
      `transition:transform var(--nev-cb-transition-slow) cubic-bezier(0.175,0.885,0.32,1.275),box-shadow var(--nev-cb-transition-normal);` +
      `}` +
      // Bubble icon spans (crossfade)
      `.nevent-chatbot-bubble-icon{` +
      `position:absolute;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `transition:opacity var(--nev-cb-transition-normal);` +
      `line-height:0;` +
      `}` +
      // Unread badge
      `.nevent-chatbot-badge{` +
      `position:absolute;` +
      `top:-4px;` +
      `right:-4px;` +
      `min-width:20px;` +
      `height:20px;` +
      `border-radius:var(--nev-cb-radius-full);` +
      `background-color:var(--nev-cb-badge-bg);` +
      `color:var(--nev-cb-badge-color);` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `font-weight:600;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0 5px;` +
      `box-sizing:border-box;` +
      `line-height:1;` +
      `font-family:var(--nev-cb-font-family);` +
      `}`
    );
  }

  /**
   * Generates styles for the main chat window container.
   *
   * Includes fixed positioning, dimensions via inline-style (set by renderer),
   * shadow, border-radius, and the initial hidden state for open/close animation.
   *
   * @returns CSS block string for window component.
   */
  private generateWindowStyles(): string {
    return (
      `.nevent-chatbot-window{` +
      `position:fixed;` +
      `display:none;` +
      `flex-direction:column;` +
      `overflow:hidden;` +
      `background-color:var(--nev-cb-color-bg);` +
      `border-radius:var(--nev-cb-radius-lg);` +
      `box-shadow:var(--nev-cb-shadow-lg);` +
      `font-family:var(--nev-cb-font-family);` +
      `opacity:0;` +
      `transform:translateY(20px);` +
      `transition:opacity var(--nev-cb-transition-normal) ease-out,transform var(--nev-cb-transition-normal) ease-out;` +
      `z-index:calc(var(--nev-cb-z-index) - 1);` +
      `}`
    );
  }

  /**
   * Generates styles for the chat window header bar.
   *
   * @returns CSS block string for header component.
   */
  private generateHeaderStyles(): string {
    return (
      `.nevent-chatbot-header{` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:space-between;` +
      `padding:0 var(--nev-cb-spacing-md);` +
      `background-color:var(--nev-cb-header-bg);` +
      `flex-shrink:0;` +
      `}` +
      `.nevent-chatbot-header-title{` +
      `color:var(--nev-cb-header-text);` +
      `font-size:var(--nev-cb-font-size-lg);` +
      `font-weight:600;` +
      `line-height:1.3;` +
      `overflow:hidden;` +
      `text-overflow:ellipsis;` +
      `white-space:nowrap;` +
      `}` +
      `.nevent-chatbot-header-subtitle{` +
      `color:var(--nev-cb-header-subtitle);` +
      `font-size:12px;` +
      `line-height:1.3;` +
      `overflow:hidden;` +
      `text-overflow:ellipsis;` +
      `white-space:nowrap;` +
      `}` +
      `.nevent-chatbot-header-button{` +
      `background:none;` +
      `border:none;` +
      `cursor:pointer;` +
      `padding:6px;` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `color:var(--nev-cb-header-text);` +
      `opacity:0.8;` +
      `transition:opacity var(--nev-cb-transition-fast),background-color var(--nev-cb-transition-fast);` +
      `line-height:0;` +
      `}` +
      `.nevent-chatbot-header-button:hover{` +
      `opacity:1;` +
      `background-color:rgba(255,255,255,0.15);` +
      `}` +
      `.nevent-chatbot-header-avatar{` +
      `width:36px;` +
      `height:36px;` +
      `border-radius:50%;` +
      `object-fit:cover;` +
      `flex-shrink:0;` +
      `}`
    );
  }

  /**
   * Generates styles for the scrollable message body area.
   *
   * @returns CSS block string for body and message list components.
   */
  private generateBodyStyles(): string {
    return (
      `.nevent-chatbot-body{` +
      `flex:1;` +
      `overflow-y:auto;` +
      `overflow-x:hidden;` +
      `position:relative;` +
      `background-color:var(--nev-cb-color-bg);` +
      `}` +
      `.nevent-chatbot-messages{` +
      `display:flex;` +
      `flex-direction:column;` +
      `padding:var(--nev-cb-spacing-lg) 0;` +
      `overflow-y:auto;` +
      `overflow-x:hidden;` +
      `height:100%;` +
      `box-sizing:border-box;` +
      `}` +
      // Loading overlay (spinner inside body)
      `.nevent-chatbot-loading{` +
      `display:none;` +
      `position:absolute;` +
      `top:0;left:0;right:0;bottom:0;` +
      `justify-content:center;` +
      `align-items:center;` +
      `background-color:var(--nev-cb-loading-bg);` +
      `z-index:1;` +
      `}` +
      `.nevent-chatbot-loading-spinner{` +
      `width:32px;` +
      `height:32px;` +
      `border:3px solid var(--nev-cb-color-border);` +
      `border-top-color:var(--nev-cb-header-bg);` +
      `border-radius:50%;` +
      `animation:nevent-chatbot-spin 0.8s linear infinite;` +
      `}`
    );
  }

  /**
   * Generates styles for the footer area that hosts the input component.
   *
   * @returns CSS block string for footer component.
   */
  private generateFooterStyles(): string {
    return (
      `.nevent-chatbot-footer{` +
      `border-top:1px solid var(--nev-cb-color-border);` +
      `flex-shrink:0;` +
      `background-color:var(--nev-cb-color-bg);` +
      `}`
    );
  }

  /**
   * Generates styles for all message bubble variants:
   * user messages, bot messages, system messages, timestamps, and date separators.
   *
   * Message bubble border-radius uses an asymmetric pattern to create a
   * "chat tail" effect (tighter bottom corner on the sending side).
   *
   * @returns CSS block string for message components.
   */
  private generateMessageStyles(): string {
    return (
      // Message wrapper
      `.nevent-chatbot-message{` +
      `display:flex;` +
      `flex-direction:column;` +
      `padding:2px var(--nev-cb-spacing-lg);` +
      `}` +
      `.nevent-chatbot-message--user{align-items:flex-end;}` +
      `.nevent-chatbot-message--assistant{align-items:flex-start;}` +
      `.nevent-chatbot-message--system{` +
      `align-items:center;` +
      `justify-content:center;` +
      `}` +
      // Message bubble (shared)
      `.nevent-chatbot-message-bubble{` +
      `max-width:80%;` +
      `padding:10px 14px;` +
      `word-wrap:break-word;` +
      `overflow-wrap:break-word;` +
      `}` +
      // User bubble — tight bottom-right corner
      `.nevent-chatbot-message--user .nevent-chatbot-message-bubble{` +
      `background-color:var(--nev-cb-msg-user-bg);` +
      `border-radius:var(--nev-cb-radius-lg) var(--nev-cb-radius-lg) 4px var(--nev-cb-radius-lg);` +
      `}` +
      // Bot bubble — tight bottom-left corner
      `.nevent-chatbot-message--assistant .nevent-chatbot-message-bubble{` +
      `background-color:var(--nev-cb-msg-bot-bg);` +
      `border-radius:var(--nev-cb-radius-lg) var(--nev-cb-radius-lg) var(--nev-cb-radius-lg) 4px;` +
      `}` +
      // Message content text
      `.nevent-chatbot-message-content{` +
      `font-size:var(--nev-cb-font-size-base);` +
      `line-height:1.5;` +
      `font-family:var(--nev-cb-font-family);` +
      `}` +
      `.nevent-chatbot-message--user .nevent-chatbot-message-content{` +
      `color:var(--nev-cb-msg-user-color);` +
      `}` +
      `.nevent-chatbot-message--assistant .nevent-chatbot-message-content{` +
      `color:var(--nev-cb-msg-bot-color);` +
      `}` +
      `.nevent-chatbot-message--system .nevent-chatbot-message-content{` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `color:var(--nev-cb-msg-system-color);` +
      `text-align:center;` +
      `}` +
      // Meta row (timestamp + status)
      `.nevent-chatbot-message-meta{` +
      `display:flex;` +
      `align-items:center;` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `color:var(--nev-cb-color-text-muted);` +
      `margin-top:2px;` +
      `padding:0 2px;` +
      `}` +
      `.nevent-chatbot-message--user .nevent-chatbot-message-meta{justify-content:flex-end;}` +
      `.nevent-chatbot-message--assistant .nevent-chatbot-message-meta{justify-content:flex-start;}` +
      // Timestamp
      `.nevent-chatbot-message-timestamp{` +
      `color:var(--nev-cb-color-text-muted);` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `}` +
      // Date separator
      `.nevent-chatbot-date-separator{` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:var(--nev-cb-spacing-md) var(--nev-cb-spacing-lg);` +
      `gap:var(--nev-cb-spacing-md);` +
      `color:var(--nev-cb-color-text-muted);` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `font-weight:500;` +
      `}` +
      `.nevent-chatbot-date-separator::before,` +
      `.nevent-chatbot-date-separator::after{` +
      `content:'';` +
      `flex:1;` +
      `height:1px;` +
      `background-color:var(--nev-cb-color-border);` +
      `}` +
      // Welcome message
      `.nevent-chatbot-welcome{` +
      `display:flex;` +
      `flex-direction:column;` +
      `align-items:center;` +
      `text-align:center;` +
      `padding:var(--nev-cb-spacing-xl) 32px;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `}` +
      `.nevent-chatbot-welcome-text{` +
      `margin:0;` +
      `font-size:var(--nev-cb-font-size-base);` +
      `line-height:1.5;` +
      `color:var(--nev-cb-msg-bot-color);` +
      `max-width:280px;` +
      `}` +
      // Empty state
      `.nevent-chatbot-empty{` +
      `display:flex;` +
      `flex-direction:column;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:48px 32px;` +
      `text-align:center;` +
      `flex:1;` +
      `color:var(--nev-cb-color-text-muted);` +
      `font-size:var(--nev-cb-font-size-base);` +
      `}` +
      // Scroll-to-bottom button
      `.nevent-chatbot-scroll-button{` +
      `position:sticky;` +
      `bottom:var(--nev-cb-spacing-sm);` +
      `align-self:center;` +
      `width:32px;` +
      `height:32px;` +
      `border-radius:50%;` +
      `background-color:var(--nev-cb-scroll-btn-bg);` +
      `border:1px solid var(--nev-cb-scroll-btn-border);` +
      `box-shadow:var(--nev-cb-shadow-sm);` +
      `cursor:pointer;` +
      `display:none;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0;` +
      `z-index:2;` +
      `color:var(--nev-cb-color-text-secondary);` +
      `line-height:0;` +
      `transition:opacity var(--nev-cb-transition-fast);` +
      `flex-shrink:0;` +
      `}`
    );
  }

  /**
   * Generates styles for quick reply pill buttons.
   *
   * Covers all three display modes:
   * - Default (scroll): single horizontal row with horizontal overflow scroll
   * - Wrap mode: added via `.nevent-chatbot-quick-replies--wrap` modifier
   * - Stacked mode: added via `.nevent-chatbot-quick-replies--stacked` modifier
   *
   * Also covers icon elements, disabled state, highlighted state, and
   * the active/pressed state. These rules complement the inline styles applied
   * by {@link QuickReplyRenderer} — the inline styles take precedence for
   * consumer-configured values, while these CSS rules provide the base defaults.
   *
   * @returns CSS block string for quick reply components.
   */
  private generateQuickReplyStyles(): string {
    return (
      // ---------- Container (default: scroll mode) ----------
      `.nevent-chatbot-quick-replies{` +
      `display:flex;` +
      `flex-wrap:nowrap;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:var(--nev-cb-spacing-sm) var(--nev-cb-spacing-lg);` +
      `overflow-x:auto;` +
      `scrollbar-width:none;` +
      `}` +
      // Hide WebKit scrollbar in scroll mode
      `.nevent-chatbot-quick-replies::-webkit-scrollbar{display:none;}` +
      // ---------- Wrap mode modifier ----------
      `.nevent-chatbot-quick-replies--wrap{` +
      `flex-wrap:wrap;` +
      `overflow-x:visible;` +
      `}` +
      // ---------- Stacked mode modifier ----------
      `.nevent-chatbot-quick-replies--stacked{` +
      `flex-direction:column;` +
      `flex-wrap:nowrap;` +
      `overflow-x:visible;` +
      `}` +
      // ---------- Individual button ----------
      `.nevent-chatbot-quick-reply-button{` +
      `border:1.5px solid var(--nev-cb-qr-border);` +
      `border-radius:var(--nev-cb-radius-full);` +
      `padding:6px 14px;` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `color:var(--nev-cb-qr-color);` +
      `background-color:var(--nev-cb-qr-bg);` +
      `cursor:pointer;` +
      `white-space:nowrap;` +
      `font-family:var(--nev-cb-font-family);` +
      `display:inline-flex;` +
      `align-items:center;` +
      `flex-shrink:0;` +
      `transition:background-color var(--nev-cb-transition-fast),color var(--nev-cb-transition-fast),border-color var(--nev-cb-transition-fast),opacity var(--nev-cb-transition-fast),transform var(--nev-cb-transition-fast);` +
      `}` +
      // Hover state
      `.nevent-chatbot-quick-reply-button:hover{` +
      `background-color:var(--nev-cb-qr-hover-bg);` +
      `color:var(--nev-cb-qr-hover-color);` +
      `border-color:var(--nev-cb-qr-hover-bg);` +
      `}` +
      // Active / pressed state (slightly darker via opacity)
      `.nevent-chatbot-quick-reply-button:active{` +
      `opacity:0.85;` +
      `}` +
      // Disabled state
      `.nevent-chatbot-quick-reply-button:disabled,` +
      `.nevent-chatbot-quick-reply-button[aria-disabled="true"]{` +
      `opacity:0.5;` +
      `pointer-events:none;` +
      `cursor:not-allowed;` +
      `}` +
      // Highlighted state (after user activates a reply)
      `.nevent-chatbot-quick-reply-button--highlighted{` +
      `background-color:var(--nev-cb-qr-hover-bg);` +
      `color:var(--nev-cb-qr-hover-color);` +
      `border-color:var(--nev-cb-qr-hover-bg);` +
      `transform:scale(1.02);` +
      `}` +
      // Stacked mode: full-width buttons with centered text
      `.nevent-chatbot-quick-replies--stacked .nevent-chatbot-quick-reply-button{` +
      `width:100%;` +
      `justify-content:center;` +
      `white-space:normal;` +
      `}` +
      // ---------- Icon element ----------
      // Shared icon styles for both emoji (<span>) and URL (<img>) icons
      `.nevent-chatbot-quick-reply-icon{` +
      `margin-right:6px;` +
      `display:inline-block;` +
      `flex-shrink:0;` +
      `line-height:1;` +
      `vertical-align:middle;` +
      `}` +
      // URL image icon sizing
      `img.nevent-chatbot-quick-reply-icon{` +
      `width:16px;` +
      `height:16px;` +
      `object-fit:contain;` +
      `}`
    );
  }

  /**
   * Generates styles for the message input area (textarea + send button).
   *
   * @returns CSS block string for input components.
   */
  private generateInputStyles(): string {
    return (
      // Input container (column layout: preview strip + input row)
      `.nevent-chatbot-input{` +
      `display:flex;` +
      `flex-direction:column;` +
      `position:relative;` +
      `}` +
      // Textarea
      `.nevent-chatbot-input-field{` +
      `flex:1;` +
      `resize:none;` +
      `border:1px solid var(--nev-cb-input-border);` +
      `border-radius:var(--nev-cb-radius-full);` +
      `padding:10px var(--nev-cb-spacing-lg);` +
      `font-size:var(--nev-cb-font-size-base);` +
      `line-height:20px;` +
      `font-family:var(--nev-cb-font-family);` +
      `color:var(--nev-cb-input-color);` +
      `background-color:var(--nev-cb-input-bg);` +
      // Do NOT set outline:none — :focus-visible rules handle visible focus indication (WCAG 2.4.7)
      `overflow-y:hidden;` +
      `max-height:80px;` +
      `min-height:20px;` +
      `transition:border-color var(--nev-cb-transition-normal);` +
      `box-sizing:border-box;` +
      `}` +
      `.nevent-chatbot-input-field::placeholder{` +
      `color:var(--nev-cb-input-placeholder);` +
      `}` +
      `.nevent-chatbot-input-field:focus{` +
      `border-color:var(--nev-cb-input-focus-border);` +
      `box-shadow:0 0 0 2px color-mix(in srgb,var(--nev-cb-input-focus-border) 20%,transparent);` +
      `}` +
      // Send button
      `.nevent-chatbot-send-button{` +
      `width:36px;` +
      `height:36px;` +
      `min-width:36px;` +
      `border-radius:50%;` +
      `border:none;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0;` +
      `transition:background-color var(--nev-cb-transition-normal),opacity var(--nev-cb-transition-normal);` +
      `background-color:var(--nev-cb-send-btn-bg);` +
      `color:var(--nev-cb-send-btn-color);` +
      `line-height:0;` +
      `flex-shrink:0;` +
      `cursor:pointer;` +
      `}` +
      `.nevent-chatbot-send-button:disabled{` +
      `background-color:var(--nev-cb-color-border);` +
      `color:var(--nev-cb-color-text-muted);` +
      `opacity:0.6;` +
      `cursor:default;` +
      `}`
    );
  }

  /**
   * Generates styles for file upload components: attachment button, file preview
   * strip, preview items, progress bars, drag-and-drop overlay, and message
   * attachment rendering.
   *
   * @returns CSS block string for file upload components.
   */
  private generateFileUploadStyles(): string {
    return (
      // Input row (flex row inside input container)
      `.nevent-chatbot-input-row{` +
      `display:flex;` +
      `align-items:flex-end;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:var(--nev-cb-spacing-md);` +
      `}` +
      // Attachment (paperclip) button
      `.nevent-chatbot-attach-button{` +
      `width:36px;` +
      `height:36px;` +
      `min-width:36px;` +
      `border-radius:50%;` +
      `border:none;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0;` +
      `background-color:transparent;` +
      `color:var(--nev-cb-color-text-muted);` +
      `cursor:pointer;` +
      `transition:color var(--nev-cb-transition-fast),background-color var(--nev-cb-transition-fast);` +
      `line-height:0;` +
      `flex-shrink:0;` +
      `}` +
      `.nevent-chatbot-attach-button:hover{` +
      `color:var(--nev-cb-color-primary);` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-primary) 10%,transparent);` +
      `}` +
      `.nevent-chatbot-attach-button:disabled{` +
      `opacity:0.4;` +
      `cursor:default;` +
      `}` +
      // File preview strip (horizontal scroll above textarea)
      `.nevent-chatbot-file-preview-strip{` +
      `display:flex;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:var(--nev-cb-spacing-sm) var(--nev-cb-spacing-md) 0 var(--nev-cb-spacing-md);` +
      `overflow-x:auto;` +
      `overflow-y:hidden;` +
      `scrollbar-width:thin;` +
      `}` +
      `.nevent-chatbot-file-preview-strip::-webkit-scrollbar{` +
      `height:4px;` +
      `}` +
      `.nevent-chatbot-file-preview-strip::-webkit-scrollbar-track{` +
      `background:transparent;` +
      `}` +
      `.nevent-chatbot-file-preview-strip::-webkit-scrollbar-thumb{` +
      `background:var(--nev-cb-color-border);` +
      `border-radius:2px;` +
      `}` +
      // File preview item
      `.nevent-chatbot-file-preview-item{` +
      `display:flex;` +
      `align-items:center;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:6px var(--nev-cb-spacing-sm);` +
      `background-color:var(--nev-cb-color-surface);` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `border:1px solid var(--nev-cb-color-border);` +
      `position:relative;` +
      `min-width:160px;` +
      `max-width:200px;` +
      `flex-shrink:0;` +
      `}` +
      // File preview thumbnail
      `.nevent-chatbot-file-preview-thumb{` +
      `width:36px;` +
      `height:36px;` +
      `min-width:36px;` +
      `border-radius:4px;` +
      `overflow:hidden;` +
      `background-color:var(--nev-cb-color-border);` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `}` +
      `.nevent-chatbot-file-preview-thumb img{` +
      `width:100%;` +
      `height:100%;` +
      `object-fit:cover;` +
      `}` +
      // File preview info
      `.nevent-chatbot-file-preview-info{` +
      `flex:1;` +
      `min-width:0;` +
      `display:flex;` +
      `flex-direction:column;` +
      `gap:2px;` +
      `}` +
      `.nevent-chatbot-file-preview-name{` +
      `font-size:12px;` +
      `font-weight:500;` +
      `color:var(--nev-cb-color-text);` +
      `overflow:hidden;` +
      `text-overflow:ellipsis;` +
      `white-space:nowrap;` +
      `max-width:120px;` +
      `}` +
      `.nevent-chatbot-file-preview-size{` +
      `font-size:10px;` +
      `color:var(--nev-cb-color-text-muted);` +
      `}` +
      // File preview progress bar
      `.nevent-chatbot-file-preview-progress{` +
      `position:absolute;` +
      `bottom:0;` +
      `left:0;` +
      `right:0;` +
      `height:3px;` +
      `background-color:var(--nev-cb-color-border);` +
      `border-radius:0 0 var(--nev-cb-radius-sm) var(--nev-cb-radius-sm);` +
      `overflow:hidden;` +
      `}` +
      `.nevent-chatbot-file-preview-progress-bar{` +
      `height:100%;` +
      `background-color:var(--nev-cb-color-primary);` +
      `border-radius:0 0 var(--nev-cb-radius-sm) var(--nev-cb-radius-sm);` +
      `transition:width 0.2s ease;` +
      `}` +
      // File preview error state
      `.nevent-chatbot-file-preview-error{` +
      `position:absolute;` +
      `inset:0;` +
      `background-color:rgba(239,68,68,0.1);` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `border:1px solid rgba(239,68,68,0.3);` +
      `pointer-events:none;` +
      `}` +
      // File preview remove button
      `.nevent-chatbot-file-preview-remove{` +
      `width:20px;` +
      `height:20px;` +
      `min-width:20px;` +
      `border-radius:50%;` +
      `border:none;` +
      `cursor:pointer;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0;` +
      `background-color:var(--nev-cb-color-border);` +
      `color:var(--nev-cb-color-text-muted);` +
      `transition:background-color var(--nev-cb-transition-fast);` +
      `flex-shrink:0;` +
      `position:absolute;` +
      `top:-6px;` +
      `right:-6px;` +
      `z-index:1;` +
      `}` +
      `.nevent-chatbot-file-preview-remove:hover{` +
      `background-color:rgba(239,68,68,0.2);` +
      `color:#ef4444;` +
      `}` +
      // Drag-and-drop overlay on input area
      `.nevent-chatbot-input--dragover{` +
      `outline:2px dashed var(--nev-cb-color-primary);` +
      `outline-offset:-2px;` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-primary) 5%,transparent);` +
      `}` +
      // Message attachment rendering
      `.nevent-chatbot-message-attachments{` +
      `display:flex;` +
      `flex-direction:column;` +
      `gap:4px;` +
      `margin-top:4px;` +
      `}` +
      `.nevent-chatbot-message-attachment-item{` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `overflow:hidden;` +
      `}` +
      `.nevent-chatbot-message-attachment-item img{` +
      `display:block;` +
      `max-width:200px;` +
      `max-height:200px;` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `object-fit:cover;` +
      `}` +
      // Upload overlay on attachments
      `.nevent-chatbot-attachment-upload-overlay{` +
      `position:absolute;` +
      `inset:0;` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `background-color:rgba(0,0,0,0.4);` +
      `border-radius:inherit;` +
      `color:#ffffff;` +
      `font-size:13px;` +
      `font-weight:600;` +
      `}`
    );
  }

  /**
   * Generates styles for the typing indicator (three bouncing dots).
   *
   * @returns CSS block string for typing indicator components.
   */
  private generateTypingStyles(): string {
    return (
      // Typing container
      `.nevent-chatbot-typing{` +
      `display:none;` +
      `flex-direction:column;` +
      `align-items:flex-start;` +
      `gap:4px;` +
      `padding:4px var(--nev-cb-spacing-lg);` +
      `opacity:0;` +
      `transform:translateY(4px);` +
      `transition:opacity var(--nev-cb-transition-normal),transform var(--nev-cb-transition-normal);` +
      `}` +
      // Typing bubble
      `.nevent-chatbot-typing-bubble{` +
      `display:flex;` +
      `align-items:center;` +
      `gap:4px;` +
      `padding:var(--nev-cb-spacing-md) var(--nev-cb-spacing-lg);` +
      `background-color:var(--nev-cb-typing-bg);` +
      `border-radius:var(--nev-cb-radius-lg) var(--nev-cb-radius-lg) var(--nev-cb-radius-lg) 4px;` +
      `}` +
      // Dot
      `.nevent-chatbot-typing-dot{` +
      `width:8px;` +
      `height:8px;` +
      `border-radius:50%;` +
      `background-color:var(--nev-cb-typing-dot-color);` +
      `display:inline-block;` +
      `animation:nevent-chatbot-dot-bounce 1.2s infinite ease-in-out;` +
      `}` +
      `.nevent-chatbot-typing-dot:nth-child(2){animation-delay:0.2s;}` +
      `.nevent-chatbot-typing-dot:nth-child(3){animation-delay:0.4s;}` +
      // Typing label
      `.nevent-chatbot-typing-label{` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `color:var(--nev-cb-color-text-muted);` +
      `padding-left:4px;` +
      `font-family:var(--nev-cb-font-family);` +
      `}`
    );
  }

  /**
   * Generates styles for all rich content components:
   * cards, carousels, standalone images, and button groups.
   *
   * All rules use CSS custom properties from the design token layer so they
   * automatically adapt to light / dark themes without additional overrides.
   *
   * Component structure:
   * - `.nevent-chatbot-card`               — card container
   * - `.nevent-chatbot-card-image-wrapper` — card image wrapper
   * - `.nevent-chatbot-card-image`         — card header image
   * - `.nevent-chatbot-card-body`          — card body (title + description)
   * - `.nevent-chatbot-card-title`         — card title text
   * - `.nevent-chatbot-card-description`   — card description (3-line clamp)
   * - `.nevent-chatbot-card-actions`       — card action buttons container
   * - `.nevent-chatbot-card-action`        — individual card action button / link
   * - `.nevent-chatbot-card-action-separator` — thin divider between card actions
   * - `.nevent-chatbot-carousel-wrapper`   — carousel outer wrapper (relative)
   * - `.nevent-chatbot-carousel`           — horizontal scroll track
   * - `.nevent-chatbot-carousel-nav`       — prev/next nav arrow buttons
   * - `.nevent-chatbot-rich-image-wrapper` — standalone image wrapper
   * - `.nevent-chatbot-rich-image`         — standalone image element
   * - `.nevent-chatbot-image-broken`       — broken-image placeholder
   * - `.nevent-chatbot-button-group`       — button group container
   * - `.nevent-chatbot-action-button`      — action button in a group
   * - `.nevent-chatbot-action-button-icon` — icon span inside action button
   * - `.nevent-chatbot-action-button-label`— label span inside action button
   *
   * @returns CSS block string for rich content components.
   */
  private generateRichContentStyles(): string {
    return (
      // -----------------------------------------------------------------------
      // Card
      // -----------------------------------------------------------------------
      `.nevent-chatbot-card{` +
      `background-color:var(--nev-cb-color-bg);` +
      `border-radius:var(--nev-cb-radius-md);` +
      `border:1px solid var(--nev-cb-color-border);` +
      `overflow:hidden;` +
      `max-width:280px;` +
      `box-shadow:var(--nev-cb-shadow-sm);` +
      `display:flex;` +
      `flex-direction:column;` +
      `}` +
      // Card image wrapper
      `.nevent-chatbot-card-image-wrapper{` +
      `width:100%;` +
      `max-height:200px;` +
      `overflow:hidden;` +
      `flex-shrink:0;` +
      `background-color:var(--nev-cb-color-surface);` +
      `}` +
      // Card header image
      `.nevent-chatbot-card-image{` +
      `width:100%;` +
      `height:200px;` +
      `object-fit:cover;` +
      `display:block;` +
      `}` +
      // Card body
      `.nevent-chatbot-card-body{` +
      `padding:var(--nev-cb-spacing-md);` +
      `display:flex;` +
      `flex-direction:column;` +
      `gap:var(--nev-cb-spacing-xs);` +
      `flex:1;` +
      `}` +
      // Card title
      `.nevent-chatbot-card-title{` +
      `font-weight:600;` +
      `font-size:15px;` +
      `color:var(--nev-cb-color-text);` +
      `line-height:1.3;` +
      `}` +
      // Card description — clamp to 3 lines
      `.nevent-chatbot-card-description{` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `color:var(--nev-cb-color-text-secondary);` +
      `line-height:1.5;` +
      `display:-webkit-box;` +
      `-webkit-line-clamp:3;` +
      `-webkit-box-orient:vertical;` +
      `overflow:hidden;` +
      `}` +
      // Card actions container
      `.nevent-chatbot-card-actions{` +
      `border-top:1px solid var(--nev-cb-color-border);` +
      `display:flex;` +
      `flex-direction:column;` +
      `}` +
      // Separator between action buttons inside a card
      `.nevent-chatbot-card-action-separator{` +
      `height:1px;` +
      `background-color:var(--nev-cb-color-border);` +
      `}` +
      // Individual card action button / anchor
      `.nevent-chatbot-card-action{` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `gap:var(--nev-cb-spacing-xs);` +
      `padding:10px var(--nev-cb-spacing-md);` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `font-family:var(--nev-cb-font-family);` +
      `font-weight:500;` +
      `color:var(--nev-cb-color-primary);` +
      `background:none;` +
      `border:none;` +
      `cursor:pointer;` +
      `text-decoration:none;` +
      `width:100%;` +
      `transition:background-color var(--nev-cb-transition-fast);` +
      `}` +
      `.nevent-chatbot-card-action:hover{` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-primary) 8%,transparent);` +
      `}` +
      `.nevent-chatbot-card-action:active{opacity:0.8;}` +
      // -----------------------------------------------------------------------
      // Carousel
      // -----------------------------------------------------------------------

      // Outer wrapper — provides relative context for nav arrows
      `.nevent-chatbot-carousel-wrapper{` +
      `position:relative;` +
      `display:flex;` +
      `align-items:center;` +
      `max-width:100%;` +
      `}` +
      // Scroll track
      `.nevent-chatbot-carousel{` +
      `display:flex;` +
      `flex-direction:row;` +
      `gap:var(--nev-cb-spacing-md);` +
      `overflow-x:auto;` +
      `scroll-snap-type:x mandatory;` +
      `-webkit-overflow-scrolling:touch;` +
      `scrollbar-width:none;` +
      `padding:var(--nev-cb-spacing-sm);` +
      `flex:1;` +
      `}` +
      `.nevent-chatbot-carousel::-webkit-scrollbar{display:none;}` +
      // Snap each card
      `.nevent-chatbot-carousel .nevent-chatbot-card{` +
      `scroll-snap-align:start;` +
      `flex-shrink:0;` +
      `}` +
      // Nav arrow buttons
      `.nevent-chatbot-carousel-nav{` +
      `position:absolute;` +
      `top:50%;` +
      `transform:translateY(-50%);` +
      `width:28px;` +
      `height:28px;` +
      `border-radius:50%;` +
      `border:1px solid var(--nev-cb-color-border);` +
      `background-color:var(--nev-cb-color-bg);` +
      `box-shadow:var(--nev-cb-shadow-sm);` +
      `cursor:pointer;` +
      `align-items:center;` +
      `justify-content:center;` +
      `padding:0;` +
      `color:var(--nev-cb-color-text-secondary);` +
      `z-index:1;` +
      `line-height:0;` +
      `transition:background-color var(--nev-cb-transition-fast);` +
      `}` +
      `.nevent-chatbot-carousel-nav:hover{` +
      `background-color:var(--nev-cb-color-surface);` +
      `}` +
      `.nevent-chatbot-carousel-nav--prev{left:-14px;}` +
      `.nevent-chatbot-carousel-nav--next{right:-14px;}` +
      // -----------------------------------------------------------------------
      // Standalone image
      // -----------------------------------------------------------------------
      `.nevent-chatbot-rich-image-wrapper{` +
      `max-width:100%;` +
      `overflow:hidden;` +
      `border-radius:var(--nev-cb-radius-md);` +
      `background-color:var(--nev-cb-color-surface);` +
      `}` +
      `.nevent-chatbot-rich-image{` +
      `max-width:100%;` +
      `max-height:300px;` +
      `object-fit:contain;` +
      `display:block;` +
      `border-radius:var(--nev-cb-radius-md);` +
      `transition:opacity var(--nev-cb-transition-fast);` +
      `}` +
      // Broken-image placeholder
      `.nevent-chatbot-image-broken{` +
      `display:flex;` +
      `align-items:center;` +
      `justify-content:center;` +
      `width:100%;` +
      `height:120px;` +
      `background-color:var(--nev-cb-color-surface);` +
      `border-radius:var(--nev-cb-radius-md);` +
      `color:var(--nev-cb-color-text-muted);` +
      `}` +
      // -----------------------------------------------------------------------
      // Button group
      // -----------------------------------------------------------------------
      `.nevent-chatbot-button-group{` +
      `display:flex;` +
      `flex-direction:column;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `width:100%;` +
      `padding:var(--nev-cb-spacing-xs) 0;` +
      `}` +
      // Action button inside a button group
      `.nevent-chatbot-action-button{` +
      `display:flex;` +
      `align-items:center;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:10px var(--nev-cb-spacing-lg);` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `font-family:var(--nev-cb-font-family);` +
      `font-weight:500;` +
      `color:var(--nev-cb-color-primary);` +
      `background-color:var(--nev-cb-color-bg);` +
      `border:1px solid var(--nev-cb-color-border);` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `cursor:pointer;` +
      `text-decoration:none;` +
      `width:100%;` +
      `text-align:left;` +
      `transition:background-color var(--nev-cb-transition-fast),border-color var(--nev-cb-transition-fast);` +
      `}` +
      `.nevent-chatbot-action-button:hover{` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-primary) 6%,transparent);` +
      `border-color:var(--nev-cb-color-primary);` +
      `}` +
      `.nevent-chatbot-action-button:active{opacity:0.8;}` +
      // Icon span
      `.nevent-chatbot-action-button-icon{` +
      `display:flex;` +
      `align-items:center;` +
      `flex-shrink:0;` +
      `line-height:0;` +
      `color:var(--nev-cb-color-primary);` +
      `}` +
      // Label span
      `.nevent-chatbot-action-button-label{` +
      `flex:1;` +
      `overflow:hidden;` +
      `text-overflow:ellipsis;` +
      `white-space:nowrap;` +
      `}`
    );
  }

  /**
   * Generates styles for Markdown-rendered content inside bot message bubbles.
   *
   * These rules target elements produced by {@link MarkdownRenderer} when bot
   * messages contain Markdown syntax. All selectors are scoped under the bot
   * message class `.nevent-chatbot-message--assistant` to avoid bleeding into
   * user or system messages.
   *
   * Covers: bold, italic, inline code, code blocks, links, lists, blockquotes,
   * headings (h3-h5), horizontal rules, and images.
   *
   * @returns CSS block string for markdown content styles.
   */
  private generateMarkdownStyles(): string {
    // Alias for the bot message content scope
    const bot = '.nevent-chatbot-message--assistant';
    return (
      // Bold
      `${bot} strong{font-weight:600;}` +
      // Italic
      `${bot} em{font-style:italic;}` +
      // Inline code
      `${bot} code{` +
      `background:rgba(0,0,0,0.06);` +
      `padding:2px 5px;` +
      `border-radius:4px;` +
      `font-family:'SF Mono',Monaco,Consolas,monospace;` +
      `font-size:0.9em;` +
      `}` +
      // Code blocks
      `${bot} pre{` +
      `background:var(--nev-cb-color-surface);` +
      `padding:12px;` +
      `border-radius:8px;` +
      `overflow-x:auto;` +
      `margin:8px 0;` +
      `}` +
      // Reset inline code styles when inside a pre (code block)
      `${bot} pre code{` +
      `background:none;` +
      `padding:0;` +
      `font-size:0.85em;` +
      `line-height:1.5;` +
      `}` +
      // Links
      `${bot} a{` +
      `color:var(--nev-cb-color-primary);` +
      `text-decoration:underline;` +
      `}` +
      // Lists (ul/ol)
      `${bot} ul,${bot} ol{` +
      `margin:4px 0;` +
      `padding-left:20px;` +
      `}` +
      // List items
      `${bot} li{margin:2px 0;}` +
      // Blockquotes
      `${bot} blockquote{` +
      `border-left:3px solid var(--nev-cb-color-primary);` +
      `margin:8px 0;` +
      `padding:4px 12px;` +
      `color:var(--nev-cb-color-text-secondary);` +
      `}` +
      // Headings (downscaled: h3, h4, h5 inside chat bubbles)
      `${bot} h3,${bot} h4,${bot} h5{` +
      `margin:8px 0 4px;` +
      `font-weight:600;` +
      `}` +
      // Horizontal rule
      `${bot} hr{` +
      `border:none;` +
      `border-top:1px solid var(--nev-cb-color-border);` +
      `margin:8px 0;` +
      `}` +
      // Images within markdown content
      `${bot} img{` +
      `max-width:100%;` +
      `border-radius:8px;` +
      `margin:4px 0;` +
      `}` +
      // Paragraphs — tighten margins inside chat bubbles
      `${bot} p{` +
      `margin:0 0 8px;` +
      `}` +
      // Remove bottom margin on last paragraph to avoid extra space
      `${bot} p:last-child{margin-bottom:0;}`
    );
  }

  /**
   * Generates utility/state styles: hidden, open, fullscreen, and fade-in animation
   * class used during window entrance.
   *
   * @returns CSS block string for utility classes.
   */
  private generateUtilityStyles(): string {
    return (
      // Hidden state helper
      `${ROOT_CLASS} .nevent-chatbot-hidden{display:none!important;}` +
      // Branding footer ("Powered by Nevent")
      `.nevent-chatbot-branding{` +
      `display:flex;` +
      `justify-content:center;` +
      `align-items:center;` +
      `padding:6px 0;` +
      `font-size:var(--nev-cb-font-size-xs);` +
      `color:var(--nev-cb-color-text-muted);` +
      `border-top:1px solid var(--nev-cb-color-border);` +
      `opacity:0.7;` +
      `transition:opacity 0.2s ease;` +
      `flex-shrink:0;` +
      `}` +
      `.nevent-chatbot-branding:hover{opacity:1;}` +
      `.nevent-chatbot-branding-link{` +
      `display:inline-flex;` +
      `align-items:center;` +
      `gap:4px;` +
      `color:inherit;` +
      `text-decoration:none;` +
      `cursor:pointer;` +
      `}` +
      `.nevent-chatbot-branding-link:hover{text-decoration:underline;}` +
      `.nevent-chatbot-branding-link strong{` +
      `font-weight:600;` +
      `color:var(--nev-cb-color-primary);` +
      `}` +
      `.nevent-chatbot-branding-icon{opacity:0.6;}` +
      // Error message
      `.nevent-chatbot-error-message{` +
      `display:flex;` +
      `align-items:center;` +
      `gap:var(--nev-cb-spacing-xs);` +
      `padding:var(--nev-cb-spacing-sm) var(--nev-cb-spacing-lg);` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `color:var(--nev-cb-color-error);` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-error) 8%,transparent);` +
      `border-radius:var(--nev-cb-radius-sm);` +
      `margin:0 var(--nev-cb-spacing-lg);` +
      `}` +
      // -----------------------------------------------------------------------
      // Connection status banner
      // Displayed below the window header when connectivity is degraded.
      // Three modifier classes map to the three non-connected states.
      // -----------------------------------------------------------------------
      `.nevent-chatbot-connection-banner{` +
      `display:none;` + // Shown programmatically via JS
      `align-items:center;` +
      `justify-content:center;` +
      `gap:var(--nev-cb-spacing-sm);` +
      `padding:var(--nev-cb-spacing-sm) var(--nev-cb-spacing-lg);` +
      `font-size:var(--nev-cb-font-size-sm);` +
      `font-family:var(--nev-cb-font-family);` +
      `text-align:center;` +
      `width:100%;` +
      `flex-shrink:0;` +
      `transition:background-color var(--nev-cb-transition-normal),color var(--nev-cb-transition-normal),opacity var(--nev-cb-transition-slow);` +
      `}` +
      // Offline: yellow-amber — no network at all
      `.nevent-chatbot-connection-banner--offline{` +
      `display:flex;` +
      `background-color:#FEF3C7;` +
      `color:#92400E;` +
      `}` +
      // Reconnecting: lighter yellow — actively retrying
      `.nevent-chatbot-connection-banner--reconnecting{` +
      `display:flex;` +
      `background-color:#FEF9C3;` +
      `color:#854D0E;` +
      `}` +
      // Connected (post-recovery): green — briefly shown then fades out
      `.nevent-chatbot-connection-banner--connected{` +
      `display:flex;` +
      `background-color:#D1FAE5;` +
      `color:#065F46;` +
      `}` +
      // Spinner icon inside reconnecting banner
      `.nevent-chatbot-connection-banner-spinner{` +
      `width:12px;` +
      `height:12px;` +
      `border:2px solid currentColor;` +
      `border-top-color:transparent;` +
      `border-radius:50%;` +
      `animation:nevent-chatbot-spin 0.8s linear infinite;` +
      `flex-shrink:0;` +
      `}`
    );
  }

  // --------------------------------------------------------------------------
  // Private: Keyframes
  // --------------------------------------------------------------------------

  /**
   * Generates all `@keyframes` animation definitions used by the widget:
   * - `nevent-chatbot-dot-bounce` — typing indicator wave animation
   * - `nevent-chatbot-spin` — loading spinner rotation
   * - `nevent-chatbot-fade-in` — general element fade-in
   * - `nevent-chatbot-slide-up` — chat window entrance animation
   * - `nevent-chatbot-qr-enter` — quick reply button staggered entrance
   *   (fades in from below; applied per-button with a 50 ms stagger)
   * - `nevent-chatbot-qr-exit` — quick reply button exit
   *   (fades out downward; applied to all buttons simultaneously)
   *
   * @returns CSS `@keyframes` block string.
   */
  private generateKeyframes(): string {
    return (
      `@keyframes nevent-chatbot-dot-bounce{` +
      `0%,60%,100%{transform:translateY(0);}` +
      `30%{transform:translateY(-6px);}` +
      `}` +
      `@keyframes nevent-chatbot-spin{` +
      `to{transform:rotate(360deg);}` +
      `}` +
      `@keyframes nevent-chatbot-fade-in{` +
      `from{opacity:0;}` +
      `to{opacity:1;}` +
      `}` +
      `@keyframes nevent-chatbot-slide-up{` +
      `from{opacity:0;transform:translateY(20px);}` +
      `to{opacity:1;transform:translateY(0);}` +
      `}` +
      // Quick reply entrance: fade in while translating from below.
      // Applied per-button in QuickReplyRenderer with a 50 ms per-button stagger
      // (the delay is applied via setTimeout rather than CSS animation-delay to
      // keep the approach simple and compatible with all browsers).
      `@keyframes nevent-chatbot-qr-enter{` +
      `from{opacity:0;transform:translateY(8px);}` +
      `to{opacity:1;transform:translateY(0);}` +
      `}` +
      // Quick reply exit: fade out downward.
      // Applied to all buttons simultaneously (200 ms, ease-in, forwards).
      `@keyframes nevent-chatbot-qr-exit{` +
      `from{opacity:1;transform:translateY(0);}` +
      `to{opacity:0;transform:translateY(8px);}` +
      `}` +
      // Streaming cursor blink animation.
      // Used by the streaming message cursor to indicate ongoing bot response.
      `@keyframes nevent-chatbot-blink{` +
      `0%,100%{opacity:1;}` +
      `50%{opacity:0;}` +
      `}`
    );
  }

  // --------------------------------------------------------------------------
  // Private: Responsive
  // --------------------------------------------------------------------------

  /**
   * Generates responsive styles for mobile viewports (max-width: 480px).
   *
   * On small screens the chat window expands to fill the entire viewport,
   * border-radius is removed, and the bubble may be scaled down for comfort.
   *
   * @returns CSS `@media` block string for responsive layout.
   */
  private generateResponsiveStyles(): string {
    return (
      `@media (max-width:${MOBILE_BREAKPOINT}px){` +
      `.nevent-chatbot-window{` +
      `position:fixed!important;` +
      `inset:0!important;` +
      `width:100%!important;` +
      `height:100%!important;` +
      `max-height:none!important;` +
      `border-radius:0!important;` +
      `right:0!important;` +
      `bottom:0!important;` +
      `}` +
      `.nevent-chatbot-bubble{` +
      `width:48px!important;` +
      `height:48px!important;` +
      `}` +
      `}`
    );
  }

  // --------------------------------------------------------------------------
  // Private: Accessibility (WCAG 2.1 AA)
  // --------------------------------------------------------------------------

  /**
   * Generates CSS rules that satisfy WCAG 2.1 AA accessibility requirements:
   *
   * 1. **Focus visibility** (SC 2.4.7): `:focus-visible` outlines on all
   *    interactive elements so keyboard users always see where focus is.
   *    We suppress the ring on mouse/touch interaction using `:focus:not(:focus-visible)`.
   *
   * 2. **Reduced motion** (SC 2.3.3): `@media (prefers-reduced-motion: reduce)`
   *    disables all widget animations for users who have requested less motion
   *    in their OS accessibility settings.
   *
   * 3. **Quick reply focus** (SC 2.4.7): Dedicated focus ring for quick reply
   *    buttons that uses the primary colour token for brand consistency.
   *
   * 4. **Visually hidden utility** (SC 1.3.1): `.nevent-chatbot-sr-only` class
   *    for content that should be read by AT but not visible on screen.
   *
   * @returns CSS accessibility block string.
   */
  private generateAccessibilityStyles(): string {
    return (
      // -----------------------------------------------------------------------
      // Focus visible (WCAG 2.4.7 — Focus Visible)
      //
      // Strategy: use :focus-visible for keyboard-only focus rings.
      // We suppress the browser default outline ONLY on mouse/touch interaction
      // via :focus:not(:focus-visible), keeping the outline for keyboard users.
      // -----------------------------------------------------------------------

      // Suppress default outline only when focus was NOT from keyboard
      `.nevent-chatbot-bubble:focus:not(:focus-visible),` +
      `.nevent-chatbot-header-button:focus:not(:focus-visible),` +
      `.nevent-chatbot-send-button:focus:not(:focus-visible),` +
      `.nevent-chatbot-quick-reply-button:focus:not(:focus-visible),` +
      `.nevent-chatbot-scroll-button:focus:not(:focus-visible),` +
      `.nevent-chatbot-card-action:focus:not(:focus-visible),` +
      `.nevent-chatbot-action-button:focus:not(:focus-visible),` +
      `.nevent-chatbot-carousel-nav:focus:not(:focus-visible),` +
      `.nevent-chatbot-rich-image:focus:not(:focus-visible),` +
      `.nevent-chatbot-input-field:focus:not(:focus-visible){outline:none;}` +
      // Show a clear ring only when focus arrived via keyboard (:focus-visible)
      `.nevent-chatbot-bubble:focus-visible{` +
      `outline:3px solid var(--nev-cb-color-primary);` +
      `outline-offset:3px;` +
      `}` +
      `.nevent-chatbot-header-button:focus-visible{` +
      `outline:2px solid rgba(255,255,255,0.9);` +
      `outline-offset:2px;` +
      `}` +
      `.nevent-chatbot-send-button:focus-visible{` +
      `outline:3px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `}` +
      `.nevent-chatbot-quick-reply-button:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `box-shadow:0 0 0 4px color-mix(in srgb,var(--nev-cb-color-primary) 20%,transparent);` +
      `}` +
      `.nevent-chatbot-scroll-button:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `}` +
      // Card action buttons/links — focus ring for keyboard users
      `.nevent-chatbot-card-action:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:-2px;` +
      `background-color:color-mix(in srgb,var(--nev-cb-color-primary) 8%,transparent);` +
      `}` +
      // Standalone action buttons (button group) — focus ring
      `.nevent-chatbot-action-button:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `border-color:var(--nev-cb-color-primary);` +
      `}` +
      // Carousel navigation arrows — focus ring
      `.nevent-chatbot-carousel-nav:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `}` +
      // Standalone rich image (acts as a link) — focus ring
      `.nevent-chatbot-rich-image:focus-visible{` +
      `outline:2px solid var(--nev-cb-color-primary);` +
      `outline-offset:2px;` +
      `}` +
      // Input textarea uses border+shadow focus (already defined in generateInputStyles),
      // suppress the browser default outline for a cleaner appearance
      `.nevent-chatbot-input-field:focus-visible{` +
      `border-color:var(--nev-cb-input-focus-border);` +
      `box-shadow:0 0 0 3px color-mix(in srgb,var(--nev-cb-input-focus-border) 25%,transparent);` +
      `outline:none;` +
      `}` +
      // -----------------------------------------------------------------------
      // Reduced motion (WCAG SC 2.3.3 / prefers-reduced-motion)
      // Disables all CSS transitions, animations, and transforms for users who
      // have enabled "Reduce Motion" in their OS accessibility preferences.
      // Also disables smooth scroll behavior for instant navigation.
      // -----------------------------------------------------------------------
      `@media (prefers-reduced-motion:reduce){` +
      // Bubble: no bounce entrance, no hover scale transition
      `.nevent-chatbot-bubble{` +
      `transition:none!important;` +
      `transform:scale(1)!important;` +
      `}` +
      `.nevent-chatbot-bubble-icon{transition:none!important;}` +
      // Window: no slide-in/out animation
      `.nevent-chatbot-window{` +
      `transition:none!important;` +
      `transform:none!important;` +
      `}` +
      // Typing indicator: no fade, no dot bounce
      `.nevent-chatbot-typing{transition:none!important;}` +
      `.nevent-chatbot-typing-dot{animation:none!important;}` +
      // Loading spinner: no rotation
      `.nevent-chatbot-loading-spinner{animation:none!important;}` +
      // Input and buttons: no transitions
      `.nevent-chatbot-input-field{transition:none!important;}` +
      `.nevent-chatbot-send-button{transition:none!important;}` +
      `.nevent-chatbot-quick-reply-button{transition:none!important;animation:none!important;}` +
      `.nevent-chatbot-header-button{transition:none!important;}` +
      // Streaming cursor blink: disable animation
      `.nevent-chatbot-streaming-cursor{animation:none!important;}` +
      // Rich content transitions
      `.nevent-chatbot-rich-image{transition:none!important;}` +
      `.nevent-chatbot-card-action{transition:none!important;}` +
      `.nevent-chatbot-action-button{transition:none!important;}` +
      `.nevent-chatbot-carousel-nav{transition:none!important;}` +
      // Connection banner transitions
      `.nevent-chatbot-connection-banner{transition:none!important;}` +
      `.nevent-chatbot-connection-banner-spinner{animation:none!important;}` +
      // Disable smooth scrolling — use instant for all scroll containers
      `.nevent-chatbot-messages{scroll-behavior:auto!important;}` +
      `.nevent-chatbot-carousel{scroll-behavior:auto!important;}` +
      `}` +
      // -----------------------------------------------------------------------
      // Visually-hidden utility (SC 1.3.1)
      // Use this class for screen-reader-only text (e.g. keyboard hints,
      // status announcements like "Message sent", "Bot is typing").
      // -----------------------------------------------------------------------
      `.nevent-chatbot-sr-only{` +
      `position:absolute!important;` +
      `width:1px!important;` +
      `height:1px!important;` +
      `padding:0!important;` +
      `margin:-1px!important;` +
      `overflow:hidden!important;` +
      `clip:rect(0,0,0,0)!important;` +
      `white-space:nowrap!important;` +
      `border:0!important;` +
      `}`
    );
  }

  // --------------------------------------------------------------------------
  // Private: Custom CSS (SSR / inline generation path)
  // --------------------------------------------------------------------------

  /**
   * Appends any raw CSS string provided by the consumer via `styles.customCSS`.
   *
   * When `generateCSS()` is called (e.g. for SSR or testing), any custom CSS
   * in `styles.customCSS` is included at the end of the generated string so it
   * wins over all base styles.
   *
   * In a live DOM environment the preferred approach is to call `injectCustomCSS`
   * directly, which places the CSS in a separate `<style>` element and provides
   * XSS sanitization.  For parity, the same sanitization is applied here.
   *
   * @returns Sanitised consumer custom CSS string, or empty string if none.
   */
  private generateCustomCSS(): string {
    const raw = this.styles?.customCSS ?? '';
    if (!raw) return '';
    return this.sanitiseCustomCSS(raw);
  }
}
