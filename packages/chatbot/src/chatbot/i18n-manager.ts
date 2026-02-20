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
 * Supports Spanish (es), English (en), Catalan (ca), and Portuguese (pt).
 *
 * @remarks
 * Default locale: 'es' (Spanish)
 * Fallback chain: requested locale -> 'es' -> key name itself
 *
 * @example
 * ```typescript
 * const i18n = new I18nManager('en');
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

// ============================================================================
// Translation Tables
// ============================================================================

/**
 * Built-in translations for all supported locales.
 * Each locale provides a full implementation of ChatbotTranslations.
 * Interpolation placeholders use the {n} convention.
 */
const TRANSLATIONS: Record<SupportedLocale, ChatbotTranslations> = {
  /**
   * Spanish (es) — default locale
   */
  es: {
    inputPlaceholder: 'Escribe un mensaje...',
    sendButton: 'Enviar',
    defaultTitle: 'Chatea con nosotros',
    statusOnline: 'En línea',
    statusConnecting: 'Conectando...',
    statusOffline: 'Sin conexión',
    typingIndicator: 'Pensando...',
    messageSendError: 'No se pudo enviar el mensaje. Inténtalo de nuevo.',
    connectionError: 'Error de conexión. Reintentando...',
    rateLimitError: 'Demasiados mensajes. Espera un momento.',
    rateLimitCountdown: 'Demasiados mensajes. Espera {seconds} segundos.',
    poweredBy: 'Powered by Nevent',
    newConversation: 'Nueva conversación',
    closeChat: 'Cerrar chat',
    openChat: 'Abrir chat',
    retry: 'Reintentar',
    justNow: 'Ahora mismo',
    minutesAgo: 'hace {n} min',
    hoursAgo: 'hace {n} h',
    yesterday: 'Ayer',
    connectionOffline: 'Sin conexión a internet',
    connectionReconnecting: 'Reconectando...',
    connectionReconnected: 'Reconectado',
  },

  /**
   * English (en)
   */
  en: {
    inputPlaceholder: 'Type a message...',
    sendButton: 'Send',
    defaultTitle: 'Chat with us',
    statusOnline: 'Online',
    statusConnecting: 'Connecting...',
    statusOffline: 'Offline',
    typingIndicator: 'Thinking...',
    messageSendError: 'Failed to send message. Please try again.',
    connectionError: 'Connection error. Retrying...',
    rateLimitError: 'Too many messages. Please wait a moment.',
    rateLimitCountdown: 'Too many messages. Please wait {seconds} seconds.',
    poweredBy: 'Powered by Nevent',
    newConversation: 'New conversation',
    closeChat: 'Close chat',
    openChat: 'Open chat',
    retry: 'Retry',
    justNow: 'Just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n}h ago',
    yesterday: 'Yesterday',
    connectionOffline: 'No internet connection',
    connectionReconnecting: 'Reconnecting...',
    connectionReconnected: 'Reconnected',
  },

  /**
   * Catalan (ca)
   */
  ca: {
    inputPlaceholder: 'Escriu un missatge...',
    sendButton: 'Enviar',
    defaultTitle: 'Xateja amb nosaltres',
    statusOnline: 'En línia',
    statusConnecting: 'Connectant...',
    statusOffline: 'Sense connexió',
    typingIndicator: 'Pensant...',
    messageSendError: "No s'ha pogut enviar el missatge. Torna-ho a intentar.",
    connectionError: 'Error de connexió. Reintentant...',
    rateLimitError: 'Massa missatges. Espera un moment.',
    rateLimitCountdown: 'Massa missatges. Espera {seconds} segons.',
    poweredBy: 'Powered by Nevent',
    newConversation: 'Nova conversació',
    closeChat: 'Tancar el xat',
    openChat: 'Obrir el xat',
    retry: 'Reintentar',
    justNow: 'Ara mateix',
    minutesAgo: 'fa {n} min',
    hoursAgo: 'fa {n} h',
    yesterday: 'Ahir',
    connectionOffline: 'Sense connexió a internet',
    connectionReconnecting: 'Reconnectant...',
    connectionReconnected: 'Reconnectat',
  },

  /**
   * Portuguese (pt)
   */
  pt: {
    inputPlaceholder: 'Escreva uma mensagem...',
    sendButton: 'Enviar',
    defaultTitle: 'Converse conosco',
    statusOnline: 'Online',
    statusConnecting: 'Conectando...',
    statusOffline: 'Offline',
    typingIndicator: 'Pensando...',
    messageSendError: 'Não foi possível enviar a mensagem. Tente novamente.',
    connectionError: 'Erro de conexão. Tentando novamente...',
    rateLimitError: 'Muitas mensagens. Aguarde um momento.',
    rateLimitCountdown: 'Muitas mensagens. Aguarde {seconds} segundos.',
    poweredBy: 'Powered by Nevent',
    newConversation: 'Nova conversa',
    closeChat: 'Fechar chat',
    openChat: 'Abrir chat',
    retry: 'Tentar novamente',
    justNow: 'Agora mesmo',
    minutesAgo: 'há {n} min',
    hoursAgo: 'há {n} h',
    yesterday: 'Ontem',
    connectionOffline: 'Sem conexão à internet',
    connectionReconnecting: 'Reconectando...',
    connectionReconnected: 'Reconectado',
  },
};

/**
 * Ordered list of all supported locales for validation purposes.
 */
const SUPPORTED_LOCALES: ReadonlyArray<SupportedLocale> = ['es', 'en', 'ca', 'pt'];

/**
 * Default fallback locale when browser locale cannot be mapped to a supported one.
 */
const DEFAULT_LOCALE: SupportedLocale = 'es';

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
 * const i18n = new I18nManager();
 *
 * // Specify a locale explicitly
 * const i18n = new I18nManager('en');
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

  /**
   * Creates a new I18nManager instance.
   *
   * @param locale - Optional locale to use. If omitted, the browser locale is
   *   auto-detected via `I18nManager.detectLocale()`. Falls back to `'es'` if
   *   the detected locale is not supported.
   *
   * @example
   * ```typescript
   * const i18n = new I18nManager();        // auto-detect
   * const i18n = new I18nManager('en');    // explicit English
   * const i18n = new I18nManager('ca');    // Catalan
   * ```
   */
  constructor(locale?: SupportedLocale) {
    // Pass all translations and the default locale to core's I18nManager.
    // Core sets currentLocale = defaultLocale ('es') initially.
    super(TRANSLATIONS, DEFAULT_LOCALE);

    this.overrides = {};

    // If an explicit locale was provided, switch to it.
    // If not, auto-detect from the browser and switch if it's a supported locale.
    const resolvedLocale = locale ?? I18nManager.detectLocale();
    if (resolvedLocale !== DEFAULT_LOCALE) {
      super.setLocale(resolvedLocale);
    }
  }

  // --------------------------------------------------------------------------
  // Locale Management (overrides for SupportedLocale typing)
  // --------------------------------------------------------------------------

  /**
   * Updates the active locale at runtime.
   *
   * After calling this method, all subsequent calls to `t()` and `format()`
   * will return strings in the new locale.
   *
   * @param locale - A supported locale code ('es' | 'en' | 'ca' | 'pt')
   *
   * @example
   * ```typescript
   * i18n.setLocale('en');
   * i18n.t('sendButton'); // 'Send'
   * ```
   */
  override setLocale(locale: SupportedLocale): void {
    super.setLocale(locale);
  }

  /**
   * Returns the currently active locale code.
   *
   * @returns The active locale (e.g., 'es', 'en', 'ca', 'pt')
   *
   * @example
   * ```typescript
   * const i18n = new I18nManager('en');
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
   * const i18n = new I18nManager('en');
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
   * const i18n = new I18nManager('es');
   * i18n.format('minutesAgo', { n: 5 });  // 'hace 5 min'
   * i18n.format('hoursAgo', { n: 2 });    // 'hace 2 h'
   *
   * const i18n = new I18nManager('en');
   * i18n.format('minutesAgo', { n: 5 });  // '5 min ago'
   * ```
   */
  format(key: keyof ChatbotTranslations, params: Record<string, string | number>): string {
    let result = this.t(key);

    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
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
   * @returns A supported locale code ('es' | 'en' | 'ca' | 'pt')
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
   * // navigator.language = 'fr-FR' (unsupported)
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

    // Direct match against supported locales
    if (primaryTag && (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(primaryTag)) {
      return primaryTag as SupportedLocale;
    }

    return DEFAULT_LOCALE;
  }
}
