/**
 * ConversationService - API interaction layer for chatbot conversations
 *
 * Handles all communication with the Nevent chatbot API endpoints:
 * - Loading chatbot configuration
 * - Creating conversation sessions
 * - Sending and receiving messages (both streaming and polling)
 * - Fetching conversation history
 * - Submitting message feedback (thumbs up/down)
 * - Closing conversations
 *
 * Uses the {@link HttpClient} from `@nevent/core` for HTTP requests with
 * automatic authentication headers and JSON parsing. All API errors are
 * mapped to typed {@link ChatbotError} instances for consistent error handling
 * in the calling layer.
 *
 * @remarks
 * API endpoints consumed (aligned with nev-api backend):
 * - `GET  /public/chatbot/{chatbotId}/config?tenantId={tenantId}`  — public config
 * - `POST /public/chatbot/{chatbotId}/conversations`               — create conversation
 * - `POST /chatbot/send-message?eventId={}&source={}`              — send message (polling)
 * - `POST /chatbot/stream?eventId={}&source={}`                    — send message (SSE streaming)
 * - `GET  /chatbot/messages?source={}&eventId={}`                  — guest message history
 * - `POST /chatbot/message/{messageId}/feedback?feedbackType={}`   — message feedback
 * - `POST /public/chatbot/{chatbotId}/conversations/{id}/close`    — close conversation
 *
 * Headers:
 * - `X-Tenant-ID`    — tenant identifier (required for all chatbot endpoints)
 * - `X-User-Context` — Base64-encoded JSON with user geolocation (`{ lat, lng }`)
 * - `Authorization`  — Bearer token from server config or AuthManager
 */

import { HttpClient, Logger } from '@nevent/core';
import type { ApiError } from '@nevent/core';
import type {
  ServerChatbotConfig,
  CreateConversationRequest,
  CreateConversationResponse,
  SendMessageRequest,
  SendMessageResponse,
  BackendMessageRequest,
  GetMessagesResponse,
  GetMessagesParams,
  ChatbotError,
  ChatbotErrorCode,
  FeedbackType,
} from '../types';
import type { AuthManager } from './auth-manager';
import { RateLimiter } from './rate-limiter';
import type { RateLimiterConfig } from './rate-limiter';

/**
 * Maps an API error (or any unknown error) to a typed {@link ChatbotError}.
 *
 * @param error - Raw error from the HttpClient or fetch
 * @param code - The chatbot-specific error code to assign
 * @param fallbackMessage - Human-readable fallback when no message is present
 * @returns A normalized ChatbotError object
 */
function mapApiError(
  error: unknown,
  code: ChatbotErrorCode,
  fallbackMessage: string
): ChatbotError {
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    'status' in error
  ) {
    const apiError = error as ApiError;
    const chatbotError: ChatbotError = {
      code,
      message: apiError.message ?? fallbackMessage,
    };
    // Only assign optional properties when they have an actual value to satisfy
    // exactOptionalPropertyTypes — assigning `undefined` is not allowed.
    if (apiError.status !== undefined) {
      chatbotError.status = apiError.status;
    }
    if (apiError.details !== undefined) {
      chatbotError.details = apiError.details;
    }
    return chatbotError;
  }

  if (error instanceof Error) {
    return {
      code,
      message: error.message,
    };
  }

  return {
    code,
    message: fallbackMessage,
  };
}

/**
 * Service responsible for all HTTP communication with the Nevent chatbot API.
 *
 * This class is the single point of contact between the widget and the backend.
 * It receives an authenticated {@link HttpClient} and handles all endpoint
 * calls, serializing query parameters and mapping errors to the chatbot error
 * domain.
 *
 * @example
 * ```typescript
 * const service = new ConversationService(
 *   'https://api.nevent.es',
 *   'server-token-from-config',
 *   'bot-123',
 *   true // debug
 * );
 *
 * const config = await service.fetchConfig('tenant-456');
 * const { conversationId } = await service.createConversation({ tenantId: 'tenant-456' });
 * const { botMessage } = await service.sendMessage(conversationId, { content: 'Hola!' });
 * ```
 */
