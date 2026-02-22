import {
  EmailValidator,
  HttpClient,
  Logger,
  AnalyticsClient,
  ErrorBoundary,
  Sanitizer,
  I18nManager,
  SentryReporter,
} from '@nevent/core';
import type {
  NormalizedError,
  SentryReporterConfig,
  SentryEvent,
} from '@nevent/core';
import type {
  CustomFont,
  FieldConfiguration,
  LayoutElement,
  NewsletterConfig,
  ServerWidgetConfig,
  SubscriptionData,
  SubscriptionResponse,
} from './types';
import { WidgetTracker } from './newsletter/analytics/widget-tracker';
import { FormRenderer } from './newsletter/form-renderer';
import { adaptFieldConfigurations } from './newsletter/field-adapter';
import { injectSchemaOrg } from './newsletter/schema-injector';
import { injectSeoTags } from './newsletter/seo-injector';
import {
  createNewsletterI18n,
  type NewsletterLabels,
} from './newsletter/i18n/index';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of retry attempts for API calls */
const MAX_RETRIES = 3;

/** Base delay between retries in milliseconds (exponential backoff) */
const RETRY_BASE_DELAY_MS = 1000;

// ============================================================================
// NewsletterWidget
// ============================================================================

/**
 * Nevent Newsletter Subscription Widget
 *
 * A fully-featured, enterprise-grade newsletter subscription widget with:
 * - Shadow DOM encapsulation (styles do not leak to/from the host page)
 * - Error isolation via ErrorBoundary (widget errors never crash the host)
 * - i18n support (es, en, ca, pt with auto-detection)
 * - HTML sanitization for all innerHTML injections (XSS prevention)
 * - WCAG 2.1 AA accessibility compliance
 * - GDPR compliance
 * - Customizable layouts (column/row)
 * - Google Fonts and custom font support
 * - Responsive design
 * - Form validation
 * - Connection management with retry logic and offline detection
 * - Analytics tracking
 * - Proper destroy() lifecycle method
 *
 * @example
 * ```typescript
 * const widget = new NewsletterWidget({
 *   newsletterId: 'newsletter-123',
 *   tenantId: 'tenant-456',
 *   containerId: 'newsletter-container',
 *   locale: 'en',
 *   onError: (err) => console.error('Widget error:', err),
 * });
 *
 * await widget.init();
 *
 * // Later, when removing widget:
 * widget.destroy();
 * ```
 */
export class NewsletterWidget {
  // --------------------------------------------------------------------------
  // Configuration and services
  // --------------------------------------------------------------------------

  /** Resolved configuration (defaults merged with user-provided config) */
  private config: Required<NewsletterConfig>;

  /** Host page container element where the widget host element is appended */
  private container: HTMLElement | null = null;

  /**
   * Host element appended to the container. Acts as the Shadow DOM
   * attachment point. Styled with `all: initial` to isolate widget
   * styles from the host page.
   */
  private hostElement: HTMLElement | null = null;

  /**
   * Shadow root attached to hostElement. All widget DOM and styles live
   * inside this shadow boundary, preventing CSS leakage in both directions.
   * Null only when `Element.attachShadow` is not supported (fallback:
   * render directly into hostElement).
   */
  private shadow: ShadowRoot | null = null;

  /** The form element rendered inside the shadow root */
  private form: HTMLFormElement | null = null;

  /** Whether a form submission is in progress */
  private isSubmitting = false;

  /** Original submit button text, stored before spinner is shown so it can be restored */
  private submitButtonOriginalText: string | null = null;

  /** Signature of loaded Google Fonts to prevent duplicate loading */
  private loadedFontSignature: string | null = null;

  /** Set of loaded custom font families to prevent duplicate loading */
  private loadedCustomFonts = new Set<string>();

  /** HTTP client for API communication */
  private httpClient: HttpClient | null = null;

  /** Logger instance for debug output */
  private logger: Logger;

  /** Analytics client for event tracking */
  private analyticsClient: AnalyticsClient | null = null;

  /** Widget-specific analytics tracker */
  private widgetTracker: WidgetTracker | null = null;

  /** Dynamic form renderer for API-driven field configurations */
  private formRenderer: FormRenderer | null = null;

  /** Field configurations from API or defaults */
  private fieldConfigurations: FieldConfiguration[] = [];

  /** Layout elements from API defining form element order and widths */
  private layoutElements: LayoutElement[] = [];

  /**
   * Error boundary for isolating widget errors from the host page.
   * All public methods, user callbacks, and event listeners are wrapped
   * through this boundary.
   */
  private errorBoundary: ErrorBoundary;

  /**
   * Lightweight Sentry error reporter for automatic error tracking.
   * Initialized during {@link init} when not explicitly disabled.
   * Wired to the ErrorBoundary so all caught errors are forwarded to Sentry.
   */
  private sentryReporter: SentryReporter | null = null;

  /**
   * I18n manager providing localized strings for all user-facing text.
   * Configured with es, en, ca, pt locales.
   */
  private i18n: I18nManager<NewsletterLabels>;

  // --------------------------------------------------------------------------
  // Lifecycle flags
  // --------------------------------------------------------------------------

  /** Whether init() has completed successfully */
  private initialized = false;

  /** Whether destroy() has been called */
  private destroyed = false;

  // --------------------------------------------------------------------------
  // Event listener references (for cleanup in destroy)
  // --------------------------------------------------------------------------

  /** Bound reference to the submit handler for cleanup */
  private boundSubmitHandler: ((event: Event) => void) | null = null;

  /** Online event listener reference */
  private onlineHandler: (() => void) | null = null;

  /** Offline event listener reference */
  private offlineHandler: (() => void) | null = null;

  /** Timer IDs for cleanup */
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Style elements injected into the document head (fonts) */
  private injectedHeadElements: HTMLElement[] = [];

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new newsletter widget instance.
   *
   * Validates required configuration fields and initializes the error
   * boundary, i18n manager, and logger. Does NOT render or fetch data
   * -- call {@link init} to start the widget lifecycle.
   *
   * @param config - Widget configuration. Only `newsletterId` and
   *   `tenantId` are required; all other options have sensible defaults.
   * @throws {Error} When `newsletterId` or `tenantId` are missing
   *
   * @example
   * ```typescript
   * const widget = new NewsletterWidget({
   *   newsletterId: 'nl-123',
   *   tenantId: 'tenant-456',
   *   locale: 'en',
   * });
   * ```
   */
  constructor(config: NewsletterConfig) {
    if (!config.newsletterId || !config.tenantId) {
      throw new Error(
        'NewsletterWidget: newsletterId and tenantId are required'
      );
    }

    this.config = this.mergeConfig(config);
    this.logger = new Logger('[NeventWidget]', this.config.debug);

    // Initialize error boundary for host page isolation
    this.errorBoundary = new ErrorBoundary(this.config.debug, '[NeventWidget]');
    if (this.config.onError) {
      this.errorBoundary.setErrorHandler(
        this.config.onError as (error: NormalizedError) => void
      );
    }

    // Initialize i18n with locale from config or auto-detect
    this.i18n = createNewsletterI18n(this.config.locale);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Initializes the widget.
   *
   * Loads configuration from server, renders the UI inside a Shadow DOM,
   * sets up event handlers, and starts analytics tracking. All operations
   * are wrapped in the error boundary so failures do not crash the host page.
   *
   * @returns Promise resolving to the widget instance, or undefined if
   *   initialization fails (error is reported via onError callback)
   */
  async init(): Promise<this | undefined> {
    return this.errorBoundary.guardAsync(async () => {
      if (this.destroyed) {
        throw new Error('NewsletterWidget: cannot init a destroyed widget');
      }

      this.findContainer();
      await this.loadWidgetConfig();
      injectSchemaOrg({
        newsletterId: this.config.newsletterId,
        title: this.config.title,
        description: this.config.subtitle,
        companyName: this.config.companyName,
        privacyPolicyUrl: this.config.privacyPolicyUrl,
      });
      injectSeoTags();
      this.initHttpClient();
      this.initAnalytics();
      this.initSentry();
      this.loadGoogleFonts();
      this.loadCustomFonts();
      this.createShadowDOM();
      this.render();
      this.attachEvents();
      this.setupConnectionMonitoring();
      this.trackEvent('widget_loaded');

      if (this.config.onLoad) {
        const safeOnLoad = this.errorBoundary.wrapCallback(
          this.config.onLoad as (...args: unknown[]) => unknown,
          'onLoad'
        );
        safeOnLoad(this);
      }

      this.initialized = true;
      this.logger.info('Widget initialized successfully');
      return this;
    }, 'init');
  }

  /**
   * Destroys the widget and cleans up all resources.
   *
   * Removes all DOM elements, event listeners, timers, and resets
   * internal state. After calling destroy(), the widget instance cannot
   * be re-initialized -- create a new instance instead.
   *
   * Safe to call multiple times (idempotent).
   */
  destroy(): void {
    this.errorBoundary.guard(() => {
      if (this.destroyed) {
        return;
      }
      this.destroyed = true;
      this.initialized = false;

      // Clean up widget tracker (IntersectionObserver, beforeunload, focusin)
      if (this.widgetTracker) {
        this.widgetTracker.destroy();
        this.widgetTracker = null;
      }

      // Remove submit handler
      if (this.form && this.boundSubmitHandler) {
        this.form.removeEventListener('submit', this.boundSubmitHandler);
        this.boundSubmitHandler = null;
      }

      // Remove connection monitoring listeners
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
        this.offlineHandler = null;
      }

      // Clear all timers
      for (const timer of this.timers) {
        clearTimeout(timer);
      }
      this.timers = [];

      // Remove injected head elements (Google Fonts, custom fonts)
      for (const el of this.injectedHeadElements) {
        el.parentNode?.removeChild(el);
      }
      this.injectedHeadElements = [];

      // Remove host element from DOM (this removes shadow root and all widget DOM)
      if (this.hostElement && this.hostElement.parentNode) {
        this.hostElement.parentNode.removeChild(this.hostElement);
      }

      // Destroy Sentry reporter and detach from error boundary
      if (this.sentryReporter) {
        this.errorBoundary.setSentryReporter(null);
        this.sentryReporter.destroy();
        this.sentryReporter = null;
      }

      // Reset references
      this.hostElement = null;
      this.shadow = null;
      this.form = null;
      this.container = null;
      this.httpClient = null;
      this.analyticsClient = null;
      this.formRenderer = null;
      this.fieldConfigurations = [];
      this.layoutElements = [];
      this.loadedFontSignature = null;
      this.loadedCustomFonts.clear();
      this.isSubmitting = false;
      this.submitButtonOriginalText = null;

      this.logger.info('Widget destroyed');
    }, 'destroy');
  }

