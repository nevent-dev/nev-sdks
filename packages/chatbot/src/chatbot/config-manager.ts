/**
 * ConfigManager - Merges and validates chatbot configuration
 *
 * Responsible for:
 * - Validating user-provided configuration (required fields, types, constraints)
 * - Applying sensible defaults for all optional configuration fields
 * - Merging client config with server-side config following a defined precedence order:
 *     1. Client-side `styles` and callbacks — always win (promoter customization)
 *     2. Server-side `features` and `rateLimit` — always win (platform enforcement)
 *     3. Server-side `theme`, `welcomeMessage`, `placeholder` — win unless client overrides
 *     4. Defaults — lowest priority fallback
 * - Providing typed accessors for all configuration properties
 *
 * Configuration precedence (highest to lowest):
 * 1. Client-side overrides (`styles`, callbacks, behavior flags)
 * 2. Server-side `features` and `rateLimit` (platform enforced)
 * 3. Server-side content/theme (`welcomeMessage`, `placeholder`, `theme`)
 * 4. Default values (defined in `DEFAULTS` below)
 */

import type {
  ChatbotConfig,
  ServerChatbotConfig,
  ChatbotError,
  ChatbotStyles,
  SupportedLocale,
  ThemeMode,
  BubblePosition,
  AuthConfig,
} from '../types';

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default values for all optional {@link ChatbotConfig} fields.
 * Applied before any user or server configuration is merged in.
 */
const DEFAULTS: Omit<Required<ChatbotConfig>, 'chatbotId' | 'tenantId'> = {
  apiUrl: 'https://api.nevent.es',
  containerId: null,
  position: 'bottom-right' as BubblePosition,
  theme: 'light' as ThemeMode,
  locale: 'es' as SupportedLocale,
  styles: {} as ChatbotStyles,
  analytics: true,
  analyticsUrl: 'https://events.neventapis.com',
  debug: false,
  welcomeMessage: '',
  placeholder: '',
  autoOpen: false,
  autoOpenDelay: 3000,
  persistConversation: true,
  conversationTTL: 24,
  showBranding: true,
  // Advanced theming defaults — undefined means "not configured, use base theme"
  themePreset: undefined as unknown as string,
  brandColor: undefined as unknown as string,
  customCSS: undefined as unknown as string,
  fonts: undefined as unknown as import('../types').FontConfig[],
  // Backend context defaults — undefined means "not provided"
  eventId: undefined as unknown as string,
  source: undefined as unknown as string,
  ticketId: undefined as unknown as string,
  userContext: undefined as unknown as { lat: number; lng: number },
  // Rate limit defaults — undefined means use RateLimiter defaults
  rateLimit: undefined as unknown as { maxRequests?: number; windowMs?: number; cooldownMs?: number },
  // Auth defaults — undefined means public (anonymous) mode
  auth: undefined as unknown as AuthConfig,
  onOpen: () => {},
  onClose: () => {},
  onMessage: () => {},
  onError: () => {},
  onReady: () => {},
};

/** Locales supported by the chatbot widget */
const SUPPORTED_LOCALES: SupportedLocale[] = ['es', 'en', 'ca', 'pt'];

/** Theme modes supported by the chatbot widget */
const SUPPORTED_THEMES: ThemeMode[] = ['light', 'dark', 'auto'];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Performs a deep merge of two plain objects.
 *
 * The `source` values take precedence over `target` values at each level.
 * Arrays are NOT merged — the source array entirely replaces the target array.
 * Non-object values are replaced with the source value.
 *
 * @param target - The base object to merge into
 * @param source - The override object whose values take precedence
 * @returns A new object with both objects merged
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Returns true if the provided string is a valid URL.
 *
 * @param value - String to validate
 * @returns `true` when the string can be parsed as a URL with http or https scheme
 */
function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// ConfigManager class
// ============================================================================

/**
 * Manages the complete configuration lifecycle for the chatbot widget.
 *
 * Validates the user-supplied config, applies defaults, and later merges in
 * server-side configuration returned by the API. All getters return readonly
 * views to prevent accidental mutation.
 *
 * @example
 * ```typescript
 * // 1. Construct with user config — throws on invalid config
 * const manager = new ConfigManager({
 *   chatbotId: 'bot-123',
 *   tenantId: 'tenant-456',
 *   locale: 'en',
 *   styles: { bubble: { backgroundColor: '#6366f1' } },
 * });
 *
 * // 2. Later, merge server config (after fetchConfig() call)
 * manager.mergeServerConfig(serverConfig);
 *
 * // 3. Use typed getters
 * const apiUrl = manager.getApiUrl();
 * const locale = manager.getLocale();
 * const debug  = manager.isDebug();
 * ```
 */
export class ConfigManager {
  /** Fully resolved config with all defaults applied */
  private config: Required<ChatbotConfig>;

  /** Server-side config — null until {@link mergeServerConfig} is called */
  private serverConfig: ServerChatbotConfig | null = null;