export class ConversationService {
  private readonly httpClient: HttpClient;
  private readonly chatbotId: string;
  private readonly logger: Logger;
  /** Stored base API URL for constructing streaming endpoint URLs */
  private readonly apiUrl: string;

  /**
   * Optional AuthManager for authenticated sessions.
   * When provided, auth headers are injected into all requests and 401
   * responses trigger token refresh with automatic retry.
   */
  private readonly authManager: AuthManager | undefined;

  /**
   * Tenant ID sent as `X-Tenant-ID` header to the backend.
   * Required for all chatbot endpoints to identify the tenant.
   */
  private readonly tenantId: string | undefined;

  /**
   * Event ID sent as a query parameter for event-scoped conversations.
   * When provided, the backend scopes the thread to this specific event.
   */
  private readonly eventId: string | undefined;

  /**
   * Session source ID for unauthenticated (guest) users.
   * Sent as a query parameter; the backend uses it to identify the guest.
   */
  private readonly source: string | undefined;

  /**
   * User geolocation context encoded as Base64 JSON.
   * Sent as the `X-User-Context` header to the backend.
   */
  private readonly userContextHeader: string | undefined;

  /**
   * Client-side rate limiter for message sending.
   * Prevents excessive requests before they reach the backend.
   * Created from the optional `rateLimitConfig` constructor parameter.
   */
  private readonly rateLimiter: RateLimiter;

  /**
   * Creates a new ConversationService instance.
   *
   * @param apiUrl - Base URL of the Nevent API (e.g. 'https://api.nevent.es')
   * @param token - Authentication token obtained from the initial config fetch
   * @param chatbotId - Identifier of the chatbot configured in nev-admin-web
   * @param debug - When true, HTTP request/response details are logged to console
   * @param authManager - Optional AuthManager for authenticated user sessions.
   *   When provided, auth headers (e.g. `Authorization: Bearer {jwt}`) are
   *   included in all API requests, and 401 responses trigger automatic token
   *   refresh via the configured `onTokenRefresh` callback.
   * @param options - Additional options for backend context headers/params
   * @param rateLimitConfig - Optional client-side rate limiter configuration.
   *   When provided, overrides the default rate limiter settings (10 req/min,
   *   5s cooldown). Set `maxRequests` to 0 to disable rate limiting entirely.
   */
  constructor(
    apiUrl: string,
    token: string,
    chatbotId: string,
    debug = false,
    authManager?: AuthManager,
    options?: {
      tenantId?: string;
      eventId?: string;
      source?: string;
      userContext?: { lat: number; lng: number };
    },
    rateLimitConfig?: Partial<RateLimiterConfig>,
  ) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    // Disable HTTP-level retries: the chatbot widget should fail fast and
    // surface errors to the UI immediately. Higher-level reconnection logic
    // is handled by ConnectionManager, making HttpClient retries redundant
    // and harmful (they add multi-second latency before errors are reported).
    this.httpClient = new HttpClient(apiUrl, token, { maxRetries: 0 });
    this.chatbotId = chatbotId;
    this.logger = new Logger('[NeventChatbot:ConversationService]', debug);
    this.authManager = authManager;
    this.tenantId = options?.tenantId;
    this.eventId = options?.eventId;
    this.source = options?.source;

    // Pre-encode the user context as Base64 JSON for the X-User-Context header
    if (options?.userContext) {
      try {
        const json = JSON.stringify(options.userContext);
        this.userContextHeader = btoa(json);
      } catch {
        this.logger.warn('Failed to encode userContext — ignoring');
      }
    }

    // Initialize the client-side rate limiter.
    // Consumer can customize limits via rateLimitConfig or rely on defaults.
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  // --------------------------------------------------------------------------
  // Public: Rate Limiter Access
  // --------------------------------------------------------------------------

