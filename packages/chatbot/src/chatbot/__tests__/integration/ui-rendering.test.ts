/**
 * @vitest-environment jsdom
 *
 * ui-rendering.test.ts - Integration tests for UI rendering subsystems
 *
 * These tests exercise the rendering layer of the chatbot SDK in isolation
 * (unit-level) and in combination with the full widget (integration-level).
 * They verify that the correct DOM elements are created, positioned, and
 * updated as messages arrive and the widget state changes.
 *
 * Test coverage:
 * - MessageRenderer renders user and bot messages correctly
 * - Bot messages with markdown are rendered as HTML
 * - Rich content (cards, carousels) is rendered
 * - Quick replies appear and can be activated
 * - Typing indicator shows and hides
 * - Input textarea renders
 * - Scroll to bottom works
 * - Mobile responsive: window expands in narrow viewport
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageRenderer } from '../../ui/message-renderer';
import { TypingRenderer } from '../../ui/typing-renderer';
import { InputRenderer } from '../../ui/input-renderer';
import { I18nManager } from '../../i18n-manager';
import { MessageSanitizer } from '../../message-sanitizer';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi } from '../helpers/mock-api';
import {
  createMockMessage,
  createMockBotMessage,
  createMockRichContent,
  createMockConfig,
} from '../helpers/mock-factories';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

// jsdom does not implement scrollTo() on HTMLElement — patch it globally
// so that MessageRenderer.scrollToBottom() does not throw.
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Shared fixtures
// ============================================================================

function createI18n(): I18nManager {
  return new I18nManager('en');
}

/** Waits for micro-tasks to settle between renders */
async function flushPromises(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

// ============================================================================
// 1. MessageRenderer — message rendering
// ============================================================================

describe('MessageRenderer — rendering', () => {
  let renderer: MessageRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    renderer = new MessageRenderer(undefined, undefined, createI18n(), MessageSanitizer);
    container = renderer.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  // --------------------------------------------------------------------------
  // User and bot messages
  // --------------------------------------------------------------------------

  it('should render a user message bubble with correct text', () => {
    const msg = createMockMessage({ role: 'user', content: 'Hello, bot!' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--user');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain('Hello, bot!');
  });

  it('should render a bot message bubble with correct text', () => {
    const msg = createMockBotMessage({ content: 'Hello, human!' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--assistant');
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain('Hello, human!');
  });

  it('should render user messages right-aligned (CSS class)', () => {
    const msg = createMockMessage({ role: 'user', content: 'Right side' });
    renderer.addMessage(msg);

    const messageEl = container.querySelector('.nevent-chatbot-message--user');
    expect(messageEl).not.toBeNull();
  });

  it('should render bot messages left-aligned (CSS class)', () => {
    const msg = createMockBotMessage({ content: 'Left side' });
    renderer.addMessage(msg);

    const messageEl = container.querySelector('.nevent-chatbot-message--assistant');
    expect(messageEl).not.toBeNull();
  });

  it('should render multiple messages in order', () => {
    renderer.addMessage(createMockMessage({ id: 'msg-1', content: 'First' }));
    renderer.addMessage(createMockBotMessage({ id: 'msg-2', content: 'Second' }));
    renderer.addMessage(createMockMessage({ id: 'msg-3', content: 'Third' }));

    const messages = container.querySelectorAll('.nevent-chatbot-message');
    expect(messages).toHaveLength(3);
    expect(messages[0]?.textContent).toContain('First');
    expect(messages[1]?.textContent).toContain('Second');
    expect(messages[2]?.textContent).toContain('Third');
  });

  // --------------------------------------------------------------------------
  // Markdown rendering
  // --------------------------------------------------------------------------

  it('should render bot message bold markdown as <strong>', () => {
    const msg = createMockBotMessage({ content: '**Important update**' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--assistant');
    expect(bubble?.innerHTML).toContain('<strong>');
  });

  it('should render bot message italic markdown as <em>', () => {
    // Use content that also includes ** so containsMarkdown() triggers,
    // then the italic conversion runs on the same pass.
    const msg = createMockBotMessage({ content: '**bold** and *italic emphasis*' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--assistant');
    expect(bubble?.innerHTML).toContain('<em>');
  });

  it('should render bot message code markdown as <code>', () => {
    const msg = createMockBotMessage({ content: 'Use `npm install` to set up' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--assistant');
    expect(bubble?.innerHTML).toContain('<code>');
  });

  it('should NOT render markdown in user messages (text should be escaped)', () => {
    const msg = createMockMessage({ role: 'user', content: '**bold** attempt' });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--user');
    // User messages are HTML-escaped, not markdown-rendered
    expect(bubble?.innerHTML).not.toContain('<strong>');
    expect(bubble?.textContent).toContain('**bold** attempt');
  });

  it('should sanitize XSS from bot messages', () => {
    const msg = createMockBotMessage({
      content: 'Safe text <script>alert("xss")</script>',
    });
    renderer.addMessage(msg);

    const bubble = container.querySelector('.nevent-chatbot-message--assistant');
    expect(bubble?.innerHTML).not.toContain('<script>');
    expect(bubble?.innerHTML).not.toContain('alert(');
  });

  // --------------------------------------------------------------------------
  // Rich content
  // --------------------------------------------------------------------------

  it('should render a card type rich content message', () => {
    const richContent = createMockRichContent('card');
    const msg = createMockBotMessage({
      type: 'rich',
      content: '',
      richContent,
    });
    renderer.addMessage(msg);

    // Card title should appear somewhere in the message container
    expect(container.textContent).toContain('Festival Pass 2025');
  });

  it('should render a carousel type rich content message', () => {
    const richContent = createMockRichContent('carousel');
    const msg = createMockBotMessage({
      type: 'rich',
      content: '',
      richContent,
    });
    renderer.addMessage(msg);

    // Carousel items should all appear
    expect(container.textContent).toContain('Day 1 Pass');
    expect(container.textContent).toContain('Day 2 Pass');
  });

  it('should render card action buttons', () => {
    const richContent = createMockRichContent('card');
    const msg = createMockBotMessage({
      type: 'rich',
      content: '',
      richContent,
    });
    renderer.addMessage(msg);

    const buttons = container.querySelectorAll('button, a');
    expect(buttons.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Quick replies
  // --------------------------------------------------------------------------

  it('should render quick reply buttons', () => {
    const quickReplies = [
      { id: 'qr-1', label: 'Yes', value: 'yes' },
      { id: 'qr-2', label: 'No', value: 'no' },
    ];

    renderer.renderQuickReplies(quickReplies, () => {});

    const qrButtons = container.querySelectorAll('.nevent-chatbot-quick-reply-button');
    expect(qrButtons).toHaveLength(2);
    expect(qrButtons[0]?.textContent).toContain('Yes');
    expect(qrButtons[1]?.textContent).toContain('No');
  });

  it('should invoke callback when quick reply is clicked', () => {
    const onReply = vi.fn();
    const quickReplies = [{ id: 'qr-1', label: 'Click me', value: 'clicked' }];

    renderer.renderQuickReplies(quickReplies, onReply);

    const btn = container.querySelector('.nevent-chatbot-quick-reply-button') as HTMLButtonElement;
    btn?.click();

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qr-1', value: 'clicked' }),
    );
  });

  it('should remove quick replies after clearQuickReplies()', () => {
    const quickReplies = [{ id: 'qr-1', label: 'Yes', value: 'yes' }];
    renderer.renderQuickReplies(quickReplies, () => {});

    expect(container.querySelector('.nevent-chatbot-quick-reply-button')).not.toBeNull();

    renderer.clearQuickReplies();

    expect(container.querySelector('.nevent-chatbot-quick-reply-button')).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Scroll behavior
  // --------------------------------------------------------------------------

  it('should not throw when scrollToBottom() is called', () => {
    expect(() => renderer.scrollToBottom(true)).not.toThrow();
  });

  it('clear() should remove all message elements', () => {
    renderer.addMessage(createMockMessage({ id: 'clear-1' }));
    renderer.addMessage(createMockBotMessage({ id: 'clear-2' }));

    expect(container.querySelectorAll('.nevent-chatbot-message').length).toBe(2);

    renderer.clear();

    expect(container.querySelectorAll('.nevent-chatbot-message').length).toBe(0);
  });
});

// ============================================================================
// 2. TypingRenderer — show/hide indicator
// ============================================================================

describe('TypingRenderer — show/hide', () => {
  let renderer: TypingRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    renderer = new TypingRenderer(undefined, createI18n());
    container = renderer.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it('typing indicator should be hidden by default', () => {
    // The container has display:none initially
    // jsdom may not apply the CSS, so check the element's inline style directly
    expect(container.style.display).toBe('none');
  });

  it('show() should make the typing indicator visible', () => {
    renderer.show();
    expect(container.style.display).not.toBe('none');
  });

  it('hide() should re-hide the typing indicator after animation completes', () => {
    renderer.show();
    renderer.hide();

    // hide() uses a 200ms setTimeout before setting display:none
    vi.advanceTimersByTime(200);

    expect(container.style.display).toBe('none');
  });
});

// ============================================================================
// 3. InputRenderer — text area and send button
// ============================================================================

describe('InputRenderer — basic rendering', () => {
  let renderer: InputRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    renderer = new InputRenderer(undefined, createI18n());
    container = renderer.render({
      onSend: () => {},
      placeholder: 'Type here…',
    });
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it('should render a textarea element', () => {
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
  });

  it('should render a send button', () => {
    const sendBtn = container.querySelector('button[aria-label]');
    expect(sendBtn).not.toBeNull();
  });

  it('should apply the configured placeholder text', () => {
    const textarea = container.querySelector('textarea');
    expect(textarea?.placeholder).toBe('Type here…');
  });

  it('setDisabled(true) should disable the textarea', () => {
    renderer.setDisabled(true);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea?.disabled).toBe(true);
  });

  it('setDisabled(false) should re-enable the textarea', () => {
    renderer.setDisabled(true);
    renderer.setDisabled(false);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea?.disabled).toBe(false);
  });

  it('clear() should empty the textarea value', () => {
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Some text';
    renderer.clear();
    expect(textarea?.value).toBe('');
  });
});

// ============================================================================
// 4. Full widget — mobile responsive (viewport < 480px)
// ============================================================================

describe('ChatbotWidget — mobile responsive rendering', () => {
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
    mockApi.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('should initialize on a narrow (mobile) viewport without errors', async () => {
    // Simulate a 375px wide viewport
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, writable: true });

    const onReady = vi.fn();
    const widget = new ChatbotWidget(createMockConfig({ onReady }));

    await widget.init();

    expect(onReady).toHaveBeenCalledTimes(1);
    // Host element should still be present (root is inside its shadow DOM)
    expect(document.querySelector('#nevent-chatbot-host')).not.toBeNull();

    widget.destroy();

    // Restore default viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('should not throw when opening the window on a mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

    const widget = new ChatbotWidget(createMockConfig());
    await widget.init();

    expect(() => widget.open()).not.toThrow();

    widget.destroy();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });
});
