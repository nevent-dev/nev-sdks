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
    rateLimitCountdownOne: 'Demasiados mensajes. Espera 1 segundo.',
    poweredBy: 'Con la tecnología de Nevent',
    newConversation: 'Nueva conversación',
    closeChat: 'Cerrar chat',
    minimizeChat: 'Minimizar chat',
    openChat: 'Abrir chat',
    retry: 'Reintentar',
    justNow: 'Ahora mismo',
    minutesAgo: 'hace {n} min',
    hoursAgo: 'hace {n} h',
    yesterday: 'Ayer',
    connectionOffline: 'Sin conexión a internet',
    connectionReconnecting: 'Reconectando...',
    connectionReconnected: 'Reconectado',
    attachFile: 'Adjuntar archivo',
    removeFile: 'Eliminar',
    uploading: 'Subiendo',
    fileTooBig: 'El archivo es demasiado grande. Máximo {maxMB} MB.',
    fileTypeNotAllowed: 'Tipo de archivo no permitido.',
    uploadFailed: 'Error al subir el archivo. Inténtalo de nuevo.',
    dragDropHint: 'Suelta los archivos aquí',
    agentTyping: '{name} está escribiendo...',
    someoneTyping: 'Alguien está escribiendo...',
    brandingAriaLabel: 'Desarrollado por Nevent - Chatbot IA para eventos',
    defaultWelcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
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
    rateLimitCountdownOne: 'Too many messages. Please wait 1 second.',
    poweredBy: 'Powered by Nevent',
    newConversation: 'New conversation',
    closeChat: 'Close chat',
    minimizeChat: 'Minimize chat',
    openChat: 'Open chat',
    retry: 'Retry',
    justNow: 'Just now',
    minutesAgo: '{n} min ago',
    hoursAgo: '{n}h ago',
    yesterday: 'Yesterday',
    connectionOffline: 'No internet connection',
    connectionReconnecting: 'Reconnecting...',
    connectionReconnected: 'Reconnected',
    attachFile: 'Attach file',
    removeFile: 'Remove',
    uploading: 'Uploading',
    fileTooBig: 'File is too large. Maximum {maxMB} MB.',
    fileTypeNotAllowed: 'File type not allowed.',
    uploadFailed: 'Upload failed. Please try again.',
    dragDropHint: 'Drop files here',
    agentTyping: '{name} is typing...',
    someoneTyping: 'Someone is typing...',
    brandingAriaLabel: 'Powered by Nevent - AI chatbot for events',
    defaultWelcomeMessage: 'Hello! How can I help you?',
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
    rateLimitCountdownOne: 'Massa missatges. Espera 1 segon.',
    poweredBy: 'Amb la tecnologia de Nevent',
    newConversation: 'Nova conversació',
    closeChat: 'Tancar el xat',
    minimizeChat: 'Minimitzar el xat',
    openChat: 'Obrir el xat',
    retry: 'Reintentar',
    justNow: 'Ara mateix',
    minutesAgo: 'fa {n} min',
    hoursAgo: 'fa {n} h',
    yesterday: 'Ahir',
    connectionOffline: 'Sense connexió a internet',
    connectionReconnecting: 'Reconnectant...',
    connectionReconnected: 'Reconnectat',
    attachFile: 'Adjuntar fitxer',
    removeFile: 'Eliminar',
    uploading: 'Pujant',
    fileTooBig: 'El fitxer és massa gran. Màxim {maxMB} MB.',
    fileTypeNotAllowed: 'Tipus de fitxer no permès.',
    uploadFailed: 'Error en pujar el fitxer. Torna-ho a intentar.',
    dragDropHint: 'Deixa anar els fitxers aquí',
    agentTyping: '{name} està escrivint...',
    someoneTyping: 'Algú està escrivint...',
    brandingAriaLabel:
      'Desenvolupat per Nevent - Chatbot IA per a esdeveniments',
    defaultWelcomeMessage: 'Hola! Com puc ajudar-te?',
  },

  /**
   * Portuguese (pt)
   */
  pt: {
    inputPlaceholder: 'Escreva uma mensagem...',
    sendButton: 'Enviar',
    defaultTitle: 'Fale connosco',
    statusOnline: 'Online',
    statusConnecting: 'A ligar…',
    statusOffline: 'Offline',
    typingIndicator: 'A pensar…',
    messageSendError: 'Não foi possível enviar a mensagem. Tente novamente.',
    connectionError: 'Erro de ligação. A tentar novamente…',
    rateLimitError: 'Muitas mensagens. Aguarde um momento.',
    rateLimitCountdown: 'Muitas mensagens. Aguarde {seconds} segundos.',
    rateLimitCountdownOne: 'Muitas mensagens. Aguarde 1 segundo.',
    poweredBy: 'Com tecnologia da Nevent',
    newConversation: 'Nova conversa',
    closeChat: 'Fechar o chat',
    minimizeChat: 'Minimizar o chat',
    openChat: 'Abrir o chat',
    retry: 'Tentar novamente',
    justNow: 'Agora mesmo',
    minutesAgo: 'há {n} min',
    hoursAgo: 'há {n} h',
    yesterday: 'Ontem',
    connectionOffline: 'Sem ligação à Internet',
    connectionReconnecting: 'A voltar a ligar…',
    connectionReconnected: 'Ligação restabelecida',
    attachFile: 'Anexar ficheiro',
    removeFile: 'Remover',
    uploading: 'A enviar',
    fileTooBig: 'O ficheiro excede o limite de {maxMB} MB.',
    fileTypeNotAllowed: 'Tipo de ficheiro não permitido.',
    uploadFailed: 'Não foi possível enviar o ficheiro. Tente novamente.',
    dragDropHint: 'Largue os ficheiros aqui',
    agentTyping: '{name} está a escrever...',
    someoneTyping: 'Alguém está a escrever...',
    brandingAriaLabel: 'Desenvolvido pela Nevent. Chatbot com IA para eventos',
    defaultWelcomeMessage: 'Olá! Como posso ajudar?',
  },
  /** French (France) (fr) */
  fr: {
    inputPlaceholder: 'Saisissez un message…',
    sendButton: 'Envoyer',
    defaultTitle: 'Discuter avec nous',
    statusOnline: 'En ligne',
    statusConnecting: 'Connexion…',
    statusOffline: 'Hors ligne',
    typingIndicator: 'Réflexion en cours…',
    messageSendError: 'Impossible d’envoyer le message. Réessayez.',
    connectionError: 'Erreur de connexion. Nouvelle tentative…',
    rateLimitError: 'Trop de messages. Patientez un instant.',
    rateLimitCountdown: 'Trop de messages. Patientez {seconds} secondes.',
    rateLimitCountdownOne: 'Trop de messages. Patientez une seconde.',
    poweredBy: 'Une technologie Nevent',
    newConversation: 'Nouvelle conversation',
    closeChat: 'Fermer la discussion',
    minimizeChat: 'Réduire la discussion',
    openChat: 'Ouvrir la discussion',
    retry: 'Réessayer',
    justNow: 'À l’instant',
    minutesAgo: 'il y a {n} min',
    hoursAgo: 'il y a {n} h',
    yesterday: 'Hier',
    connectionOffline: 'Pas de connexion Internet',
    connectionReconnecting: 'Reconnexion…',
    connectionReconnected: 'Connexion rétablie',
    attachFile: 'Joindre un fichier',
    removeFile: 'Supprimer',
    uploading: 'Envoi en cours',
    fileTooBig: 'Le fichier dépasse la taille maximale de {maxMB} Mo.',
    fileTypeNotAllowed: 'Type de fichier non autorisé.',
    uploadFailed: 'Impossible d’envoyer le fichier. Réessayez.',
    dragDropHint: 'Déposez les fichiers ici',
    agentTyping: '{name} écrit…',
    someoneTyping: 'Une personne écrit…',
    brandingAriaLabel: 'Une technologie Nevent. Chatbot IA pour les événements',
    defaultWelcomeMessage: 'Bonjour ! Comment puis-je vous aider ?',
  },

  /** Italian (Italy) (it) */
  it: {
    inputPlaceholder: 'Scrivi un messaggio…',
    sendButton: 'Invia',
    defaultTitle: 'Chatta con noi',
    statusOnline: 'Online',
    statusConnecting: 'Connessione in corso…',
    statusOffline: 'Offline',
    typingIndicator: 'Sto pensando…',
    messageSendError: 'Impossibile inviare il messaggio. Riprova.',
    connectionError: 'Errore di connessione. Nuovo tentativo in corso…',
    rateLimitError: 'Troppi messaggi. Aspetta un momento.',
    rateLimitCountdown: 'Troppi messaggi. Aspetta {seconds} secondi.',
    rateLimitCountdownOne: 'Troppi messaggi. Aspetta 1 secondo.',
    poweredBy: 'Con tecnologia Nevent',
    newConversation: 'Nuova conversazione',
    closeChat: 'Chiudi la chat',
    minimizeChat: 'Riduci la chat',
    openChat: 'Apri la chat',
    retry: 'Riprova',
    justNow: 'Adesso',
    minutesAgo: '{n} min fa',
    hoursAgo: '{n} h fa',
    yesterday: 'Ieri',
    connectionOffline: 'Connessione a Internet assente',
    connectionReconnecting: 'Riconnessione in corso…',
    connectionReconnected: 'Connessione ripristinata',
    attachFile: 'Allega un file',
    removeFile: 'Rimuovi',
    uploading: 'Caricamento',
    fileTooBig: 'Il file è troppo grande. Il limite è {maxMB} MB.',
    fileTypeNotAllowed: 'Tipo di file non consentito.',
    uploadFailed: 'Impossibile caricare il file. Riprova.',
    dragDropHint: 'Rilascia qui i file',
    agentTyping: '{name} sta scrivendo…',
    someoneTyping: 'Qualcuno sta scrivendo…',
    brandingAriaLabel: 'Con tecnologia Nevent, chatbot IA per eventi',
    defaultWelcomeMessage: 'Ciao! Come posso aiutarti?',
  },
  /** German (Germany) (de) */
  de: {
    inputPlaceholder: 'Nachricht schreiben…',
    sendButton: 'Senden',
    defaultTitle: 'Chat mit uns',
    statusOnline: 'Online',
    statusConnecting: 'Wird verbunden…',
    statusOffline: 'Offline',
    typingIndicator: 'Ich denke nach…',
    messageSendError: 'Die Nachricht konnte nicht gesendet werden. Versuchen Sie es erneut.',
    connectionError: 'Verbindungsfehler. Ein neuer Versuch läuft…',
    rateLimitError: 'Zu viele Nachrichten. Warten Sie einen Moment.',
    rateLimitCountdown: 'Zu viele Nachrichten. Warten Sie {seconds} Sekunden.',
    rateLimitCountdownOne: 'Zu viele Nachrichten. Warten Sie 1 Sekunde.',
    poweredBy: 'Technologie von Nevent',
    newConversation: 'Neuer Chat',
    closeChat: 'Chat schließen',
    minimizeChat: 'Chat minimieren',
    openChat: 'Chat öffnen',
    retry: 'Erneut versuchen',
    justNow: 'Gerade eben',
    minutesAgo: 'vor {n} Min.',
    hoursAgo: 'vor {n} Std.',
    yesterday: 'Gestern',
    connectionOffline: 'Keine Internetverbindung',
    connectionReconnecting: 'Verbindung wird erneut aufgebaut…',
    connectionReconnected: 'Verbindung wiederhergestellt',
    attachFile: 'Datei anhängen',
    removeFile: 'Entfernen',
    uploading: 'Wird hochgeladen',
    fileTooBig: 'Die Datei ist zu groß. Maximal sind {maxMB} MB erlaubt.',
    fileTypeNotAllowed: 'Dieser Dateityp ist nicht zulässig.',
    uploadFailed: 'Die Datei konnte nicht hochgeladen werden. Versuchen Sie es erneut.',
    dragDropHint: 'Dateien hier ablegen',
    agentTyping: '{name} schreibt…',
    someoneTyping: 'Jemand schreibt…',
    brandingAriaLabel: 'Technologie von Nevent, KI-Chatbot für Events',
    defaultWelcomeMessage: 'Hallo! Wie kann ich Ihnen helfen?',
  },
};

/**
 * Ordered list of all supported locales for validation purposes.
 */
const SUPPORTED_LOCALES: ReadonlyArray<SupportedLocale> = [
  'es',
  'en',
  'ca',
  'pt',
  'fr',
  'it',
  'de',
];

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
   * @param locale - A supported locale code ('es' | 'en' | 'ca' | 'pt' | 'fr' | 'it')
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
   * @returns The active locale (e.g., 'es', 'en', 'ca', 'pt', 'fr', 'it')
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
   * @returns A supported locale code ('es' | 'en' | 'ca' | 'pt' | 'fr' | 'it')
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
   * // navigator.language = 'nl-NL' (unsupported)
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
    if (
      primaryTag &&
      (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(primaryTag)
    ) {
      return primaryTag as SupportedLocale;
    }

    return DEFAULT_LOCALE;
  }
}