  /**
   * Checks the client-side rate limiter and throws a typed
   * {@link ChatbotError} with code `RATE_LIMITED` when the limit has been
   * reached.
   *
   * This method is called internally before `sendMessage()` and is also
   * exposed so the widget layer (ChatbotWidget / StreamingClient) can
   * perform a pre-flight check before initiating a request.
   *
   * @throws {ChatbotError} with code `RATE_LIMITED` and `retryAfterMs` in
   *   `details` when the request is rate limited
   */
  checkRateLimit(): void {
    const result = this.rateLimiter.consume();
    if (!result.allowed) {
      const retryAfterMs = result.retryAfterMs ?? this.rateLimiter['config'].cooldownMs;
      const error: ChatbotError = {
        code: 'RATE_LIMITED',
        message: 'Too many messages. Please wait before sending another.',
        details: { retryAfterMs },
      };
      throw error;
    }
  }

  /**
   * Returns whether a message can be sent without hitting the rate limit.
   *
   * This is a read-only check that does NOT consume a token. Use it for
   * UI state (e.g., disabling the send button) without side effects.
   *
   * @returns `true` if a message can be sent, `false` if rate limited
   */
  canSendMessage(): boolean {
    return this.rateLimiter.canProceed();
  }

  /**
   * Returns the number of messages remaining before hitting the rate limit.
   *
   * @returns Number of remaining allowed requests in the current window
   */
  remainingMessages(): number {
    return this.rateLimiter.remaining();
  }

  /**
   * Resets the rate limiter state.
   *
   * Call this when starting a new conversation or when the user has been
   * idle long enough that the rate limit should no longer apply.
   */
  resetRateLimit(): void {
    this.rateLimiter.reset();
  }

  // --------------------------------------------------------------------------
  // Private: Authenticated Request Wrapper
  // --------------------------------------------------------------------------

