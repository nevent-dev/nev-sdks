/**
 * ChatbotWidget - Main entry point and lifecycle orchestrator
 *
 * The ChatbotWidget is the public-facing class that consumers instantiate to
 * embed a Nevent chatbot on their website. It orchestrates the initialization,
 * rendering, event handling, and teardown of all sub-systems:
 *
 * - {@link ConfigManager} for configuration validation and merging
 * - {@link ConversationService} for API communication
 * - {@link StateManager} for reactive state with optional persistence
 * - {@link I18nManager} for localized UI strings
 * - {@link CSSGenerator} for dynamic theming and style injection
 * - {@link MessageSanitizer} for XSS prevention in bot messages
 * - {@link ChatbotTracker} for analytics event tracking
 * - UI renderers: Bubble, Window, Messages, Input, Typing
 *
 * Supports two rendering modes:
 * - **Floating mode** (default): Renders a circular bubble (FAB) fixed to the
 *   viewport corner. Clicking the bubble opens/closes a chat window above it.
 * - **Inline mode**: Renders the chat window directly inside a provided container
 *   element. No bubble is rendered; the window is always visible.
 *
 * @example
 * ```typescript
 * // Minimal floating chatbot
 * const widget = new ChatbotWidget({
 *   chatbotId: 'bot-123',
 *   tenantId: 'tenant-456',
 * });
 * await widget.init();
 * ```
 *
 * @example
 * ```typescript
 * // Inline chatbot inside a container
 * const widget = new ChatbotWidget({
 *   chatbotId: 'bot-123',
 *   tenantId: 'tenant-456',
 *   containerId: 'chat-container',
 *   theme: 'dark',
 *   locale: 'en',
 *   onMessage: (msg) => console.log('New message:', msg),
 * });
 * await widget.init();
 * ```
 *
 * @packageDocumentation
 */

import { Logger, SentryReporter } from '@nevent/core';
import type { SentryReporterConfig, SentryEvent } from '@nevent/core';
import type {
  ChatbotConfig,
  ChatMessage,
  ChatbotError,
  ConversationState,
  ServerChatbotConfig,
  QuickReply,
  Conversation,
  PersistedConversationState,
  FeedbackType,
  FileAttachment,
} from './types';
import { ConfigManager } from './chatbot/config-manager';
import { ConversationService } from './chatbot/conversation-service';
import { StreamingClient } from './chatbot/streaming-client';
import { AuthManager } from './chatbot/auth-manager';
import { StateManager } from './chatbot/state-manager';
import { I18nManager } from './chatbot/i18n-manager';
import { CSSGenerator } from './chatbot/css-generator';
import { FontLoader } from './chatbot/font-loader';
import { MessageSanitizer } from './chatbot/message-sanitizer';
import { ChatbotTracker } from './chatbot/analytics/chatbot-tracker';
import { ConnectionManager } from './chatbot/connection-manager';
import type { ConnectionStatus } from './chatbot/connection-manager';
import { ErrorBoundary } from './chatbot/error-boundary';
import { FileUploadService } from './chatbot/file-upload-service';
import { TypingStatusService } from './chatbot/typing-status-service';
import { BubbleRenderer } from './chatbot/ui/bubble-renderer';
import { WindowRenderer } from './chatbot/ui/window-renderer';
import { MessageRenderer } from './chatbot/ui/message-renderer';
import { InputRenderer } from './chatbot/ui/input-renderer';
import { TypingRenderer } from './chatbot/ui/typing-renderer';

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generates a unique message ID using `crypto.randomUUID()` when available,
 * falling back to a simple random string for older environments.
 *
 * @returns A unique string identifier
 */
function generateMessageId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback: 16 random hex characters
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

// ============================================================================
// ChatbotWidget Class
// ============================================================================

/**
 * Main chatbot widget class that orchestrates all sub-systems.
 *
 * Lifecycle:
 * 1. `constructor(config)` - Validates config, initializes ConfigManager and I18nManager
 * 2. `init()` - Fetches server config, renders UI, restores state
 * 3. User interactions trigger `open()`, `close()`, `sendMessage()`, etc.
 * 4. `destroy()` - Tears down all UI, listeners, and state
 *
 * @example
 * ```typescript
 * const widget = new ChatbotWidget({ chatbotId: 'bot-1', tenantId: 'tenant-1' });
 * await widget.init();
 *
 * widget.open();
 * await widget.sendMessage('Hello!');
 * widget.close();
 * widget.destroy();
 * ```
 */
export class ChatbotWidget {
  // --------------------------------------------------------------------------
  // Sub-systems
  // --------------------------------------------------------------------------

  /** Configuration validation and merging */
  private configManager: ConfigManager;

  /** API client for chatbot conversations (initialized after server config fetch) */
  private conversationService: ConversationService | null = null;

  /**
   * SSE streaming client for real-time bot response rendering.
   * Initialized after server config fetch when `features.streaming` is true.
   * Null when streaming is disabled or not yet initialized.
   */
  private streamingClient: StreamingClient | null = null;

  /**
   * Authentication manager for identified user sessions.
   * Created when `config.auth` is provided; null in public (anonymous) mode.
   * Provides auth headers and token refresh logic to ConversationService
   * and StreamingClient.
   */
  private authManager: AuthManager | null = null;

  /** Reactive conversation state with optional persistence */
  private stateManager: StateManager;

  /** Internationalization manager for UI strings */
  private i18n: I18nManager;

  /** Dynamic CSS generation and injection */
  private cssGenerator: CSSGenerator;

  /**
   * Font loader responsible for injecting Google Fonts `<link>` tags and
   * custom `@font-face` `<style>` tags.  Created once in the constructor and
   * destroyed alongside the widget.
   */
  private fontLoader: FontLoader;

  /** Analytics event tracker (null when analytics disabled) */
  private tracker: ChatbotTracker | null = null;

  /**
   * Lightweight Sentry error reporter for automatic error tracking.
   * Initialized during {@link init} when not explicitly disabled.
   * Wired to the ErrorBoundary so all caught errors are forwarded to Sentry.
   */
  private sentryReporter: SentryReporter | null = null;

  /**
   * Connection lifecycle manager: monitors browser online/offline events,
   * runs periodic heartbeat pings, and drives automatic reconnection with
   * exponential back-off.  Initialised after the server config is fetched
   * so the API URL is available.
   */
  private connectionManager: ConnectionManager | null = null;

  /** Unsubscribe function returned by ConnectionManager.onStatusChange() */
  private connectionStatusUnsubscribe: (() => void) | null = null;

  /**
   * The connection status banner element rendered directly below the window
   * header.  Hidden when the connection is healthy; visible (with a
   * modifier class) when offline or reconnecting.
   */
  private connectionBanner: HTMLElement | null = null;

  /** Timer ID for the "Reconnected" banner auto-hide after recovery. */
  private connectionBannerTimer: ReturnType<typeof setTimeout> | null = null;

  /** Logger for debug output */
  private logger: Logger;

  /**
   * Error boundary for isolating widget errors from the host page.
   * Wraps all public methods, user-provided callbacks, and timer callbacks
   * so that no uncaught exception escapes to the host application.
   */
  private errorBoundary: ErrorBoundary;

  // --------------------------------------------------------------------------
  // UI Renderers
  // --------------------------------------------------------------------------

  /** Floating chat bubble (null in inline mode) */
  private bubbleRenderer: BubbleRenderer | null = null;

  /** Chat window container with header, body, and footer */
  private windowRenderer: WindowRenderer | null = null;

  /** Message list and bubble renderer */
  private messageRenderer: MessageRenderer | null = null;

  /** Text input and send button */
  private inputRenderer: InputRenderer | null = null;

  /** Bot typing indicator animation */
  private typingRenderer: TypingRenderer | null = null;

  /** File upload service for validating and uploading attachments */
  private fileUploadService: FileUploadService | null = null;

  /**
   * Bidirectional typing status service.
   * Manages user→server typing notifications (debounced) and server→client
   * agent typing events (via SSE). Initialized after server config fetch.
   */
  private typingStatusService: TypingStatusService | null = null;

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  /** Root DOM element wrapping all widget UI */
  private rootElement: HTMLElement | null = null;

  /**
   * Outer host element appended to the document. Acts as the Shadow DOM
   * attachment point.  Styled with `all: initial` to isolate widget
   * styles from the host page.
   */
  private hostElement: HTMLElement | null = null;

  /**
   * Shadow root attached to `hostElement`.  When available, all widget DOM
   * and styles live inside this shadow boundary, preventing CSS leakage in
   * both directions.  Null when `Element.attachShadow` is not supported
   * (fallback: render directly into `hostElement`).
   */
  private shadow: ShadowRoot | null = null;

  /** Whether init() has completed successfully */
  private initialized = false;

  /** Whether destroy() has been called */
  private destroyed = false;

  /** User-provided container element (inline mode) or null (floating mode) */
  private container: HTMLElement | null = null;

  /** Timer ID for the rate-limit cooldown countdown (auto-re-enables input) */
  private rateLimitTimer: ReturnType<typeof setTimeout> | null = null;

  /** State change subscription cleanup function */
  private stateUnsubscribe: (() => void) | null = null;

  /** Keyboard event listener reference for cleanup */
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

  /** Focus trap keydown handler reference for cleanup */
  private focusTrapHandler: ((event: KeyboardEvent) => void) | null = null;

  /** Visibility change listener reference for cleanup */
  private visibilityHandler: (() => void) | null = null;

  /** Auto-open timer ID for cleanup */
  private autoOpenTimer: ReturnType<typeof setTimeout> | null = null;

