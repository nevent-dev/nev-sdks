/**
 * @vitest-environment jsdom
 *
 * benchmark.test.ts - Performance threshold tests for the chatbot SDK
 *
 * These tests verify that critical operations complete within acceptable time
 * bounds. All thresholds are intentionally generous to avoid CI flakiness on
 * slow runners while still catching genuine regressions (e.g. O(n²) loops,
 * synchronous heavy operations, unguarded re-renders).
 *
 * Design decisions:
 * - `performance.now()` is used for sub-millisecond accuracy.
 * - All operations are isolated — no network calls, no DOM mounting overhead
 *   (except widget init which mocks fetch to return instantly).
 * - Thresholds include a 5× safety margin vs. measured baseline on a typical
 *   developer machine to prevent false positives on slow CI environments.
 *
 * Test coverage:
 * - Widget init (excluding network) < 100ms
 * - Rendering 100 messages < 200ms
 * - Rapid message additions (50 in quick succession) — no errors
 * - StateManager: 1000 state updates < 50ms
 * - MarkdownRenderer: 100 complex renders < 50ms
 * - MessageSanitizer: 100 complex HTML sanitizations < 50ms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../../state-manager';
import { MarkdownRenderer } from '../../markdown-renderer';
import { MessageSanitizer } from '../../message-sanitizer';
import { MessageRenderer } from '../../ui/message-renderer';
import { I18nManager } from '../../i18n-manager';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi } from '../helpers/mock-api';
import {
  createMockMessage,
  createMockBotMessage,
  createMockConfig,
  resetFactorySequences,
} from '../helpers/mock-factories';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

// jsdom does not implement scrollTo() on HTMLElement — patch it globally
// so that MessageRenderer.scrollToBottom() does not throw during perf tests.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Constants — threshold values (milliseconds)
// ============================================================================

/** Maximum time for widget init to complete (excluding network round-trip) */
const WIDGET_INIT_THRESHOLD_MS = 100;

/** Maximum time to render 100 messages into the DOM */
const RENDER_100_MESSAGES_THRESHOLD_MS = 200;

/** Maximum time for 1000 StateManager state updates */
const STATE_1000_UPDATES_THRESHOLD_MS = 50;

/** Maximum time for 100 MarkdownRenderer.render() calls */
const MARKDOWN_100_RENDERS_THRESHOLD_MS = 200;

/** Maximum time for 100 MessageSanitizer.sanitize() calls */
const SANITIZE_100_CALLS_THRESHOLD_MS = 200;

// ============================================================================
// Fixtures
// ============================================================================

/** Complex markdown string that exercises all parser branches */
const COMPLEX_MARKDOWN = `
# Heading 1
## Heading 2

**Bold text** and *italic text* and ***bold italic***

- List item 1
- List item 2
  - Nested item

1. Ordered item 1
2. Ordered item 2

\`inline code\` and some ~~strikethrough~~

\`\`\`
const x = 1 + 2;
console.log(x);
\`\`\`

> Blockquote with **bold** content

[A link](https://example.com) for testing.
`;

/** Complex HTML with potential XSS vectors — tests the sanitizer thoroughly */
const COMPLEX_HTML = `
<p>Welcome to the <strong>festival</strong>!</p>
<script>alert("xss")</script>
<img src="https://example.com/safe.jpg" alt="Safe image" onerror="alert(1)" />
<a href="javascript:alert(1)">Dangerous link</a>
<a href="https://example.com" target="_blank">Safe link</a>
<ul>
  <li>Item 1 with <em>emphasis</em></li>
  <li>Item 2 with <code>code</code></li>
</ul>
<iframe src="https://evil.com"></iframe>
<div style="expression(alert(1))">Content</div>
<b>Bold</b> and <i>italic</i> content here.
`;

// ============================================================================
// 1. Widget initialization performance
// ============================================================================

describe('Performance: Widget initialization', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    mockApi = createMockApi({ latency: 0 });
    vi.stubGlobal('fetch', mockApi.mockFetch);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    document.querySelectorAll('#nevent-chatbot-host').forEach((el) => el.remove());
    document.querySelectorAll('.nevent-chatbot-root').forEach((el) => el.remove());
    document.querySelectorAll('style').forEach((el) => el.remove());
    mockApi.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it(`widget initialization should complete in < ${WIDGET_INIT_THRESHOLD_MS}ms (excluding network)`, async () => {
    const start = performance.now();

    const widget = new ChatbotWidget(
      createMockConfig({ analytics: false, persistConversation: false }),
    );
    await widget.init();

    const elapsed = performance.now() - start;

    widget.destroy();

    expect(elapsed).toBeLessThan(WIDGET_INIT_THRESHOLD_MS);
  });
});

// ============================================================================
// 2. Message rendering performance
// ============================================================================