  /**
   * Executes an HTTP request with optional authentication headers and
   * automatic 401 token refresh + retry.
   *
   * Flow:
   * 1. Merge auth headers (if AuthManager is present) into the request.
   * 2. Execute the request via HttpClient.
   * 3. If 401 is received and AuthManager can refresh the token, retry once.
   * 4. Map errors to {@link ChatbotError} domain.
   *
   * @param method - HTTP method ('GET' or 'POST')
   * @param endpoint - API endpoint path (relative to base URL)
   * @param body - Optional request body for POST requests
   * @param errorCode - ChatbotErrorCode to use when mapping errors
   * @param fallbackMessage - Fallback error message when no message is present
   * @param isRetry - Internal flag to prevent infinite retry loops
   * @returns Promise resolving to the response data of type T
   * @throws {ChatbotError} When the request fails and cannot be recovered
   */
  private async authenticatedRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    body: unknown | undefined,
    errorCode: ChatbotErrorCode,
    fallbackMessage: string,
    isRetry = false,
  ): Promise<T> {
    try {
      // Build extra headers: tenant ID, user context, and auth headers
      const extraHeaders: Record<string, string> = {};

      // Add tenant ID header (required for chatbot endpoints)
      if (this.tenantId) {
        extraHeaders['X-Tenant-ID'] = this.tenantId;
      }

      // Add user geolocation context header
      if (this.userContextHeader) {
        extraHeaders['X-User-Context'] = this.userContextHeader;
      }

      // Merge auth headers (these may override the default Authorization header)
      if (this.authManager) {
        Object.assign(extraHeaders, this.authManager.getAuthHeaders());
      }

      let response;
      if (method === 'GET') {
        response = await this.httpClient.request<T>(endpoint, {
          method: 'GET',
          headers: extraHeaders,
        });
      } else {
        response = await this.httpClient.request<T>(endpoint, {
          method: 'POST',
          body,
          headers: extraHeaders,
        });
      }

      return response.data;
    } catch (error) {
      // Handle 401 with token refresh (only once to prevent infinite loops)
      if (
        !isRetry &&
        this.authManager &&
        error !== null &&
        typeof error === 'object' &&
        'status' in error &&
        (error as ApiError).status === 401
      ) {
        this.logger.debug('Received 401 — attempting token refresh');
        const refreshed = await this.authManager.handleUnauthorized();
        if (refreshed) {
          this.logger.debug('Token refreshed — retrying request');
          return this.authenticatedRequest<T>(
            method,
            endpoint,
            body,
            errorCode,
            fallbackMessage,
            true,
          );
        }
        this.logger.debug('Token refresh failed — propagating 401 error');
      }

      throw error;
    }
  }

  /**
   * Fetches the server-side chatbot configuration for a given tenant.
   *
   * The returned configuration contains theme settings, feature flags,
   * rate limits, and the API token to use for subsequent requests.
   *
   * Endpoint: `GET /public/chatbot/{chatbotId}/config?tenantId={tenantId}`
   *
   * @param tenantId - The tenant identifier for multi-tenancy scoping
   * @returns Promise resolving to the complete server chatbot configuration
   * @throws {ChatbotError} with code `CONFIG_LOAD_FAILED` on any failure
   */
  async fetchConfig(tenantId: string): Promise<ServerChatbotConfig> {
    const endpoint = `/public/chatbot/${this.chatbotId}/config?tenantId=${encodeURIComponent(tenantId)}`;
    this.logger.debug('Fetching chatbot config', { chatbotId: this.chatbotId, tenantId });

    try {
      const data = await this.authenticatedRequest<ServerChatbotConfig>(
        'GET',
        endpoint,
        undefined,
        'CONFIG_LOAD_FAILED',
        'Failed to load chatbot configuration',
      );
      this.logger.debug('Chatbot config loaded successfully');
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch chatbot config', error);
      throw mapApiError(error, 'CONFIG_LOAD_FAILED', 'Failed to load chatbot configuration');
    }
  }

  /**
   * Creates a new conversation session for the end user.
   *
   * A conversation represents a single interaction session between the user
   * and the chatbot. The response includes the conversation ID required for
   * all subsequent message operations.
   *
   * Endpoint: `POST /public/chatbot/{chatbotId}/conversations`
   *
   * @param request - Optional creation parameters (tenantId, visitorId, locale, metadata)
   * @returns Promise resolving to the created conversation identifiers and optional welcome message
   * @throws {ChatbotError} with code `CONVERSATION_CREATE_FAILED` on any failure
   */
  async createConversation(
    request?: CreateConversationRequest
  ): Promise<CreateConversationResponse> {
    const endpoint = `/public/chatbot/${this.chatbotId}/conversations`;
    this.logger.debug('Creating conversation', { chatbotId: this.chatbotId, request });

    try {
      // Merge user identity from AuthManager into the request body
      // so the API knows who the authenticated user is.
      const userIdentity = this.authManager?.getUserIdentity();
      const body: Record<string, unknown> = { ...(request ?? {}) };
      if (userIdentity) {
        body.userIdentity = userIdentity;
      }

      const data = await this.authenticatedRequest<CreateConversationResponse>(
        'POST',
        endpoint,
        body,
        'CONVERSATION_CREATE_FAILED',
        'Failed to create conversation',
      );
      this.logger.debug('Conversation created', { conversationId: data.conversationId });
      return data;
    } catch (error) {
      this.logger.error('Failed to create conversation', error);
      throw mapApiError(error, 'CONVERSATION_CREATE_FAILED', 'Failed to create conversation');
    }
  }

  /**
   * Sends a user message via the non-streaming (polling) endpoint and returns
   * the bot reply.
   *
   * The response contains both the persisted user message and the chatbot's
   * generated response. If the bot is rate-limited, a `RATE_LIMIT_EXCEEDED`
   * error is thrown so the UI can surface a helpful message to the user.
   *
   * Real backend endpoint: `POST /chatbot/send-message?eventId={}&source={}`
   * with `X-Tenant-ID` and `X-User-Context` headers.
   *
   * The backend expects a `MessageRequest` body: `{ message: string, ticketId?: string }`.
   * The SDK translates from the higher-level `SendMessageRequest` format.
   *
   * @param conversationId - The active conversation identifier (used for state tracking;
   *   the backend resolves threads via userId+tenantId+eventId, not conversationId)
   * @param request - Message content, type, and optional metadata
   * @returns Promise resolving to the user message and bot response
   * @throws {ChatbotError} with code `RATE_LIMIT_EXCEEDED` when HTTP 429 is received
   * @throws {ChatbotError} with code `MESSAGE_SEND_FAILED` on other failures
   */
  async sendMessage(
    conversationId: string,
    request: SendMessageRequest
  ): Promise<SendMessageResponse> {
    // Build query params for backend context
    const queryParams = this.buildQueryString({
      eventId: this.eventId,
      source: this.source,
    });

    const endpoint = `/chatbot/send-message${queryParams}`;
    this.logger.debug('Sending message', {
      chatbotId: this.chatbotId,
      conversationId,
      contentLength: request.content.length,
    });

    // Translate SDK request format to backend MessageRequest DTO
    const backendBody: BackendMessageRequest = {
      message: request.content,
    };

    // Include ticketId from request metadata if provided
    if (request.metadata?.ticketId && typeof request.metadata.ticketId === 'string') {
      backendBody.ticketId = request.metadata.ticketId;
    }

    try {
      const data = await this.authenticatedRequest<SendMessageResponse>(
        'POST',
        endpoint,
        backendBody,
        'MESSAGE_SEND_FAILED',
        'Failed to send message',
      );
      this.logger.debug('Message sent and bot response received', {
        userMessageId: data.userMessage.id,
        botMessageId: data.botMessage.id,
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to send message', error);

      // Rate limit deserves a dedicated error code for UI-level handling
      if (
        error !== null &&
        typeof error === 'object' &&
        'status' in error &&
        (error as ApiError).status === 429
      ) {
        throw mapApiError(error, 'RATE_LIMIT_EXCEEDED', 'You are sending messages too quickly. Please wait a moment.');
      }

      throw mapApiError(error, 'MESSAGE_SEND_FAILED', 'Failed to send message');
    }
  }

  /**
   * Retrieves message history for a conversation (guest access).
   *
   * Real backend endpoint: `GET /chatbot/messages?source={source}&eventId={eventId}`
   * with `X-Tenant-ID` header.
   *
   * The backend resolves the conversation thread via the `source` (guest user
   * identifier) and `eventId` parameters, combined with the tenant ID from the
   * header. For authenticated users, the backend uses the JWT to identify the
   * user and locate the thread.
   *
   * Returns messages in chronological order by default (`order: 'asc'`).
   * Use the `cursor` from a previous response to fetch the next page.
   *
   * @param conversationId - The conversation ID (used for logging; the backend
   *   resolves threads via source+eventId, not conversationId)
   * @param params - Optional pagination parameters (limit, cursor, order)
   * @returns Promise resolving to messages array with pagination metadata
   * @throws {ChatbotError} with code `MESSAGE_LOAD_FAILED` on any failure
   */
  async getMessages(
    conversationId: string,
    params?: GetMessagesParams
  ): Promise<GetMessagesResponse> {
    // Build query params combining backend context (source, eventId) with
    // pagination params (limit, cursor, order)
    const queryParams = this.buildQueryString({
      source: this.source,
      eventId: this.eventId,
      limit: params?.limit?.toString(),
      cursor: params?.cursor,
      order: params?.order,
    });

    const endpoint = `/chatbot/messages${queryParams}`;
    this.logger.debug('Fetching message history', { chatbotId: this.chatbotId, conversationId, params });

    try {
      const data = await this.authenticatedRequest<GetMessagesResponse>(
        'GET',
        endpoint,
        undefined,
        'MESSAGE_LOAD_FAILED',
        'Failed to load message history',
      );
      this.logger.debug('Messages loaded', {
        count: data.messages.length,
        hasMore: data.hasMore,
      });
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch messages', error);
      throw mapApiError(error, 'MESSAGE_LOAD_FAILED', 'Failed to load message history');
    }
  }

  /**
   * Closes an active conversation, signaling to the server that the session has ended.
   *
   * After a conversation is closed, no further messages can be sent to it.
   * The UI should start a new conversation if the user wants to continue chatting.
   *
   * Endpoint: `POST /public/chatbot/{chatbotId}/conversations/{conversationId}/close`
   *
   * @param conversationId - The conversation to close
   * @returns Promise that resolves when the conversation has been successfully closed
   * @throws {ChatbotError} with code `API_ERROR` if the close request fails
   */
  async closeConversation(conversationId: string): Promise<void> {
    const endpoint = `/public/chatbot/${this.chatbotId}/conversations/${conversationId}/close`;
    this.logger.debug('Closing conversation', { chatbotId: this.chatbotId, conversationId });

    try {
      await this.authenticatedRequest<void>(
        'POST',
        endpoint,
        {},
        'API_ERROR',
        'Failed to close conversation',
      );
      this.logger.debug('Conversation closed successfully', { conversationId });
    } catch (error) {
      // Non-fatal: log the error but do not re-throw — a failed close should
      // not prevent the UI from resetting or the user from starting a new conversation.
      this.logger.error('Failed to close conversation (non-fatal)', error);
    }
  }

  /**
   * Returns the streaming endpoint URL for the chatbot.
   *
   * The real backend endpoint is `POST /chatbot/stream` with optional query
   * parameters for `eventId` and `source`. The backend resolves the conversation
   * thread via userId+tenantId+eventId, not via a conversationId in the URL.
   *
   * This URL is consumed by {@link StreamingClient} to initiate SSE streams.
   * The method is exposed here (rather than in StreamingClient) so that callers
   * can consistently derive URLs from a single source of truth.
   *
   * @param _conversationId - The conversation ID (used for abort tracking in
   *   StreamingClient; not included in the URL since the backend resolves
   *   threads server-side)
   * @returns Full streaming endpoint URL string
   *
   * @example
   * ```typescript
   * const streamUrl = service.getStreamingUrl('conv-123');
   * // 'https://api.nevent.es/chatbot/stream?eventId=evt-1&source=src-uuid'
   * ```
   */
  getStreamingUrl(_conversationId: string): string {
    const params = new URLSearchParams();
    if (this.eventId) {
      params.set('eventId', this.eventId);
    }
    if (this.source) {
      params.set('source', this.source);
    }

    const queryString = params.toString();
    const base = `${this.apiUrl}/chatbot/stream`;
    return queryString ? `${base}?${queryString}` : base;
  }

  /**
   * Submits feedback for a specific bot message (thumbs up/down).
   *
   * Real backend endpoint:
   * `POST /chatbot/message/{messageId}/feedback?feedbackType={POSITIVE|NEGATIVE}`
   * with `X-Tenant-ID` header. Requires authentication (USER, ADMIN, or SUPERADMIN).
   *
   * @param messageId - The ID of the bot message to provide feedback on
   * @param feedbackType - The type of feedback: 'POSITIVE' or 'NEGATIVE'
   * @returns Promise that resolves when feedback has been submitted
   * @throws {ChatbotError} with code `FEEDBACK_FAILED` if the request fails
   *
   * @example
   * ```typescript
   * await service.sendFeedback('msg-123', 'POSITIVE');
   * ```
   */
  async sendFeedback(messageId: string, feedbackType: FeedbackType): Promise<void> {
    const endpoint = `/chatbot/message/${encodeURIComponent(messageId)}/feedback?feedbackType=${encodeURIComponent(feedbackType)}`;
    this.logger.debug('Sending message feedback', { messageId, feedbackType });

    try {
      await this.authenticatedRequest<void>(
        'POST',
        endpoint,
        {},
        'FEEDBACK_FAILED',
        'Failed to submit feedback',
      );
      this.logger.debug('Feedback submitted successfully', { messageId, feedbackType });
    } catch (error) {
      this.logger.error('Failed to submit feedback', error);
      throw mapApiError(error, 'FEEDBACK_FAILED', 'Failed to submit message feedback');
    }
  }

  /**
   * Builds a URL query string from a record of optional key-value pairs.
   * Entries with undefined or empty values are omitted.
   *
   * @param params - Key-value map of query parameters
   * @returns URL query string including leading '?' or empty string when no params
   */
  private buildQueryString(params: Record<string, string | undefined>): string {
    const entries = Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== ''
    ) as [string, string][];

    if (entries.length === 0) {
      return '';
    }

    const searchParams = new URLSearchParams(entries);
    return `?${searchParams.toString()}`;
  }
}
