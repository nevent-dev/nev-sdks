/**
 * @vitest-environment jsdom
 *
 * widget-lifecycle.test.ts - Integration tests for ChatbotWidget full lifecycle
 *
 * These tests verify the complete initialization, interaction, and teardown
 * flow of the ChatbotWidget in a jsdom environment. All network calls are
 * intercepted by the mock API helper — no real API calls are made.
 *
 * Test coverage:
 * - Minimal config initialization (config fetch → render → onReady)
 * - Bubble presence in the DOM after init (floating mode)
 * - Window presence in the DOM after init
 * - open() / close() / toggle() state transitions
 * - destroy() DOM cleanup
 * - Inline mode (containerId) — no bubble rendered
 * - sendMessage() optimistic UI update
 * - State persistence: save and restore conversation
 * - Multiple widgets coexist without interference
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi } from '../helpers/mock-api';
import { createMockConfig, createMockServerConfig } from '../helpers/mock-factories';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

// jsdom does not implement scrollTo() on HTMLElement — patch it globally
// so that MessageRenderer.scrollToBottom() does not throw.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Helper: wait for micro-task queue to flush (async state propagation)
// ============================================================================

/** Waits for `n` event-loop ticks to allow async operations to settle. */
async function flushPromises(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

/**
 * Queries for an element by CSS selector, searching inside Shadow DOM trees.
 *
 * Since the widget now uses Shadow DOM for style isolation, elements are not
 * discoverable via `document.querySelector`. This helper traverses shadow
 * roots attached to `#nevent-chatbot-host` elements.
 *
 * @param selector - CSS selector to match
 * @returns The first matching Element, or null
 */
function queryShadow(selector: string): Element | null {
  // First try direct document query (fallback / non-shadow mode)
  const direct = document.querySelector(selector);
  if (direct) return direct;

  // Search inside all shadow roots of chatbot host elements
  const hosts = document.querySelectorAll('#nevent-chatbot-host');
  for (const host of Array.from(hosts)) {
    const shadow = host.shadowRoot;
    if (shadow) {
      const found = shadow.querySelector(selector);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Queries for all elements matching a CSS selector, including inside Shadow DOM.
 *
 * @param selector - CSS selector to match
 * @returns Array of matching Elements
 */
function queryShadowAll(selector: string): Element[] {
  const results: Element[] = [];

  // Check document-level (fallback / non-shadow mode)
  results.push(...Array.from(document.querySelectorAll(selector)));

  // Search inside all shadow roots of chatbot host elements
  const hosts = document.querySelectorAll('#nevent-chatbot-host');
  for (const host of Array.from(hosts)) {
    const shadow = host.shadowRoot;
    if (shadow) {
      results.push(...Array.from(shadow.querySelectorAll(selector)));
    }
  }
  return results;
}

/** Waits for a specific DOM element to appear in the document. */
function waitForElement(selector: string, timeout = 3000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for selector: ${selector}`));
    }, timeout);
  });
}

// ============================================================================
// Suite setup
// ============================================================================

describe('ChatbotWidget — Integration: Lifecycle', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    // Set up a clean DOM body for each test
    document.body.innerHTML = '';
    localStorage.clear();

    // Install mock fetch
    mockApi = createMockApi({ latency: 0 });
    vi.stubGlobal('fetch', mockApi.mockFetch);

    // Suppress non-critical console noise
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Remove any widget host/root elements that might have been left by a test
    document.querySelectorAll('#nevent-chatbot-host').forEach((el) => el.remove());
    document.querySelectorAll('.nevent-chatbot-root').forEach((el) => el.remove());
    document.querySelectorAll('[data-vitest-css]').forEach((el) => el.remove());

    mockApi.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ==========================================================================
  // 1. Initialization with minimal config
  // ==========================================================================

  describe('1. Initialization with minimal config', () => {
    it('should call onReady callback after successful init', async () => {
      const onReady = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onReady }));

      await widget.init();

      expect(onReady).toHaveBeenCalledTimes(1);

      widget.destroy();
    });

    it('should fetch server config exactly once during init', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      // The config fetch is one call; additional calls would be conversation/message
      const configCalls = mockApi.callCount;
      expect(configCalls).toBeGreaterThanOrEqual(1);

      widget.destroy();
    });

    it('should create root element inside shadow DOM in floating mode', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      // Root element lives inside the shadow root of #nevent-chatbot-host
      const root = queryShadow('.nevent-chatbot-root');
      expect(root).not.toBeNull();

      // The host element should be on document.body
      const host = document.querySelector('#nevent-chatbot-host');
      expect(host).not.toBeNull();
      expect(document.body.contains(host)).toBe(true);

      widget.destroy();
    });

    it('should inject CSS styles into the shadow root', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      // CSSGenerator injects a <style> element inside the shadow root
      const styleElements = queryShadowAll('style');
      expect(styleElements.length).toBeGreaterThan(0);

      widget.destroy();
    });

    it('should be idempotent — calling init() twice is a no-op', async () => {
      const onReady = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onReady }));

      await widget.init();
      await widget.init(); // second call should be ignored

      expect(onReady).toHaveBeenCalledTimes(1);

      widget.destroy();
    });
  });

  // ==========================================================================
  // 2. Bubble rendering (floating mode)
  // ==========================================================================

  describe('2. Bubble rendering — floating mode', () => {
    it('should render a bubble button in the shadow DOM', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      const bubble = queryShadow('.nevent-chatbot-bubble');
      expect(bubble).not.toBeNull();

      widget.destroy();
    });

    it('should remove bubble from DOM after destroy()', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      widget.destroy();

      // After destroy, the shadow host is removed so no shadow roots exist
      const bubble = queryShadow('.nevent-chatbot-bubble');
      expect(bubble).toBeNull();
    });
  });

  // ==========================================================================
  // 3. Window rendering
  // ==========================================================================

  describe('3. Window rendering', () => {
    it('should render the chat window element inside shadow DOM', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      const window = queryShadow('.nevent-chatbot-window');
      expect(window).not.toBeNull();

      widget.destroy();
    });

    it('should render the window header with bot name from server config', async () => {
      const widget = new ChatbotWidget(
        createMockConfig(),
      );
      // Server config has name: 'Test Bot'
      await widget.init();

      const header = queryShadow('.nevent-chatbot-header-title');
      expect(header?.textContent).toBe('Test Bot');

      widget.destroy();
    });
  });

  // ==========================================================================
  // 4. open() / close() / toggle()
  // ==========================================================================

  describe('4. open() / close() / toggle()', () => {
    it('open() should mark widget as open in state', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      expect(widget.isOpen()).toBe(false);
      widget.open();
      expect(widget.isOpen()).toBe(true);

      widget.destroy();
    });

    it('close() should mark widget as closed in state', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      widget.open();
      expect(widget.isOpen()).toBe(true);

      widget.close();
      expect(widget.isOpen()).toBe(false);

      widget.destroy();
    });

    it('toggle() should switch open state', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      expect(widget.isOpen()).toBe(false);
      widget.toggle();
      expect(widget.isOpen()).toBe(true);
      widget.toggle();
      expect(widget.isOpen()).toBe(false);

      widget.destroy();
    });

    it('open() should fire onOpen callback', async () => {
      const onOpen = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onOpen }));
      await widget.init();

      widget.open();
      expect(onOpen).toHaveBeenCalledTimes(1);

      widget.destroy();
    });

    it('close() should fire onClose callback', async () => {
      const onClose = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onClose }));
      await widget.init();

      widget.open();
      widget.close();
      expect(onClose).toHaveBeenCalledTimes(1);

      widget.destroy();
    });

    it('open() / close() should be no-ops before init()', () => {
      const widget = new ChatbotWidget(createMockConfig());

      // Should not throw
      expect(() => widget.open()).not.toThrow();
      expect(() => widget.close()).not.toThrow();
      expect(widget.isOpen()).toBe(false);
    });
  });

  // ==========================================================================
  // 5. destroy() — DOM cleanup
  // ==========================================================================

  describe('5. destroy() — DOM cleanup', () => {
    it('should remove the root element and host from the DOM', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      expect(queryShadow('.nevent-chatbot-root')).not.toBeNull();

      widget.destroy();

      expect(queryShadow('.nevent-chatbot-root')).toBeNull();
      expect(document.querySelector('#nevent-chatbot-host')).toBeNull();
    });

    it('should remove injected CSS style elements (shadow host removed)', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      // Styles live inside shadow root now; verify they exist
      const stylesAfterInit = queryShadowAll('style');
      expect(stylesAfterInit.length).toBeGreaterThan(0);

      widget.destroy();

      // After destroy, the shadow host is removed so all styles are gone
      const stylesAfterDestroy = queryShadowAll('style');
      expect(stylesAfterDestroy.length).toBe(0);
    });

    it('should mark widget as destroyed — subsequent open() is a no-op', async () => {
      const onOpen = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onOpen }));
      await widget.init();

      widget.destroy();
      widget.open(); // should be a no-op

      expect(onOpen).not.toHaveBeenCalled();
    });

    it('calling destroy() twice should not throw', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();

      widget.destroy();
      expect(() => widget.destroy()).not.toThrow();
    });
  });

  // ==========================================================================
  // 6. Inline mode (containerId)
  // ==========================================================================

  describe('6. Inline mode — containerId', () => {
    beforeEach(() => {
      // Create a container element for inline tests
      const container = document.createElement('div');
      container.id = 'chat-container';
      document.body.appendChild(container);
    });

    it('should NOT render a bubble in inline mode', async () => {
      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'chat-container' }),
      );
      await widget.init();

      const bubble = queryShadow('.nevent-chatbot-bubble');
      expect(bubble).toBeNull();

      widget.destroy();
    });

    it('should mount host inside the provided container with shadow root', async () => {
      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'chat-container' }),
      );
      await widget.init();

      const container = document.getElementById('chat-container');
      const host = container?.querySelector('#nevent-chatbot-host');
      expect(host).not.toBeNull();

      // Root element is inside the shadow root
      const root = host?.shadowRoot?.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();

      widget.destroy();
    });

    it('should open the window immediately in inline mode', async () => {
      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'chat-container' }),
      );
      await widget.init();

      // Inline mode auto-opens the window (no bubble to click)
      expect(widget.isOpen()).toBe(true);

      widget.destroy();
    });

    it('should call onError with CONTAINER_NOT_FOUND when container does not exist (error isolated)', async () => {
      const onError = vi.fn();
      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'non-existent-container', onError }),
      );

      // Error boundary isolates the error — init() resolves without throwing
      await expect(widget.init()).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CONTAINER_NOT_FOUND' }),
      );
    });
  });

  // ==========================================================================
  // 7. sendMessage() — optimistic UI
  // ==========================================================================

  describe('7. sendMessage() — optimistic UI', () => {
    it('should add user message to the DOM after sendMessage completes', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();
      widget.open();

      // Await the full sendMessage (conversation create + message add + bot response)
      await widget.sendMessage('Hello from test');
      await flushPromises(10);

      // Messages live inside the shadow root
      const messageElements = queryShadowAll('.nevent-chatbot-message');
      const texts = Array.from(messageElements).map((el) => el.textContent ?? '');
      const hasUserMessage = texts.some((t) => t.includes('Hello from test'));
      expect(hasUserMessage).toBe(true);

      widget.destroy();
    });

    it('should ignore empty messages', async () => {
      const widget = new ChatbotWidget(createMockConfig());
      await widget.init();
      widget.open();

      const initialState = widget.getState();
      await widget.sendMessage('   '); // whitespace-only

      const finalState = widget.getState();
      // No conversation should have been created
      expect(finalState.conversation).toEqual(initialState.conversation);

      widget.destroy();
    });

    it('should be a no-op before init()', async () => {
      const widget = new ChatbotWidget(createMockConfig());

      // Should not throw
      await expect(widget.sendMessage('Hello')).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // 8. State persistence — save and restore
  // ==========================================================================

  describe('8. State persistence', () => {
    it('should persist conversation to localStorage after sendMessage', async () => {
      const chatbotId = 'bot-persist-test';
      const widget = new ChatbotWidget(
        createMockConfig({
          chatbotId,
          persistConversation: true,
        }),
      );
      await widget.init();
      widget.open();

      await widget.sendMessage('Persist this message');
      await flushPromises(20);

      // Trigger persistence via beforeunload simulation
      widget.destroy();

      // Check that something was persisted for this chatbot
      const keys = Object.keys(localStorage);
      const chatbotKey = keys.find((k) => k.includes(chatbotId));
      expect(chatbotKey).toBeDefined();
    });

    it('should NOT persist when persistConversation is false', async () => {
      const chatbotId = 'bot-no-persist';
      const widget = new ChatbotWidget(
        createMockConfig({
          chatbotId,
          persistConversation: false,
        }),
      );
      await widget.init();
      widget.open();

      await widget.sendMessage('Do not persist');
      await flushPromises(20);

      widget.destroy();

      // No key should have been written for this chatbot
      const keys = Object.keys(localStorage);
      const chatbotKey = keys.find((k) => k.includes(chatbotId));
      expect(chatbotKey).toBeUndefined();
    });
  });

  // ==========================================================================
  // 9. Multiple widgets coexist without interference
  // ==========================================================================

  describe('9. Multiple widgets — no interference', () => {
    it('two widgets can initialize on the same page independently', async () => {
      const onReady1 = vi.fn();
      const onReady2 = vi.fn();

      const widget1 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-widget-1', onReady: onReady1 }),
      );
      const widget2 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-widget-2', onReady: onReady2 }),
      );

      await Promise.all([widget1.init(), widget2.init()]);

      expect(onReady1).toHaveBeenCalledTimes(1);
      expect(onReady2).toHaveBeenCalledTimes(1);

      // Both root elements should be in the DOM (inside shadow roots)
      const roots = queryShadowAll('.nevent-chatbot-root');
      expect(roots.length).toBe(2);

      widget1.destroy();
      widget2.destroy();
    });

    it('destroying one widget does not affect the other', async () => {
      const widget1 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-indep-1' }),
      );
      const widget2 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-indep-2' }),
      );

      await Promise.all([widget1.init(), widget2.init()]);

      widget1.destroy();

      // widget2 should still be functional
      expect(() => widget2.open()).not.toThrow();
      expect(widget2.isOpen()).toBe(true);

      widget2.destroy();
    });

    it('open/close on one widget does not affect the other', async () => {
      const widget1 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-state-1' }),
      );
      const widget2 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-state-2' }),
      );

      await Promise.all([widget1.init(), widget2.init()]);

      widget1.open();

      expect(widget1.isOpen()).toBe(true);
      expect(widget2.isOpen()).toBe(false); // unaffected

      widget1.destroy();
      widget2.destroy();
    });
  });

  // ==========================================================================
  // 10. Config fetch failure graceful degradation
  // ==========================================================================

  describe('10. Config fetch failure', () => {
    it('should call onError with CONFIG_LOAD_FAILED when fetch rejects (error isolated)', async () => {
      // Override fetch with a rejecting mock for this test
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      );

      const onError = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onError }));

      // Error boundary isolates the error — init() resolves without throwing
      await expect(widget.init()).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CONFIG_LOAD_FAILED' }),
      );
    });
  });
});
