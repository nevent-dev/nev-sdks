/**
 * StreamingClient - SSE (Server-Sent Events) streaming for real-time bot responses
 *
 * Implements a streaming message client that uses the Fetch API + ReadableStream
 * to receive bot responses token-by-token from the Nevent chatbot API.
 *
 * Why not EventSource?
 * - `EventSource` only supports GET requests and cannot send custom headers (e.g.
 *   Authorization). The Nevent API requires POST with a JSON body and a Bearer
 *   token, so we parse the SSE stream manually from the `fetch` response body.
 *
 * SSE wire format (per https://html.spec.whatwg.org/multipage/server-sent-events.html):
 * ```
 * event: message.delta\n
 * data: {"content":"Hello"}\n
 * \n
 * event: message.complete\n
 * data: {"messageId":"msg-1","content":"Hello world"}\n
 * \n
 * ```
 *
 * @remarks
 * Each active stream is associated with an `AbortController` keyed by
 * `conversationId`. Call `abort(conversationId)` to cancel a specific stream
 * or `abortAll()` to cancel all active streams (e.g. on widget destroy).
 *
 * Retry logic is intentionally NOT implemented inside StreamingClient — the
 * ConnectionManager layer is responsible for reconnection decisions.
 */

import { Logger } from '@nevent/core';
import type {
  ChatMessage,
  ChatbotError,
  QuickReply,
  RichContent,
  BackendStreamEvent,
  BackendMessageRequest,
  TypingStatusEvent,
} from '../types';
import type { AuthManager } from './auth-manager';

// ============================================================================
// SSE Event Types
// ============================================================================

/**
 * Event types emitted by the chatbot streaming API via SSE.
 *
 * The SDK supports two SSE event naming conventions:
 *
 * **Backend (nev-api) event names** (lowercase of StreamingChatEvent.EventType):
 * - `token`            — A text token chunk from the AI response
 * - `thinking`         — AI is processing/thinking (for models with thinking capabilities)
 * - `done`             — Stream completed successfully
 * - `error`            — Error occurred during streaming
 * - `tool_call_start`  — Function calling started (reserved for future use)
 * - `tool_call_result` — Function calling completed (reserved for future use)
 *
 * **Legacy SDK event names** (kept for backward compatibility with custom endpoints):
 * - `message.start`    — Bot has begun composing a response
 * - `message.delta`    — A token or text chunk has arrived
 * - `message.complete` — The full response is available
 * - `message.error`    — The server encountered an error
 * - `typing.start`     — Bot typing indicator should be shown
 * - `typing.stop`      — Bot typing indicator should be hidden
 * - `quick_replies`    — Quick reply suggestions for the user's next turn
 */
export type StreamEventType =
  // Backend (nev-api) SSE event names
  | 'token'
  | 'thinking'
  | 'done'
  | 'error'
  | 'tool_call_start'
  | 'tool_call_result'
  // Legacy SDK event names (backward compatibility)
  | 'message.start'
  | 'message.delta'
  | 'message.complete'
  | 'message.error'
  | 'typing.start'
  | 'typing.stop'
  | 'quick_replies';

/**
 * Payload carried by a single SSE event from the streaming API.
 *
 * All fields are optional because only relevant fields are included
 * per event type:
 * - `message.start`    — `messageId`
 * - `message.delta`    — `content` (the new token/chunk)
 * - `message.complete` — `messageId`, `content`, `richContent`, `metadata`
 * - `message.error`    — `error`
 * - `quick_replies`    — `quickReplies`
 * - `typing.start/stop` — no payload
 */
export interface StreamEventData {
  /** Unique identifier for the bot message being streamed */
  messageId?: string;
  /**
   * Text content.
   * - For `message.delta`: the incremental token/chunk to append.
   * - For `message.complete`: the full canonical message text.
   */
  content?: string;
  /** Optional rich content payload for `message.complete` events */
  richContent?: RichContent;
  /** Quick reply suggestions for `quick_replies` events */
  quickReplies?: QuickReply[];
  /** Error details for `message.error` events */
  error?: { code: string; message: string };
  /** Arbitrary metadata for `message.complete` events */
  metadata?: Record<string, unknown>;
}

