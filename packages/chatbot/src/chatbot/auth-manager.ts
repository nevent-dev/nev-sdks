/**
 * AuthManager - Authentication lifecycle management for chatbot sessions
 *
 * Manages authentication state for the chatbot widget, supporting three modes:
 *
 * - **Public mode** (default): Uses the `X-API-Key` header from the server config
 *   token. This is the existing behaviour and requires no additional configuration.
 *
 * - **JWT mode**: Adds an `Authorization: Bearer {token}` header to all API
 *   requests. Designed for enterprise integrations where the chatbot interacts
 *   with identified users (e.g., ticket holders, logged-in attendees).
 *
 * - **Custom mode**: Uses a caller-defined header name and prefix for environments
 *   that do not follow the Bearer token convention.
 *
 * Token refresh:
 * When the API returns HTTP 401 (Unauthorized), the AuthManager can call a
 * user-provided `onTokenRefresh` callback to obtain a new token and retry the
 * request transparently. Concurrent 401 responses are deduplicated so only one
 * refresh is in-flight at a time.
 *
 * User identity:
 * An optional {@link UserIdentity} payload can be attached to conversation
 * creation requests so the chatbot API can personalise responses (e.g., greet
 * the user by name, pull up their ticket history).
 *
 * @remarks
 * This class is intentionally stateless with respect to the HTTP layer. It does
 * NOT make requests itself; instead, it provides headers and token refresh logic
 * that the {@link ConversationService} and {@link StreamingClient} consume.
 */

import { Logger } from '@nevent/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Authentication mode for the chatbot widget.
 *
 * - `'public'` - Uses `X-API-Key` header only (default, existing behaviour)
 * - `'jwt'`    - Adds `Authorization: Bearer {token}` header
 * - `'custom'` - Uses a caller-defined header name and prefix
 */
export type AuthMode = 'public' | 'jwt' | 'custom';

/**
 * Authentication configuration for identified user sessions.
 *
 * When provided in {@link ChatbotConfig.auth}, the widget switches from
 * anonymous (public) mode to authenticated mode, enabling user-specific
 * features such as conversation history, personalised responses, and
 * identity-aware interactions.
 *
 * @example
 * ```typescript
 * // JWT authentication with token refresh
 * const auth: AuthConfig = {
 *   mode: 'jwt',
 *   token: 'eyJhbGciOiJIUzI1NiIs...',
 *   userIdentity: {
 *     userId: 'user_456',
 *     name: 'Jane Doe',
 *     email: 'jane@example.com',
 *   },
 *   onTokenRefresh: async () => {
 *     const res = await fetch('/api/auth/refresh');
 *     const { token } = await res.json();
 *     return token;
 *   },
 * };
 * ```
 */
export interface AuthConfig {
  /** Authentication mode. Default: 'public' */
  mode: AuthMode;

  /** JWT token for authenticated sessions (required for 'jwt' and 'custom' modes) */
  token?: string;

  /**
   * Custom auth header name.
   * Only used in 'custom' mode. Default: 'Authorization'
   */
  headerName?: string;

  /**
   * Custom auth header value prefix.
   * Only used in 'custom' mode. Default: 'Bearer'
   */
  headerPrefix?: string;

  /**
   * Token refresh callback invoked when a 401 response is received.
   * Must return a fresh token string. If the callback throws or returns
   * an empty string, the refresh is considered failed and the original
   * 401 error is propagated to the caller.
   */
  onTokenRefresh?: () => Promise<string>;

  /**
   * User identity for the chatbot session.
   * Sent to the API during conversation creation so the bot can
   * personalise responses (e.g., greet user by name, show ticket info).
   */
  userIdentity?: UserIdentity;
}

/**
 * Identity of the authenticated user interacting with the chatbot.
 *
 * All fields except `userId` are optional. The API uses `userId` as the
 * primary identifier; other fields enhance the chatbot's personalisation
 * capabilities.
 */
export interface UserIdentity {
  /** User ID in the client's system (required, unique identifier) */
  userId: string;

  /** Display name shown in the chatbot UI and used for personalised greetings */
  name?: string;

  /** Email address for identity correlation and notifications */
  email?: string;

  /** Avatar URL displayed alongside user messages */
  avatar?: string;

  /** Custom metadata key-value pairs (e.g., plan, role, company) */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AuthManager Class
// ============================================================================

/**
 * Manages authentication state and provides auth headers for API requests.
 *
 * Lifecycle:
 * 1. Constructed with an {@link AuthConfig} (or defaults to public mode)
 * 2. {@link getAuthHeaders} called by ConversationService/StreamingClient before requests
 * 3. {@link handleUnauthorized} called on 401 responses to attempt token refresh
 * 4. {@link destroy} called when the widget is torn down
 *
 * @example
 * ```typescript
 * const manager = new AuthManager({
 *   mode: 'jwt',
 *   token: 'initial-jwt-token',
 *   onTokenRefresh: async () => fetchNewToken(),
 * });
 *
 * // Get headers for a request
 * const headers = manager.getAuthHeaders();
 * // { Authorization: 'Bearer initial-jwt-token' }
 *
 * // Handle a 401 response
 * const refreshed = await manager.handleUnauthorized();
 * // true if token was refreshed, false otherwise
 *
 * // Update token at runtime (e.g., after SPA login)
 * manager.setToken('new-jwt-token');
 *
 * // Cleanup
 * manager.destroy();
 * ```
 */
export class AuthManager {
  /** Current authentication token (null when in public mode or cleared) */
  private token: string | null = null;