  /** beforeunload handler reference for persistence on page leave */
  private beforeUnloadHandler: (() => void) | null = null;

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new ChatbotWidget instance.
   *
   * Validates the provided configuration immediately. Throws an error with
   * code `INVALID_CONFIG` if required fields are missing or any field fails
   * validation.
   *
   * @param config - Configuration provided by the host application.
   *   Only `chatbotId` and `tenantId` are required; all other options have
   *   sensible defaults.
   *
   * @throws {Error} When required fields are missing or any field fails validation
   *
   * @example
   * ```typescript
   * const widget = new ChatbotWidget({
   *   chatbotId: 'bot-123',
   *   tenantId: 'tenant-456',
   *   theme: 'auto',
   *   locale: 'en',
   * });
   * ```
   */
  constructor(config: ChatbotConfig) {
    // ConfigManager validates and applies defaults in its constructor
    this.configManager = new ConfigManager(config);

    const resolvedConfig = this.configManager.getConfig();
    this.logger = new Logger('[NeventChatbot]', resolvedConfig.debug);

    // Initialize error boundary for host page isolation.
    // The error handler is wired to the user-provided onError callback so
    // that caught errors are still surfaced to the host application.
    this.errorBoundary = new ErrorBoundary(resolvedConfig.debug);
    if (resolvedConfig.onError) {
      this.errorBoundary.setErrorHandler(resolvedConfig.onError);
    }

    // Initialize i18n with the resolved locale
    this.i18n = new I18nManager(resolvedConfig.locale);

    // Initialize state manager with persistence preference
    this.stateManager = new StateManager(
      resolvedConfig.chatbotId,
      resolvedConfig.persistConversation
    );

    // Initialize CSS generator with theme, styles, and z-index
    this.cssGenerator = new CSSGenerator(
      resolvedConfig.theme,
      resolvedConfig.styles,
      resolvedConfig.styles.zIndex ?? 9999
    );

    // Initialize font loader for Google Fonts and custom @font-face loading
    this.fontLoader = new FontLoader();

    // Initialize AuthManager when auth config is provided.
    // In public mode (default), authManager remains null and all existing
    // behaviour is preserved (X-API-Key header only).
    if (resolvedConfig.auth) {
      this.authManager = new AuthManager(
        resolvedConfig.auth,
        resolvedConfig.debug
      );
    }

    this.logger.debug('ChatbotWidget constructed', {
      chatbotId: resolvedConfig.chatbotId,
      tenantId: resolvedConfig.tenantId,
      theme: resolvedConfig.theme,
      locale: resolvedConfig.locale,
    });
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Initializes the chatbot widget: fetches server configuration, renders UI,
   * restores persisted state, and sets up event listeners.
   *
   * This method must be called after construction and before any other public
   * method. It is safe to call only once; subsequent calls are no-ops.
   *
   * @returns Promise that resolves when the widget is fully initialized
   * @throws {Error} with code `INITIALIZATION_FAILED` if critical steps fail
   *   (e.g., server config fetch fails, container not found)
   *
   * @example
   * ```typescript
   * const widget = new ChatbotWidget({ chatbotId: 'bot-1', tenantId: 't-1' });
   * await widget.init();
   * // Widget is now visible and ready for interaction
   * ```
   */
  async init(): Promise<void> {
    // Guard: already initialized or destroyed
    if (this.initialized) {
      this.logger.debug('init() called but widget is already initialized');
      return;
    }
    if (this.destroyed) {
      this.logger.warn('init() called on a destroyed widget — ignoring');
      return;
    }

    return this.errorBoundary.guardAsync(async () => {
      const config = this.configManager.getConfig();

      try {
        // Step 1: Find container if containerId provided (inline mode)
        if (config.containerId) {
          this.container = document.querySelector(`#${config.containerId}`);
          if (!this.container) {
            const error: ChatbotError = {
              code: 'CONTAINER_NOT_FOUND',
              message: `Container element with id "${config.containerId}" not found`,
            };
            config.onError(error);
            throw Object.assign(new Error(error.message), error);
          }
        }

        // Step 2: Create Shadow DOM host element for style isolation.
        // The host element acts as the shadow boundary; all widget DOM and
        // styles live inside the shadow root so host-page CSS cannot leak in
        // and widget CSS cannot leak out.
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'nevent-chatbot-host';

        if (this.container) {
          // Inline mode: host fills the container naturally
          this.hostElement.style.cssText =
            'all: initial; position: relative; display: block; width: 100%; height: 100%;';
        } else {
          // Floating mode: host is a zero-size fixed overlay at maximum z-index
          this.hostElement.style.cssText =
            'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0;';
        }

        // Attach Shadow DOM (open mode) with fallback to direct DOM
        if (this.hostElement.attachShadow) {
          this.shadow = this.hostElement.attachShadow({ mode: 'open' });
        } else {
          this.shadow = null;
        }

        const renderTarget = this.shadow ?? this.hostElement;

        // Create root element inside the shadow boundary
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'nevent-chatbot-root';
        this.rootElement.setAttribute('data-theme', config.theme);
        renderTarget.appendChild(this.rootElement);

        // Mount host element into the DOM
        const mountPoint = this.container ?? document.body;
        mountPoint.appendChild(this.hostElement);

        // Step 3: Inject CSS into the shadow root (or document.head as fallback)
        this.cssGenerator.inject(this.shadow ?? undefined);

        // Step 4: Fetch server configuration
        let serverConfig: ServerChatbotConfig;
        try {
          // Use a temporary ConversationService for the initial config fetch.
          // The config endpoint is public and does not require a token.
          const tempService = new ConversationService(
            config.apiUrl,
            '',
            config.chatbotId,
            config.debug
          );
          serverConfig = await tempService.fetchConfig(config.tenantId);
          this.logger.debug('Server config fetched successfully');
        } catch (fetchError) {
          this.logger.error('Failed to fetch server config', fetchError);
          const error: ChatbotError = {
            code: 'CONFIG_LOAD_FAILED',
            message: 'Failed to load chatbot configuration from server',
          };
          config.onError(error);
          throw Object.assign(new Error(error.message), error);
        }

        // Step 5: Merge server config into resolved config
        this.configManager.mergeServerConfig(serverConfig);
        const mergedConfig = this.configManager.getConfig();

        // Step 5b: Apply advanced theming from merged config.
        // Priority order (highest wins):
        //   1. brandColor — auto-generate full theme from a single hex color
        //   2. themePreset — named preset (e.g. 'midnight', 'ocean')
        //   3. server theme.primaryColor — apply as a brand-color generated theme
        //   4. Base light/dark tokens — already in the injected stylesheet
        if (mergedConfig.brandColor) {
          this.cssGenerator.setThemeFromColor(mergedConfig.brandColor);
          this.logger.debug('Brand color theme applied', {
            brandColor: mergedConfig.brandColor,
          });
        } else if (mergedConfig.themePreset) {
          const applied = this.cssGenerator.setThemePreset(
            mergedConfig.themePreset
          );
          if (!applied) {
            this.logger.warn(
              `Unknown theme preset: "${mergedConfig.themePreset}" — ignoring`
            );
          } else {
            this.logger.debug('Theme preset applied', {
              preset: mergedConfig.themePreset,
            });
          }
        } else if (serverConfig.theme?.primaryColor) {
          // Apply server brand color as a generated theme when no client-side preset
          this.cssGenerator.setThemeFromColor(serverConfig.theme.primaryColor);
          this.logger.debug('Server primary color theme applied', {
            primaryColor: serverConfig.theme.primaryColor,
          });
        }

        // Step 5c: Inject custom CSS from merged config.
        // Precedence: client customCSS > serverConfig.customCSS > styles.customCSS
        const effectiveCustomCSS =
          mergedConfig.customCSS ||
          serverConfig.customCSS ||
          mergedConfig.styles.customCSS ||
          '';
        if (effectiveCustomCSS) {
          this.cssGenerator.injectCustomCSS(
            effectiveCustomCSS,
            this.shadow ?? undefined
          );
          this.logger.debug('Custom CSS injected');
        }

        // Step 5d: Load fonts declared in config.fonts and server theme.font.
        // Google Fonts are loaded first (async, concurrent), custom @font-face is synchronous.
        await this.loadFonts(mergedConfig, serverConfig);

        // Step 6: Initialize ConversationService with the token from server config.
        // Pass the AuthManager (if present) so auth headers are injected into
        // every API request and 401 responses trigger automatic token refresh.
        // Backend context options (tenantId, eventId, source, userContext) are
        // forwarded so that X-Tenant-ID, X-User-Context headers and eventId/source
        // query parameters are included in all API requests.
        // Build backend context options, only including properties that have actual
        // values. exactOptionalPropertyTypes forbids assigning `undefined` to optional
        // properties, so we conditionally add each field.
        const backendContextOptions: {
          tenantId?: string;
          eventId?: string;
          source?: string;
          userContext?: { lat: number; lng: number };
        } = {
          tenantId: mergedConfig.tenantId,
        };
        if (mergedConfig.eventId) {
          backendContextOptions.eventId = mergedConfig.eventId;
        }
        if (mergedConfig.source) {
          backendContextOptions.source = mergedConfig.source;
        }
        if (mergedConfig.userContext) {
          backendContextOptions.userContext = mergedConfig.userContext;
        }

        this.conversationService = new ConversationService(
          mergedConfig.apiUrl,
          serverConfig.token,
          mergedConfig.chatbotId,
          mergedConfig.debug,
          this.authManager ?? undefined,
          backendContextOptions,
          mergedConfig.rateLimit
        );

        // Step 6b: Initialize StreamingClient when the server feature flag is enabled.
        // The StreamingClient uses the same token and API URL as ConversationService
        // but implements SSE-based streaming via fetch + ReadableStream.
        // The same backend context options are forwarded for consistent header/param usage.
        if (serverConfig.features.streaming) {
          this.streamingClient = new StreamingClient(
            mergedConfig.apiUrl,
            serverConfig.token,
            mergedConfig.chatbotId,
            mergedConfig.debug,
            this.authManager ?? undefined,
            backendContextOptions
          );
          this.logger.debug(
            'StreamingClient initialized — streaming mode active'
          );
        }

        // Step 6c: Initialize FileUploadService when file uploads are enabled.
        // Uses the same token and tenant ID for authenticated uploads.
        if (mergedConfig.fileUpload?.enabled !== false) {
          this.fileUploadService = new FileUploadService(
            mergedConfig.fileUpload,
            mergedConfig.apiUrl,
            mergedConfig.tenantId,
            serverConfig.token,
            mergedConfig.debug
          );
          this.logger.debug('FileUploadService initialized');
        }

        // Step 6d: Initialize TypingStatusService for bidirectional typing notifications.
        // Enabled by default unless explicitly disabled via typingStatus.enabled === false.
        if (mergedConfig.typingStatus?.enabled !== false) {
          this.typingStatusService = new TypingStatusService(
            mergedConfig.typingStatus,
            mergedConfig.apiUrl,
            mergedConfig.tenantId,
            () => this.stateManager.getState().conversation?.id ?? null,
            serverConfig.token,
            mergedConfig.debug
          );

          // Wire server typing events to the typing renderer
          this.typingStatusService.onServerTyping((event) => {
            if (event.isTyping) {
              this.typingRenderer?.showWithName(event.displayName);
            } else {
              this.typingRenderer?.hide();
            }
          });

          this.logger.debug('TypingStatusService initialized');
        }

        // Step 6e: Initialize ConnectionManager for heartbeat / reconnection.
        // Uses the same API URL as ConversationService so pings hit the same host.
        this.connectionManager = new ConnectionManager(mergedConfig.apiUrl, {
          debug: mergedConfig.debug,
        });

        // Step 7: Initialize analytics tracker (non-critical)
        try {
          if (mergedConfig.analytics) {
            this.tracker = new ChatbotTracker({
              chatbotId: mergedConfig.chatbotId,
              tenantId: mergedConfig.tenantId,
              analyticsUrl: mergedConfig.analyticsUrl,
              debug: mergedConfig.debug,
            });
          }
        } catch (analyticsError) {
          this.logger.warn(
            'Analytics initialization failed (non-fatal)',
            analyticsError
          );
        }

        // Step 7b: Initialize Sentry error reporter (non-critical)
        try {
          const sentryConfig = mergedConfig.sentry;
          if (sentryConfig?.enabled !== false) {
            // Default DSN for Nevent SDKs
            const defaultDsn =
              'https://ecaff66e5b924e2aa881e662581fe805@o4504651545640960.ingest.sentry.io/4504788728872960';

            // Auto-detect environment from API URL
            const detectedEnv = mergedConfig.apiUrl.includes('dev.')
              ? 'development'
              : mergedConfig.apiUrl.includes('staging.')
                ? 'staging'
                : 'production';

            const reporterConfig: SentryReporterConfig = {
              dsn: sentryConfig?.dsn ?? defaultDsn,
              enabled: true,
              tunnel:
                sentryConfig?.tunnel ?? `${mergedConfig.apiUrl}/diagnostics`,
              environment: sentryConfig?.environment ?? detectedEnv,
              release: `@nevent/chatbot@0.1.0`,
              sampleRate: sentryConfig?.sampleRate ?? 1.0,
              tags: {
                sdk: 'chatbot',
                tenantId: mergedConfig.tenantId,
                chatbotId: mergedConfig.chatbotId,
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

            // Set user context if auth is configured
            if (mergedConfig.auth?.userIdentity) {
              const userCtx: { id?: string; email?: string } = {};
              if (mergedConfig.auth.userIdentity.userId) {
                userCtx.id = mergedConfig.auth.userIdentity.userId;
              }
              if (mergedConfig.auth.userIdentity.email) {
                userCtx.email = mergedConfig.auth.userIdentity.email;
              }
              this.sentryReporter.setUser(userCtx);
            }

            this.logger.debug('Sentry reporter initialized');
          }
        } catch (sentryError) {
          this.logger.warn(
            'Sentry initialization failed (non-fatal)',
            sentryError
          );
        }

        // Step 8: Restore persisted state (non-critical)
        let persistedState: PersistedConversationState | null = null;
        try {
          persistedState = this.stateManager.restore();
          if (persistedState) {
            // Check TTL expiration
            const ttlHours = mergedConfig.conversationTTL;
            const lastActivity = new Date(
              persistedState.lastActivity
            ).getTime();
            const now = Date.now();
            const ttlMs = ttlHours * 60 * 60 * 1000;

            if (now - lastActivity > ttlMs) {
              this.logger.debug('Persisted conversation expired — clearing');
              this.stateManager.clearPersisted();
              persistedState = null;
            } else {
              this.logger.debug('Persisted conversation restored', {
                conversationId: persistedState.conversationId,
                messageCount: persistedState.messages.length,
              });
            }
          }
        } catch (restoreError) {
          this.logger.warn(
            'State restoration failed (non-fatal)',
            restoreError
          );
        }

        // Step 9: Render UI
        this.renderUI(serverConfig, persistedState);

        // Step 9b: Wire ConnectionManager status changes → banner UI.
        // Must be done after renderUI() so this.connectionBanner exists.
        if (this.connectionManager) {
          this.connectionStatusUnsubscribe =
            this.connectionManager.onStatusChange((status) => {
              this.onConnectionStatusChange(status);
            });
          this.connectionManager.start();
        }

        // Step 10: Attach event listeners
        this.attachEventListeners();

        // Step 11: If restored conversation, load messages into UI
        if (persistedState) {
          this.restoreConversation(persistedState);
        } else {
          // Show welcome message if configured
          this.renderWelcomeMessage();
        }

        // Step 12: If autoOpen, schedule open after delay
        if (mergedConfig.autoOpen) {
          this.autoOpenTimer = setTimeout(
            this.errorBoundary.guardTimer(() => {
              this.open();
            }, 'autoOpenTimer'),
            mergedConfig.autoOpenDelay
          );
        }

        // Step 13: Subscribe to state changes
        this.stateUnsubscribe = this.stateManager.subscribe(
          this.onStateChange.bind(this)
        );

        // Step 14: Set up persistence on page leave
        this.beforeUnloadHandler = () => {
          this.stateManager.persist();
        };
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

        // Step 15: Mark as initialized and fire onReady callback
        this.initialized = true;
        mergedConfig.onReady();

        this.logger.info('ChatbotWidget initialized successfully');
      } catch (initError) {
        this.logger.error('Widget initialization failed', initError);
        // Clean up any partially rendered UI
        this.cleanupPartialInit();
        throw initError;
      }
    }, 'init');
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Opens the chat window.
   *
   * In floating mode, the window slides in above the bubble and the bubble
   * icon switches to a close (X) icon. In inline mode, the window is shown
   * within the container.
   *
   * Resets the unread message count and focuses the input field.
   *
   * @example
   * ```typescript
   * widget.open();
   * ```
   */
  open(): void {
    if (!this.initialized || this.destroyed) return;

    this.errorBoundary.guard(() => {
      this.stateManager.setOpen(true);
      this.stateManager.resetUnread();

      if (this.windowRenderer) {
        this.windowRenderer.open();
      }

      // Update bubble icon to X in floating mode
      if (this.bubbleRenderer) {
        this.bubbleRenderer.setActive(true);
        this.bubbleRenderer.updateBadge(0);
      }

      // Focus the input field after a brief delay for animation
      // and activate the focus trap within the dialog (WCAG 2.1.2).
      setTimeout(
        this.errorBoundary.guardTimer(() => {
          this.inputRenderer?.focus();
          this.setupFocusTrap();
        }, 'openFocusTimer'),
        150
      );

      if (this.tracker) {
        this.tracker.trackOpen();
      }

      const config = this.configManager.getConfig();
      config.onOpen();
    }, 'open');
  }

  /**
   * Closes the chat window.
   *
   * In floating mode, the window slides out and the bubble icon reverts to
   * the chat icon. In inline mode, the window is hidden.
   *
   * @example
   * ```typescript
   * widget.close();
   * ```
   */
  close(): void {
    if (!this.initialized || this.destroyed) return;

    this.errorBoundary.guard(() => {
      this.stateManager.setOpen(false);

      if (this.windowRenderer) {
        this.windowRenderer.close();
      }

      // Update bubble icon back to chat icon in floating mode
      if (this.bubbleRenderer) {
        this.bubbleRenderer.setActive(false);
      }

      // Remove focus trap and return focus to the bubble button so keyboard
      // users can continue navigating the page (WCAG 2.4.3 Focus Order).
      this.removeFocusTrap();
      this.returnFocusToBubble();

      if (this.tracker) {
        this.tracker.trackClose(0);
      }

      const config = this.configManager.getConfig();
      config.onClose();
    }, 'close');
  }

  /**
   * Toggles the chat window open or closed.
   *
   * Convenience method equivalent to calling `open()` or `close()` based on
   * the current state.
   *
   * @example
   * ```typescript
   * widget.toggle(); // Opens if closed, closes if open
   * ```
   */
  toggle(): void {
    this.errorBoundary.guard(() => {
      if (this.stateManager.getState().isOpen) {
        this.close();
      } else {
        this.open();
      }
    }, 'toggle');
  }

  /**
   * Returns whether the chat window is currently open.
   *
   * @returns `true` if the chat window is visible, `false` otherwise
   *
   * @example
   * ```typescript
   * if (widget.isOpen()) {
   *   console.log('Chat is open');
   * }
   * ```
   */
  isOpen(): boolean {
    return (
      this.errorBoundary.guard(() => {
        return this.stateManager.getState().isOpen;
      }, 'isOpen') ?? false
    );
  }

  /**
   * Sets the authentication token at runtime.
   *
   * Use this method in SPA login flows where the JWT is obtained after
   * the widget has already been initialized. The new token is immediately
   * available for subsequent API requests.
   *
   * Requires `auth` to be configured in the widget config (mode must be
   * 'jwt' or 'custom'). If no AuthManager is present, this method is a
   * no-op.
   *
   * @param token - The new JWT or authentication token string
   *
   * @example
   * ```typescript
   * // After user logs in:
   * widget.setAuthToken('eyJhbGciOiJIUzI1NiIs...');
   * ```
   */
  setAuthToken(token: string): void {
    this.errorBoundary.guard(() => {
      if (!this.authManager) {
        this.logger.warn(
          'setAuthToken() called but no auth config was provided — ignoring. ' +
            'Configure auth in ChatbotConfig to enable authenticated sessions.'
        );
        return;
      }
      this.authManager.setToken(token);
      this.logger.debug('Auth token updated via setAuthToken()');
    }, 'setAuthToken');
  }

  /**
   * Clears the authentication token, reverting to unauthenticated mode
   * for subsequent requests in the current session.
   *
   * Use this method when the user logs out in a SPA. Existing conversations
   * are not affected, but new requests will not include auth headers.
   *
   * @example
   * ```typescript
   * // After user logs out:
   * widget.clearAuth();
   * ```
   */
  clearAuth(): void {
    this.errorBoundary.guard(() => {
      if (!this.authManager) {
        this.logger.debug('clearAuth() called but no auth config — no-op');
        return;
      }
      this.authManager.clearToken();
      this.logger.debug('Auth cleared via clearAuth()');
    }, 'clearAuth');
  }

  /**
   * Submits feedback (thumbs up/down) for a specific bot message.
   *
   * Calls the backend endpoint:
   * `POST /chatbot/message/{messageId}/feedback?feedbackType={POSITIVE|NEGATIVE}`
   *
   * This method requires authentication (the user must have a valid JWT).
   * If the user is not authenticated, the request will fail with a 401/403 error.
   *
   * @param messageId - The ID of the bot message to provide feedback on
   * @param feedbackType - The type of feedback: 'POSITIVE' or 'NEGATIVE'
   * @returns Promise that resolves when feedback has been submitted
   *
   * @example
   * ```typescript
   * // User clicks thumbs up on a bot message
   * await widget.sendFeedback('msg-123', 'POSITIVE');
   *
   * // User clicks thumbs down
   * await widget.sendFeedback('msg-456', 'NEGATIVE');
   * ```
   */
  async sendFeedback(
    messageId: string,
    feedbackType: FeedbackType
  ): Promise<void> {
    if (!this.initialized || this.destroyed) return;
    if (!this.conversationService) return;

    return this.errorBoundary.guardAsync(async () => {
      try {
        await this.conversationService!.sendFeedback(messageId, feedbackType);
        this.logger.debug('Feedback submitted', { messageId, feedbackType });
      } catch (feedbackError) {
        this.logger.error('Failed to submit feedback', feedbackError);

        const chatbotError: ChatbotError =
          feedbackError !== null &&
          typeof feedbackError === 'object' &&
          'code' in feedbackError
            ? (feedbackError as ChatbotError)
            : {
                code: 'FEEDBACK_FAILED',
                message:
                  feedbackError instanceof Error
                    ? feedbackError.message
                    : 'Failed to submit message feedback',
              };

        const config = this.configManager.getConfig();
        config.onError(chatbotError);
      }
    }, 'sendFeedback');
  }

  /**
   * Sends a message programmatically on behalf of the user.
   *
   * Creates an optimistic user message in the UI immediately, then sends it
   * to the API. The bot's response is rendered when it arrives. If sending
   * fails, the message status is updated to 'error' and the onError callback
   * is invoked.
   *
   * A client-side rate limit of 1 message per second is enforced. Exceeding
   * the limit shows a localized rate limit error in the UI.
   *
   * @param text - The message text to send. Must be non-empty after trimming.
   * @returns Promise that resolves when the bot response has been rendered
   *
   * @example
   * ```typescript
   * await widget.sendMessage('Hello, I need help with my tickets');
   * ```
   */
  async sendMessage(text: string): Promise<void> {
    if (!this.initialized || this.destroyed) return;
    if (!this.conversationService) return;

    return this.errorBoundary.guardAsync(async () => {
      // Validate text and attachments
      const trimmedText = text.trim();
      const pendingAttachments = this.inputRenderer?.getAttachments() ?? [];
      if (!trimmedText && pendingAttachments.length === 0) return;

      // Client-side rate limiting via ConversationService's RateLimiter.
      // If the limit is exceeded, show a countdown message and temporarily
      // disable input until the cooldown expires.
      try {
        this.conversationService!.checkRateLimit();
      } catch (rateLimitError) {
        if (
          rateLimitError !== null &&
          typeof rateLimitError === 'object' &&
          'code' in rateLimitError &&
          (rateLimitError as { code: string }).code === 'RATE_LIMITED'
        ) {
          const details = (
            rateLimitError as { details?: { retryAfterMs?: number } }
          ).details;
          const retryAfterMs = details?.retryAfterMs ?? 5000;
          const retrySeconds = Math.ceil(retryAfterMs / 1000);

          this.logger.debug('Rate limited — cooldown active', { retryAfterMs });

          // Show countdown message in the chat window
          this.showInlineError(
            this.i18n.format('rateLimitCountdown', { seconds: retrySeconds })
          );

          // Disable input during cooldown and re-enable when it expires
          this.inputRenderer?.setDisabled(true);
          this.scheduleRateLimitRecovery(retryAfterMs);

          return;
        }
        // Re-throw non-rate-limit errors
        throw rateLimitError;
      }

      const config = this.configManager.getConfig();
      const state = this.stateManager.getState();

      // Upload any pending file attachments before building the user message.
      // Each file is uploaded in parallel; failed uploads are filtered out.
      let uploadedAttachments: FileAttachment[] = [];
      if (pendingAttachments.length > 0 && this.fileUploadService) {
        const uploadPromises = pendingAttachments.map(async (attachment) => {
          if (attachment.status === 'uploaded' && attachment.url) {
            return attachment; // Already uploaded
          }
          try {
            const result = await this.fileUploadService!.upload(
              attachment.file,
              (progress) => {
                this.inputRenderer?.updateAttachment(attachment.id, {
                  progress,
                  status: 'uploading',
                });
              }
            );
            const updateData: Partial<FileAttachment> = {
              status: result.status,
              progress: result.progress,
            };
            if (result.url) updateData.url = result.url;
            if (result.error) updateData.error = result.error;
            this.inputRenderer?.updateAttachment(attachment.id, updateData);
            return result;
          } catch {
            this.inputRenderer?.updateAttachment(attachment.id, {
              status: 'error',
              error: 'Upload failed',
            });
            return null;
          }
        });

        const results = await Promise.all(uploadPromises);
        uploadedAttachments = results.filter(
          (r): r is FileAttachment => r !== null && r.status === 'uploaded'
        );
      }

      // Create optimistic user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        conversationId: state.conversation?.id ?? '',
        role: 'user',
        content: trimmedText,
        type: 'text',
        timestamp: new Date().toISOString(),
        status: 'sending',
        ...(uploadedAttachments.length > 0
          ? { attachments: uploadedAttachments }
          : {}),
      };

      // Ensure a conversation exists (create lazily on first message)
      if (!state.conversation) {
        try {
          await this.createConversation();
          // Update the conversation ID on the user message
          const updatedState = this.stateManager.getState();
          userMessage.conversationId = updatedState.conversation?.id ?? '';
        } catch (createError) {
          this.logger.error('Failed to create conversation', createError);
          const error: ChatbotError = {
            code: 'CONVERSATION_CREATE_FAILED',
            message: 'Failed to start a new conversation',
          };
          config.onError(error);
          return;
        }
      }

      // Add optimistic message to state and render
      this.stateManager.addMessage(userMessage);
      this.messageRenderer?.addMessage(userMessage);

      // Clear quick replies from previous turn
      this.messageRenderer?.clearQuickReplies();

      // Clear input and disable while waiting for response
      this.inputRenderer?.clear();
      this.inputRenderer?.setDisabled(true);
      this.stateManager.setLoading(true);

      // Track analytics
      if (this.tracker) {
        const conversationId =
          this.stateManager.getState().conversation?.id ?? '';
        this.tracker.trackMessageSent(conversationId, trimmedText.length);
      }

      try {
        const conversationId = this.stateManager.getState().conversation!.id;

        // Update message status to 'sent'
        this.stateManager.updateMessageStatus(userMessage.id, 'sent');
        this.messageRenderer?.updateMessage(userMessage.id, { status: 'sent' });

        // Choose streaming or polling based on server feature flags
        const serverConfig = this.configManager.getServerConfig();
        const useStreaming =
          this.streamingClient !== null &&
          serverConfig?.features.streaming === true;

        if (useStreaming) {
          await this.sendMessageWithStreaming(conversationId, trimmedText);
        } else {
          await this.sendMessageWithPolling(conversationId, trimmedText);
        }

        // Persist state after successful response
        this.stateManager.persist();
      } catch (sendError) {
        this.logger.error('Failed to send message', sendError);

        // Hide typing indicator
        this.stateManager.setTyping(false);
        this.typingRenderer?.hide();

        // Update message status to 'error'
        this.stateManager.updateMessageStatus(userMessage.id, 'error');
        this.messageRenderer?.updateMessage(userMessage.id, {
          status: 'error',
        });

        // Surface error
        const chatbotError: ChatbotError =
          sendError !== null &&
          typeof sendError === 'object' &&
          'code' in sendError
            ? (sendError as ChatbotError)
            : {
                code: 'MESSAGE_SEND_FAILED',
                message:
                  sendError instanceof Error
                    ? sendError.message
                    : 'Failed to send message',
              };

        this.showInlineError(
          chatbotError.code === 'RATE_LIMIT_EXCEEDED' ||
            chatbotError.code === 'RATE_LIMITED'
            ? this.i18n.t('rateLimitError')
            : this.i18n.t('messageSendError')
        );

        config.onError(chatbotError);
      } finally {
        // Re-enable input
        this.stateManager.setLoading(false);
        this.inputRenderer?.setDisabled(false);
        this.inputRenderer?.focus();
      }
    }, 'sendMessage');
  }

  // --------------------------------------------------------------------------
  // Private: File Upload Handling
  // --------------------------------------------------------------------------

  /**
   * Handles files selected by the user (via file input, drag-drop, or paste).
   *
   * Validates each file against the FileUploadService configuration (size,
   * type), creates FileAttachment objects for valid files, and adds them to
   * the InputRenderer's preview strip. Invalid files trigger inline error
   * messages.
   *
   * @param files - Array of File objects selected by the user
   */
  private async handleFilesSelected(files: File[]): Promise<void> {
    if (!this.fileUploadService || !this.inputRenderer) return;

    for (const file of files) {
      const validation = this.fileUploadService.validate(file);

      if (!validation.valid) {
        // Show validation error inline
        const errorKey = validation.error ?? '';
        if (errorKey.startsWith('FILE_TOO_LARGE:')) {
          const maxMB = errorKey.split(':')[1] ?? '10';
          this.showInlineError(this.i18n.format('fileTooBig', { maxMB }));
        } else if (errorKey === 'FILE_TYPE_NOT_ALLOWED') {
          this.showInlineError(this.i18n.t('fileTypeNotAllowed'));
        } else {
          this.showInlineError(this.i18n.t('uploadFailed'));
        }
        continue;
      }

      // Create a pending attachment with a local preview
      const thumbnailUrl = this.fileUploadService.createPreview(file);
      const id =
        crypto?.randomUUID?.() ??
        `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const attachment: FileAttachment = {
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'pending',
        progress: 0,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };

      this.inputRenderer.addAttachments([attachment]);
    }
  }

  /**
   * Handles removal of a file attachment from the InputRenderer preview strip.
   *
   * Revokes the blob URL for the preview image (if any) and cancels any
   * in-progress upload for the attachment.
   *
   * @param attachmentId - The ID of the attachment to remove
   */
  private handleFileRemoved(attachmentId: string): void {
    if (!this.inputRenderer) return;

    // Find the attachment to clean up its resources
    const attachments = this.inputRenderer.getAttachments();
    const attachment = attachments.find((a) => a.id === attachmentId);

    if (attachment) {
      // Revoke blob URL to prevent memory leaks
      if (attachment.thumbnailUrl && this.fileUploadService) {
        this.fileUploadService.revokePreview(attachment.thumbnailUrl);
      }

      // Cancel upload if in progress
      if (attachment.status === 'uploading' && this.fileUploadService) {
        this.fileUploadService.cancelUpload(attachmentId);
      }
    }

    this.inputRenderer.removeAttachment(attachmentId);
  }

  // --------------------------------------------------------------------------
  // Private: Message Sending Strategies
  // --------------------------------------------------------------------------

  /**
   * Sends a message and receives the bot response via SSE streaming.
   *
   * This is the preferred path when `serverConfig.features.streaming === true`.
   * It creates an empty bot message placeholder immediately and fills it
   * token-by-token as `message.delta` events arrive, giving the user a
   * ChatGPT-like experience.
   *
   * Flow:
   * 1. Generate a temporary bot message ID and add an empty streaming bubble.
   * 2. Hide typing indicator once the first token arrives.
   * 3. Update the bubble on every `message.delta` event.
   * 4. Finalize the bubble and add to state on `message.complete`.
   * 5. Handle quick replies from a `quick_replies` event.
   * 6. On `message.error` or network failure, set the bubble to error state.
   *
   * @param conversationId - The active conversation session ID
   * @param content - The user's message text (already validated and trimmed)
   * @returns Promise that resolves when the stream is complete or errored
   */
  private async sendMessageWithStreaming(
    conversationId: string,
    content: string
  ): Promise<void> {
    if (!this.streamingClient) return;

    const config = this.configManager.getConfig();

    // Generate a local ID for the bot message placeholder.
    // The server may supply its own ID via `message.start`; if so,
    // `onComplete` replaces the placeholder with the canonical message.
    const botMessageId = generateMessageId();
    const now = new Date().toISOString();

    // Create an empty bot message to hold the streaming content
    const streamingBotMessage: ChatMessage = {
      id: botMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: now,
      status: 'sending',
    };

    // Show streaming bubble with blinking cursor
    this.messageRenderer?.addStreamingMessage(streamingBotMessage);

    // Show typing indicator until the first token arrives
    this.stateManager.setTyping(true);
    this.typingRenderer?.show();
    this.messageRenderer?.scrollToBottom(true);

    // Build the streaming request, including ticketId from config if available
    const streamingRequest: {
      content: string;
      type?: string;
      metadata?: Record<string, unknown>;
    } = { content };
    if (config.ticketId) {
      streamingRequest.metadata = { ticketId: config.ticketId };
    }

    await this.streamingClient.sendMessageStreaming(
      conversationId,
      streamingRequest,
      {
        onTypingStart: () => {
          this.stateManager.setTyping(true);
          this.typingRenderer?.show();
        },

        onTypingStop: () => {
          this.stateManager.setTyping(false);
          this.typingRenderer?.hide();
        },

        onThinking: () => {
          // THINKING event from the backend indicates the AI model is
          // reasoning/processing. Show the typing indicator as a visual cue.
          if (!this.stateManager.getState().isTyping) {
            this.stateManager.setTyping(true);
            this.typingRenderer?.show();
          }
        },

        onDelta: (_token, accumulated) => {
          // Hide typing indicator as soon as content starts flowing
          if (this.stateManager.getState().isTyping) {
            this.stateManager.setTyping(false);
            this.typingRenderer?.hide();
          }

          // Update the streaming bubble with the accumulated text so far
          this.messageRenderer?.updateMessageContent(
            botMessageId,
            accumulated,
            true
          );
        },

        onComplete: (completedMessage) => {
          // Ensure the message has the correct conversation ID
          completedMessage.conversationId = conversationId;

          // If the server assigned a different ID we still update our local element,
          // then re-register it under the server ID for future lookups.
          this.messageRenderer?.finalizeStreamingMessage(
            botMessageId,
            completedMessage.content
          );

          // Add the completed message to state so it persists
          this.stateManager.addMessage(completedMessage);

          // Track bot response received
          if (this.tracker) {
            this.tracker.trackMessageReceived(conversationId, 0);
          }

          // Notify the host application callback
          config.onMessage(completedMessage);

          // Increment unread badge if the chat window is closed
          if (!this.stateManager.getState().isOpen) {
            this.stateManager.incrementUnread();
          }

          this.messageRenderer?.scrollToBottom(true);

          this.logger.debug('Streaming response complete', {
            conversationId,
            messageId: completedMessage.id,
            contentLength: completedMessage.content.length,
          });
        },

        onError: (streamError) => {
          this.logger.error('Streaming error received', streamError);

          // Hide typing indicator
          this.stateManager.setTyping(false);
          this.typingRenderer?.hide();

          // Mark the streaming bubble as errored
          this.messageRenderer?.updateMessageStatus(botMessageId, 'error');

          // Report network-level failures to the connection manager so it
          // can trigger reconnection logic (not for semantic API errors).
          if (streamError.code === 'NETWORK_ERROR') {
            this.connectionManager?.reportFailure();
          }

          // Show inline error message in the chat window
          this.showInlineError(
            streamError.code === 'RATE_LIMIT_EXCEEDED'
              ? this.i18n.t('rateLimitError')
              : this.i18n.t('messageSendError')
          );

          config.onError(streamError);
        },

        onQuickReplies: (replies) => {
          this.messageRenderer?.renderQuickReplies(
            replies,
            (reply: QuickReply) => {
              void this.handleQuickReply(reply);
            }
          );

          // Focus first quick reply for keyboard users (WCAG 2.4.3)
          setTimeout(
            this.errorBoundary.guardTimer(() => {
              this.focusFirstQuickReply();
            }, 'streamingQuickReplyFocus'),
            50
          );
        },

        // Server → Client: agent typing status via SSE
        onAgentTypingStart: (event) => {
          this.typingStatusService?.handleServerTypingEvent(event);
        },

        onAgentTypingStop: (event) => {
          this.typingStatusService?.handleServerTypingEvent(event);
        },
      }
    );
  }

  /**
   * Sends a message and receives the full bot response via a standard POST request.
   *
   * This is the fallback path when streaming is disabled or unavailable.
   * The typing indicator is shown while awaiting the full response, then the
   * complete bot message is rendered in a single DOM operation.
   *
   * @param conversationId - The active conversation session ID
   * @param content - The user's message text (already validated and trimmed)
   * @returns Promise that resolves when the bot response has been rendered
   * @throws {ChatbotError} Propagates API errors to the caller (`sendMessage`)
   */
  private async sendMessageWithPolling(
    conversationId: string,
    content: string
  ): Promise<void> {
    if (!this.conversationService) return;

    const config = this.configManager.getConfig();

    // Show typing indicator while awaiting full response
    this.stateManager.setTyping(true);
    this.typingRenderer?.show();
    this.messageRenderer?.scrollToBottom(true);

    // Send via standard REST endpoint.
    // The inner try/catch reports network errors to the ConnectionManager and
    // re-throws so the outer catch in sendMessage() handles the UI update.
    let response: import('./types').SendMessageResponse;
    try {
      response = await this.conversationService.sendMessage(conversationId, {
        content,
      });
      // Report success to reset retry counter and restore 'connected' status.
      this.connectionManager?.reportSuccess();
    } catch (pollError) {
      // Report network failure so ConnectionManager can schedule reconnection.
      this.connectionManager?.reportFailure();
      throw pollError;
    }

    // Hide typing indicator
    this.stateManager.setTyping(false);
    this.typingRenderer?.hide();

    // Add bot response to state and render
    const botMessage = response.botMessage;
    this.stateManager.addMessage(botMessage);
    this.messageRenderer?.addMessage(botMessage, (action) => {
      void this.handleRichContentAction(action);
    });

    // Render quick replies if any
    if (response.quickReplies && response.quickReplies.length > 0) {
      this.messageRenderer?.renderQuickReplies(
        response.quickReplies,
        (reply: QuickReply) => {
          void this.handleQuickReply(reply);
        }
      );

      // Focus the first quick reply button so keyboard users can navigate
      // immediately with Arrow keys (WCAG 2.1.1, 2.4.3).
      setTimeout(
        this.errorBoundary.guardTimer(() => {
          this.focusFirstQuickReply();
        }, 'pollingQuickReplyFocus'),
        50
      );
    }

    // Scroll to show the new message
    this.messageRenderer?.scrollToBottom(true);

    // Track bot response
    if (this.tracker) {
      this.tracker.trackMessageReceived(conversationId, 0);
    }

    // Notify callback
    config.onMessage(botMessage);

    // Increment unread if window is closed
    if (!this.stateManager.getState().isOpen) {
      this.stateManager.incrementUnread();
    }
  }

  /**
   * Clears the current conversation and starts fresh.
   *
   * Closes the existing conversation on the server, resets the in-memory state,
   * clears the message UI, removes persisted data, and shows the welcome message.
   *
   * @returns Promise that resolves when the conversation has been cleared
   *
   * @example
   * ```typescript
   * await widget.clearConversation();
   * ```
   */
  async clearConversation(): Promise<void> {
    if (!this.initialized || this.destroyed) return;

    return this.errorBoundary.guardAsync(async () => {
      const state = this.stateManager.getState();

      // Abort any active SSE stream for the current conversation before closing it
      if (state.conversation && this.streamingClient) {
        this.streamingClient.abort(state.conversation.id);
      }

      // Close existing conversation on the server (fire-and-forget)
      if (state.conversation && this.conversationService) {
        try {
          await this.conversationService.closeConversation(
            state.conversation.id
          );
        } catch {
          // Non-fatal: logged inside ConversationService
        }
      }

      // Reset state
      this.stateManager.reset();
      this.stateManager.clearPersisted();

      // Reset the rate limiter so the user starts fresh
      this.conversationService?.resetRateLimit();

      // Cancel any active rate-limit cooldown timer
      if (this.rateLimitTimer !== null) {
        clearTimeout(this.rateLimitTimer);
        this.rateLimitTimer = null;
      }

      // Clear message UI
      this.messageRenderer?.clear();

      // Show welcome message
      this.renderWelcomeMessage();

      this.logger.debug('Conversation cleared');
    }, 'clearConversation');
  }

  /**
   * Returns a readonly snapshot of the current conversation state.
   *
   * @returns Readonly view of the current {@link ConversationState}
   *
   * @example
   * ```typescript
   * const state = widget.getState();
   * console.log('Messages:', state.conversation?.messages.length ?? 0);
   * console.log('Is open:', state.isOpen);
   * ```
   */
  getState(): Readonly<ConversationState> {
    return (
      this.errorBoundary.guard(() => {
        return this.stateManager.getState();
      }, 'getState') ?? this.getDefaultState()
    );
  }

  /**
   * Destroys the widget completely.
   *
   * Removes all UI elements from the DOM, unsubscribes from state changes,
   * cleans up event listeners, removes injected CSS, and marks the widget
   * as destroyed. After calling this method, the widget instance cannot be
   * reused.
   *
   * Persisted state is saved before teardown if persistence is enabled.
   *
   * @example
   * ```typescript
   * widget.destroy();
   * // Widget is now fully removed from the page
   * ```
   */
  destroy(): void {
    if (this.destroyed) return;

    this.errorBoundary.guard(() => {
      this.logger.debug('Destroying ChatbotWidget');

      // Cancel auto-open timer
      if (this.autoOpenTimer !== null) {
        clearTimeout(this.autoOpenTimer);
        this.autoOpenTimer = null;
      }

      // Cancel rate-limit recovery timer
      if (this.rateLimitTimer !== null) {
        clearTimeout(this.rateLimitTimer);
        this.rateLimitTimer = null;
      }

      // Persist state one final time before teardown
      this.stateManager.persist();

      // Close conversation on the server (fire-and-forget)
      const state = this.stateManager.getState();
      if (state.conversation && this.conversationService) {
        void this.conversationService.closeConversation(state.conversation.id);
      }

      // Remove event listeners
      this.removeEventListeners();

      // Unsubscribe from state changes
      if (this.stateUnsubscribe) {
        this.stateUnsubscribe();
        this.stateUnsubscribe = null;
      }

      // Stop and destroy the connection manager.
      if (this.connectionStatusUnsubscribe) {
        this.connectionStatusUnsubscribe();
        this.connectionStatusUnsubscribe = null;
      }
      if (this.connectionManager) {
        this.connectionManager.destroy();
        this.connectionManager = null;
      }

      // Clear banner auto-hide timer.
      if (this.connectionBannerTimer !== null) {
        clearTimeout(this.connectionBannerTimer);
        this.connectionBannerTimer = null;
      }
      this.connectionBanner = null;

      // Abort all active SSE streams before destroying renderers
      if (this.streamingClient) {
        this.streamingClient.destroy();
        this.streamingClient = null;
      }

      // Destroy typing status service (clears timers, sends stop if mid-typing)
      if (this.typingStatusService) {
        this.typingStatusService.destroy();
        this.typingStatusService = null;
      }

      // Destroy file upload service (cancels active uploads, revokes blob URLs)
      if (this.fileUploadService) {
        this.fileUploadService.destroy();
        this.fileUploadService = null;
      }

      // Destroy UI renderers
      this.bubbleRenderer?.destroy();
      this.windowRenderer?.destroy();
      this.messageRenderer?.destroy();
      this.inputRenderer?.destroy();
      this.typingRenderer?.destroy();

      this.bubbleRenderer = null;
      this.windowRenderer = null;
      this.messageRenderer = null;
      this.inputRenderer = null;
      this.typingRenderer = null;

      // Remove root element and host element (shadow root is removed with the host)
      this.rootElement?.remove();
      this.rootElement = null;
      this.hostElement?.remove();
      this.hostElement = null;
      this.shadow = null;

      // Remove injected CSS (also removes custom CSS element)
      this.cssGenerator.remove();

      // Destroy font loader — removes all injected font <link> and <style> elements
      this.fontLoader.destroy();

      // Destroy AuthManager and clear sensitive token state
      if (this.authManager) {
        this.authManager.destroy();
        this.authManager = null;
      }

      // Destroy Sentry reporter and detach from error boundary
      if (this.sentryReporter) {
        this.errorBoundary.setSentryReporter(null);
        this.sentryReporter.destroy();
        this.sentryReporter = null;
      }

      // Clean up references
      this.conversationService = null;
      this.tracker = null;
      this.container = null;

      this.destroyed = true;
      this.initialized = false;

      this.logger.info('ChatbotWidget destroyed');
    }, 'destroy');

    // Ensure destroyed flag is set even if the guard caught an error,
    // to prevent any subsequent method calls from executing.
    this.destroyed = true;
    this.initialized = false;
  }

  // --------------------------------------------------------------------------
  // Private: Font Loading
  // --------------------------------------------------------------------------

  /**
   * Loads all fonts declared in the merged client config and server config.
   *
   * Font sources resolved in this order:
   * 1. `config.fonts` — explicit `FontConfig[]` array provided by the host app.
   * 2. `config.styles.header.font` — font declared in header styles.
   * 3. `config.styles.messages.font` — font declared in message styles.
   * 4. `config.styles.input.font` — font declared in input styles.
   * 5. `serverConfig.theme.font` — font configured by the event promoter.
   * 6. `config.styles.fontFamily` — plain family string (attempted as Google Font
   *    when it looks like a named font family, i.e. starts with a capital letter).
   *
   * After all fonts are loaded, the `--nev-cb-font-family` CSS custom property
   * is updated on the root element if any font was successfully loaded.
   *
   * @param config - Fully resolved merged config
   * @param serverConfig - Server-side config (for theme.font)
   */
  private async loadFonts(
    config: Readonly<Required<import('./types').ChatbotConfig>>,
    serverConfig: import('./types').ServerChatbotConfig
  ): Promise<void> {
    const fontLoadPromises: Promise<void>[] = [];
    let primaryFontFamily: string | null = null;

    // Helper: queue a FontConfig for loading.
    // Custom @font-face rules are injected into both document.head and the
    // shadow root for cross-browser compatibility (some browsers do not
    // inherit @font-face from the outer document into shadow DOM).
    const queueFont = (
      fontConfig: import('./types').FontConfig | undefined | null
    ): void => {
      if (!fontConfig?.family) return;

      if (fontConfig.type === 'GOOGLE_FONT') {
        fontLoadPromises.push(
          this.fontLoader.loadGoogleFont(fontConfig.family)
        );
        if (!primaryFontFamily) primaryFontFamily = fontConfig.family;
      } else if (fontConfig.type === 'CUSTOM_FONT') {
        this.fontLoader.loadCustomFont(fontConfig, this.shadow ?? undefined);
        if (!primaryFontFamily) primaryFontFamily = fontConfig.family;
      }
      // SYSTEM_FONT — already available, no loading needed
    };

    // 1. Explicit fonts array from host app config (cast through unknown since
    //    fonts is declared in ChatbotConfig but Required<> preserves it as optional)
    const fontsArray = (
      config as unknown as { fonts?: import('./types').FontConfig[] }
    ).fonts;
    if (Array.isArray(fontsArray)) {
      for (const fontConfig of fontsArray) {
        queueFont(fontConfig);
      }
    }

    // 2–4. Fonts embedded in style sections
    queueFont(config.styles?.header?.font);
    queueFont(config.styles?.messages?.font);
    queueFont(config.styles?.input?.font);

    // 5. Server theme font
    queueFont(serverConfig.theme?.font);

    // 6. Plain fontFamily string — attempt as Google Font if it looks like a
    //    named family (starts with a capital letter, e.g. 'Inter', 'Open Sans')
    const plainFamily = config.styles?.fontFamily;
    if (
      plainFamily &&
      !primaryFontFamily &&
      /^[A-Z]/.test(plainFamily.trim())
    ) {
      const cleanFamily =
        plainFamily.split(',')[0]?.trim().replace(/['"]/g, '') ?? plainFamily;
      fontLoadPromises.push(this.fontLoader.loadGoogleFont(cleanFamily));
      primaryFontFamily = cleanFamily;
    }

    // Load all Google Fonts concurrently (custom fonts are synchronous)
    if (fontLoadPromises.length > 0) {
      try {
        await Promise.allSettled(fontLoadPromises);
      } catch {
        // allSettled never rejects, but guard defensively
      }
    }

    // Apply the primary font family as a CSS custom property override on root
    if (primaryFontFamily && this.rootElement) {
      this.rootElement.style.setProperty(
        '--nev-cb-font-family',
        `'${primaryFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      );
      this.logger.debug('Font family applied', {
        fontFamily: primaryFontFamily,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Private: UI Rendering
  // --------------------------------------------------------------------------

  /**
   * Renders the complete UI: bubble (floating mode), window, messages, input,
   * and typing indicator.
   *
   * @param serverConfig - Server configuration for header content
   * @param persistedState - Optional persisted state for restoration
   */
  private renderUI(
    serverConfig: ServerChatbotConfig,
    persistedState: PersistedConversationState | null
  ): void {
    if (!this.rootElement) return;

    const config = this.configManager.getConfig();
    const isFloating = !this.container;

    // Determine header content from server config
    const headerTitle = serverConfig.name || this.i18n.t('defaultTitle');
    const headerSubtitle =
      serverConfig.description || this.i18n.t('statusOnline');
    const headerAvatar = serverConfig.avatar;

    // Render bubble (floating mode only).
    // The bubble is rendered inside the shadow root for style isolation.
    if (isFloating) {
      this.bubbleRenderer = new BubbleRenderer(
        config.position,
        config.styles.bubble,
        this.i18n
      );
      const renderTarget = this.shadow ?? this.rootElement;
      this.bubbleRenderer.render(() => {
        this.toggle();
      }, renderTarget ?? undefined);
    }

    // Render window.
    // Pass the shadow root so sub-renderers can inject animations inside the
    // shadow boundary instead of document.head.
    this.windowRenderer = new WindowRenderer(
      config.styles.window,
      config.styles.header,
      this.i18n,
      this.shadow ?? undefined
    );

    // Resolve branding visibility: client config takes precedence over server
    // feature flag. Both default to true when not explicitly set.
    const showBranding =
      config.showBranding !== false &&
      serverConfig.features.showBranding !== false;

    const windowRenderOptions: Parameters<WindowRenderer['render']>[0] = {
      title: headerTitle,
      subtitle: headerSubtitle,
      onClose: () => this.close(),
      onNewConversation: () => {
        void this.clearConversation();
      },
      showBranding,
      tenantId: config.tenantId,
      tracker: this.tracker,
    };
    if (headerAvatar) {
      windowRenderOptions.avatar = headerAvatar;
    }
    const windowElement = this.windowRenderer.render(windowRenderOptions);

    this.rootElement.appendChild(windowElement);

    // Render the connection status banner directly below the header.
    // It is inserted as the first child of the window body so it appears
    // above the message list.  The banner is hidden by default and only
    // shown when the ConnectionManager reports a degraded status.
    this.connectionBanner = document.createElement('div');
    this.connectionBanner.className = 'nevent-chatbot-connection-banner';
    this.connectionBanner.setAttribute('role', 'status');
    this.connectionBanner.setAttribute('aria-live', 'polite');
    this.connectionBanner.setAttribute('aria-atomic', 'true');
    this.windowRenderer.getBody().appendChild(this.connectionBanner);

    // Render message list in window body
    this.messageRenderer = new MessageRenderer(
      config.styles.messages,
      config.styles.quickReplies,
      this.i18n,
      MessageSanitizer
    );

    const messageListElement = this.messageRenderer.render();
    this.windowRenderer.getBody().appendChild(messageListElement);

    // Render scroll-to-bottom button
    this.messageRenderer.renderScrollButton(() => {
      this.messageRenderer?.scrollToBottom(true);
    });

    // Render typing indicator in window body (hidden by default).
    // Pass the shadow root so the keyframe animation style is injected
    // inside the shadow boundary.
    this.typingRenderer = new TypingRenderer(
      config.styles.messages,
      this.i18n,
      this.shadow ?? undefined
    );

    const typingElement = this.typingRenderer.render();
    this.windowRenderer.getBody().appendChild(typingElement);

    // Render input in window footer
    this.inputRenderer = new InputRenderer(config.styles.input, this.i18n);

    const placeholder =
      config.placeholder ||
      serverConfig.placeholder ||
      this.i18n.t('inputPlaceholder');

    const inputRenderOptions: Parameters<InputRenderer['render']>[0] = {
      onSend: (text: string) => {
        void this.sendMessage(text);
      },
      placeholder,
    };

    // Wire typing status notifications (user → server).
    // Properties are added conditionally to satisfy exactOptionalPropertyTypes.
    if (this.typingStatusService) {
      const typingSvc = this.typingStatusService;
      inputRenderOptions.onTyping = () => {
        typingSvc.notifyTyping();
      };
      inputRenderOptions.onStoppedTyping = () => {
        typingSvc.notifyStoppedTyping();
      };
    }

    if (this.fileUploadService) {
      inputRenderOptions.fileUpload = {
        enabled: true,
        accept: this.fileUploadService.getAcceptString(),
        maxFiles: this.fileUploadService.getMaxFiles(),
        onFilesSelected: (files: File[]) => {
          void this.handleFilesSelected(files);
        },
        onFileRemoved: (attachmentId: string) => {
          this.handleFileRemoved(attachmentId);
        },
      };
    }

    const inputElement = this.inputRenderer.render(inputRenderOptions);
    this.windowRenderer.getFooter().appendChild(inputElement);

    // The root element is already inside the shadow root (mounted in init()).
    // In inline mode, open the window immediately since there is no bubble.
    if (this.container) {
      this.windowRenderer.open();
      this.stateManager.setOpen(true);
    }

    this.logger.debug('UI rendered', {
      mode: isFloating ? 'floating' : 'inline',
      hasPersistedState: persistedState !== null,
    });
  }

  /**
   * Renders the welcome message in the message list.
   * Uses the client-side override or server-configured welcome message.
   */
  private renderWelcomeMessage(): void {
    const config = this.configManager.getConfig();
    const serverConfig = this.configManager.getServerConfig();
    const welcomeText =
      config.welcomeMessage || serverConfig?.welcomeMessage || '';

    if (welcomeText && this.messageRenderer) {
      this.messageRenderer.renderWelcome(welcomeText);
    }
  }

  /**
   * Restores a persisted conversation into the UI by re-creating the
   * conversation object in state and rendering all cached messages.
   *
   * @param persisted - The persisted conversation data from localStorage
   */
  private restoreConversation(persisted: PersistedConversationState): void {
    // Re-create a Conversation object from persisted data
    const conversation: Conversation = {
      id: persisted.conversationId,
      chatbotId: persisted.chatbotId,
      status: 'active',
      messages: persisted.messages,
      createdAt: persisted.lastActivity,
      updatedAt: persisted.lastActivity,
    };

    // Only include metadata when it has a value (exactOptionalPropertyTypes)
    if (persisted.metadata !== undefined) {
      conversation.metadata = persisted.metadata;
    }

    this.stateManager.setConversation(conversation);

    // Render all persisted messages into the message list.
    // Provide onAction so restored rich content messages remain interactive.
    for (const message of persisted.messages) {
      this.messageRenderer?.addMessage(message, (action) => {
        void this.handleRichContentAction(action);
      });
    }

    // Scroll to bottom after rendering all messages
    this.messageRenderer?.scrollToBottom(false);

    if (this.tracker) {
      this.tracker.trackConversationResume(
        persisted.conversationId,
        persisted.messages.length
      );
    }

    this.logger.debug('Conversation restored from persistence', {
      conversationId: persisted.conversationId,
      messageCount: persisted.messages.length,
    });
  }

  // --------------------------------------------------------------------------
  // Private: Conversation Management
  // --------------------------------------------------------------------------

  /**
   * Creates a new conversation via the API and stores it in state.
   * Called lazily when the user sends their first message.
   *
   * @throws {ChatbotError} with code `CONVERSATION_CREATE_FAILED` on failure
   */
  private async createConversation(): Promise<void> {
    if (!this.conversationService) {
      throw new Error('ConversationService not initialized');
    }

    const config = this.configManager.getConfig();

    const response = await this.conversationService.createConversation({
      tenantId: config.tenantId,
      locale: config.locale,
    });

    // Create a Conversation object and store it in state
    const conversation: Conversation = {
      id: response.conversationId,
      chatbotId: config.chatbotId,
      status: 'active',
      messages: [],
      createdAt: response.createdAt,
      updatedAt: response.createdAt,
    };

    this.stateManager.setConversation(conversation);

    if (this.tracker) {
      this.tracker.trackConversationStart(response.conversationId);
    }

    this.logger.debug('Conversation created', {
      conversationId: response.conversationId,
    });
  }

  /**
   * Handles an action button interaction from a rich content message.
   *
   * Behaviour by action type:
   * - `postback` — sends `action.value` as a user message (same as quick reply)
   * - `url` — opened directly by the anchor element; no widget logic needed
   * - `phone` — opened directly by the anchor element; no widget logic needed
   * - `copy` — clipboard write is handled by the renderer; no widget logic needed
   *
   * Analytics: re-uses `trackQuickReplyClick` (same semantic event — user
   * selected a suggested action from the bot).  The `action.id` maps to the
   * quick reply `id`, and `action.label` to its `label`.
   *
   * @param action - The {@link ActionButton} that was activated
   */
  private async handleRichContentAction(
    action: import('./types').ActionButton
  ): Promise<void> {
    if (this.tracker) {
      const conversationId =
        this.stateManager.getState().conversation?.id ?? '';
      // Re-use the quick-reply tracking event; the action id / label carry the
      // rich content context.  A dedicated rich_content event can be added to
      // ChatbotTracker in a follow-up without changing this call-site.
      this.tracker.trackQuickReplyClick(
        conversationId,
        action.id,
        action.label
      );
    }

    if (action.type === 'postback') {
      // Send the postback value as a user message
      await this.sendMessage(action.value);
    }
    // 'url', 'phone', and 'copy' are handled entirely inside the renderer.
  }

  /**
   * Handles a quick reply button click by sending its value as a user message.
   *
   * @param reply - The selected quick reply option
   */
  private async handleQuickReply(reply: QuickReply): Promise<void> {
    if (this.tracker) {
      const conversationId =
        this.stateManager.getState().conversation?.id ?? '';
      this.tracker.trackQuickReplyClick(conversationId, reply.id, reply.label);
    }

    // Clear quick replies immediately to prevent double-click
    this.messageRenderer?.clearQuickReplies();

    // Return focus to textarea so keyboard users can continue typing (WCAG 2.4.3)
    this.inputRenderer?.focus();

    // Send the quick reply value as a user message
    await this.sendMessage(reply.value);
  }

  // --------------------------------------------------------------------------
  // Private: Event Listeners
  // --------------------------------------------------------------------------

  /**
   * Attaches all event listeners for keyboard shortcuts and document events.
   */
  private attachEventListeners(): void {
    // Keyboard: Escape to close when the chat window is open
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.stateManager.getState().isOpen) {
        this.close();
      }
    };
    document.addEventListener('keydown', this.keyboardHandler);

    // Document visibility change: persist state when tab becomes hidden
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.stateManager.persist();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Removes all event listeners attached during initialization.
   */
  private removeEventListeners(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    this.removeFocusTrap();
  }

  // --------------------------------------------------------------------------
  // Private: Focus Management (WCAG 2.1 AA)
  // --------------------------------------------------------------------------

  /**
   * Activates a focus trap inside the chat dialog window.
   *
   * When the dialog is open, Tab and Shift+Tab cycle focus only within
   * the focusable elements inside the window element (WCAG 2.1.2 — No
   * Keyboard Trap requires that focus can always leave, so we use a cycle
   * rather than a true hard trap, as recommended for modal dialogs).
   *
   * @remarks
   * Elements outside the dialog are not `aria-hidden` here to keep the
   * implementation lightweight and avoid side effects on the host page.
   * Consumers may wish to set `aria-hidden="true"` on the main page
   * content for a stricter ARIA modal pattern.
   */
  private setupFocusTrap(): void {
    if (!this.windowRenderer) return;

    // Remove any previously installed handler first
    this.removeFocusTrap();

    this.focusTrapHandler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (!this.windowRenderer) return;

      const focusable = this.windowRenderer.getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // In Shadow DOM, the active element is on the shadow root, not document.
      const activeEl = this.shadow?.activeElement ?? document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: if focus is on the first element, wrap to last
        if (activeEl === first) {
          event.preventDefault();
          last?.focus();
        }
      } else {
        // Tab: if focus is on the last element, wrap to first
        if (activeEl === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', this.focusTrapHandler);
  }

  /**
   * Removes the active focus trap event listener, if any.
   */
  private removeFocusTrap(): void {
    if (this.focusTrapHandler) {
      document.removeEventListener('keydown', this.focusTrapHandler);
      this.focusTrapHandler = null;
    }
  }

  /**
   * Returns focus to the bubble button after the chat window is closed.
   *
   * This follows the ARIA Authoring Practices Guide pattern for dialogs:
   * when the dialog closes, focus returns to the element that opened it
   * (WCAG 2.4.3 — Focus Order).
   *
   * Only applicable in floating mode (when the bubble is rendered).
   */
  private returnFocusToBubble(): void {
    // The bubble's button element is not directly exposed, so we query for it.
    // In Shadow DOM the element lives inside the shadow root, not the document.
    const searchRoot: ParentNode = this.shadow ?? document;
    const bubbleButton = searchRoot.querySelector<HTMLButtonElement>(
      '.nevent-chatbot-bubble'
    );
    if (bubbleButton) {
      // Small delay to let the window close animation complete
      setTimeout(
        this.errorBoundary.guardTimer(() => {
          bubbleButton.focus();
        }, 'returnFocusToBubble'),
        160
      );
    }
  }

  /**
   * Moves focus to the first quick reply button in the message list.
   *
   * Called after quick replies are rendered so keyboard users do not have to
   * Tab all the way to the quick replies (WCAG 2.4.3 — Focus Order).
   */
  private focusFirstQuickReply(): void {
    // In Shadow DOM the quick reply buttons live inside the shadow root.
    const searchRoot: ParentNode = this.shadow ?? document;
    const firstQR = searchRoot.querySelector<HTMLButtonElement>(
      '.nevent-chatbot-quick-reply-button'
    );
    if (firstQR) {
      firstQR.focus();
    }
  }

  // --------------------------------------------------------------------------
  // Private: State Subscription
  // --------------------------------------------------------------------------

  /**
   * Callback invoked on every state change.
   *
   * Updates the bubble badge count and window loading indicator. Persistence
   * is handled separately via beforeunload and visibility change events to
   * avoid excessive writes on every state mutation.
   *
   * @param state - The new conversation state snapshot
   */
  private onStateChange(state: ConversationState): void {
    // Update badge count on bubble (only when chat is closed)
    if (this.bubbleRenderer && !state.isOpen) {
      this.bubbleRenderer.updateBadge(state.unreadCount);
    }

    // Update window loading overlay
    if (this.windowRenderer) {
      this.windowRenderer.setLoading(state.isLoading);
    }
  }

  // --------------------------------------------------------------------------
  // Private: Error Display
  // --------------------------------------------------------------------------

  /**
   * Shows a temporary inline error message in the chat window body.
   * The error element is automatically removed after 4 seconds.
   *
   * @param message - Localized error message text to display
   */
  private showInlineError(message: string): void {
    if (!this.windowRenderer) return;

    const body = this.windowRenderer.getBody();
    const errorEl = document.createElement('div');
    errorEl.className = 'nevent-chatbot-error-message';
    // role="alert" + aria-live="assertive" interrupts the screen reader
    // immediately to announce error messages (WCAG 4.1.3 — Status Messages).
    errorEl.setAttribute('role', 'alert');
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.setAttribute('aria-atomic', 'true');
    errorEl.textContent = message;

    body.appendChild(errorEl);

    // Auto-remove after 4 seconds
    setTimeout(
      this.errorBoundary.guardTimer(() => {
        errorEl.remove();
      }, 'errorAutoRemove'),
      4000
    );
  }

  // --------------------------------------------------------------------------
  // Private: Rate Limit Recovery
  // --------------------------------------------------------------------------

  /**
   * Schedules re-enabling of the input after a rate-limit cooldown expires.
   *
   * Cancels any previously scheduled recovery timer to prevent stacking.
   * After the cooldown, re-enables the input field and restores focus so
   * the user can resume typing.
   *
   * @param delayMs - Time in milliseconds until the input should be re-enabled
   */
  private scheduleRateLimitRecovery(delayMs: number): void {
    // Cancel any existing recovery timer to prevent stacking
    if (this.rateLimitTimer !== null) {
      clearTimeout(this.rateLimitTimer);
    }

    this.rateLimitTimer = setTimeout(
      this.errorBoundary.guardTimer(() => {
        this.rateLimitTimer = null;

        // Only re-enable if the widget is not loading (another request in-flight)
        // and not in an offline/reconnecting state
        if (!this.stateManager.getState().isLoading) {
          this.inputRenderer?.setDisabled(false);
          this.inputRenderer?.focus();
        }
      }, 'rateLimitRecovery'),
      delayMs
    );
  }

  // --------------------------------------------------------------------------
  // Private: Connection Status UI
  // --------------------------------------------------------------------------

  /**
   * Reacts to connection status changes emitted by {@link ConnectionManager}.
   *
   * Status → UI behaviour mapping:
   * - `'offline'`      — Show offline banner; disable input.
   * - `'reconnecting'` — Show reconnecting banner (with spinner); disable input.
   * - `'disconnected'` — Show offline banner (max retries exhausted); disable input.
   * - `'connected'`    — Show "Reconnected" banner briefly then hide; re-enable input.
   *
   * @param status - New connection status from the ConnectionManager.
   */
  private onConnectionStatusChange(status: ConnectionStatus): void {
    this.logger.debug('Connection status changed', { status });

    switch (status) {
      case 'offline':
        this.showConnectionBanner('offline', this.i18n.t('connectionOffline'));
        this.inputRenderer?.setDisabled(true);
        break;

      case 'reconnecting':
        this.showConnectionBanner(
          'reconnecting',
          this.i18n.t('connectionReconnecting')
        );
        this.inputRenderer?.setDisabled(true);
        break;

      case 'disconnected':
        // Max retries exhausted — treat like offline for the user.
        this.showConnectionBanner('offline', this.i18n.t('connectionOffline'));
        this.inputRenderer?.setDisabled(true);
        break;

      case 'connected':
        // Only show recovery banner when recovering from a degraded state.
        this.showConnectionBanner(
          'connected',
          this.i18n.t('connectionReconnected')
        );
        this.inputRenderer?.setDisabled(false);

        // Auto-hide the "Reconnected" banner after 3 seconds.
        if (this.connectionBannerTimer !== null) {
          clearTimeout(this.connectionBannerTimer);
        }
        this.connectionBannerTimer = setTimeout(
          this.errorBoundary.guardTimer(() => {
            this.hideConnectionBanner();
            this.connectionBannerTimer = null;
          }, 'connectionBannerAutoHide'),
          3000
        );
        break;
    }
  }

  /**
   * Shows the connection status banner with the appropriate modifier class
   * and the provided text content.
   *
   * Any previously active modifier classes are removed before applying the
   * new one so the banner always reflects the latest status.
   *
   * @param variant - The status variant that drives the CSS modifier class.
   * @param message - Localised text to display in the banner.
   */
  private showConnectionBanner(
    variant: 'offline' | 'reconnecting' | 'connected',
    message: string
  ): void {
    if (!this.connectionBanner) return;

    // Clear any pending hide timer when explicitly showing a banner.
    if (variant !== 'connected' && this.connectionBannerTimer !== null) {
      clearTimeout(this.connectionBannerTimer);
      this.connectionBannerTimer = null;
    }

    // Reset all modifier classes.
    this.connectionBanner.className = 'nevent-chatbot-connection-banner';

    // Build content: spinner for 'reconnecting', wifi-off icon for 'offline'.
    let iconHtml = '';
    if (variant === 'reconnecting') {
      iconHtml = `<span class="nevent-chatbot-connection-banner-spinner" aria-hidden="true"></span>`;
    } else if (variant === 'offline') {
      // Simple SVG wifi-off icon (inline, no external dependency).
      iconHtml =
        `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<line x1="1" y1="1" x2="23" y2="23"/>` +
        `<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>` +
        `<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>` +
        `<path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>` +
        `<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>` +
        `<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>` +
        `<line x1="12" y1="20" x2="12.01" y2="20"/>` +
        `</svg>`;
    } else {
      // Connected / recovered: simple checkmark icon.
      iconHtml =
        `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
        `<polyline points="20 6 9 17 4 12"/>` +
        `</svg>`;
    }

    this.connectionBanner.innerHTML = `${iconHtml}<span>${message}</span>`;
    this.connectionBanner.classList.add(
      `nevent-chatbot-connection-banner--${variant}`
    );
  }

  /**
   * Hides the connection status banner by removing all modifier classes and
   * resetting to the default (hidden) state.
   */
  private hideConnectionBanner(): void {
    if (!this.connectionBanner) return;

    this.connectionBanner.className = 'nevent-chatbot-connection-banner';
    this.connectionBanner.innerHTML = '';
  }

  // --------------------------------------------------------------------------
  // Private: Cleanup
  // --------------------------------------------------------------------------

  /**
   * Returns a safe default state snapshot for use when the state manager
   * is unavailable or throws. Ensures `getState()` always returns a valid
   * {@link ConversationState} object.
   *
   * @returns A minimal, safe default ConversationState
   */
  private getDefaultState(): Readonly<ConversationState> {
    return {
      conversation: null,
      isOpen: false,
      isLoading: false,
      isTyping: false,
      error: null,
      unreadCount: 0,
      lastActivity: null,
    };
  }

  /**
   * Cleans up any partially rendered UI elements after a failed init().
   * Called from the catch block of init() to ensure no orphaned DOM elements.
   */
  private cleanupPartialInit(): void {
    // Cancel rate-limit recovery timer if it was started before the failure.
    if (this.rateLimitTimer !== null) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }

    // Destroy connection manager if it was initialised before the failure.
    if (this.connectionStatusUnsubscribe) {
      this.connectionStatusUnsubscribe();
      this.connectionStatusUnsubscribe = null;
    }
    if (this.connectionManager) {
      this.connectionManager.destroy();
      this.connectionManager = null;
    }
    if (this.connectionBannerTimer !== null) {
      clearTimeout(this.connectionBannerTimer);
      this.connectionBannerTimer = null;
    }
    this.connectionBanner = null;

    this.bubbleRenderer?.destroy();
    this.windowRenderer?.destroy();
    this.messageRenderer?.destroy();
    this.inputRenderer?.destroy();
    this.typingRenderer?.destroy();

    this.rootElement?.remove();
    this.rootElement = null;
    this.hostElement?.remove();
    this.hostElement = null;
    this.shadow = null;
    this.cssGenerator.remove();
    this.fontLoader.destroy();

    this.bubbleRenderer = null;
    this.windowRenderer = null;
    this.messageRenderer = null;
    this.inputRenderer = null;
    this.typingRenderer = null;
  }
}