/**
 * A fully parsed SSE event from the streaming API.
 */
export interface StreamEvent {
  /** The semantic event type */
  type: StreamEventType;
  /** Structured payload associated with this event */
  data: StreamEventData;
}

// ============================================================================
// Streaming Options
// ============================================================================

/**
 * Callbacks and configuration for a streaming message operation.
 *
 * All callbacks are invoked synchronously from the read loop, so heavy
 * DOM work should be deferred with `requestAnimationFrame` if needed.
 *
 * @example
 * ```typescript
 * const options: StreamingOptions = {
 *   onDelta: (token, accumulated) => {
 *     renderer.updateMessageContent(msgId, accumulated, true);
 *   },
 *   onComplete: (message) => {
 *     renderer.finalizeStreamingMessage(message.id, message.content);
 *     stateManager.addMessage(message);
 *   },
 *   onError: (error) => {
 *     renderer.updateMessageStatus(msgId, 'error');
 *   },
 * };
 * ```
 */
export interface StreamingOptions {
  /**
   * Called for every `message.delta` event.
   *
   * @param token - The new token or chunk received in this event
   * @param accumulated - The full accumulated text so far (token prepended)
   */
  onDelta: (token: string, accumulated: string) => void;

  /**
   * Called when the stream terminates with a `message.complete` event.
   * The `message` object is a fully formed {@link ChatMessage} ready to be
   * persisted in state.
   *
   * @param message - The complete bot {@link ChatMessage}
   */
  onComplete: (message: ChatMessage) => void;

  /**
   * Called when the stream terminates with a `message.error` event or when
   * a network/parse error occurs.
   *
   * @param error - A typed {@link ChatbotError} describing the failure
   */
  onError: (error: ChatbotError) => void;

  /**
   * Called when a `typing.start` SSE event is received.
   * Use this to show the typing indicator before content starts flowing.
   */
  onTypingStart?: () => void;

  /**
   * Called when a `typing.stop` SSE event is received.
   * Use this to hide the typing indicator once content starts flowing.
   */
  onTypingStop?: () => void;

  /**
   * Called when a `quick_replies` SSE event is received.
   *
   * @param replies - Array of quick reply options to render
   */
  onQuickReplies?: (replies: QuickReply[]) => void;

  /**
   * Called when a `thinking` SSE event is received from the backend.
   *
   * The THINKING event indicates the AI model is processing the request,
   * particularly relevant for models with extended thinking capabilities
   * (e.g., Gemini 2.5 Flash Thinking, Claude with extended thinking).
   *
   * Use this to show a "Processing..." indicator distinct from the typing
   * indicator, signaling that the model is reasoning rather than generating.
   */
  onThinking?: () => void;

  /**
   * Called when a `tool_call_start` SSE event is received from the backend.
   *
   * Indicates that the AI model has started calling an external function/tool.
   * Reserved for future use — the backend does not yet emit these events
   * in production, but the SDK is prepared to handle them.
   *
   * @param metadata - Tool call metadata (tool name, parameters, etc.)
   */
  onToolCallStart?: (metadata: unknown) => void;

  /**
   * Called when a `tool_call_result` SSE event is received from the backend.
   *
   * Indicates that an external function/tool call has completed.
   * Reserved for future use.
   *
   * @param content - The result content from the tool call (if any)
   * @param metadata - Tool call result metadata
   */
  onToolCallResult?: (content: string | null | undefined, metadata: unknown) => void;

  /**
   * Called when a `TYPING_START` SSE event is received from the backend,
   * indicating that a live agent has started typing.
   *
   * @param event - The typing status event with agent identity
   */
  onAgentTypingStart?: (event: TypingStatusEvent) => void;

  /**
   * Called when a `TYPING_STOP` SSE event is received from the backend,
   * indicating that a live agent has stopped typing.
   *
   * @param event - The typing status event with agent identity
   */
  onAgentTypingStop?: (event: TypingStatusEvent) => void;