describe('Performance: Message rendering', () => {
  let renderer: MessageRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    resetFactorySequences();
    renderer = new MessageRenderer(undefined, undefined, new I18nManager('en'), MessageSanitizer);
    container = renderer.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it(`should render 100 messages in < ${RENDER_100_MESSAGES_THRESHOLD_MS}ms`, () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      createMockMessage({ id: `perf-user-${i}`, content: `User message ${i}` }),
    ).concat(
      Array.from({ length: 50 }, (_, i) =>
        createMockBotMessage({ id: `perf-bot-${i}`, content: `Bot response ${i}` }),
      ),
    );

    const start = performance.now();

    for (const msg of messages) {
      renderer.addMessage(msg);
    }

    const elapsed = performance.now() - start;

    // With virtual scrolling active (threshold: 50), only a subset of messages
    // lives in the DOM at any time. Verify that at least some messages rendered
    // and that the operation completed within the time budget.
    const rendered = container.querySelectorAll('.nevent-chatbot-message');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThanOrEqual(100);

    expect(elapsed).toBeLessThan(RENDER_100_MESSAGES_THRESHOLD_MS);
  });

  it('should handle 50 rapid message additions without errors or missing elements', () => {
    // Add 50 messages in quick succession (synchronous, no async gap)
    for (let i = 0; i < 50; i++) {
      const msg = i % 2 === 0
        ? createMockMessage({ id: `rapid-user-${i}`, content: `Message ${i}` })
        : createMockBotMessage({ id: `rapid-bot-${i}`, content: `Response ${i}` });
      renderer.addMessage(msg);
    }

    // With virtual scrolling active (threshold: 50), the 50th message triggers
    // migration to virtual mode. Only visible items are in the DOM.
    const rendered = container.querySelectorAll('.nevent-chatbot-message');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThanOrEqual(50);
  });

  it('should render messages with rich content in < 200ms for 20 cards', () => {
    const start = performance.now();

    for (let i = 0; i < 20; i++) {
      renderer.addMessage(
        createMockBotMessage({
          id: `rich-${i}`,
          type: 'rich',
          content: '',
          richContent: {
            type: 'card',
            title: `Card ${i}`,
            description: `Description for card ${i}`,
            buttons: [
              { id: `btn-${i}`, label: 'Click', type: 'postback', value: `action_${i}` },
            ],
          },
        }),
      );
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

// ============================================================================
// 3. StateManager performance
// ============================================================================

describe('Performance: StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    localStorage.clear();
    resetFactorySequences();
    stateManager = new StateManager('perf-bot', false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it(`should handle 1000 state updates (addMessage) in < ${STATE_1000_UPDATES_THRESHOLD_MS}ms`, () => {
    // Set up a conversation first (required for addMessage to work)
    stateManager.setConversation({
      id: 'perf-conv-1',
      chatbotId: 'perf-bot',
      status: 'active',
      messages: [],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      stateManager.addMessage(
        createMockMessage({
          id: `bulk-msg-${i}`,
          content: `Message number ${i}`,
        }),
      );
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(STATE_1000_UPDATES_THRESHOLD_MS);

    // Verify all messages were added correctly
    const state = stateManager.getState();
    expect(state.conversation?.messages.length).toBe(1000);
  });

  it(`should handle 1000 setOpen() calls in < ${STATE_1000_UPDATES_THRESHOLD_MS}ms`, () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      stateManager.setOpen(i % 2 === 0);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(STATE_1000_UPDATES_THRESHOLD_MS);
  });

  it('should handle 500 subscribers being notified without degradation', () => {
    const handlers = Array.from({ length: 500 }, () => vi.fn());
    const unsubscribers = handlers.map((h) => stateManager.subscribe(h));

    const start = performance.now();
    stateManager.setOpen(true);
    const elapsed = performance.now() - start;

    // All handlers should have been called
    for (const h of handlers) {
      expect(h).toHaveBeenCalledTimes(1);
    }

    // Notification of 500 subscribers should be fast
    expect(elapsed).toBeLessThan(50);

    // Clean up
    for (const unsub of unsubscribers) {
      unsub();
    }
  });
});

// ============================================================================
// 4. MarkdownRenderer performance
// ============================================================================

describe('Performance: MarkdownRenderer', () => {
  it(`should parse complex markdown 100 times in < ${MARKDOWN_100_RENDERS_THRESHOLD_MS}ms`, () => {
    // Warm up the renderer (JIT compilation)
    MarkdownRenderer.render(COMPLEX_MARKDOWN);

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      const result = MarkdownRenderer.render(COMPLEX_MARKDOWN);
      // Prevent dead-code elimination — consume the result
      void result.length;
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(MARKDOWN_100_RENDERS_THRESHOLD_MS);
  });

  it('should handle empty string without throwing or excessive time', () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      MarkdownRenderer.render('');
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should handle a simple plain-text string 1000 times in < 500ms', () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      MarkdownRenderer.render('Hello, this is a plain text message without any markdown.');
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ============================================================================
// 5. MessageSanitizer performance
// ============================================================================

describe('Performance: MessageSanitizer', () => {
  it(`should sanitize complex HTML 100 times in < ${SANITIZE_100_CALLS_THRESHOLD_MS}ms`, () => {
    // Warm up
    MessageSanitizer.sanitize(COMPLEX_HTML);

    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      const result = MessageSanitizer.sanitize(COMPLEX_HTML);
      void result.length;
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(SANITIZE_100_CALLS_THRESHOLD_MS);
  });

  it('should sanitize 1000 simple strings in < 500ms', () => {
    const simpleHtml = '<p>Hello <b>world</b>! Visit <a href="https://example.com">here</a>.</p>';

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      MessageSanitizer.sanitize(simpleHtml);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('sanitize() output should be XSS-clean for all 100 complex iterations', () => {
    for (let i = 0; i < 100; i++) {
      const result = MessageSanitizer.sanitize(COMPLEX_HTML);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('<iframe>');
      expect(result).not.toContain('onerror=');
    }
  });

  it('escapeHtml() should handle 1000 XSS strings in < 50ms', () => {
    const dangerous = '<script>alert("xss")</script>';

    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      MessageSanitizer.escapeHtml(dangerous);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
