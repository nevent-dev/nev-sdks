/**
 * I18nManager - Internationalization manager for chatbot UI strings
 *
 * Extends `@nevent/core`'s {@link CoreI18nManager} with chatbot-specific
 * functionality while delegating locale management and translation lookups
 * to the core implementation.
 *
 * Chatbot-specific additions:
 * - **`format(key, params)`**: Interpolates `{param}` placeholders in
 *   translated strings (chatbot uses `{n}` syntax, not core's `{{n}}`).
 * - **`setOverrides(overrides)`**: Allows the host application to override
 *   specific translations at runtime (e.g., custom branding).
 * - **`detectLocale()`**: Returns `SupportedLocale` (typed union) instead
 *   of core's plain `string` return type.
 *
 * Supports Spanish (es), English (en), Catalan (ca), Portuguese (pt), French (fr), and Italian (it).
 *
 * @remarks
 * Default locale: 'es' (Spanish)
 * Fallback chain: requested locale -> 'es' -> key name itself
 *
 * @example
 * ```typescript
 * const i18n = await I18nManager.create('en');
 * i18n.t('sendButton');              // 'Send'
 * i18n.format('minutesAgo', { n: 5 }); // '5 min ago'
 *
 * // With overrides
 * i18n.setOverrides({ poweredBy: 'Powered by Acme Corp' });
 * i18n.t('poweredBy'); // 'Powered by Acme Corp'
 * ```
 */

import { I18nManager as CoreI18nManager } from '@nevent/core';
import type { SupportedLocale, ChatbotTranslations } from '../types';
import defaultCatalog from './locales/es';
import type { LocaleCatalog, RendererLabels } from './locales/types';

const DEFAULT_LOCALE = 'es';

const CATALOG_LOADERS = {
  en: () => import('./locales/en'),
  ca: () => import('./locales/ca'),
  pt: () => import('./locales/pt'),
  fr: () => import('./locales/fr'),
  it: () => import('./locales/it'),
  de: () => import('./locales/de'),
  nl: () => import('./locales/nl'),
} satisfies Record<Exclude<SupportedLocale, 'es'>, () => Promise<{ default: LocaleCatalog }>>;

// ============================================================================
// I18nManager Class
// ============================================================================

/**
 * Manages internationalization for the chatbot widget.
 *
 * Extends core's `I18nManager<ChatbotTranslations>` for locale management
 * and translation lookups, while adding chatbot-specific features:
 * - `format()` for `{param}` interpolation (distinct from core's `{{param}}`)
 * - `setOverrides()` for runtime translation overrides
 * - `detectLocale()` returning typed `SupportedLocale`
 *
 * @example
 * ```typescript
 * // Auto-detect browser locale
 * const i18n = await I18nManager.create();
 *
 * // Specify a locale explicitly
 * const i18n = await I18nManager.create('en');
 *
 * // Get translated string
 * i18n.t('sendButton'); // 'Send'
 *
 * // Get interpolated string
 * i18n.format('minutesAgo', { n: 5 }); // '5 min ago'
 *
 * // Override specific strings for custom branding
 * i18n.setOverrides({ poweredBy: 'Powered by My Company' });
 * ```
 */
export class I18nManager extends CoreI18nManager<ChatbotTranslations> {
  /**
   * User-provided overrides that take precedence over built-in translations.
   * Partial -- only the keys the consumer wants to override need to be provided.
   */
  private overrides: Partial<ChatbotTranslations>;

  private rendererLabels = defaultCatalog.rendererLabels;

  private constructor(
    private readonly catalogs: Record<string, ChatbotTranslations> = {
      es: defaultCatalog.translations,
    }
  ) {
    super(catalogs, DEFAULT_LOCALE);
    this.overrides = {};
  }

  static async create(locale = I18nManager.detectLocale()): Promise<I18nManager> {
    const manager = new I18nManager();
    await manager.setLocale(locale);
    return manager;
  }

  override async setLocale(locale: SupportedLocale): Promise<void> {
    let catalog = defaultCatalog;
    let activeLocale: SupportedLocale = DEFAULT_LOCALE;
    if (locale !== DEFAULT_LOCALE) {
      try {
        catalog = (await CATALOG_LOADERS[locale]()).default;
        activeLocale = locale;
      } catch {
        // A blocked or unavailable module must not prevent the widget from rendering.
      }
    }

    this.catalogs[activeLocale] = catalog.translations;
    this.rendererLabels = catalog.rendererLabels;
    super.setLocale(activeLocale);
  }

  rendererLabel(key: keyof RendererLabels): string {
    return this.rendererLabels[key];
  }

  /**
   * Returns the currently active locale code.
   *
   * @returns The active locale (e.g., 'es', 'en', 'ca', 'pt', 'fr', 'it', 'de', 'nl')
   *
   * @example
   * ```typescript
   * const i18n = await I18nManager.create('en');
   * i18n.getLocale(); // 'en'
   * ```
   */
  override getLocale(): SupportedLocale {
    return super.getLocale() as SupportedLocale;
  }