  /**
   * Returns the current locale code.
   *
   * @returns Two-letter locale code (e.g. 'en', 'es')
   */
  getLocale(): string {
    return this.i18n.getLocale();
  }

  /**
   * Changes the active locale and re-renders if initialized.
   *
   * @param locale - Two-letter locale code (e.g. 'en', 'es', 'ca', 'pt')
   */
  setLocale(locale: string): void {
    this.errorBoundary.guard(() => {
      this.i18n.setLocale(locale);
      // If initialized, re-render with new locale strings
      if (this.initialized && this.shadow) {
        this.rerender();
      }
    }, 'setLocale');
  }

  // --------------------------------------------------------------------------
  // Shadow DOM
  // --------------------------------------------------------------------------

  /**
   * Creates the Shadow DOM host element and attaches a shadow root.
   *
   * The host element is styled with `all: initial` to prevent style
   * inheritance from the host page into the shadow root.
   */
  private createShadowDOM(): void {
    if (!this.container) {
      return;
    }

    this.hostElement = document.createElement('div');
    this.hostElement.setAttribute('data-nevent-widget', 'newsletter');
    // Reset all inherited styles at the host boundary
    this.hostElement.style.all = 'initial';
    this.hostElement.style.display = 'block';

    if (typeof this.hostElement.attachShadow === 'function') {
      this.shadow = this.hostElement.attachShadow({ mode: 'open' });
    } else {
      // Fallback for environments without Shadow DOM support
      this.shadow = null;
    }

    this.container.appendChild(this.hostElement);
  }

  /**
   * Returns the rendering target: shadow root if available, otherwise
   * the host element itself.
   */
  private getRenderRoot(): ShadowRoot | HTMLElement {
    return this.shadow || this.hostElement!;
  }

  // --------------------------------------------------------------------------
  // Re-render (locale change)
  // --------------------------------------------------------------------------

  /**
   * Clears the shadow root content and re-renders the widget.
   * Used when locale changes after initialization.
   */
  private rerender(): void {
    const root = this.getRenderRoot();

    // Remove submit handler before clearing DOM
    if (this.form && this.boundSubmitHandler) {
      this.form.removeEventListener('submit', this.boundSubmitHandler);
      this.boundSubmitHandler = null;
    }

    // Clear shadow root
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }

    this.form = null;
    this.formRenderer = null;

    // Re-render
    this.render();
    this.attachEvents();
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Merges user-provided config with defaults.
   *
   * @param config - User-provided configuration
   * @returns Fully resolved configuration with all defaults applied
   */
  private mergeConfig(config: NewsletterConfig): Required<NewsletterConfig> {
    const defaults: Required<NewsletterConfig> = {
      newsletterId: config.newsletterId,
      tenantId: config.tenantId,
      apiUrl: 'https://api.nevent.es',
      containerId: null,
      theme: 'default',
      primaryColor: '#007bff',
      backgroundColor: '#ffffff',
      borderRadius: 8,
      fields: {
        email: { enabled: true, required: true, placeholder: 'Tu email' },
        firstName: {
          enabled: true,
          required: false,
          placeholder: 'Tu nombre',
        },
        lastName: {
          enabled: false,
          required: false,
          placeholder: 'Apellidos',
        },
        postalCode: {
          enabled: false,
          required: false,
          placeholder: 'Codigo postal',
        },
        birthDate: {
          enabled: false,
          required: false,
          placeholder: 'Fecha de nacimiento',
        },
      },
      messages: {
        submit: '',
        loading: '',
        success: '',
        error: '',
        alreadySubscribed: '',
        invalidEmail: '',
        gdprText: '',
        privacyText: '',
      },
      locale: '',
      analytics: true,
      analyticsUrl: 'https://events.neventapis.com',
      resetOnSuccess: true,
      showLabels: false,
      animations: true,
      debug: false,
      showBranding: true,
      styles: null,
      customCSS: '',
      token: '',
      companyName: '',
      privacyPolicyUrl: '',
      title: '',
      subtitle: '',
      sentry: undefined,
      onLoad: undefined,
      onSubmit: undefined,
      onSuccess: undefined,
      onError: undefined,
    };

    return this.deepMerge(defaults, config) as Required<NewsletterConfig>;
  }