  /**
   * Optional AbortSignal from the consumer.
   * When this signal is aborted the stream is cancelled immediately and
   * `onError` is NOT called (the abort is considered intentional).
   */
  signal?: AbortSignal;
}

// ============================================================================
// StreamingClient Class
// ============================================================================

/**
 * SSE streaming client for real-time bot response rendering.
 *
 * Manages one `AbortController` per active stream, keyed by `conversationId`.
 * A single conversation can only have one active stream at a time — starting a
 * new stream for the same conversation automatically aborts the previous one.
 *
 * @example
 * ```typescript
 * const client = new StreamingClient(
 *   'https://api.nevent.es',
 *   'server-token',
 *   'bot-123',
 *   true // debug
 * );
 *
 * await client.sendMessageStreaming('conv-456', { content: 'Hello!' }, {
 *   onDelta: (token, acc) => console.log('Token:', token, 'Total:', acc),
 *   onComplete: (msg) => console.log('Done:', msg.content),
 *   onError: (err) => console.error('Stream error:', err),
 * });
 *
 * // To cancel mid-stream:
 * client.abort('conv-456');
 *
 * // Cleanup on widget teardown:
 * client.destroy();
 * ```
 */
export class StreamingClient {
  /**
   * Map of active stream abort controllers, keyed by conversationId.
   * Allows fine-grained cancellation of individual conversation streams.
   */
  private activeStreams: Map<string, AbortController> = new Map();

  /** Logger for debug output and error reporting */
  private readonly logger: Logger;

  /** Full streaming endpoint URL template base */
  private readonly apiUrl: string;

  /** Bearer token for Authorization header */
  private readonly token: string;

  /**
   * Optional AuthManager for authenticated sessions.
   * When provided, auth headers from the manager are merged into SSE
   * request headers, enabling token-based authentication for streaming.
   */
  private readonly authManager: AuthManager | undefined;