  /**
   * In-flight token refresh promise.
   * Used to deduplicate concurrent refresh calls so only one
   * `onTokenRefresh()` invocation runs at a time.
   */
  private refreshPromise: Promise<string> | null = null;

  /** Logger for debug output and error reporting */
  private readonly logger: Logger;

  /** Frozen copy of the auth configuration */
  private readonly config: AuthConfig;

  /**
   * Creates a new AuthManager instance.
   *
   * @param config - Authentication configuration provided by the host application
   * @param debug - When true, authentication lifecycle events are logged to console
   */
  constructor(config: AuthConfig, debug = false) {
    this.config = config;
    this.logger = new Logger('[NeventChatbot:AuthManager]', debug);

    // Set initial token from config (if provided)
    if (config.token) {
      this.token = config.token;
    }

    this.logger.debug('AuthManager initialized', {
      mode: config.mode,
      hasToken: this.token !== null,
      hasRefreshCallback: typeof config.onTokenRefresh === 'function',
      hasUserIdentity: config.userIdentity !== undefined,
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Returns authentication headers to include in API requests.
   *
   * Header behaviour by mode:
   * - `'public'`  - Returns an empty object (public mode relies on `X-API-Key` set by HttpClient)
   * - `'jwt'`     - Returns `{ Authorization: 'Bearer {token}' }`
   * - `'custom'`  - Returns `{ {headerName}: '{headerPrefix} {token}' }`
   *
   * When the token is null (not yet set or cleared), returns an empty object
   * regardless of mode, allowing the request to proceed without auth headers.
   *
   * @returns Record of header name/value pairs to merge into the request headers
   */
  getAuthHeaders(): Record<string, string> {
    if (this.config.mode === 'public' || this.token === null) {
      return {};
    }

    if (this.config.mode === 'jwt') {
      return { Authorization: `Bearer ${this.token}` };
    }

    // Custom mode
    const headerName = this.config.headerName ?? 'Authorization';
    const headerPrefix = this.config.headerPrefix ?? 'Bearer';
    return { [headerName]: `${headerPrefix} ${this.token}` };
  }

  /**
   * Sets or updates the authentication token at runtime.
   *
   * Common use case: SPA login flow where the token is obtained after the
   * widget has already been initialized.
   *
   * @param token - The new JWT or authentication token string
   */
  setToken(token: string): void {
    this.token = token;
    this.logger.debug('Token updated');
  }

  /**
   * Clears the current authentication token.
   *
   * After calling this method, subsequent requests will not include
   * authentication headers (effectively reverting to unauthenticated mode
   * for the current session).
   *
   * Common use case: user logout in a SPA.
   */
  clearToken(): void {
    this.token = null;
    this.refreshPromise = null;
    this.logger.debug('Token cleared');
  }

  /**
   * Handles a 401 Unauthorized response by attempting to refresh the token.
   *
   * If an `onTokenRefresh` callback was provided in the configuration, it is
   * called to obtain a new token. The new token is stored and the method
   * returns `true`, signalling the caller to retry the original request.
   *
   * Concurrent calls are deduplicated: if a refresh is already in progress,
   * subsequent calls await the same promise rather than triggering multiple
   * refresh requests.
   *
   * @returns `true` if the token was refreshed successfully, `false` if
   *          refresh is not available or failed
   */
  async handleUnauthorized(): Promise<boolean> {
    // No refresh callback configured — cannot recover
    if (typeof this.config.onTokenRefresh !== 'function') {
      this.logger.debug('No onTokenRefresh callback — cannot refresh token');
      return false;
    }

    // Public mode does not use auth tokens — nothing to refresh
    if (this.config.mode === 'public') {
      this.logger.debug('Public mode — token refresh not applicable');
      return false;
    }

    // Deduplicate concurrent refresh calls
    if (this.refreshPromise !== null) {
      this.logger.debug('Token refresh already in progress — awaiting existing promise');
      try {
        const newToken = await this.refreshPromise;
        return newToken.length > 0;
      } catch {
        return false;
      }
    }

    this.logger.debug('Initiating token refresh');

    // Store the promise so concurrent callers can await the same one
    this.refreshPromise = this.config.onTokenRefresh();

    try {
      const newToken = await this.refreshPromise;

      if (!newToken || newToken.trim().length === 0) {
        this.logger.warn('Token refresh returned empty token');
        return false;
      }

      this.token = newToken;
      this.logger.debug('Token refreshed successfully');
      return true;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      return false;
    } finally {
      // Clear the in-flight promise so future 401s can trigger a new refresh
      this.refreshPromise = null;
    }
  }

  /**
   * Returns the current authentication mode.
   *
   * @returns The configured {@link AuthMode}
   */
  getMode(): AuthMode {
    return this.config.mode;
  }

  /**
   * Checks whether the manager currently holds a valid token.
   *
   * In public mode, always returns `false` (no token-based auth).
   * In jwt/custom modes, returns `true` when a token is present.
   *
   * @returns `true` when authenticated (token is set and mode is not public)
   */
  isAuthenticated(): boolean {
    if (this.config.mode === 'public') {
      return false;
    }
    return this.token !== null && this.token.length > 0;
  }

  /**
   * Returns the user identity if configured, or `null` otherwise.
   *
   * @returns The {@link UserIdentity} payload or `null`
   */
  getUserIdentity(): UserIdentity | null {
    return this.config.userIdentity ?? null;
  }

  /**
   * Destroys the AuthManager and clears all sensitive state.
   *
   * After calling this method, the instance should not be reused.
   * All references to tokens and refresh promises are cleared.
   */
  destroy(): void {
    this.token = null;
    this.refreshPromise = null;
    this.logger.debug('AuthManager destroyed');
  }
}
