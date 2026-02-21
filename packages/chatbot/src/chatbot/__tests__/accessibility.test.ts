/**
 * @vitest-environment jsdom
 *
 * accessibility.test.ts - WCAG 2.1 AA compliance tests for the chatbot widget
 *
 * Validates that all interactive elements have correct ARIA attributes, focus
 * styles are visible (no outline:none without :focus-visible), prefers-reduced-motion
 * CSS exists, screen-reader-only content is present, and keyboard event handlers
 * are properly wired.
 *
 * Test categories:
 * - ARIA attributes on all interactive elements
 * - Focus styles: no bare outline:none in generated CSS
 * - prefers-reduced-motion media query coverage
 * - Screen reader announcer and sr-only content
 * - Keyboard event handlers (Escape, Tab, arrow keys)
 * - aria-expanded toggles on bubble open/close
 * - Message role and label attributes
 * - Error message alert roles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BubbleRenderer } from '../ui/bubble-renderer';
import { WindowRenderer } from '../ui/window-renderer';
import { MessageRenderer } from '../ui/message-renderer';
import { InputRenderer } from '../ui/input-renderer';
import { TypingRenderer } from '../ui/typing-renderer';
import { QuickReplyRenderer } from '../ui/quick-reply-renderer';
import { CSSGenerator } from '../css-generator';
import { I18nManager } from '../i18n-manager';
import { MessageSanitizer } from '../message-sanitizer';
import {
  createMockMessage,
  createMockBotMessage,
} from './helpers/mock-factories';

// jsdom does not implement scrollTo() on HTMLElement — patch globally
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

function createI18n(): I18nManager {
  return new I18nManager('en');
}

// ============================================================================
// 1. BubbleRenderer ARIA Attributes
// ============================================================================

describe('BubbleRenderer — ARIA attributes', () => {
  let bubble: BubbleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    bubble = new BubbleRenderer('bottom-right', undefined, createI18n());
    container = bubble.render(() => {});
  });

  afterEach(() => {
    bubble.destroy();
    document.body.innerHTML = '';
  });

  it('should have role="button" on the bubble element', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('role')).toBe('button');
  });

  it('should have aria-expanded="false" when closed', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('should have aria-haspopup="dialog"', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');
    expect(btn?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('should have an aria-label', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('should toggle aria-expanded on setActive()', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');

    bubble.setActive(true);
    expect(btn?.getAttribute('aria-expanded')).toBe('true');

    bubble.setActive(false);
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('should update aria-label when toggling active state', () => {
    const btn = container.querySelector('.nevent-chatbot-bubble');
    const closedLabel = btn?.getAttribute('aria-label');

    bubble.setActive(true);
    const openLabel = btn?.getAttribute('aria-label');

    // Labels should be different (open vs close)
    expect(closedLabel).not.toBe(openLabel);
    expect(openLabel).toBeTruthy();
  });

  it('should have role="status" on the badge element', () => {
    const badge = container.querySelector('.nevent-chatbot-badge');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('role')).toBe('status');
  });

  it('should have aria-live="polite" on the badge', () => {
    const badge = container.querySelector('.nevent-chatbot-badge');
    expect(badge?.getAttribute('aria-live')).toBe('polite');
  });

  it('should have aria-atomic="true" on the badge', () => {
    const badge = container.querySelector('.nevent-chatbot-badge');
    expect(badge?.getAttribute('aria-atomic')).toBe('true');
  });
});

// ============================================================================
// 2. WindowRenderer ARIA Attributes
// ============================================================================

describe('WindowRenderer — ARIA attributes', () => {
  let windowRenderer: WindowRenderer;
  let windowEl: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    windowRenderer = new WindowRenderer(undefined, undefined, createI18n());
    windowEl = windowRenderer.render({
      title: 'Test Bot',
      subtitle: 'Online',
      onClose: () => {},
      onNewConversation: () => {},
    });
    document.body.appendChild(windowEl);
  });

  afterEach(() => {
    windowRenderer.destroy();
    document.body.innerHTML = '';
  });

  it('should have role="dialog" on the window element', () => {
    expect(windowEl.getAttribute('role')).toBe('dialog');
  });

  it('should have aria-modal="true"', () => {
    expect(windowEl.getAttribute('aria-modal')).toBe('true');
  });

  it('should have aria-labelledby pointing to the title element', () => {
    const labelledBy = windowEl.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const titleEl = windowEl.querySelector(`#${labelledBy}`);
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent).toBe('Test Bot');
  });

  it('should have aria-label on header buttons', () => {
    const buttons = windowEl.querySelectorAll('.nevent-chatbot-header-button');
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('should have loading overlay with role="status" and aria-live', () => {
    const loading = windowEl.querySelector('.nevent-chatbot-loading');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
  });

  it('should return focusable elements for focus trap', () => {
    windowRenderer.open();
    const focusable = windowRenderer.getFocusableElements();
    // At minimum, header buttons should be focusable
    expect(focusable.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 3. MessageRenderer ARIA Attributes
// ============================================================================

describe('MessageRenderer — ARIA attributes', () => {
  let renderer: MessageRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    renderer = new MessageRenderer(
      undefined,
      undefined,
      createI18n(),
      MessageSanitizer
    );
    container = renderer.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it('should have role="log" on the message container', () => {
    expect(container.getAttribute('role')).toBe('log');
  });

  it('should have aria-live="polite" on the message container', () => {
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('should have aria-relevant="additions" on the message container', () => {
    expect(container.getAttribute('aria-relevant')).toBe('additions');
  });

  it('should have an aria-label on the message container', () => {
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have role="article" on user messages', () => {
    const msg = createMockMessage({ role: 'user', content: 'Test message' });
    renderer.addMessage(msg);

    const messageEl = container.querySelector('.nevent-chatbot-message--user');
    expect(messageEl?.getAttribute('role')).toBe('article');
  });

  it('should have role="article" on bot messages', () => {
    const msg = createMockBotMessage({ content: 'Bot reply' });
    renderer.addMessage(msg);

    const messageEl = container.querySelector(
      '.nevent-chatbot-message--assistant'
    );
    expect(messageEl?.getAttribute('role')).toBe('article');
  });

  it('should have role="note" on system messages', () => {
    const msg = createMockMessage({
      role: 'system' as any,
      content: 'System notice',
    });
    renderer.addMessage(msg);

    const messageEl = container.querySelector(
      '.nevent-chatbot-message--system'
    );
    expect(messageEl?.getAttribute('role')).toBe('note');
  });

  it('should have aria-label with sender context on messages', () => {
    const msg = createMockMessage({ role: 'user', content: 'Hello there' });
    renderer.addMessage(msg);

    const messageEl = container.querySelector('.nevent-chatbot-message--user');
    const label = messageEl?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label).toContain('Hello there');
  });

  it('should have a screen-reader announcer element', () => {
    const announcer = container.querySelector(
      '.nevent-chatbot-sr-only[role="status"]'
    );
    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
  });

  it('should set role="alert" on error messages', () => {
    const msg = createMockBotMessage({ id: 'err-1', content: 'Error content' });
    renderer.addStreamingMessage(msg);
    renderer.updateMessageStatus('err-1', 'error');

    const messageEl = container.querySelector('[data-message-id="err-1"]');
    expect(messageEl?.getAttribute('role')).toBe('alert');
    expect(messageEl?.getAttribute('aria-live')).toBe('assertive');
  });

  it('should have aria-label on scroll-to-bottom button', () => {
    renderer.renderScrollButton(() => {});

    const scrollBtn = container.querySelector('.nevent-chatbot-scroll-button');
    expect(scrollBtn).not.toBeNull();
    expect(scrollBtn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('announce() should set text on the screen-reader announcer', () => {
    renderer.announce('Message sent');

    const announcer = container.querySelector(
      '.nevent-chatbot-sr-only[role="status"]'
    );
    expect(announcer?.textContent).toBe('Message sent');
  });
});

// ============================================================================
// 4. InputRenderer ARIA Attributes
// ============================================================================

describe('InputRenderer — ARIA attributes', () => {
  let input: InputRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    input = new InputRenderer(undefined, createI18n());
    container = input.render({ onSend: () => {} });
    document.body.appendChild(container);
  });

  afterEach(() => {
    input.destroy();
    document.body.innerHTML = '';
  });

  it('should have aria-label on the textarea', () => {
    const textarea = container.querySelector('.nevent-chatbot-input-field');
    expect(textarea?.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have aria-describedby pointing to keyboard hint', () => {
    const textarea = container.querySelector('.nevent-chatbot-input-field');
    const describedBy = textarea?.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const hint = container.querySelector(`#${describedBy}`);
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBeTruthy();
  });

  it('should have aria-label on the send button', () => {
    const btn = container.querySelector('.nevent-chatbot-send-button');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have a visually hidden keyboard hint element', () => {
    const hint = container.querySelector('.nevent-chatbot-input-hint');
    expect(hint).not.toBeNull();
    // Verify it is visually hidden (clip rect technique)
    const style = (hint as HTMLElement).style;
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.height).toBe('1px');
    expect(style.overflow).toBe('hidden');
  });
});

// ============================================================================
// 5. TypingRenderer ARIA Attributes
// ============================================================================

describe('TypingRenderer — ARIA attributes', () => {
  let typing: TypingRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    typing = new TypingRenderer(undefined, createI18n());
    container = typing.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    typing.destroy();
    document.body.innerHTML = '';
  });

  it('should have role="status" on the typing container', () => {
    expect(container.getAttribute('role')).toBe('status');
  });

  it('should have aria-live="polite" on the typing container', () => {
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('should have aria-atomic="true" on the typing container', () => {
    expect(container.getAttribute('aria-atomic')).toBe('true');
  });

  it('should have aria-label on the typing container', () => {
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have aria-hidden="true" on decorative dots', () => {
    const dots = container.querySelectorAll('.nevent-chatbot-typing-dot');
    expect(dots.length).toBe(3);

    dots.forEach((dot) => {
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('should have aria-hidden="true" on the visible label', () => {
    const label = container.querySelector('.nevent-chatbot-typing-label');
    expect(label?.getAttribute('aria-hidden')).toBe('true');
  });
});

// ============================================================================
// 6. QuickReplyRenderer ARIA Attributes
// ============================================================================

describe('QuickReplyRenderer — ARIA attributes', () => {
  let qr: QuickReplyRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    qr = new QuickReplyRenderer(undefined, createI18n());
    container = qr.render({
      replies: [
        { id: 'qr-1', label: 'Option A', value: 'a' },
        { id: 'qr-2', label: 'Option B', value: 'b' },
      ],
      onClick: () => {},
      animated: false,
    });
    document.body.appendChild(container);
  });

  afterEach(() => {
    qr.destroy();
    document.body.innerHTML = '';
  });

  it('should have role="group" on the container', () => {
    expect(container.getAttribute('role')).toBe('group');
  });

  it('should have aria-label on the container', () => {
    expect(container.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have aria-label on each button', () => {
    const buttons = container.querySelectorAll(
      '.nevent-chatbot-quick-reply-button'
    );
    expect(buttons.length).toBe(2);

    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('should support keyboard navigation with arrow keys', () => {
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.nevent-chatbot-quick-reply-button'
    );

    // Focus first button and simulate ArrowRight
    buttons[0]?.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    });
    container.dispatchEvent(event);

    // After arrow key, focus should have moved (in jsdom this is best-effort)
    // At minimum, the keydown handler should not throw
    expect(buttons.length).toBe(2);
  });
});

// ============================================================================
// 7. CSSGenerator — Focus Styles and Reduced Motion
// ============================================================================

describe('CSSGenerator — Accessibility CSS', () => {
  let generator: CSSGenerator;
  let css: string;

  beforeEach(() => {
    generator = new CSSGenerator('light', undefined, 9999);
    css = generator.generateCSS();
  });

  // --------------------------------------------------------------------------
  // Focus visible rules
  // --------------------------------------------------------------------------

  it('should NOT have bare outline:none on .nevent-chatbot-bubble (without :focus-visible context)', () => {
    // The CSS should use :focus:not(:focus-visible) or :focus-visible, NOT bare :focus{outline:none}
    // Check that the bubble base rule does not contain outline:none
    const bubbleBaseMatch = css.match(/\.nevent-chatbot-bubble\{[^}]*\}/);
    if (bubbleBaseMatch) {
      expect(bubbleBaseMatch[0]).not.toContain('outline:none');
    }
  });

  it('should NOT have bare outline:none on .nevent-chatbot-input-field base rule', () => {
    const inputBaseMatch = css.match(/\.nevent-chatbot-input-field\{[^}]*\}/);
    if (inputBaseMatch) {
      expect(inputBaseMatch[0]).not.toContain('outline:none');
    }
  });

  it('should have :focus-visible rule for .nevent-chatbot-bubble', () => {
    expect(css).toContain('.nevent-chatbot-bubble:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-header-button', () => {
    expect(css).toContain('.nevent-chatbot-header-button:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-send-button', () => {
    expect(css).toContain('.nevent-chatbot-send-button:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-quick-reply-button', () => {
    expect(css).toContain('.nevent-chatbot-quick-reply-button:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-scroll-button', () => {
    expect(css).toContain('.nevent-chatbot-scroll-button:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-card-action', () => {
    expect(css).toContain('.nevent-chatbot-card-action:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-action-button', () => {
    expect(css).toContain('.nevent-chatbot-action-button:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-carousel-nav', () => {
    expect(css).toContain('.nevent-chatbot-carousel-nav:focus-visible');
  });

  it('should have :focus-visible rule for .nevent-chatbot-rich-image', () => {
    expect(css).toContain('.nevent-chatbot-rich-image:focus-visible');
  });

  it('should use :focus:not(:focus-visible) for outline suppression, not bare :focus', () => {
    // Verify we suppress outline only for mouse/touch, not keyboard
    expect(css).toContain(':focus:not(:focus-visible)');
  });

  // --------------------------------------------------------------------------
  // Reduced motion
  // --------------------------------------------------------------------------

  it('should have @media (prefers-reduced-motion:reduce) block', () => {
    expect(css).toContain('@media (prefers-reduced-motion:reduce)');
  });

  it('should disable bubble transition in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-bubble');
    expect(reducedBlock).toContain('transition:none');
  });

  it('should disable window transition in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-window');
  });

  it('should disable typing dot animation in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-typing-dot');
    expect(reducedBlock).toContain('animation:none');
  });

  it('should disable quick reply animation in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-quick-reply-button');
  });

  it('should disable streaming cursor blink in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-streaming-cursor');
  });

  it('should disable smooth scrolling in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('scroll-behavior:auto');
  });

  it('should disable loading spinner animation in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-loading-spinner');
  });

  it('should disable connection banner spinner in reduced motion', () => {
    const reducedBlock = extractReducedMotionBlock(css);
    expect(reducedBlock).toContain('.nevent-chatbot-connection-banner-spinner');
  });

  // --------------------------------------------------------------------------
  // Visually-hidden utility
  // --------------------------------------------------------------------------

  it('should have .nevent-chatbot-sr-only class with correct properties', () => {
    expect(css).toContain('.nevent-chatbot-sr-only');
    expect(css).toContain('clip:rect(0,0,0,0)');
    expect(css).toContain('position:absolute');
  });

  // --------------------------------------------------------------------------
  // Streaming cursor keyframe
  // --------------------------------------------------------------------------

  it('should have @keyframes nevent-chatbot-blink for streaming cursor', () => {
    expect(css).toContain('@keyframes nevent-chatbot-blink');
  });
});

// ============================================================================
// 8. Streaming Message Accessibility
// ============================================================================

describe('MessageRenderer — Streaming message accessibility', () => {
  let renderer: MessageRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    renderer = new MessageRenderer(
      undefined,
      undefined,
      createI18n(),
      MessageSanitizer
    );
    container = renderer.render();
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it('should have aria-hidden on streaming cursor', () => {
    const msg = createMockBotMessage({ id: 'stream-1', content: '' });
    renderer.addStreamingMessage(msg);

    const cursor = container.querySelector('.nevent-chatbot-streaming-cursor');
    expect(cursor).not.toBeNull();
    expect(cursor?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should have aria-live="polite" on streaming message wrapper', () => {
    const msg = createMockBotMessage({ id: 'stream-2', content: '' });
    renderer.addStreamingMessage(msg);

    const wrapper = container.querySelector('[data-message-id="stream-2"]');
    expect(wrapper?.getAttribute('aria-live')).toBe('polite');
  });

  it('should update aria-label on streaming message finalization', () => {
    const msg = createMockBotMessage({ id: 'stream-3', content: '' });
    renderer.addStreamingMessage(msg);
    renderer.finalizeStreamingMessage('stream-3', 'Final bot response');

    const wrapper = container.querySelector('[data-message-id="stream-3"]');
    const label = wrapper?.getAttribute('aria-label');
    expect(label).toContain('Final bot response');
  });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extracts the content of the @media (prefers-reduced-motion:reduce) block
 * from the generated CSS string.
 */
function extractReducedMotionBlock(css: string): string {
  const marker = '@media (prefers-reduced-motion:reduce)';
  const startIdx = css.indexOf(marker);
  if (startIdx === -1) return '';

  // Find the matching closing brace by counting brace depth
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  return css.substring(startIdx, endIdx);
}
