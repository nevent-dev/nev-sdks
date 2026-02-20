/**
 * I18nManager - Generic internationalization manager for Nevent SDKs
 *
 * Provides a lightweight, type-safe translation system that can be used
 * across all Nevent SDK packages. Supports locale detection, dynamic locale
 * switching, and string interpolation with named parameters.
 *
 * @typeParam T - A record type defining the translation keys and their
 *   string values. This provides compile-time safety: only valid translation
 *   keys are accepted by the `t()` method.
 *
 * @example
 * ```typescript
 * // Define translation shape
 * interface ChatLabels extends Record<string, string> {
 *   greeting: string;
 *   farewell: string;
 *   userCount: string;
 * }
 *
 * // Create manager with locales
 * const i18n = new I18nManager<ChatLabels>(
 *   {
 *     en: { greeting: 'Hello {{name}}', farewell: 'Goodbye', userCount: '{{count}} users' },
 *     es: { greeting: 'Hola {{name}}', farewell: 'Adiós', userCount: '{{count}} usuarios' },
 *   },
 *   'en',
 * );
 *
 * i18n.t('greeting', { name: 'World' }); // 'Hello World'
 * i18n.setLocale('es');
 * i18n.t('greeting', { name: 'Mundo' }); // 'Hola Mundo'
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// I18nManager Class
// ============================================================================

/**
 * Generic internationalization manager with type-safe translation keys.
 *
 * @typeParam T - Record type defining all translation keys and their string values
 */
export class I18nManager<T extends Record<string, string>> {
  /** Map of locale codes to their translation dictionaries */
  private readonly locales: Record<string, T>;

  /** Currently active locale code */
  private currentLocale: string;

  /** The default/fallback locale code */
  private readonly defaultLocale: string;

  /**
   * Creates a new I18nManager instance.
   *
   * @param locales - Object mapping locale codes (e.g., 'en', 'es') to
   *   their translation dictionaries. At minimum, the `defaultLocale` must
   *   be present in this map.
   * @param defaultLocale - The fallback locale code used when a translation
   *   key is missing in the active locale. Also used as the initial locale.
   *
   * @throws {Error} If the `defaultLocale` is not found in the `locales` map
   *
   * @example
   * ```typescript
   * const i18n = new I18nManager(
   *   {
   *     en: { submit: 'Submit', cancel: 'Cancel' },
   *     es: { submit: 'Enviar', cancel: 'Cancelar' },
   *   },
   *   'en',
   * );
   * ```
   */
  constructor(locales: Record<string, T>, defaultLocale: string) {
    if (!locales[defaultLocale]) {
      throw new Error(
        `I18nManager: default locale "${defaultLocale}" not found in provided locales. ` +
          `Available locales: ${Object.keys(locales).join(', ')}`,
      );
    }

    this.locales = locales;
    this.defaultLocale = defaultLocale;
    this.currentLocale = defaultLocale;
  }

  // --------------------------------------------------------------------------
  // Translation
  // --------------------------------------------------------------------------

  /**
   * Translates a key using the current locale, with optional parameter
   * interpolation.
   *
   * If the key is not found in the current locale, it falls back to the
   * default locale. If still not found, the raw key is returned as a string.
   *
   * Interpolation uses double-brace syntax: `{{paramName}}`. Each occurrence
   * of `{{paramName}}` in the translation string is replaced with the
   * corresponding value from the `params` object.
   *
   * @param key - The translation key (must be a key of `T`)
   * @param params - Optional object with named parameters for interpolation
   * @returns The translated (and interpolated) string, or the raw key if
   *   no translation is found
   *
   * @example
   * ```typescript
   * // Simple translation
   * i18n.t('submit'); // 'Submit'
   *
   * // With interpolation
   * i18n.t('greeting', { name: 'Alice' }); // 'Hello Alice'
   *
   * // Missing key returns the key itself
   * i18n.t('nonexistent' as keyof T); // 'nonexistent'
   * ```
   */
  t(key: keyof T, params?: Record<string, string>): string {
    const keyStr = String(key);

    // Try current locale first
    const currentDict = this.locales[this.currentLocale];
    let value: string | undefined = currentDict?.[keyStr];

    // Fallback to default locale
    if (value === undefined && this.currentLocale !== this.defaultLocale) {
      const defaultDict = this.locales[this.defaultLocale];
      value = defaultDict?.[keyStr];
    }

    // If no translation found, return the key itself
    if (value === undefined) {
      return keyStr;
    }

    // Interpolate parameters
    if (params) {
      return I18nManager.interpolate(value, params);
    }

    return value;
  }

  // --------------------------------------------------------------------------
  // Locale Management
  // --------------------------------------------------------------------------

  /**
   * Changes the active locale.
   *
   * If the requested locale is not available, a warning is logged and the
   * locale is not changed.
   *
   * @param locale - The locale code to switch to (e.g., 'en', 'es', 'fr')
   *
   * @example
   * ```typescript
   * i18n.setLocale('es');
   * i18n.t('submit'); // 'Enviar'
   * ```
   */
  setLocale(locale: string): void {
    if (!this.locales[locale]) {
      console.warn(
        `I18nManager: locale "${locale}" not available. ` +
          `Available locales: ${Object.keys(this.locales).join(', ')}`,
      );
      return;
    }

    this.currentLocale = locale;
  }

  /**
   * Returns the currently active locale code.
   *
   * @returns The active locale code string
   *
   * @example
   * ```typescript
   * i18n.getLocale(); // 'en'
   * i18n.setLocale('es');
   * i18n.getLocale(); // 'es'
   * ```
   */
  getLocale(): string {
    return this.currentLocale;
  }

  /**
   * Returns all available locale codes.
   *
   * @returns Array of locale code strings
   *
   * @example
   * ```typescript
   * i18n.getAvailableLocales(); // ['en', 'es', 'fr']
   * ```
   */
  getAvailableLocales(): string[] {
    return Object.keys(this.locales);
  }

  // --------------------------------------------------------------------------
  // Locale Detection (static)
  // --------------------------------------------------------------------------

  /**
   * Detects the user's preferred locale from the browser environment.
   *
   * Uses `navigator.language` as the primary source, extracting the
   * two-letter language code (e.g., 'en' from 'en-US'). Falls back to
   * `'en'` when `navigator` is not available (SSR environments).
   *
   * @returns A two-letter locale code (e.g., 'en', 'es', 'fr')
   *
   * @example
   * ```typescript
   * // In a browser with language set to 'es-ES'
   * I18nManager.detectLocale(); // 'es'
   *
   * // In Node.js (no navigator)
   * I18nManager.detectLocale(); // 'en'
   * ```
   */
  static detectLocale(): string {
    if (
      typeof navigator !== 'undefined' &&
      navigator.language
    ) {
      // Extract two-letter language code from BCP 47 tag (e.g., 'en-US' -> 'en')
      return navigator.language.split('-')[0]?.toLowerCase() ?? 'en';
    }

    return 'en';
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Replaces `{{paramName}}` placeholders in a string with values from
   * the provided params object.
   *
   * @param template - The template string containing `{{...}}` placeholders
   * @param params - Object with replacement values
   * @returns The interpolated string
   */
  private static interpolate(
    template: string,
    params: Record<string, string>,
  ): string {
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_match, paramKey: string) => {
        return params[paramKey] ?? `{{${paramKey}}}`;
      },
    );
  }
}