  /**
   * Creates a new ConfigManager for the given user configuration.
   *
   * Validates the config immediately and applies all defaults. Throws a
   * {@link ChatbotError}-shaped Error if validation fails so the widget can
   * surface a clear initialization error.
   *
   * @param userConfig - Configuration provided by the host application
   * @throws {Error} When required fields are missing or any field fails validation
   */
  constructor(userConfig: ChatbotConfig) {
    this.validate(userConfig);
    this.config = this.applyDefaults(userConfig);
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validates a {@link ChatbotConfig} object against all constraints.
   *
   * Checks performed:
   * - `chatbotId` is a non-empty string
   * - `tenantId` is a non-empty string
   * - `apiUrl` (if provided) is a valid http/https URL
   * - `locale` (if provided) is one of the supported locales
   * - `theme` (if provided) is one of the supported themes
   * - `autoOpenDelay` (if provided) is a positive number
   * - `styles.zIndex` (if provided) is a positive integer
   *
   * @param config - The configuration to validate
   * @throws {Error} with a descriptive message for the first validation failure found
   */
  validate(config: ChatbotConfig): void {
    const errors: string[] = [];

    // Required fields
    if (!config.chatbotId || typeof config.chatbotId !== 'string' || config.chatbotId.trim() === '') {
      errors.push('chatbotId is required and must be a non-empty string');
    }

    if (!config.tenantId || typeof config.tenantId !== 'string' || config.tenantId.trim() === '') {
      errors.push('tenantId is required and must be a non-empty string');
    }

    // Optional URL validation
    if (config.apiUrl !== undefined && !isValidUrl(config.apiUrl)) {
      errors.push(`apiUrl must be a valid http or https URL, received: "${config.apiUrl}"`);
    }

    if (config.analyticsUrl !== undefined && !isValidUrl(config.analyticsUrl)) {
      errors.push(`analyticsUrl must be a valid http or https URL, received: "${config.analyticsUrl}"`);
    }

    // Locale validation
    if (config.locale !== undefined && !SUPPORTED_LOCALES.includes(config.locale)) {
      errors.push(
        `locale must be one of [${SUPPORTED_LOCALES.join(', ')}], received: "${config.locale}"`
      );
    }

    // Theme validation
    if (config.theme !== undefined && !SUPPORTED_THEMES.includes(config.theme)) {
      errors.push(
        `theme must be one of [${SUPPORTED_THEMES.join(', ')}], received: "${config.theme}"`
      );
    }

    // autoOpenDelay must be a positive number
    if (config.autoOpenDelay !== undefined) {
      if (typeof config.autoOpenDelay !== 'number' || config.autoOpenDelay <= 0) {
        errors.push(`autoOpenDelay must be a positive number, received: ${config.autoOpenDelay}`);
      }
    }

    // conversationTTL must be a positive number
    if (config.conversationTTL !== undefined) {
      if (typeof config.conversationTTL !== 'number' || config.conversationTTL <= 0) {
        errors.push(`conversationTTL must be a positive number (hours), received: ${config.conversationTTL}`);
      }
    }

    // styles.zIndex must be a positive integer if provided
    if (config.styles?.zIndex !== undefined) {
      if (
        typeof config.styles.zIndex !== 'number' ||
        !Number.isInteger(config.styles.zIndex) ||
        config.styles.zIndex <= 0
      ) {
        errors.push(`styles.zIndex must be a positive integer, received: ${config.styles.zIndex}`);
      }
    }

    // Auth config validation
    if (config.auth !== undefined) {
      const validModes = ['public', 'jwt', 'custom'];
      if (!validModes.includes(config.auth.mode)) {
        errors.push(
          `auth.mode must be one of [${validModes.join(', ')}], received: "${String(config.auth.mode)}"`
        );
      }

      // JWT and custom modes require a token (can be set later via setAuthToken, but warn)
      // No hard error here — the token can be set at runtime via setAuthToken()

      // Custom mode: headerName must be a non-empty string if provided
      if (config.auth.mode === 'custom') {
        if (
          config.auth.headerName !== undefined &&
          (typeof config.auth.headerName !== 'string' || config.auth.headerName.trim() === '')
        ) {
          errors.push('auth.headerName must be a non-empty string when provided');
        }
        if (
          config.auth.headerPrefix !== undefined &&
          typeof config.auth.headerPrefix !== 'string'
        ) {
          errors.push('auth.headerPrefix must be a string when provided');
        }
      }

      // onTokenRefresh must be a function if provided
      if (
        config.auth.onTokenRefresh !== undefined &&
        typeof config.auth.onTokenRefresh !== 'function'
      ) {
        errors.push('auth.onTokenRefresh must be a function when provided');
      }

      // userIdentity.userId is required when userIdentity is provided
      if (config.auth.userIdentity !== undefined) {
        if (
          !config.auth.userIdentity.userId ||
          typeof config.auth.userIdentity.userId !== 'string' ||
          config.auth.userIdentity.userId.trim() === ''
        ) {
          errors.push('auth.userIdentity.userId is required and must be a non-empty string');
        }
      }
    }

    if (errors.length > 0) {
      throw Object.assign(
        new Error(`[NeventChatbot] Invalid configuration:\n  - ${errors.join('\n  - ')}`),
        {
          code: 'INVALID_CONFIG' as const,
          details: { errors },
        } satisfies Partial<ChatbotError>
      );
    }
  }

  // ============================================================================
  // Server config merge
  // ============================================================================

  /**
   * Merges the server-side configuration into the resolved config.
   *
   * Merge rules:
   * - `styles` from user config always win over server styles (client precedence)
   * - `features` and `rateLimit` from server always win (platform enforcement)
   * - `welcomeMessage` and `placeholder` from server are used ONLY when the user
   *   has not provided explicit overrides (empty string default)
   * - `theme.mode` from server is used when the user chose the default 'light'
   *
   * @param serverCfg - Configuration returned by `GET /public/chatbot/{id}/config`
   */
  mergeServerConfig(serverCfg: ServerChatbotConfig): void {
    this.serverConfig = serverCfg;

    // Server styles deep-merged first, then user styles applied on top
    // Result: user's style overrides always win over server styles
    const mergedStyles = deepMerge(
      (serverCfg.styles ?? {}) as Record<string, unknown>,
      (this.config.styles ?? {}) as Record<string, unknown>
    ) as ChatbotStyles;

    // Welcome message: use server value only when user left it as empty default
    const welcomeMessage =
      this.config.welcomeMessage !== ''
        ? this.config.welcomeMessage
        : serverCfg.welcomeMessage ?? '';

    // Placeholder: same precedence rule
    const placeholder =
      this.config.placeholder !== ''
        ? this.config.placeholder
        : serverCfg.placeholder ?? '';

    // Theme: apply server's theme.mode only when user is using the default ('light')
    const theme: ThemeMode =
      this.config.theme !== DEFAULTS.theme
        ? this.config.theme
        : (serverCfg.theme?.mode ?? this.config.theme);

    this.config = {
      ...this.config,
      welcomeMessage,
      placeholder,
      theme,
      styles: mergedStyles,
    };
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Returns the fully resolved configuration object.
   *
   * @returns Readonly view of the merged {@link ChatbotConfig}
   */
  getConfig(): Readonly<Required<ChatbotConfig>> {
    return this.config;
  }

  /**
   * Returns the server configuration if it has been merged, otherwise `null`.
   *
   * @returns Readonly server config or `null`
   */
  getServerConfig(): Readonly<ServerChatbotConfig> | null {
    return this.serverConfig;
  }

  /**
   * Returns the resolved API base URL.
   *
   * @returns API URL string (e.g. 'https://api.nevent.es')
   */
  getApiUrl(): string {
    return this.config.apiUrl;
  }

  /**
   * Returns the tenant identifier.
   *
   * @returns Tenant ID string
   */
  getTenantId(): string {
    return this.config.tenantId;
  }

  /**
   * Returns the chatbot identifier.
   *
   * @returns Chatbot ID string
   */
  getChatbotId(): string {
    return this.config.chatbotId;
  }

  /**
   * Returns the resolved locale for UI strings.
   *
   * @returns One of the {@link SupportedLocale} values
   */
  getLocale(): SupportedLocale {
    return this.config.locale;
  }

  /**
   * Returns the resolved theme mode.
   *
   * @returns One of the {@link ThemeMode} values ('light', 'dark', or 'auto')
   */
  getTheme(): ThemeMode {
    return this.config.theme;
  }

  /**
   * Returns whether debug logging is enabled.
   *
   * @returns `true` when verbose debug output is active
   */
  isDebug(): boolean {
    return this.config.debug;
  }

  /**
   * Returns whether analytics tracking is enabled.
   *
   * When the server config has been merged, server-level feature flags
   * do not override this — analytics consent is always the host app's decision.
   *
   * @returns `true` when analytics events should be tracked and sent
   */
  isAnalyticsEnabled(): boolean {
    return this.config.analytics;
  }

  /**
   * Returns whether conversation state should be persisted to localStorage.
   *
   * @returns `true` when cross-page conversation persistence is active
   */
  shouldPersist(): boolean {
    return this.config.persistConversation;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Applies the {@link DEFAULTS} to a user-provided config, returning a
   * fully-resolved {@link Required<ChatbotConfig>} with no optional fields.
   *
   * @param userConfig - Partial config from the host application
   * @returns Fully-resolved config with all optional fields filled in
   */
  private applyDefaults(userConfig: ChatbotConfig): Required<ChatbotConfig> {
    return {
      ...DEFAULTS,
      ...userConfig,
      // Deep merge styles so partial overrides (e.g. only bubble) don't erase other sections
      styles: deepMerge(
        DEFAULTS.styles as Record<string, unknown>,
        (userConfig.styles ?? {}) as Record<string, unknown>
      ) as ChatbotStyles,
    };
  }
}
