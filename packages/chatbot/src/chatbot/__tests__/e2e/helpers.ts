/**
 * E2E Test Helpers - Utilities for full lifecycle chatbot integration tests
 *
 * Provides high-level helpers that encapsulate common E2E test operations:
 * - Widget initialization with mocked API
 * - SSE stream simulation for streaming responses
 * - DOM interaction helpers (type, click, toggle)
 * - Shadow DOM element queries with timeout-based waiting
 *
 * These helpers are designed to make E2E tests concise and readable while
 * hiding the complexity of shadow DOM traversal and async state propagation.
 *
 * @example
 * ```typescript
 * const { widget, shadowRoot, mockFetch, cleanup } = await createInitializedWidget();
 * toggleChat(shadowRoot);
 * typeInInput(shadowRoot, 'Hello');
 * clickSend(shadowRoot);
 * const messageEl = await waitForElement(shadowRoot, '.nevent-chatbot-message--user');
 * expect(messageEl.textContent).toContain('Hello');
 * cleanup();
 * ```
 */

import { vi } from 'vitest';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi, type MockApiHandle } from '../helpers/mock-api';
import { createMockConfig } from '../helpers/mock-factories';
import type { ChatbotConfig, BackendStreamEventType } from '../../../types';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

// jsdom does not implement scrollTo() on HTMLElement.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Types
// ============================================================================

/**
 * Return value of {@link createInitializedWidget}.
 * Contains all references needed to interact with and assert against the widget.
 */
export interface InitializedWidget {
  /** The ChatbotWidget instance */
  widget: ChatbotWidget;
  /** The host container element in the document */
  container: HTMLElement;
  /** The shadow root for querying internal DOM elements */
  shadowRoot: ShadowRoot;
  /** The mock fetch handle for assertions on API calls */
  mockApi: MockApiHandle;
  /** Cleanup function that destroys the widget and restores globals */
  cleanup: () => void;
}

/**
 * Describes a single SSE event to be emitted by {@link createMockSSEStream}.
 */
export interface MockSSEEvent {
  /** The SSE event type (maps to BackendStreamEventType) */
  type: BackendStreamEventType;
  /** The JSON data payload for this event */
  data: Record<string, unknown>;
  /** Optional delay in milliseconds before emitting this event */
  delay?: number;
}

// ============================================================================
// Widget initialization
// ============================================================================

/**
 * Creates a fully initialized ChatbotWidget with mocked API, ready for E2E testing.
 *
 * Handles the full setup:
 * 1. Cleans the DOM and localStorage
 * 2. Creates a mock API with optional overrides
 * 3. Stubs `fetch` globally
 * 4. Constructs and initializes the widget
 * 5. Locates the shadow root for DOM assertions
 *
 * @param configOverrides - Partial ChatbotConfig to merge into mock defaults
 * @param apiOptions - Options for the mock API (latency, bot response, etc.)
 * @returns An {@link InitializedWidget} with all references needed for testing
 */
export async function createInitializedWidget(
  configOverrides: Partial<ChatbotConfig> = {},
  apiOptions: Parameters<typeof createMockApi>[0] = {}
): Promise<InitializedWidget> {
  // Clean environment
  document.body.innerHTML = '';
  localStorage.clear();

  // Set up mock API
  const mockApi = createMockApi({ latency: 0, ...apiOptions });
  vi.stubGlobal('fetch', mockApi.mockFetch);

  // Suppress non-critical console noise
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Create and initialize widget
  const config = createMockConfig({
    analytics: false,
    persistConversation: false,
    ...configOverrides,
  });
  const widget = new ChatbotWidget(config);
  await widget.init();

  // Locate shadow root
  const host = document.querySelector('#nevent-chatbot-host') as HTMLElement;
  if (!host) {
    throw new Error('Widget host element not found after init');
  }
  const shadowRoot = host.shadowRoot!;
  if (!shadowRoot) {
    throw new Error('Shadow root not found on widget host element');
  }

  /**
   * Cleanup function that tears down the widget and restores all global stubs.
   */
  function cleanup(): void {
    widget.destroy();
    mockApi.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
  }

  return {
    widget,
    container: host,
    shadowRoot,
    mockApi,
    cleanup,
  };
}

// ============================================================================
// SSE Stream simulation
// ============================================================================

/**
 * Creates a mock SSE ReadableStream response that emits the given events.
 *
 * The stream encodes each event in the standard SSE wire format:
 * ```
 * event: <type>\n
 * data: <json>\n
 * \n
 * ```
 *
 * Events are emitted sequentially. When a `delay` is specified on an event,
 * the stream pauses for that duration before emitting the event.
 *
 * @param events - Array of SSE events to emit in order
 * @returns A Response object with a readable body stream
 */