  // --------------------------------------------------------------------------
  // String Retrieval (with override support)
  // --------------------------------------------------------------------------

  /**
   * Retrieves a translated string by key for the current locale.
   *
   * User-provided overrides (set via `setOverrides()`) take precedence over
   * built-in translations. If neither is found, falls back to the Spanish
   * default (handled by core), then to the key name itself as a last resort.
   *
   * @param key - A key from the `ChatbotTranslations` interface
   * @returns The translated string for the current locale
   *
   * @example
   * ```typescript
   * const i18n = await I18nManager.create('en');
   * i18n.t('sendButton');     // 'Send'
   * i18n.t('closeChat');      // 'Close chat'
   * i18n.t('minutesAgo');     // '{n} min ago'  (raw template)
   * ```
   *
   * @see format For strings with interpolation placeholders
   */
  override t(key: keyof ChatbotTranslations): string {
    // 1. User override takes highest priority
    if (this.overrides[key] !== undefined) {
      return this.overrides[key] as string;
    }

    // 2. Delegate to core's t() which handles locale lookup + fallback
    return super.t(key);
  }

  // --------------------------------------------------------------------------
  // Chatbot-Specific: Interpolation
  // --------------------------------------------------------------------------

  /**
   * Retrieves a translated string with interpolated parameters.
   *
   * Replaces `{param}` placeholders in the translated string with the
   * corresponding values from the `params` object.
   *
   * @param key - A key from the `ChatbotTranslations` interface
   * @param params - Key-value pairs where keys match `{placeholder}` names
   * @returns The translated string with placeholders replaced by their values
   *
   * @example
   * ```typescript
   * const i18n = await I18nManager.create('es');
   * i18n.format('minutesAgo', { n: 5 });  // 'hace 5 min'
   * i18n.format('hoursAgo', { n: 2 });    // 'hace 2 h'
   *
   * const i18n = await I18nManager.create('en');
   * i18n.format('minutesAgo', { n: 5 });  // '5 min ago'
   * ```
   */
  format(
    key: keyof ChatbotTranslations,
    params: Record<string, string | number>
  ): string {
    let result = this.t(key);

    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(
        new RegExp(`\\{${paramKey}\\}`, 'g'),
        String(paramValue)
      );
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Chatbot-Specific: Translation Overrides
  // --------------------------------------------------------------------------

  /**
   * Sets user-provided translation overrides.
   *
   * Overrides are merged with any existing overrides -- calling this method
   * multiple times is additive. Overrides take precedence over all built-in
   * translations regardless of locale.
   *
   * Pass `{}` to clear all overrides.
   *
   * @param overrides - A partial ChatbotTranslations object with keys to override
   *
   * @example
   * ```typescript
   * // Custom branding
   * i18n.setOverrides({
   *   poweredBy: 'Powered by Acme Corp',
   *   defaultTitle: 'Support Chat',
   * });
   *
   * // Fully replace overrides
   * i18n.setOverrides({}); // clears all previous overrides
   * i18n.setOverrides({ poweredBy: 'New Brand' });
   * ```
   */
  setOverrides(overrides: Partial<ChatbotTranslations>): void {
    this.overrides = { ...this.overrides, ...overrides };
  }

  // --------------------------------------------------------------------------
  // Static: Locale Detection (typed for SupportedLocale)
  // --------------------------------------------------------------------------

  /**
   * Detects the user's preferred locale from the browser's `navigator.language`.
   *
   * Parses the browser locale string (e.g., 'es-ES', 'en-US', 'ca') and maps
   * it to the nearest supported locale. If no match is found, returns the
   * default locale ('es').
   *
   * @returns A supported locale code ('es' | 'en' | 'ca' | 'pt' | 'fr' | 'it' | 'de' | 'nl')
   *
   * @example
   * ```typescript
   * // navigator.language = 'es-ES'
   * I18nManager.detectLocale(); // 'es'
   *
   * // navigator.language = 'en-US'
   * I18nManager.detectLocale(); // 'en'
   *
   * // navigator.language = 'ca'
   * I18nManager.detectLocale(); // 'ca'
   *
   * // navigator.language = 'fi-FI' (unsupported)
   * I18nManager.detectLocale(); // 'es' (default fallback)
   * ```
   */
  static override detectLocale(): SupportedLocale {
    // Guard: navigator may not exist in SSR environments
    if (typeof navigator === 'undefined' || !navigator.language) {
      return DEFAULT_LOCALE;
    }

    // Extract the primary language subtag (e.g., 'es' from 'es-ES')
    const rawLocale = navigator.language.toLowerCase();
    const primaryTag = rawLocale.split('-')[0] ?? '';

    if (Object.prototype.hasOwnProperty.call(CATALOG_LOADERS, primaryTag)) {
      return primaryTag as SupportedLocale;
    }

    return DEFAULT_LOCALE;
  }
}
