/**
 * mock-api.ts - Mock fetch implementation for integration tests
 *
 * Provides a `createMockApi` helper that returns a `mockFetch` function which
 * intercepts all `fetch` calls made by the chatbot SDK and returns
 * pre-configured responses without hitting any real network endpoint.
 *
 * Supported endpoints (same paths as the real ConversationService):
 * - `GET  /public/chatbot/{id}/config`  → returns server config
 * - `POST /public/chatbot/{id}/conversations`  → creates a conversation
 * - `POST /public/chatbot/{id}/conversations/{id}/messages`  → bot response
 *
 * @example
 * ```typescript
 * import { createMockApi } from './helpers/mock-api';
 * import { vi } from 'vitest';
 *
 * const { mockFetch, reset } = createMockApi({ latency: 0 });
 * vi.stubGlobal('fetch', mockFetch);
 *
 * // ... run widget init and interact ...
 *
 * reset();
 * vi.unstubAllGlobals();
 * ```
 */

import type { ServerChatbotConfig } from '../../../types';
import {
  createMockServerConfig,
  createMockConfigResponse,
  createMockConversationResponse,
  createMockSendMessageResponse,
} from './mock-factories';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for configuring the mock API behavior.
 */
export interface MockApiOptions {
  /**
   * Partial server config overrides to merge into the default mock config.
   * Useful for testing specific feature flags or theme settings.
   */
  serverConfig?: Partial<ServerChatbotConfig>;

  /**
   * Whether to simulate SSE streaming responses.
   * When `true`, message requests return a streaming response.
   * Default: `false`
   */
  streamingEnabled?: boolean;

  /**
   * Artificial latency in milliseconds added to every response.
   * Set to `0` for synchronous-like responses in performance tests.
   * Default: `0`
   */
  latency?: number;

  /**
   * Fixed bot response text returned by the send-message endpoint.
   * Default: `'This is a test bot response.'`
   */
  botResponse?: string;

  /**
   * Conversation ID to use in create-conversation responses.
   * Default: `'conv-integration-test-1'`
   */
  conversationId?: string;
}

/**
 * Return value of `createMockApi`.
 */
export interface MockApiHandle {
  /**
   * Mock `fetch` function to stub on `globalThis.fetch`.
   * Intercepts all API calls made by the SDK.
   */
  mockFetch: typeof fetch;

  /**
   * Resets call counters and clears any pending latency timers.
   * Should be called in `afterEach` alongside `vi.unstubAllGlobals()`.
   */
  reset: () => void;

  /**
   * Number of times `mockFetch` was called since creation or last `reset()`.
   * Useful for asserting that the expected number of API calls were made.
   */
  readonly callCount: number;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a mock `fetch` implementation that simulates all chatbot API endpoints.
 *
 * The mock routes requests by URL pattern matching (using `String.includes`)
 * to avoid hard-coding the full URL. This keeps tests independent of the
 * `apiUrl` configuration value.
 *
 * @param options - Configuration for the mock API behavior
 * @returns An object containing `mockFetch`, `reset`, and `callCount`
 */
export function createMockApi(options: MockApiOptions = {}): MockApiHandle {
  const {
    serverConfig: serverConfigOverrides = {},
    latency = 0,
    botResponse = 'This is a test bot response.',
    conversationId = 'conv-integration-test-1',
  } = options;

  const resolvedServerConfig = createMockServerConfig(serverConfigOverrides);

  // Track call count for assertions
  let _callCount = 0;
  const pendingTimers: ReturnType<typeof setTimeout>[] = [];

  /**
   * Wraps a response factory with an optional latency delay.
   *
   * @param responseFactory - Function returning a mock Response
   * @returns A Promise resolving to the mocked Response
   */
  async function withLatency(responseFactory: () => Response): Promise<Response> {
    if (latency <= 0) {
      return responseFactory();
    }

    return new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        resolve(responseFactory());
      }, latency);
      pendingTimers.push(timer);
    });
  }

  /**
   * Mock fetch function.
   *
   * Routes calls to the appropriate response factory based on URL patterns.
   * Unknown URLs receive a 404 response so tests fail clearly rather than
   * hanging on an unresolved Promise.
   *
   * @param input - Request URL or Request object
   * @returns Promise resolving to a mock Response
   */
  const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
    _callCount++;

    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

    // Route: GET /public/chatbot/{id}/config
    if (url.includes('/config')) {
      return withLatency(() => createMockConfigResponse(resolvedServerConfig));
    }

    // Route: POST /chatbot/send-message (new backend endpoint)
    if (url.includes('/send-message')) {
      return withLatency(() => createMockSendMessageResponse(botResponse));
    }

    // Route: POST /chatbot/typing (typing status notifications)
    if (url.includes('/chatbot/typing')) {
      return withLatency(() => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response));
    }

    // Route: GET /chatbot/messages (message history)
    // Route: POST /public/chatbot/{id}/conversations/{id}/messages (legacy)
    // This pattern must come BEFORE the conversations route to avoid
    // false-matching on /conversations/{id}/messages.
    if (url.includes('/messages')) {
      return withLatency(() => createMockSendMessageResponse(botResponse));
    }

    // Route: POST /public/chatbot/{id}/conversations
    if (url.includes('/conversations')) {
      return withLatency(() => createMockConversationResponse(conversationId));
    }

    // Route: POST .../close (conversation close — respond with 200)
    if (url.includes('/close')) {
      return withLatency(() => ({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as unknown as Response));
    }

    // Fallback: unknown endpoint
    console.warn(`[mock-api] Unmatched URL: ${url}`);
    return {
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, message: `Not found: ${url}` }),
    } as unknown as Response;
  };

  /**
   * Resets the mock state (call counters and pending timers).
   */
  function reset(): void {
    _callCount = 0;
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.length = 0;
  }

  return {
    mockFetch: mockFetch as typeof fetch,
    reset,
    get callCount() { return _callCount; },
  };
}