  /**
   * Tenant ID sent as `X-Tenant-ID` header to the backend.
   * Required for unauthenticated users; optional for authenticated users.
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
   * Creates a new StreamingClient.
   *
   * @param apiUrl - Base URL of the Nevent API (e.g. 'https://api.nevent.es')
   * @param token - Bearer token obtained from the server config endpoint
   * @param chatbotId - The chatbot identifier from platform configuration
   * @param debug - When true, detailed SSE parsing events are logged to console
   * @param authManager - Optional AuthManager for authenticated user sessions.
   *   When provided, auth headers (e.g. `Authorization: Bearer {jwt}`) are
   *   included in all SSE streaming requests.
   * @param options - Additional options for backend context headers
   */
  constructor(
    apiUrl: string,
    token: string,
    _chatbotId: string,
    debug = false,
    authManager?: AuthManager,
    options?: {
      tenantId?: string;
      eventId?: string;
      source?: string;
      userContext?: { lat: number; lng: number };
    },
  ) {
    this.apiUrl = apiUrl.replace(/\/$/, ''); // Strip trailing slash
    this.token = token;
    // Note: chatbotId is accepted for API compatibility but not stored.
    // The real backend endpoint /chatbot/stream does not include chatbotId
    // in the URL — threads are resolved server-side via userId+tenantId+eventId.
    this.logger = new Logger('[NeventChatbot:StreamingClient]', debug);
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
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Sends a message and streams the bot response via SSE.
   *
   * Establishes a POST request to the streaming endpoint with
   * `Accept: text/event-stream` and reads the response body as a
   * `ReadableStream`. Each SSE event is parsed from the chunked response
   * and dispatched to the appropriate callback in `options`.
   *
   * If a stream for `conversationId` is already active, it is aborted before
   * starting the new one (prevents multiple concurrent streams per conversation).
   *
   * @param conversationId - The active conversation session identifier
   * @param request - The user message content and optional metadata
   * @param options - Callbacks for streaming lifecycle events
   * @returns Promise that resolves when the stream is complete or aborted
   *
   * @throws Never — all errors are reported via `options.onError`
   */
  async sendMessageStreaming(
    conversationId: string,
    request: { content: string; type?: string; metadata?: Record<string, unknown> },
    options: StreamingOptions,
  ): Promise<void> {
    // Abort any existing stream for this conversation
    this.abort(conversationId);

    const controller = new AbortController();
    this.activeStreams.set(conversationId, controller);

    // Combine consumer signal with our own AbortController signal
    const signal = this.combineSignals(controller.signal, options.signal);

    const url = this.buildStreamingUrl(conversationId);

    this.logger.debug('Starting SSE stream', {
      conversationId,
      url,
      contentLength: request.content.length,
    });

    try {
      // Build request headers — start with base headers, then merge auth headers.
      // The AuthManager headers take precedence over the default Authorization header,
      // allowing JWT/custom tokens to override the server config token.
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${this.token}`,
      };

      // Add tenant ID header (required for unauthenticated, useful for all)
      if (this.tenantId) {
        headers['X-Tenant-ID'] = this.tenantId;
      }

      // Add user geolocation context header
      if (this.userContextHeader) {
        headers['X-User-Context'] = this.userContextHeader;
      }

      if (this.authManager) {
        Object.assign(headers, this.authManager.getAuthHeaders());
      }

      // Build the request body matching the backend MessageRequest DTO.
      // The backend expects { message: string, ticketId?: string } for the
      // streaming endpoint. We translate from the SDK's { content } format.
      const backendBody: BackendMessageRequest = {
        message: request.content,
      };

      // Include ticketId from request metadata if provided
      if (request.metadata?.ticketId && typeof request.metadata.ticketId === 'string') {
        backendBody.ticketId = request.metadata.ticketId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(backendBody),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.logger.error('Streaming endpoint returned non-OK status', {
          status: response.status,
          body: errorText,
        });
        options.onError({
          code: response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'MESSAGE_SEND_FAILED',
          message: `Streaming request failed with HTTP ${response.status}`,
          status: response.status,
        });
        return;
      }

      if (!response.body) {
        this.logger.error('Streaming response has no body');
        options.onError({
          code: 'MESSAGE_SEND_FAILED',
          message: 'Streaming response has no body',
        });
        return;
      }

      const reader = response.body.getReader();

      try {
        await this.parseSSEStream(reader, conversationId, options);
      } finally {
        // Always release the reader lock even if parsing throws
        reader.releaseLock();
      }
    } catch (error) {
      // AbortError is intentional — do not call onError
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logger.debug('Stream aborted', { conversationId });
        return;
      }

      this.logger.error('Stream connection error', error);
      options.onError({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown streaming error',
      });
    } finally {
      this.activeStreams.delete(conversationId);
    }
  }

  /**
   * Aborts the active stream for a specific conversation.
   *
   * The stream's fetch is cancelled immediately. The `onError` callback is NOT
   * called — the abort is treated as an intentional user/system action.
   *
   * @param conversationId - The conversation whose stream should be aborted
   */
  abort(conversationId: string): void {
    const controller = this.activeStreams.get(conversationId);
    if (controller) {
      this.logger.debug('Aborting stream', { conversationId });
      controller.abort();
      this.activeStreams.delete(conversationId);
    }
  }

  /**
   * Aborts all active streams simultaneously.
   *
   * Called when the widget is being destroyed or the user navigates away.
   * The `onError` callbacks are NOT called for any aborted streams.
   */
  abortAll(): void {
    if (this.activeStreams.size === 0) return;

    this.logger.debug('Aborting all active streams', { count: this.activeStreams.size });
    for (const [conversationId, controller] of this.activeStreams) {
      controller.abort();
      this.logger.debug('Aborted stream', { conversationId });
    }
    this.activeStreams.clear();
  }

  /**
   * Returns whether a stream is currently active for the given conversation.
   *
   * @param conversationId - The conversation to check
   * @returns `true` if a stream is in progress, `false` otherwise
   */
  isStreaming(conversationId: string): boolean {
    return this.activeStreams.has(conversationId);
  }

  /**
   * Destroys the streaming client and cancels all active streams.
   *
   * After calling this method, the instance should not be used. Equivalent to
   * `abortAll()` but semantically signals end-of-lifecycle.
   */
  destroy(): void {
    this.logger.debug('Destroying StreamingClient');
    this.abortAll();
  }

  // --------------------------------------------------------------------------
  // Private: URL Construction
  // --------------------------------------------------------------------------

  /**
   * Constructs the streaming endpoint URL.
   *
   * The real backend endpoint is `POST /chatbot/stream` with optional query
   * parameters for `eventId` and `source` (used for unauthenticated users).
   *
   * For backward compatibility, if a custom endpoint pattern was configured
   * (via `chatbotId` containing a `/`), the legacy URL pattern is used instead.
   *
   * @param _conversationId - The conversation identifier (used for abort tracking,
   *   not in the URL for the real backend since threads are resolved server-side)
   * @returns Full streaming endpoint URL string
   */
  private buildStreamingUrl(_conversationId: string): string {
    // Real backend endpoint: POST /chatbot/stream with query params
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

  // --------------------------------------------------------------------------
  // Private: SSE Stream Parsing
  // --------------------------------------------------------------------------

  /**
   * Reads and parses the SSE stream from a `ReadableStreamDefaultReader`.
   *
   * The SSE wire protocol uses `\n\n` to separate events. Each event block
   * contains one or more `field: value` lines. Only `event:` and `data:`
   * fields are used by this implementation.
   *
   * Accumulated text is built incrementally from `message.delta` events so the
   * `onDelta` callback always receives both the new token and the full text
   * rendered so far — this avoids the consumer needing to maintain a buffer.
   *
   * Special sentinel: if `data` is the literal string `[DONE]`, parsing stops
   * and the stream is considered complete (some APIs use this convention).
   *
   * @param reader - The `ReadableStreamDefaultReader` from `response.body`
   * @param conversationId - Used for logging context
   * @param options - Streaming callbacks
   */
  private async parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    conversationId: string,
    options: StreamingOptions,
  ): Promise<void> {
    const decoder = new TextDecoder('utf-8');

    /**
     * Incomplete line buffer.
     * When a chunk boundary falls in the middle of a line, the partial line is
     * held here and prepended to the next chunk's decoded string.
     */
    let buffer = '';

    /** The `event:` field value for the current SSE block (reset after dispatch) */
    let currentEvent: StreamEventType | null = null;

    /** The `data:` field value for the current SSE block (reset after dispatch) */
    let currentData = '';

    /** Full accumulated bot text across all `message.delta` events */
    let accumulated = '';

    /** Server-assigned message ID received from `message.start` */
    let streamingMessageId = '';

    this.logger.debug('SSE read loop started', { conversationId });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Stream ended by the server — process any remaining buffered content
        this.logger.debug('SSE stream closed by server', { conversationId });

        // Flush any remaining buffer content (handles streams without trailing \n)
        if (buffer.trim()) {
          this.processSSELine(buffer, {
            onEvent: (event) => { currentEvent = event; },
            onData: (data) => { currentData += data; },
          });
        }

        // Dispatch any pending event block
        if (currentData || currentEvent) {
          this.dispatchEvent(
            currentEvent,
            currentData,
            { accumulated, streamingMessageId },
            options,
            (newAccumulated) => { accumulated = newAccumulated; },
            (msgId) => { streamingMessageId = msgId; },
          );
        }

        break;
      }

      // Decode the chunk and append to the incomplete-line buffer
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines — the last element may be an incomplete line
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          // Blank line = end of an SSE event block → dispatch the accumulated event
          if (currentData || currentEvent) {
            this.dispatchEvent(
              currentEvent,
              currentData,
              { accumulated, streamingMessageId },
              options,
              (newAccumulated) => { accumulated = newAccumulated; },
              (msgId) => { streamingMessageId = msgId; },
            );
          }
          // Reset for next event block
          currentEvent = null;
          currentData = '';
        } else {
          this.processSSELine(line, {
            onEvent: (event) => { currentEvent = event; },
            onData: (data) => {
              // SSE allows multiple `data:` lines — they are concatenated with newlines
              currentData = currentData ? `${currentData}\n${data}` : data;
            },
          });
        }
      }
    }
  }

  /**
   * Parses a single SSE line and invokes the appropriate callback.
   *
   * Handled fields:
   * - `event: <type>` — sets the event type for the current block
   * - `data: <json>` — appends data to the current block
   * - Lines starting with `:` are SSE comments and are ignored.
   * - Unknown fields are silently ignored per the SSE spec.
   *
   * @param line - A single line from the SSE stream (without trailing newline)
   * @param callbacks - Callbacks for parsed `event` and `data` fields
   */
  private processSSELine(
    line: string,
    callbacks: {
      onEvent: (event: StreamEventType) => void;
      onData: (data: string) => void;
    },
  ): void {
    // SSE comment — skip
    if (line.startsWith(':')) return;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // Field with no value (bare field name) — ignored for our use case
      return;
    }

    const field = line.slice(0, colonIndex).trim();
    // Per spec, if there's a space after the colon it is stripped
    const value = line.slice(colonIndex + 1).replace(/^ /, '');

    if (field === 'event') {
      // Validate against known event types (both backend and legacy SDK names)
      const knownTypes: StreamEventType[] = [
        // Backend (nev-api) SSE event names
        'token',
        'thinking',
        'done',
        'error',
        'tool_call_start',
        'tool_call_result',
        // Legacy SDK event names
        'message.start',
        'message.delta',
        'message.complete',
        'message.error',
        'typing.start',
        'typing.stop',
        'quick_replies',
      ];
      if (knownTypes.includes(value as StreamEventType)) {
        callbacks.onEvent(value as StreamEventType);
      } else {
        this.logger.debug('Unknown SSE event type — ignored', { value });
      }
    } else if (field === 'data') {
      callbacks.onData(value);
    }
    // `id:` and `retry:` fields are parsed by spec but not used here
  }

  /**
   * Dispatches a fully accumulated SSE event block to the appropriate callback.
   *
   * Called when a blank line (event block separator) is encountered. Parses the
   * JSON `data` string and invokes the matching callback in `options`.
   *
   * @param eventType - The parsed `event:` field value (or null if absent)
   * @param rawData - The accumulated `data:` field value
   * @param state - Mutable streaming state (accumulated text, message ID)
   * @param options - Consumer callbacks
   * @param setAccumulated - Setter for the accumulated text buffer
   * @param setMessageId - Setter for the streaming message ID
   */
  private dispatchEvent(
    eventType: StreamEventType | null,
    rawData: string,
    state: { accumulated: string; streamingMessageId: string },
    options: StreamingOptions,
    setAccumulated: (v: string) => void,
    setMessageId: (v: string) => void,
  ): void {
    // [DONE] sentinel — some APIs send this instead of a proper complete event
    if (rawData.trim() === '[DONE]') {
      this.logger.debug('Received [DONE] sentinel — stream complete');
      return;
    }

    // Default to 'message.delta' when the `event:` field is absent (legacy APIs)
    const type = eventType ?? 'message.delta';

    // Parse JSON data payload.
    // The backend sends StreamingChatEvent objects with { type, content, metadata, timestamp }.
    // Legacy endpoints may send StreamEventData objects with { messageId, content, error, ... }.
    let data: StreamEventData = {};
    let backendEvent: BackendStreamEvent | null = null;
    if (rawData.trim()) {
      try {
        const parsed = JSON.parse(rawData);
        // Detect backend event format by checking for the 'type' field
        // containing a BackendStreamEventType value
        if (parsed.type && ['TOKEN', 'THINKING', 'DONE', 'ERROR', 'TOOL_CALL_START', 'TOOL_CALL_RESULT', 'TYPING_START', 'TYPING_STOP'].includes(parsed.type)) {
          backendEvent = parsed as BackendStreamEvent;
        } else {
          data = parsed as StreamEventData;
        }
      } catch (parseError) {
        this.logger.debug('Failed to parse SSE data as JSON', { rawData, parseError });
        return;
      }
    }

    this.logger.debug('SSE event dispatched', { type, hasBackendEvent: backendEvent !== null });

    // =======================================================================
    // Backend (nev-api) SSE event handling
    // =======================================================================

    if (backendEvent) {
      switch (backendEvent.type) {
        case 'TOKEN': {
          const tokenContent = backendEvent.content ?? '';
          if (!tokenContent) break;

          const newAccumulated = state.accumulated + tokenContent;
          setAccumulated(newAccumulated);
          options.onDelta(tokenContent, newAccumulated);
          break;
        }

        case 'THINKING':
          // THINKING event indicates the AI model is reasoning.
          // Call the dedicated onThinking callback if provided,
          // otherwise fall back to onTypingStart for backward compatibility.
          if (options.onThinking) {
            options.onThinking();
          } else {
            options.onTypingStart?.();
          }
          break;

        case 'DONE': {
          // Stream is complete — build a ChatMessage from accumulated text
          const finalContent = state.accumulated;
          const messageId = state.streamingMessageId || this.generateFallbackId();

          const completedMessage: ChatMessage = {
            id: messageId,
            conversationId: '', // The widget will fill this from its own state
            role: 'assistant',
            content: finalContent,
            type: 'text',
            timestamp: new Date().toISOString(),
            status: 'delivered',
          };

          options.onComplete(completedMessage);
          break;
        }

        case 'ERROR': {
          const chatbotError: import('../types').ChatbotError = {
            code: 'STREAM_ERROR',
            message: backendEvent.content ?? 'An error occurred during response generation',
          };
          options.onError(chatbotError);
          break;
        }

        case 'TOOL_CALL_START':
          options.onToolCallStart?.(backendEvent.metadata);
          break;

        case 'TOOL_CALL_RESULT':
          options.onToolCallResult?.(backendEvent.content, backendEvent.metadata);
          break;

        case 'TYPING_START': {
          // Live agent started typing — parse metadata for agent identity
          const typingStartEvent: TypingStatusEvent = {
            isTyping: true,
            ...(backendEvent.metadata && typeof backendEvent.metadata === 'object'
              ? backendEvent.metadata as Partial<TypingStatusEvent>
              : {}),
          };
          options.onAgentTypingStart?.(typingStartEvent);
          break;
        }

        case 'TYPING_STOP': {
          // Live agent stopped typing
          const typingStopEvent: TypingStatusEvent = {
            isTyping: false,
            ...(backendEvent.metadata && typeof backendEvent.metadata === 'object'
              ? backendEvent.metadata as Partial<TypingStatusEvent>
              : {}),
          };
          options.onAgentTypingStop?.(typingStopEvent);
          break;
        }

        default:
          this.logger.debug('Unhandled backend event type', { type: backendEvent.type });
      }

      return;
    }

    // =======================================================================
    // Backend SSE event names (used as SSE `event:` field values)
    // The backend sets `event: token`, `event: done`, etc. and the data
    // payload is a BackendStreamEvent JSON. However if the data was not
    // detected as a BackendStreamEvent above (e.g. plain text data), we
    // handle the event type name as a signal.
    // =======================================================================

    switch (type) {
      // Backend event names (when data is not BackendStreamEvent format)
      case 'token': {
        const tokenContent = data.content ?? '';
        if (!tokenContent) break;

        const newAccumulated = state.accumulated + tokenContent;
        setAccumulated(newAccumulated);
        options.onDelta(tokenContent, newAccumulated);
        break;
      }

      case 'thinking':
        if (options.onThinking) {
          options.onThinking();
        } else {
          options.onTypingStart?.();
        }
        break;

      case 'done': {
        const finalContent = data.content ?? state.accumulated;
        const messageId = data.messageId ?? (state.streamingMessageId || this.generateFallbackId());

        const completedMessage: ChatMessage = {
          id: messageId,
          conversationId: '',
          role: 'assistant',
          content: finalContent,
          type: 'text',
          timestamp: new Date().toISOString(),
          status: 'delivered',
        };

        options.onComplete(completedMessage);
        break;
      }

      case 'error': {
        const errorMessage = data.content ?? data.error?.message ?? 'An error occurred during response generation';
        const chatbotError: import('../types').ChatbotError = {
          code: 'STREAM_ERROR',
          message: errorMessage,
        };
        if (data.error?.code) {
          chatbotError.details = { serverCode: data.error.code };
        }
        options.onError(chatbotError);
        break;
      }

      case 'tool_call_start':
        options.onToolCallStart?.(data.metadata);
        break;

      case 'tool_call_result':
        options.onToolCallResult?.(data.content ?? null, data.metadata);
        break;

      // =======================================================================
      // Legacy SDK event names (backward compatibility)
      // =======================================================================

      case 'typing.start':
        options.onTypingStart?.();
        break;

      case 'typing.stop':
        options.onTypingStop?.();
        break;

      case 'message.start':
        if (data.messageId) {
          setMessageId(data.messageId);
          this.logger.debug('Streaming message started', { messageId: data.messageId });
        }
        break;

      case 'message.delta': {
        const token = data.content ?? '';
        if (!token) break;

        const newAccumulated = state.accumulated + token;
        setAccumulated(newAccumulated);

        options.onDelta(token, newAccumulated);
        break;
      }

      case 'message.complete': {
        // Build a full ChatMessage from the complete event payload.
        // Use the accumulated text as a fallback if `content` is absent.
        const finalContent = data.content ?? state.accumulated;
        const messageId = data.messageId ?? state.streamingMessageId;

        const completedMessage: ChatMessage = {
          id: messageId || this.generateFallbackId(),
          conversationId: '', // The widget will fill this from its own state
          role: 'assistant',
          content: finalContent,
          type: data.richContent ? 'rich' : 'text',
          timestamp: new Date().toISOString(),
          status: 'delivered',
        };

        if (data.richContent) {
          completedMessage.richContent = data.richContent;
        }
        if (data.metadata) {
          completedMessage.metadata = data.metadata;
        }

        options.onComplete(completedMessage);
        break;
      }

      case 'message.error': {
        const serverError = data.error;
        const chatbotError: import('../types').ChatbotError = {
          code: 'API_ERROR',
          message: serverError?.message ?? 'An error occurred during response generation',
        };
        // Only assign details when the server provided an error code
        // (exactOptionalPropertyTypes forbids assigning undefined explicitly)
        if (serverError?.code) {
          chatbotError.details = { serverCode: serverError.code };
        }
        options.onError(chatbotError);
        break;
      }

      case 'quick_replies':
        if (data.quickReplies && data.quickReplies.length > 0) {
          options.onQuickReplies?.(data.quickReplies);
        }
        break;

      default:
        this.logger.debug('Unhandled SSE event type', { type });
    }
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  /**
   * Combines two `AbortSignal` instances into a single signal that aborts
   * when either source aborts.
   *
   * Uses `AbortSignal.any()` when available (modern browsers/Node 20+) and
   * falls back to a manual approach for older environments.
   *
   * @param primary - The StreamingClient's own controller signal
   * @param secondary - Optional consumer-provided signal
   * @returns A combined signal, or `primary` when `secondary` is absent
   */
  private combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
    if (!secondary) return primary;

    // Use AbortSignal.any() when available (Chrome 116+, Firefox 124+, Safari 17.4+)
    if (typeof AbortSignal.any === 'function') {
      return AbortSignal.any([primary, secondary]);
    }

    // Manual fallback: create a new controller and abort it when either signal fires
    const combined = new AbortController();
    const abort = () => combined.abort();

    primary.addEventListener('abort', abort, { once: true });
    secondary.addEventListener('abort', abort, { once: true });

    return combined.signal;
  }

  /**
   * Generates a fallback message ID when the server does not provide one.
   * Used only as a last resort — the server should always supply a `messageId`.
   *
   * @returns A unique string identifier
   */
  private generateFallbackId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