export function createMockSSEResponse(events: MockSSEEvent[]): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        if (event.delay && event.delay > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, event.delay)
          );
        }

        const ssePayload =
          `event: ${event.type.toLowerCase()}\n` +
          `data: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`;

        controller.enqueue(encoder.encode(ssePayload));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Creates a standard sequence of TOKEN + DONE SSE events for a simple bot response.
 *
 * @param text - The full response text to stream token-by-token
 * @param tokenSize - Number of characters per token chunk. Default: 5
 * @param tokenDelay - Delay in ms between token events. Default: 0
 * @returns Array of MockSSEEvent objects
 */
export function createTokenStreamEvents(
  text: string,
  tokenSize = 5,
  tokenDelay = 0
): MockSSEEvent[] {
  const events: MockSSEEvent[] = [];

  // Split text into token-sized chunks
  for (let i = 0; i < text.length; i += tokenSize) {
    const chunk = text.slice(i, i + tokenSize);
    events.push({
      type: 'TOKEN',
      data: { content: chunk, timestamp: Date.now() },
      delay: tokenDelay,
    });
  }

  // Add DONE event
  events.push({
    type: 'DONE',
    data: { content: null, timestamp: Date.now() },
  });

  return events;
}

// ============================================================================
// DOM interaction helpers
// ============================================================================

/**
 * Simulates typing text into the chat input textarea within the shadow DOM.
 *
 * Sets the textarea value and dispatches an `input` event to trigger
 * any listeners (e.g., typing status notifications, send button enabling).
 *
 * @param shadowRoot - The shadow root containing the input
 * @param text - The text to type into the input
 * @throws Error if no textarea is found in the shadow root
 */
export function typeInInput(shadowRoot: ShadowRoot, text: string): void {
  const textarea = shadowRoot.querySelector('textarea') as HTMLTextAreaElement;
  if (!textarea) {
    throw new Error('No textarea found in shadow root');
  }
  textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Clicks the send button in the chat input area within the shadow DOM.
 *
 * Locates the send button by its CSS class and dispatches a click event.
 *
 * @param shadowRoot - The shadow root containing the send button
 * @throws Error if no send button is found
 */
export function clickSend(shadowRoot: ShadowRoot): void {
  const sendBtn = shadowRoot.querySelector(
    '.nevent-chatbot-send-button'
  ) as HTMLButtonElement;
  if (!sendBtn) {
    // Fallback: try finding by aria-label pattern
    const btn = shadowRoot.querySelector(
      'button[aria-label]'
    ) as HTMLButtonElement;
    if (!btn) {
      throw new Error('No send button found in shadow root');
    }
    btn.click();
    return;
  }
  sendBtn.click();
}

/**
 * Toggles the chat window by clicking the bubble button.
 *
 * @param shadowRoot - The shadow root containing the bubble
 * @throws Error if no bubble element is found
 */
export function toggleChat(shadowRoot: ShadowRoot): void {
  const bubble = shadowRoot.querySelector(
    '.nevent-chatbot-bubble'
  ) as HTMLElement;
  if (!bubble) {
    throw new Error('No bubble element found in shadow root');
  }
  bubble.click();
}

/**
 * Waits for a DOM element matching the given selector to appear in the shadow root.
 *
 * Uses a polling approach since MutationObserver does not fire for shadow DOM
 * changes in jsdom. Polls every 50ms until the element is found or timeout.
 *
 * @param shadowRoot - The shadow root to query
 * @param selector - CSS selector for the target element
 * @param timeout - Maximum wait time in milliseconds. Default: 3000
 * @returns The found Element
 * @throws Error if the element is not found within the timeout
 */
export async function waitForElement(
  shadowRoot: ShadowRoot,
  selector: string,
  timeout = 3000
): Promise<Element> {
  const startTime = Date.now();
  const pollInterval = 50;

  while (Date.now() - startTime < timeout) {
    const el = shadowRoot.querySelector(selector);
    if (el) return el;
    await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout (${timeout}ms) waiting for selector: "${selector}"`);
}

/**
 * Waits for N event-loop ticks to allow async operations to settle.
 *
 * @param ticks - Number of micro-task flushes to perform. Default: 10
 */
export async function flushPromises(ticks = 10): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

/**
 * Queries all elements matching a selector inside the shadow root.
 *
 * @param shadowRoot - The shadow root to query
 * @param selector - CSS selector to match
 * @returns Array of matching elements
 */
export function queryAll(shadowRoot: ShadowRoot, selector: string): Element[] {
  return Array.from(shadowRoot.querySelectorAll(selector));
}

/**
 * Gets the text content of all message elements in the chat.
 *
 * @param shadowRoot - The shadow root containing messages
 * @returns Array of text strings from message elements
 */
export function getMessageTexts(shadowRoot: ShadowRoot): string[] {
  const messages = shadowRoot.querySelectorAll('.nevent-chatbot-message');
  return Array.from(messages).map((el) => el.textContent ?? '');
}