  /**
   * Deep merge two objects.
   *
   * @param target - Base object with defaults
   * @param source - Override object
   * @returns Merged object
   */
  private deepMerge<T extends Record<string, unknown>>(
    target: T,
    source: Partial<T>
  ): T {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Server configuration
  // --------------------------------------------------------------------------

  /**
   * Loads widget configuration from the Nevent API with retry logic.
   *
   * On failure, falls back to default field configurations. Network
   * errors are caught and logged but do not prevent the widget from
   * rendering.
   */
  private async loadWidgetConfig(): Promise<void> {
    try {
      const url = `${this.config.apiUrl}/public/widget/${this.config.newsletterId}/config?tenantId=${this.config.tenantId}`;

      // Use a single retry for config loading (non-critical, falls back to defaults)
      const response = await this.fetchWithRetry(
        url,
        { method: 'GET', headers: { Accept: 'application/json' } },
        1
      );

      if (response.ok) {
        const serverConfig = (await response.json()) as ServerWidgetConfig;

        // Merge server config, handling optional properties correctly
        const mergedConfig = {
          ...this.config,
          ...serverConfig,
          fields: serverConfig.fields
            ? { ...this.config.fields, ...serverConfig.fields }
            : this.config.fields,
          messages: serverConfig.messages
            ? { ...this.config.messages, ...serverConfig.messages }
            : this.config.messages,
          styles: serverConfig.styles
            ? {
                global: {
                  ...this.config.styles?.global,
                  ...serverConfig.styles.global,
                },
                title: {
                  ...this.config.styles?.title,
                  ...serverConfig.styles.title,
                },
                subtitle: {
                  ...this.config.styles?.subtitle,
                  ...serverConfig.styles.subtitle,
                },
                input: {
                  ...this.config.styles?.input,
                  ...serverConfig.styles.input,
                },
                button: {
                  ...this.config.styles?.button,
                  ...serverConfig.styles.button,
                },
              }
            : this.config.styles,
        };

        this.config = mergedConfig as Required<NewsletterConfig>;
        this.logger.debug('Widget configuration loaded from server');

        // Store fieldConfigurations if provided by API (adapt from raw API format)
        if (
          serverConfig.fieldConfigurations &&
          serverConfig.fieldConfigurations.length > 0
        ) {
          this.fieldConfigurations = adaptFieldConfigurations(
            serverConfig.fieldConfigurations
          );
          this.logger.debug(
            'Dynamic field configurations loaded from API:',
            this.fieldConfigurations
          );
        } else {
          this.fieldConfigurations = this.getDefaultFieldConfigurations();
          this.logger.debug(
            'Using default field configurations (backward compatibility)'
          );
        }

        // Store layoutElements if provided by API
        if (
          serverConfig.styles?.global?.layoutElements &&
          serverConfig.styles.global.layoutElements.length > 0
        ) {
          this.layoutElements = serverConfig.styles.global.layoutElements;
          this.logger.debug(
            'Layout elements loaded from API:',
            this.layoutElements
          );
        }

        // Enrich field configs with semantic keys from layout elements
        this.enrichFieldConfigsFromLayout();
      } else {
        this.logger.warn(
          'Could not load widget configuration from server, using defaults'
        );
        this.fieldConfigurations = this.getDefaultFieldConfigurations();
      }
    } catch (error) {
      this.logger.warn('Error loading widget configuration:', error);
      this.fieldConfigurations = this.getDefaultFieldConfigurations();
    }
  }

  /**
   * Enriches field configurations with semantic keys from layout elements.
   * When backend doesn't return semanticKey, fieldName defaults to propertyDefinitionId.
   * Layout elements contain the expected semantic keys, so we match by displayOrder position.
   */
  private enrichFieldConfigsFromLayout(): void {
    if (!this.layoutElements || this.layoutElements.length === 0) return;
    if (!this.fieldConfigurations || this.fieldConfigurations.length === 0)
      return;

    const fieldLayouts = this.layoutElements
      .filter((e) => e.type === 'field')
      .sort((a, b) => a.order - b.order);

    const sortedConfigs = [...this.fieldConfigurations].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );

    fieldLayouts.forEach((layout, index) => {
      if (index < sortedConfigs.length) {
        const config = sortedConfigs[index];
        if (config && config.fieldName === config.propertyDefinitionId) {
          config.fieldName = layout.key;
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // HTTP / Connection management
  // --------------------------------------------------------------------------

  /**
   * Initializes the HTTP client after config is loaded.
   */
  private initHttpClient(): void {
    const apiKey = this.config.token || '';
    this.httpClient = new HttpClient(this.config.apiUrl, apiKey);
  }

  /**
   * Fetches a URL with exponential backoff retry logic.
   *
   * @param url - The URL to fetch
   * @param options - Fetch request init options
   * @param maxRetries - Maximum number of retry attempts (default: MAX_RETRIES)
   * @returns The fetch Response
   * @throws {Error} When all retry attempts are exhausted
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = MAX_RETRIES
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check offline state before attempting
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error('OFFLINE');
        }

        const response = await fetch(url, options);

        // Retry on server errors (5xx), not client errors (4xx)
        if (response.status >= 500 && attempt < maxRetries) {
          lastError = new Error(`Server error: ${response.status}`);
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          this.logger.warn(
            `Fetch attempt ${attempt + 1}/${maxRetries + 1} failed, retrying...`
          );
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Sets up browser online/offline event monitoring.
   * Shows user-friendly messages when connection state changes.
   */
  private setupConnectionMonitoring(): void {
    this.onlineHandler = () => {
      this.errorBoundary.guard(() => {
        this.hideOfflineBanner();
        this.logger.debug('Connection restored');
      }, 'onlineHandler');
    };

    this.offlineHandler = () => {
      this.errorBoundary.guard(() => {
        this.showOfflineBanner();
        this.logger.debug('Connection lost');
      }, 'offlineHandler');
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);

    // Show banner immediately if currently offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.showOfflineBanner();
    }
  }

  /**
   * Shows an offline notification banner inside the widget.
   */
  private showOfflineBanner(): void {
    const root = this.getRenderRoot();
    let banner = root.querySelector(
      '.nevent-offline-banner'
    ) as HTMLElement | null;

    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'nevent-offline-banner';
      banner.setAttribute('role', 'alert');
      banner.textContent = this.i18n.t('offlineMessage');

      const firstChild = root.firstChild;
      if (firstChild) {
        root.insertBefore(banner, firstChild);
      } else {
        root.appendChild(banner);
      }
    }

    banner.style.display = 'block';
  }

  /**
   * Hides the offline notification banner.
   */
  private hideOfflineBanner(): void {
    const root = this.getRenderRoot();
    const banner = root.querySelector(
      '.nevent-offline-banner'
    ) as HTMLElement | null;
    if (banner) {
      banner.style.display = 'none';
    }
  }

  /**
   * Returns a promise that resolves after a specified delay.
   *
   * @param ms - Delay in milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.timers.push(timer);
    });
  }

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  /**
   * Initializes analytics client and widget tracker.
   */
  private initAnalytics(): void {
    if (!this.config.analytics) {
      return;
    }

    this.analyticsClient = new AnalyticsClient({
      endpoint: this.config.analyticsUrl,
      enabled: true,
      debug: this.config.debug,
    });

    this.widgetTracker = new WidgetTracker(
      this.analyticsClient,
      this.config.newsletterId,
      this.config.tenantId
    );
  }

  // --------------------------------------------------------------------------
  // Sentry initialization
  // --------------------------------------------------------------------------

  /**
   * Initializes the lightweight Sentry error reporter.
   *
   * Creates a {@link SentryReporter} instance with sensible defaults and
   * wires it to the ErrorBoundary so all caught errors are automatically
   * forwarded to Sentry. Non-critical: failures are logged and swallowed.
   */
  private initSentry(): void {
    try {
      const sentryConfig = this.config.sentry;
      if (sentryConfig?.enabled === false) {
        return;
      }

      // Default DSN for Nevent SDKs
      const defaultDsn =
        'https://ecaff66e5b924e2aa881e662581fe805@o4504651545640960.ingest.sentry.io/4504788728872960';

      // Auto-detect environment from API URL
      const apiUrl = this.config.apiUrl;
      const detectedEnv = apiUrl.includes('dev.')
        ? 'development'
        : apiUrl.includes('staging.')
          ? 'staging'
          : 'production';

      const reporterConfig: SentryReporterConfig = {
        dsn: sentryConfig?.dsn ?? defaultDsn,
        enabled: true,
        tunnel: sentryConfig?.tunnel ?? `${apiUrl}/diagnostics`,
        environment: sentryConfig?.environment ?? detectedEnv,
        release: `@nevent/subscriptions@2.2.0`,
        sampleRate: sentryConfig?.sampleRate ?? 1.0,
        tags: {
          sdk: 'subscriptions',
          tenantId: this.config.tenantId,
          newsletterId: this.config.newsletterId,
        },
      };

      // Only set beforeSend if provided (exactOptionalPropertyTypes)
      if (sentryConfig?.beforeSend) {
        reporterConfig.beforeSend = sentryConfig.beforeSend as (
          event: SentryEvent
        ) => SentryEvent | null;
      }

      this.sentryReporter = new SentryReporter(reporterConfig);

      // Wire Sentry to ErrorBoundary for automatic error forwarding
      this.errorBoundary.setSentryReporter(this.sentryReporter);

      this.logger.debug('Sentry reporter initialized');
    } catch (sentryError) {
      this.logger.warn('Sentry initialization failed (non-fatal)', sentryError);
    }
  }

  // --------------------------------------------------------------------------
  // Font loading
  // --------------------------------------------------------------------------

  /**
   * Loads Google Fonts used in widget styles.
   *
   * Google Fonts are loaded via a `<link>` tag in the document head
   * (required for font file fetching) and the font-family declarations
   * are used inside the Shadow DOM CSS.
   */
  private loadGoogleFonts(): void {
    const googleFonts = new Set<string>();
    const styles = this.config.styles;

    // Collect all Google Fonts from configuration (filter by type)
    if (
      styles?.global?.font?.family &&
      styles.global.font.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.global.font.family);
    }
    if (
      styles?.title?.font?.family &&
      styles.title.font.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.title.font.family);
    }
    if (
      styles?.subtitle?.font?.family &&
      styles.subtitle.font.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.subtitle.font.family);
    }
    if (
      styles?.input?.font?.family &&
      styles.input.font.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.input.font.family);
    }
    if (
      styles?.button?.font?.family &&
      styles.button.font.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.button.font.family);
    }
    if (
      styles?.input?.labelFont?.family &&
      styles.input.labelFont.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.input.labelFont.family);
    }
    if (
      styles?.input?.placeholderFont?.family &&
      styles.input.placeholderFont.type === 'GOOGLE_FONT'
    ) {
      googleFonts.add(styles.input.placeholderFont.family);
    }
    // Support legacy fontFamily properties (backward compatibility)
    if (styles?.input?.fontFamily) {
      googleFonts.add(styles.input.fontFamily);
    }
    if (styles?.button?.fontFamily) {
      googleFonts.add(styles.button.fontFamily);
    }

    if (googleFonts.size === 0) {
      return;
    }

    // Check if already loaded
    const fontSignature = Array.from(googleFonts).sort().join('|');
    if (this.loadedFontSignature === fontSignature) {
      return;
    }

    // Build Google Fonts URL
    const fontFamilies = Array.from(googleFonts).map((family) => {
      const urlFamily = family.replace(/ /g, '+');
      return `${urlFamily}:wght@300;400;500;600;700`;
    });

    const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontFamilies.map((f) => `family=${f}`).join('&')}&display=swap`;

    // Check if link already exists
    if (document.querySelector(`link[href="${googleFontsUrl}"]`)) {
      return;
    }

    // Inject Google Fonts link into document head (must be outside shadow DOM)
    const linkElement = document.createElement('link');
    linkElement.href = googleFontsUrl;
    linkElement.rel = 'stylesheet';
    linkElement.type = 'text/css';
    linkElement.id = 'nevent-google-fonts';
    document.head.appendChild(linkElement);
    this.injectedHeadElements.push(linkElement);

    this.loadedFontSignature = fontSignature;
    this.logger.debug('Google Fonts loaded:', Array.from(googleFonts));
  }

  /**
   * Loads custom fonts from config styles.
   */
  private loadCustomFonts(): void {
    const styles = this.config.styles;
    const fontSections = [
      styles?.global?.font,
      styles?.title?.font,
      styles?.subtitle?.font,
      styles?.input?.font,
      styles?.input?.labelFont,
      styles?.input?.placeholderFont,
      styles?.button?.font,
    ].filter(Boolean);

    for (const font of fontSections) {
      if (font && font.type === 'CUSTOM_FONT' && font.files && font.family) {
        this.injectCustomFont({
          id: font.customFontId || font.family,
          family: font.family,
          files: font.files,
        });
      }
    }

    if (this.loadedCustomFonts.size > 0) {
      this.logger.debug(
        'Custom fonts loaded:',
        Array.from(this.loadedCustomFonts)
      );
    }
  }

  /**
   * Injects a custom font @font-face rule.
   *
   * Font-face declarations are injected into the document head because
   * they need to be globally available for the browser to resolve the
   * font-family reference inside the Shadow DOM.
   *
   * @param customFont - Custom font configuration with URL and family name
   */
  private injectCustomFont(customFont: CustomFont): void {
    if (!customFont.files || this.loadedCustomFonts.has(customFont.family)) {
      return;
    }

    const fontUrls = Object.values(customFont.files);
    if (fontUrls.length === 0) {
      return;
    }

    const fontUrl = fontUrls[0];
    const fontId = `custom-font-${customFont.id}`;

    if (document.querySelector(`style[data-font-id="${fontId}"]`)) {
      this.loadedCustomFonts.add(customFont.family);
      return;
    }

    const fontFaceCSS = `
      @font-face {
        font-family: '${Sanitizer.escapeHtml(customFont.family)}';
        src: url('${Sanitizer.escapeHtml(fontUrl ?? '')}') format('truetype');
        font-display: swap;
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.setAttribute('data-font-id', fontId);
    styleElement.textContent = fontFaceCSS;
    document.head.appendChild(styleElement);
    this.injectedHeadElements.push(styleElement);

    this.loadedCustomFonts.add(customFont.family);
    this.logger.debug(`Custom font loaded: ${customFont.family}`);
  }

  // --------------------------------------------------------------------------
  // Default field configurations
  // --------------------------------------------------------------------------

  /**
   * Returns default field configurations for backward compatibility.
   *
   * @returns Array containing a single email field configuration
   */
  private getDefaultFieldConfigurations(): FieldConfiguration[] {
    return [
      {
        fieldName: 'email',
        displayName: 'Email Address',
        hint: null,
        required: true,
        type: 'email',
        placeholder:
          this.config.fields.email?.placeholder || 'Enter your email',
      },
    ];
  }

  // --------------------------------------------------------------------------
  // Container resolution
  // --------------------------------------------------------------------------

  /**
   * Finds the container element for the widget in the host page.
   *
   * @throws {Error} When the container element is not found in the DOM
   */
  private findContainer(): void {
    if (this.config.containerId) {
      this.container = document.getElementById(this.config.containerId);
    } else {
      this.container = document.querySelector('.nevent-widget');
    }

    if (!this.container) {
      throw new Error('NewsletterWidget: Container element not found');
    }
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  /**
   * Renders the widget UI inside the Shadow DOM.
   *
   * Creates the form element, injects styles into the shadow root,
   * and renders either a dynamic (API-driven) or static form layout.
   */
  private render(): void {
    const root = this.getRenderRoot();
    if (!root) {
      return;
    }

    // Inject styles into shadow root (not document head)
    this.injectStyles();

    this.form = document.createElement('form');
    this.form.className = 'nevent-widget-form';
    // WCAG: form role and label
    this.form.setAttribute('role', 'form');
    this.form.setAttribute('aria-label', this.i18n.t('formAriaLabel'));
    this.form.setAttribute('novalidate', '');

    // Use dynamic form rendering if fieldConfigurations exist
    if (this.fieldConfigurations && this.fieldConfigurations.length > 0) {
      this.renderDynamicForm();
    } else {
      // Form HTML is constructed with Sanitizer.escapeHtml() for all user content
      // and Sanitizer.sanitizeHtml() for GDPR rich text; no double-sanitize needed
      this.form.innerHTML = this.buildFormHTML();
    }

    // Apply animations
    if (this.config.animations) {
      this.form.style.opacity = '0';
      this.form.style.transform = 'translateY(20px)';
      this.form.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    }

    root.appendChild(this.form);

    // Render "Powered by Nevent" branding footer below the form.
    // Visible by default; white-label clients can disable via showBranding: false.
    if (this.config.showBranding !== false) {
      const branding = this.createBrandingFooter();
      root.appendChild(branding);
    }

    if (this.config.animations) {
      requestAnimationFrame(() => {
        if (this.form) {
          this.form.style.opacity = '1';
          this.form.style.transform = 'translateY(0)';
        }
      });
    }

    this.logger.debug('Widget rendered');
  }

  // --------------------------------------------------------------------------
  // Form HTML builders
  // --------------------------------------------------------------------------

  /**
   * Builds the complete form HTML structure for static (non-dynamic) mode.
   *
   * @returns HTML string for the form content
   */
  private buildFormHTML(): string {
    const direction = this.config.styles?.global?.direction || 'column';

    if (direction === 'row') {
      return this.buildRowLayout();
    }

    return this.buildColumnLayout();
  }

  /**
   * Renders a dynamic form using FormRenderer and layoutElements.
   */
  private renderDynamicForm(): void {
    if (!this.form) return;

    // Title and subtitle remain outside the flex container
    const titleSubtitleContainer = document.createElement('div');
    // Title and subtitle content is already escaped via Sanitizer.escapeHtml()
    // in buildTitle() and buildSubtitle(), so we do not double-sanitize here
    titleSubtitleContainer.innerHTML = `${this.buildTitle()}${this.buildSubtitle()}`;
    this.form.appendChild(titleSubtitleContainer);

    // Ensure email field exists (required for form submission)
    const hasEmailField = this.fieldConfigurations.some(
      (f) =>
        f.type === 'email' ||
        f.fieldName === 'email' ||
        f.propertyDefinitionId?.toLowerCase().includes('email')
    );
    if (!hasEmailField) {
      this.fieldConfigurations.unshift({
        fieldName: 'email',
        displayName: 'Email Address',
        hint: null,
        required: true,
        type: 'email',
        placeholder:
          this.config.fields.email?.placeholder || 'Enter your email',
      });
    }

    // Create unified flex container for ALL elements
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'nevent-fields-container';
    this.form.appendChild(fieldsContainer);

    // Initialize FormRenderer for field rendering
    this.formRenderer = new FormRenderer(
      this.fieldConfigurations,
      this.config.styles
    );

    // Check if layoutElements exist
    if (this.layoutElements && this.layoutElements.length > 0) {
      this.renderLayoutBasedForm(fieldsContainer);
    } else {
      this.renderDefaultLayout(fieldsContainer);
    }

    // Status message with ARIA live region
    const statusMessage = document.createElement('div');
    statusMessage.className = 'nevent-status-message';
    statusMessage.setAttribute('role', 'status');
    statusMessage.setAttribute('aria-live', 'polite');
    statusMessage.setAttribute('aria-label', this.i18n.t('statusRegionLabel'));
    statusMessage.style.display = 'none';
    this.form.appendChild(statusMessage);
  }

  /**
   * Renders form using layoutElements for order and width.
   *
   * @param container - The container element for form fields
   */
  private renderLayoutBasedForm(container: HTMLElement): void {
    const sortedElements = [...this.layoutElements].sort(
      (a, b) => a.order - b.order
    );

    sortedElements.forEach((layoutElement) => {
      const { type, key, width } = layoutElement;

      if (type === 'field') {
        const fieldConfig = this.fieldConfigurations.find(
          (f) => f.fieldName === key
        );
        if (fieldConfig) {
          const configWithWidth = { ...fieldConfig, width };
          const fieldElement = this.formRenderer!.renderField(configWithWidth);
          container.appendChild(fieldElement);
        }
      } else if (type === 'legalTerms') {
        const gdprElement = this.buildGDPRElement(width);
        container.appendChild(gdprElement);
      } else if (type === 'submitButton') {
        const submitElement = this.buildSubmitButtonElement(width);
        container.appendChild(submitElement);
      }
    });
  }

  /**
   * Renders form with default layout (backward compatibility).
   *
   * @param container - The container element for form fields
   */
  private renderDefaultLayout(container: HTMLElement): void {
    // Render all fields at their configured widths
    this.fieldConfigurations.forEach((fieldConfig) => {
      const fieldElement = this.formRenderer!.renderField(fieldConfig);
      container.appendChild(fieldElement);
    });

    // GDPR at 100%
    const gdprElement = this.buildGDPRElement(100);
    container.appendChild(gdprElement);

    // Submit button at 100%
    const submitElement = this.buildSubmitButtonElement(100);
    container.appendChild(submitElement);
  }

  /**
   * Builds column layout HTML.
   *
   * @returns HTML string for column layout
   */
  private buildColumnLayout(): string {
    return `
      ${this.buildTitle()}
      ${this.buildSubtitle()}
      ${this.buildEmailField()}
      ${this.buildOptionalFields()}
      ${this.buildGDPRCheckbox()}
      ${this.buildSubmitButton()}
      <div class="nevent-status-message" role="status" aria-live="polite" aria-label="${Sanitizer.escapeHtml(this.i18n.t('statusRegionLabel'))}" style="display: none;"></div>
    `;
  }

  /**
   * Builds row layout HTML.
   *
   * @returns HTML string for row layout
   */
  private buildRowLayout(): string {
    return `
      <div class="nevent-text-section">
        ${this.buildTitle()}
        ${this.buildSubtitle()}
      </div>
      <div class="nevent-fields-section">
        <div class="nevent-fields-grid">
          ${this.buildEmailField()}
          ${this.buildOptionalFields()}
        </div>
        ${this.buildGDPRCheckbox()}
        ${this.buildSubmitButton()}
        <div class="nevent-status-message" role="status" aria-live="polite" aria-label="${Sanitizer.escapeHtml(this.i18n.t('statusRegionLabel'))}" style="display: none;"></div>
      </div>
    `;
  }

  /**
   * Builds title HTML.
   *
   * @returns HTML string for the title, or empty string if hidden
   */
  private buildTitle(): string {
    if (this.config.styles?.title?.hidden) {
      return '';
    }

    const title = this.config.title || this.i18n.t('formTitle');
    return `<h2 class="nevent-title">${Sanitizer.escapeHtml(title)}</h2>`;
  }

  /**
   * Builds subtitle HTML.
   *
   * @returns HTML string for the subtitle, or empty string if hidden
   */
  private buildSubtitle(): string {
    if (this.config.styles?.subtitle?.hidden || !this.config.subtitle) {
      return '';
    }

    return `<p class="nevent-subtitle">${Sanitizer.escapeHtml(this.config.subtitle)}</p>`;
  }

  /**
   * Builds email field HTML with proper label association and ARIA.
   *
   * @returns HTML string for the email input field
   */
  private buildEmailField(): string {
    const field = this.config.fields.email;
    if (!field || !field.enabled) {
      return '';
    }

    const fieldId = 'nevent-email-field';
    const errorId = 'nevent-email-error';

    return `
      <div class="nevent-field">
        <label for="${fieldId}" class="nevent-field-label nevent-sr-only">Email</label>
        <input
          type="email"
          id="${fieldId}"
          name="email"
          class="nevent-input"
          placeholder="${Sanitizer.escapeHtml(field.placeholder || '')}"
          aria-describedby="${errorId}"
          autocomplete="email"
          ${field.required ? 'required aria-required="true"' : ''}
        />
        <span id="${errorId}" class="nevent-field-error nevent-field-error--hidden" role="alert"></span>
      </div>
    `;
  }

  /**
   * Builds optional fields HTML with proper label associations.
   *
   * @returns HTML string for all enabled optional fields
   */
  private buildOptionalFields(): string {
    let html = '';
    const fields = this.config.fields;

    if (fields.firstName?.enabled) {
      const fieldId = 'nevent-firstname-field';
      const errorId = 'nevent-firstname-error';
      html += `
        <div class="nevent-field">
          <label for="${fieldId}" class="nevent-field-label nevent-sr-only">${Sanitizer.escapeHtml(fields.firstName.placeholder || 'First name')}</label>
          <input
            type="text"
            id="${fieldId}"
            name="firstName"
            class="nevent-input"
            placeholder="${Sanitizer.escapeHtml(fields.firstName.placeholder || '')}"
            aria-describedby="${errorId}"
            autocomplete="given-name"
            ${fields.firstName.required ? 'required aria-required="true"' : ''}
          />
          <span id="${errorId}" class="nevent-field-error nevent-field-error--hidden" role="alert"></span>
        </div>
      `;
    }

    if (fields.lastName?.enabled) {
      const fieldId = 'nevent-lastname-field';
      const errorId = 'nevent-lastname-error';
      html += `
        <div class="nevent-field">
          <label for="${fieldId}" class="nevent-field-label nevent-sr-only">${Sanitizer.escapeHtml(fields.lastName.placeholder || 'Last name')}</label>
          <input
            type="text"
            id="${fieldId}"
            name="lastName"
            class="nevent-input"
            placeholder="${Sanitizer.escapeHtml(fields.lastName.placeholder || '')}"
            aria-describedby="${errorId}"
            autocomplete="family-name"
            ${fields.lastName.required ? 'required aria-required="true"' : ''}
          />
          <span id="${errorId}" class="nevent-field-error nevent-field-error--hidden" role="alert"></span>
        </div>
      `;
    }

    if (fields.postalCode?.enabled) {
      const fieldId = 'nevent-postalcode-field';
      const errorId = 'nevent-postalcode-error';
      html += `
        <div class="nevent-field">
          <label for="${fieldId}" class="nevent-field-label nevent-sr-only">${Sanitizer.escapeHtml(fields.postalCode.placeholder || 'Postal code')}</label>
          <input
            type="text"
            id="${fieldId}"
            name="postalCode"
            class="nevent-input"
            placeholder="${Sanitizer.escapeHtml(fields.postalCode.placeholder || '')}"
            aria-describedby="${errorId}"
            autocomplete="postal-code"
            ${fields.postalCode.required ? 'required aria-required="true"' : ''}
          />
          <span id="${errorId}" class="nevent-field-error nevent-field-error--hidden" role="alert"></span>
        </div>
      `;
    }

    if (fields.birthDate?.enabled) {
      const fieldId = 'nevent-birthdate-field';
      const errorId = 'nevent-birthdate-error';
      html += `
        <div class="nevent-field">
          <label for="${fieldId}" class="nevent-field-label nevent-sr-only">${Sanitizer.escapeHtml(fields.birthDate.placeholder || 'Birth date')}</label>
          <input
            type="date"
            id="${fieldId}"
            name="birthDate"
            class="nevent-input"
            placeholder="${Sanitizer.escapeHtml(fields.birthDate.placeholder || '')}"
            aria-describedby="${errorId}"
            autocomplete="bday"
            ${fields.birthDate.required ? 'required aria-required="true"' : ''}
          />
          <span id="${errorId}" class="nevent-field-error nevent-field-error--hidden" role="alert"></span>
        </div>
      `;
    }

    return html;
  }

  /**
   * Builds GDPR checkbox HTML with proper ARIA and sanitized content.
   *
   * GDPR text is sanitized via `Sanitizer.sanitizeHtml()` because it may
   * contain anchor tags from the server configuration (XSS risk).
   *
   * @returns HTML string for the GDPR consent checkbox
   */
  private buildGDPRCheckbox(): string {
    const gdprHtml = this.buildGDPRHtml();

    return `
      <div class="nevent-gdpr">
        <label class="nevent-gdpr-label">
          <input
            type="checkbox"
            name="gdprConsent"
            class="nevent-gdpr-checkbox"
            required
            aria-required="true"
          />
          <span class="nevent-gdpr-text">${gdprHtml}</span>
        </label>
      </div>
    `;
  }

  /**
   * Builds submit button HTML.
   *
   * @returns HTML string for the submit button
   */
  private buildSubmitButton(): string {
    const buttonText =
      this.config.messages.submit || this.i18n.t('submitButton');
    return `
      <button type="submit" class="nevent-submit-button">
        ${Sanitizer.escapeHtml(buttonText)}
      </button>
    `;
  }

  /**
   * Builds GDPR checkbox as a DOM element with configurable width.
   *
   * @param width - Width percentage (25, 50, 75, or 100)
   * @returns HTMLElement containing the GDPR checkbox
   */
  private buildGDPRElement(width: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-gdpr';

    // Apply width styling
    if (width < 100) {
      container.style.width = `calc(${width}% - 12px)`;
    } else {
      container.style.width = '100%';
    }
    container.style.boxSizing = 'border-box';
    container.style.minWidth = '0';

    const gdprHtml = this.buildGDPRHtml();

    container.innerHTML = `
      <label class="nevent-gdpr-label">
        <input
          type="checkbox"
          name="gdprConsent"
          class="nevent-gdpr-checkbox"
          required
          aria-required="true"
        />
        <span class="nevent-gdpr-text">${gdprHtml}</span>
      </label>
    `;

    return container;
  }

  /**
   * Builds sanitized GDPR HTML text with interpolated company name
   * and privacy policy link.
   *
   * Uses `Sanitizer.sanitizeHtml()` for the final output because the
   * GDPR text may contain anchor elements from the server config.
   *
   * @returns Sanitized HTML string for GDPR consent text
   */
  private buildGDPRHtml(): string {
    // Use config message or i18n fallback
    let gdprText = this.config.messages.gdprText || this.i18n.t('gdprText');

    // Build privacy policy link
    const privacyLabel =
      this.config.messages.privacyText || this.i18n.t('privacyPolicyLabel');

    if (this.config.companyName) {
      gdprText = gdprText
        .replace(
          '{{companyName}}',
          Sanitizer.escapeHtml(this.config.companyName)
        )
        .replace(
          '[COMPANY_NAME]',
          Sanitizer.escapeHtml(this.config.companyName)
        );
    }

    if (this.config.privacyPolicyUrl) {
      const escapedUrl = Sanitizer.escapeHtml(this.config.privacyPolicyUrl);
      const privacyLink = `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${Sanitizer.escapeHtml(privacyLabel)}</a>`;
      gdprText = gdprText
        .replace('{{privacyPolicyLink}}', privacyLink)
        .replace('[PRIVACY_POLICY_LINK]', privacyLink);
    }

    // Sanitize the final HTML (allows <a> tags but strips everything dangerous)
    return Sanitizer.sanitizeHtml(gdprText);
  }

  /**
   * Builds submit button as a DOM element with configurable width.
   *
   * @param width - Width percentage (25, 50, 75, or 100)
   * @returns HTMLElement containing the submit button
   */
  private buildSubmitButtonElement(width: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-submit-button-container';

    // Apply width styling
    if (width < 100) {
      container.style.width = `calc(${width}% - 12px)`;
    } else {
      container.style.width = '100%';
    }
    container.style.boxSizing = 'border-box';
    container.style.minWidth = '0';

    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'nevent-submit-button';
    const buttonText =
      this.config.messages.submit || this.i18n.t('submitButton');
    button.textContent = buttonText;

    container.appendChild(button);
    return container;
  }

  // --------------------------------------------------------------------------
  // Branding Footer
  // --------------------------------------------------------------------------

  /**
   * Creates the "Powered by Nevent" branding footer element.
   *
   * Links to nevent.es with UTM parameters for PLG attribution:
   * - `utm_source=newsletter_widget`
   * - `utm_medium=powered_by`
   * - `utm_campaign=plg`
   * - `utm_content={tenantId}`
   *
   * @returns The branding footer DOM element
   */
  private createBrandingFooter(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'nevent-newsletter-branding';

    const utmParams = new URLSearchParams({
      utm_source: 'newsletter_widget',
      utm_medium: 'powered_by',
      utm_campaign: 'plg',
      utm_content: this.config.tenantId,
    });

    const link = document.createElement('a');
    link.href = `https://nevent.ai?${utmParams.toString()}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'nevent-newsletter-branding-link';

    // Lightning bolt emoji + "Powered by " text
    const textNode = document.createTextNode('\u26A1 Powered by ');
    link.appendChild(textNode);

    // "Nevent" in bold
    const strong = document.createElement('strong');
    strong.textContent = 'Nevent';
    link.appendChild(strong);

    // Track branding clicks via analytics
    link.addEventListener('click', () => {
      if (this.widgetTracker) {
        this.trackEvent('branding_click');
      }
    });

    container.appendChild(link);
    return container;
  }

  // --------------------------------------------------------------------------
  // Style injection (Shadow DOM)
  // --------------------------------------------------------------------------

  /**
   * Injects widget styles into the shadow root.
   *
   * All CSS is injected inside the shadow root to prevent style leakage.
   * Custom CSS from configuration is also injected after the base styles.
   */
  private injectStyles(): void {
    const root = this.getRenderRoot();

    const styleElement = document.createElement('style');
    styleElement.textContent = this.generateCSS();
    root.appendChild(styleElement);

    // Custom CSS
    if (this.config.customCSS) {
      const customStyleElement = document.createElement('style');
      customStyleElement.textContent = this.config.customCSS;
      root.appendChild(customStyleElement);
    }
  }

  /**
   * Generates CSS for the widget with WCAG-compliant focus styles
   * and prefers-reduced-motion support.
   *
   * @returns Complete CSS string for the widget
   */
  private generateCSS(): string {
    const styles = this.config.styles;
    const global = styles?.global || {};

    const backgroundColor =
      global.backgroundColor || this.config.backgroundColor;
    const primaryColor = this.config.primaryColor;
    const borderRadius = this.extractNumericValue(this.config.borderRadius);

    // Build font-family cascades with fallbacks
    const globalFontFamily =
      styles?.global?.font?.family && styles.global.font.type !== 'CUSTOM_FONT'
        ? `'${styles.global.font.family}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
        : styles?.global?.font?.family
          ? `'${styles.global.font.family}', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const titleFontFamily = styles?.title?.font?.family
      ? `'${styles.title.font.family}', ${globalFontFamily}`
      : globalFontFamily;

    const subtitleFontFamily = styles?.subtitle?.font?.family
      ? `'${styles.subtitle.font.family}', ${globalFontFamily}`
      : globalFontFamily;

    const inputFontFamily = styles?.input?.font?.family
      ? `'${styles.input.font.family}', ${globalFontFamily}`
      : styles?.input?.fontFamily
        ? `'${styles.input.fontFamily}', ${globalFontFamily}`
        : globalFontFamily;

    const buttonFontFamily = styles?.button?.font?.family
      ? `'${styles.button.font.family}', ${globalFontFamily}`
      : styles?.button?.fontFamily
        ? `'${styles.button.fontFamily}', ${globalFontFamily}`
        : globalFontFamily;

    const labelFontFamily = styles?.input?.labelFont?.family
      ? `'${styles.input.labelFont.family}', ${globalFontFamily}`
      : globalFontFamily;

    const placeholderFontFamily = styles?.input?.placeholderFont?.family
      ? `'${styles.input.placeholderFont.family}', ${globalFontFamily}`
      : globalFontFamily;

    return `
      /* WCAG: Screen reader only utility */
      .nevent-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* Offline banner */
      .nevent-offline-banner {
        background: #fff3cd;
        color: #856404;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        text-align: center;
        margin-bottom: 8px;
        font-family: ${globalFontFamily};
      }

      .nevent-widget-form {
        display: flex;
        flex-direction: ${global.direction || 'column'};
        gap: ${global.spacingBetweenElements || '12px'};
        padding: ${global.innerPadding || '20px'};
        background: ${backgroundColor};
        border: none;
        border-radius: ${borderRadius}px;
        font-family: ${globalFontFamily};
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        overflow: visible;
      }

      .nevent-title {
        margin: 0 0 8px 0;
        font-size: ${styles?.title?.fontSize || '24px'};
        font-weight: ${styles?.title?.fontWeight || '600'};
        color: ${styles?.title?.color || '#333'};
        font-family: ${titleFontFamily};
      }

      .nevent-subtitle {
        margin: 0 0 16px 0;
        font-size: ${styles?.subtitle?.fontSize || '14px'};
        color: ${styles?.subtitle?.color || '#666'};
        font-family: ${subtitleFontFamily};
      }

      .nevent-fields-container {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .nevent-fields-container .nevent-field {
        box-sizing: border-box;
        min-width: 0;
      }

      .nevent-fields-container .nevent-gdpr,
      .nevent-fields-container .nevent-submit-button-container {
        box-sizing: border-box;
        min-width: 0;
      }

      .nevent-field {
        display: flex;
        flex-direction: column;
      }

      .nevent-field-label {
        font-size: ${styles?.input?.labelFontSize || '14px'};
        color: ${styles?.input?.labelColor || '#333'};
        font-family: ${labelFontFamily};
        margin-bottom: 4px;
        font-weight: 500;
      }

      .nevent-input {
        padding: ${styles?.input?.padding || '12px'};
        border: ${this.generateBorderCSS(styles?.input?.borderWidth, styles?.input?.borderColor, primaryColor)};
        border-radius: ${styles?.input?.borderRadius || '4px'};
        background: ${styles?.input?.backgroundColor || '#fff'};
        color: ${styles?.input?.textColor || 'inherit'};
        font-family: ${inputFontFamily};
        font-size: 14px;
        ${styles?.input?.height ? `height: ${styles.input.height};` : ''}
        transition: border-color 0.2s, outline-color 0.2s;
      }

      .nevent-input::placeholder {
        font-family: ${placeholderFontFamily};
        color: #999;
      }

      /* WCAG: Visible focus indicator */
      .nevent-input:focus {
        border-color: ${primaryColor};
        outline: 2px solid ${primaryColor};
        outline-offset: 1px;
      }

      /* WCAG: Error state on inputs */
      .nevent-input[aria-invalid="true"],
      .nevent-input--invalid {
        border-color: #dc3545;
      }

      .nevent-input[aria-invalid="true"]:focus,
      .nevent-input--invalid:focus {
        outline-color: #dc3545;
      }

      .nevent-gdpr {
        margin: 8px 0;
      }

      .nevent-gdpr-label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12px;
        color: #666;
        cursor: pointer;
      }

      .nevent-gdpr-checkbox {
        margin-top: 2px;
        cursor: pointer;
      }

      /* WCAG: Focus indicator for checkbox */
      .nevent-gdpr-checkbox:focus {
        outline: 2px solid ${primaryColor};
        outline-offset: 2px;
      }

      .nevent-submit-button {
        width: 100%;
        padding: ${styles?.button?.padding || '12px 24px'};
        background: ${styles?.button?.backgroundColor || primaryColor};
        color: ${styles?.button?.textColor || '#fff'};
        border: ${this.generateBorderCSS(styles?.button?.borderWidth, styles?.button?.borderColor, primaryColor)};
        border-radius: ${styles?.button?.borderRadius || '4px'};
        font-family: ${buttonFontFamily};
        font-size: 16px;
        font-weight: 600;
        ${styles?.button?.height ? `height: ${styles.button.height};` : ''}
        cursor: pointer;
        transition: filter 0.2s, background-color 0.2s;
      }

      /* WCAG: Focus indicator for submit button */
      .nevent-submit-button:focus {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }

      .nevent-submit-button:hover {
        ${styles?.button?.hoverBackgroundColor ? `background: ${styles.button.hoverBackgroundColor};` : 'filter: brightness(0.9);'}
      }

      .nevent-submit-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Submit button loading spinner */
      @keyframes nevent-spin {
        to { transform: rotate(360deg); }
      }

      .nevent-newsletter-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: nevent-spin 0.7s linear infinite;
        vertical-align: middle;
      }

      .nevent-field-hint {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #888;
      }

      .nevent-field-error {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #dc3545;
        min-height: 0;
      }

      .nevent-field-error--hidden {
        display: none;
      }

      .nevent-status-message {
        padding: 12px;
        border-radius: 4px;
        font-size: 14px;
        text-align: center;
      }

      .nevent-status-message.success {
        background: #d4edda;
        color: #155724;
      }

      .nevent-status-message.error {
        background: #f8d7da;
        color: #721c24;
      }

      /* Success state: full-container overlay that replaces the form */
      @keyframes nevent-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      .nevent-newsletter-success-message {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px 20px;
        font-size: 18px;
        font-weight: 500;
        color: #155724;
        font-family: ${globalFontFamily};
        animation: nevent-fade-in 0.4s ease forwards;
      }

      /* WCAG: Prefers-reduced-motion */
      @media (prefers-reduced-motion: reduce) {
        .nevent-widget-form,
        .nevent-input,
        .nevent-submit-button,
        .nevent-newsletter-spinner,
        .nevent-newsletter-success-message {
          transition: none !important;
          animation: none !important;
        }
      }

      @media (max-width: 768px) {
        .nevent-widget-form {
          flex-direction: column;
        }

        .nevent-text-section,
        .nevent-fields-section {
          width: 100% !important;
        }

        .nevent-fields-container .nevent-field {
          width: 100% !important;
        }
      }

      /* Powered by Nevent branding footer */
      .nevent-newsletter-branding {
        text-align: center;
        padding: 8px 0 4px;
        font-size: 11px;
        color: #999;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }
      .nevent-newsletter-branding:hover {
        opacity: 1;
      }
      .nevent-newsletter-branding-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: inherit;
        text-decoration: none;
        cursor: pointer;
      }
      .nevent-newsletter-branding-link:hover {
        text-decoration: underline;
      }
      .nevent-newsletter-branding-link strong {
        font-weight: 600;
        color: var(--nev-primary-color, ${primaryColor});
      }
    `;
  }

  // --------------------------------------------------------------------------
  // Event handling
  // --------------------------------------------------------------------------

  /**
   * Attaches event handlers for form submission and analytics tracking.
   *
   * All handlers are wrapped in the error boundary to prevent widget
   * errors from crashing the host page.
   */
  private attachEvents(): void {
    if (!this.form) {
      return;
    }

    this.boundSubmitHandler = (event: Event) => {
      this.errorBoundary.guard(() => {
        this.handleSubmit(event);
      }, 'submitHandler');
    };
    this.form.addEventListener('submit', this.boundSubmitHandler);

    if (this.widgetTracker && this.container) {
      this.widgetTracker.setupImpressionTracking(this.container);
      if (this.form) {
        this.widgetTracker.setupFormInteractionTracking(this.form);
      }
      this.widgetTracker.setupAbandonmentTracking();
    }
  }

  /**
   * Handles form submission with validation, offline check, and API call.
   *
   * @param event - The form submit event
   */
  private handleSubmit(event: Event): void {
    event.preventDefault();

    // Async work is delegated to guardAsync
    this.errorBoundary.guardAsync(async () => {
      if (this.isSubmitting || !this.form || !this.httpClient) {
        return;
      }

      // Check offline state
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.showError(this.i18n.t('offlineMessage'));
        return;
      }

      // Validate dynamic form if using FormRenderer
      if (this.formRenderer) {
        const isValid = this.formRenderer.validateFields();
        if (!isValid) return;
      }

      // Validate form
      const formData = new FormData(this.form);
      const email = formData.get('email') as string;
      const gdprConsent = formData.get('gdprConsent') as string;

      const emailValidation = EmailValidator.validate(email);
      if (!emailValidation.valid) {
        const message =
          this.config.messages.invalidEmail || this.i18n.t('invalidEmail');
        this.showError(message);
        return;
      }

      if (!gdprConsent) {
        this.showError(this.i18n.t('gdprRequired'));
        return;
      }

      this.isSubmitting = true;
      this.showLoading();

      try {
        let subscriptionData: SubscriptionData;

        if (this.formRenderer) {
          // Get data from dynamic form
          const dynamicFormData = this.formRenderer.getFormData();
          const emailValue = dynamicFormData.email?.trim() || email.trim();

          // Build properties: { propertyDefinitionId: value } (exclude email)
          const properties: Record<string, string> = {};
          this.fieldConfigurations.forEach((config) => {
            if (
              config.propertyDefinitionId &&
              config.type !== 'email' &&
              config.fieldName !== 'email'
            ) {
              const value = dynamicFormData[config.fieldName];
              if (value) {
                properties[config.propertyDefinitionId] = value;
              }
            }
          });

          subscriptionData = {
            email: emailValue,
            ...(Object.keys(properties).length > 0 ? { properties } : {}),
            consent: {
              marketing: true,
              timestamp: new Date().toISOString(),
            },
          };
        } else {
          // Legacy form data collection
          subscriptionData = {
            email: email.trim(),
            consent: {
              marketing: true,
              timestamp: new Date().toISOString(),
            },
          };
        }

        if (this.config.onSubmit) {
          const safeOnSubmit = this.errorBoundary.wrapCallback(
            this.config.onSubmit as (...args: unknown[]) => unknown,
            'onSubmit'
          );
          safeOnSubmit(subscriptionData);
        }

        this.trackEvent('form_submit');

        const response = await this.httpClient.post<SubscriptionResponse>(
          `/public/newsletter/${this.config.newsletterId}/subscribe?tenantId=${this.config.tenantId}`,
          subscriptionData
        );

        const successMsg =
          response.data.message ||
          this.config.messages.success ||
          this.i18n.t('successMessage');
        this.showSuccess(successMsg);

        if (this.config.onSuccess) {
          const safeOnSuccess = this.errorBoundary.wrapCallback(
            this.config.onSuccess as (...args: unknown[]) => unknown,
            'onSuccess'
          );
          safeOnSuccess(response.data);
        }

        if (this.config.resetOnSuccess) {
          const timer = setTimeout(() => {
            this.form?.reset();
            if (this.formRenderer) {
              this.formRenderer.reset();
            }
          }, 3000);
          this.timers.push(timer);
        }

        this.trackEvent('subscription_success');
      } catch (error) {
        this.logger.error('Submission error:', error);

        const errorMessage =
          error instanceof Error
            ? error.message
            : this.config.messages.error || this.i18n.t('errorMessage');

        this.showError(errorMessage);

        if (this.config.onError && error instanceof Error) {
          const safeOnError = this.errorBoundary.wrapCallback(
            this.config.onError as (...args: unknown[]) => unknown,
            'onError'
          );
          safeOnError(error);
        }

        this.trackEvent('subscription_error', {
          error_message: errorMessage,
        });
      } finally {
        this.isSubmitting = false;
      }
    }, 'handleSubmit');
  }

  // --------------------------------------------------------------------------
  // Status messages
  // --------------------------------------------------------------------------

  /**
   * Shows loading state on the form.
   *
   * Replaces the submit button text with an inline CSS spinner animation
   * and disables the button to prevent double-submission. The original
   * button text is stored in {@link submitButtonOriginalText} so it can
   * be restored once the request completes (success or error).
   */
  private showLoading(): void {
    const root = this.getRenderRoot();
    const statusElement = root.querySelector('.nevent-status-message');
    const submitButton = root.querySelector(
      '.nevent-submit-button'
    ) as HTMLButtonElement;

    if (statusElement) {
      (statusElement as HTMLElement).style.display = 'none';
      statusElement.className = 'nevent-status-message';
    }

    if (submitButton) {
      // Persist the current label so it can be restored after submission
      this.submitButtonOriginalText = submitButton.textContent ?? '';

      // Replace text content with an accessible spinner element.
      // The spinner <span> is purely visual; the aria-label on the button
      // keeps the loading intent announced to screen readers.
      submitButton.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'nevent-newsletter-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      submitButton.appendChild(spinner);
      submitButton.setAttribute(
        'aria-label',
        this.config.messages.loading || this.i18n.t('loadingButton')
      );
      submitButton.disabled = true;
    }
  }

  /**
   * Restores the submit button to its pre-submission state.
   *
   * Removes the spinner element, restores the original button text, clears
   * the stored aria-label override, and re-enables the button so the user
   * can attempt another submission.
   */
  private restoreSubmitButton(): void {
    const root = this.getRenderRoot();
    const submitButton = root.querySelector(
      '.nevent-submit-button'
    ) as HTMLButtonElement | null;

    if (!submitButton) {
      return;
    }

    // Remove spinner if present
    const spinner = submitButton.querySelector('.nevent-newsletter-spinner');
    if (spinner) {
      submitButton.removeChild(spinner);
    }

    // Restore original text and remove the loading aria-label override
    submitButton.textContent = this.submitButtonOriginalText ?? '';
    submitButton.removeAttribute('aria-label');
    submitButton.disabled = false;
    this.submitButtonOriginalText = null;
  }

  /**
   * Shows a success message by replacing the entire form with a centered
   * success panel that fills the container at its current height.
   *
   * Implementation notes:
   * - The container height is captured and locked via `minHeight` BEFORE
   *   the form is hidden, preventing any layout shift on the host page.
   * - The form element is hidden (not removed) so the DOM stays intact for
   *   potential `resetOnSuccess` resets.
   * - A dedicated success element is created and positioned absolutely so
   *   it overlays the form area without affecting document flow.
   * - A `nevent-fade-in` animation fades the message in smoothly.
   * - Respects `prefers-reduced-motion` via CSS (animation is suppressed).
   *
   * @param message - The success message to display (HTML-escaped before rendering)
   */
  private showSuccess(message: string): void {
    const root = this.getRenderRoot();

    // --- 1. Lock the container height before touching the form ---
    // Capture the form's rendered height and pin it on the host element so
    // the surrounding page layout does not jump when we hide the form.
    if (this.hostElement && this.form) {
      const currentHeight = this.form.getBoundingClientRect().height;
      if (currentHeight > 0) {
        this.hostElement.style.minHeight = `${currentHeight}px`;
      }
    }

    // --- 2. Hide the form (all inputs, GDPR, button) ---
    if (this.form) {
      this.form.style.display = 'none';
    }

    // --- 3. Create and show the success message element ---
    // Remove any pre-existing success element from a previous call (edge case).
    const existing = root.querySelector(
      '.nevent-newsletter-success-message'
    ) as HTMLElement | null;
    if (existing) {
      existing.parentNode?.removeChild(existing);
    }

    const successEl = document.createElement('div');
    successEl.className = 'nevent-newsletter-success-message';
    successEl.setAttribute('role', 'status');
    successEl.setAttribute('aria-live', 'polite');
    successEl.textContent = message;
    root.appendChild(successEl);

    // Submit button state is no longer relevant (form is hidden), but we still
    // reset the internal flag so destroy() and potential future resets are clean.
    this.restoreSubmitButton();
  }

  /**
   * Shows an error message on the form.
   *
   * @param message - The error message to display (escaped before rendering)
   */
  private showError(message: string): void {
    const root = this.getRenderRoot();
    const statusElement = root.querySelector('.nevent-status-message');

    if (statusElement) {
      statusElement.textContent = Sanitizer.escapeHtml(message);
      (statusElement as HTMLElement).style.display = 'block';
      statusElement.className = 'nevent-status-message error';

      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        (statusElement as HTMLElement).style.display = 'none';
      }, 5000);
      this.timers.push(timer);
    }

    this.restoreSubmitButton();
  }

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  /**
   * Tracks an analytics event via the widget tracker.
   *
   * @param eventName - Name of the event to track
   * @param extra - Optional additional event parameters
   */
  private trackEvent(eventName: string, extra?: Record<string, unknown>): void {
    if (!this.config.analytics || !this.widgetTracker) {
      return;
    }

    switch (eventName) {
      case 'widget_loaded':
        this.widgetTracker.trackWidgetLoaded();
        break;
      case 'form_submit':
        this.widgetTracker.trackFormSubmit();
        break;
      case 'subscription_success':
        this.widgetTracker.trackSubscriptionSuccess();
        break;
      case 'subscription_error':
        this.widgetTracker.trackSubscriptionError(
          extra?.error_message as string
        );
        break;
      case 'branding_click':
        this.widgetTracker.trackBrandingClick();
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------------------
  // CSS helpers
  // --------------------------------------------------------------------------

  /**
   * Extracts numeric value from a string or number.
   *
   * @param value - CSS value that may be a string like '8px' or a number
   * @returns Numeric value, or 0 if parsing fails
   */
  private extractNumericValue(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Generates valid CSS border shorthand property.
   *
   * Handles scenarios:
   * 1. Both borderWidth and borderColor set: use provided values
   * 2. Only borderColor set: default borderWidth to '1px'
   * 3. borderWidth is 'none' or '0': return 'none'
   * 4. Neither set: return 'none'
   *
   * @param borderWidth - CSS border width
   * @param borderColor - CSS border color
   * @param fallbackColor - Fallback color
   * @returns Valid CSS border property value
   */
  private generateBorderCSS(
    borderWidth: string | undefined,
    borderColor: string | undefined,
    fallbackColor: string
  ): string {
    if (borderWidth === 'none' || borderWidth === '0') {
      return 'none';
    }

    if (!borderWidth && !borderColor) {
      return 'none';
    }

    const width = borderWidth || '1px';

    if (!borderColor) {
      return `${width} solid ${fallbackColor}`;
    }

    return `${width} solid ${borderColor}`;
  }
}
