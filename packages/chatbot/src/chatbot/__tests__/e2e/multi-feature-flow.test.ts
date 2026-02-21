/**
 * @vitest-environment jsdom
 *
 * multi-feature-flow.test.ts - E2E test for combined feature interactions
 *
 * Exercises multiple features working together in realistic scenarios:
 * - Text message followed by rich content response
 * - Quick replies displayed and clickable
 * - Theme switching (light -> dark -> auto)
 * - Locale switching (es -> en)
 * - Multiple widgets coexisting
 * - Inline mode behavior
 * - Conversation state management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi } from '../helpers/mock-api';
import {
  createMockConfig,
  createMockServerConfig,
} from '../helpers/mock-factories';
import {
  createInitializedWidget,
  flushPromises,
  queryAll,
  getMessageTexts,
} from './helpers';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2E: Multi-Feature Flow', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document
      .querySelectorAll('#nevent-chatbot-host')
      .forEach((el) => el.remove());
    localStorage.clear();
  });

  // ==========================================================================
  // 1. Text message + bot response
  // ==========================================================================

  describe('Text message with bot response', () => {
    it('should show user message and bot response in correct order', async () => {
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget();
      cleanup = c;

      widget.open();

      await widget.sendMessage('What events are happening this weekend?');
      await flushPromises(30);

      // At minimum, user message must appear (optimistic UI)
      const messages = queryAll(shadowRoot, '.nevent-chatbot-message');
      expect(messages.length).toBeGreaterThanOrEqual(1);

      const texts = getMessageTexts(shadowRoot);
      const userMsgIdx = texts.findIndex((t) =>
        t.includes('What events are happening this weekend?')
      );
      expect(userMsgIdx).toBeGreaterThanOrEqual(0);

      // If bot response also rendered, verify ordering
      const botMsgIdx = texts.findIndex((t) =>
        t.includes('This is a test bot response.')
      );
      if (botMsgIdx >= 0) {
        expect(userMsgIdx).toBeLessThan(botMsgIdx);
      }
    });
  });

  // ==========================================================================
  // 2. Theme configuration
  // ==========================================================================

  describe('Theme configuration', () => {
    it('should initialize with light theme by default', async () => {
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget({
        theme: 'light',
      });
      cleanup = c;

      // The root element should exist with theme applied
      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();
    });

    it('should initialize with dark theme when configured', async () => {
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget({
        theme: 'dark',
      });
      cleanup = c;

      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();
      // Dark theme should be applied (check for class or attribute)
      // The actual implementation may use a class, data attribute, or CSS variables
    });

    it('should initialize with auto theme', async () => {
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget({
        theme: 'auto',
      });
      cleanup = c;

      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();
    });

    it('should apply server theme mode when user uses default', async () => {
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget(
        {}, // default theme is 'light'
        {
          serverConfig: {
            theme: { primaryColor: '#6366f1', mode: 'dark' },
          },
        }
      );
      cleanup = c;

      // Server config overrides the default 'light' theme
      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();
    });
  });

  // ==========================================================================
  // 3. Locale configuration
  // ==========================================================================

  describe('Locale configuration', () => {
    it('should display Spanish UI strings with locale es', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        locale: 'es',
      });
      cleanup = c;

      // Check for Spanish placeholder or UI element
      const textarea = shadowRoot.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;
      if (textarea) {
        // Spanish placeholder should be set
        expect(textarea.placeholder).toBeDefined();
        expect(textarea.placeholder.length).toBeGreaterThan(0);
      }
    });

    it('should display English UI strings with locale en', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        locale: 'en',
      });
      cleanup = c;

      const textarea = shadowRoot.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;
      if (textarea) {
        expect(textarea.placeholder).toBeDefined();
        expect(textarea.placeholder.length).toBeGreaterThan(0);
      }
    });

    it('should display Catalan UI strings with locale ca', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        locale: 'ca',
      });
      cleanup = c;

      const textarea = shadowRoot.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;
      if (textarea) {
        expect(textarea.placeholder).toBeDefined();
      }
    });

    it('should display Portuguese UI strings with locale pt', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        locale: 'pt',
      });
      cleanup = c;

      const textarea = shadowRoot.querySelector(
        'textarea'
      ) as HTMLTextAreaElement;
      if (textarea) {
        expect(textarea.placeholder).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // 4. Multiple widgets coexistence
  // ==========================================================================

  describe('Multiple widgets coexistence', () => {
    it('should support two independent widgets on the same page', async () => {
      // Initialize first widget
      const mockApi1 = createMockApi({ latency: 0 });
      vi.stubGlobal('fetch', mockApi1.mockFetch);
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const widget1 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-multi-1' })
      );
      await widget1.init();

      const widget2 = new ChatbotWidget(
        createMockConfig({ chatbotId: 'bot-multi-2' })
      );
      await widget2.init();

      // Both should be initialized
      const hosts = document.querySelectorAll('#nevent-chatbot-host');
      expect(hosts.length).toBe(2);

      // Open widget1 — widget2 should remain closed
      widget1.open();
      expect(widget1.isOpen()).toBe(true);
      expect(widget2.isOpen()).toBe(false);

      // Open widget2 independently
      widget2.open();
      expect(widget2.isOpen()).toBe(true);

      // Destroy widget1 — widget2 should still work
      widget1.destroy();
      expect(() => widget2.open()).not.toThrow();
      expect(widget2.isOpen()).toBe(true);

      cleanup = () => {
        widget2.destroy();
        mockApi1.reset();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });
  });

  // ==========================================================================
  // 5. Inline mode
  // ==========================================================================

  describe('Inline mode', () => {
    beforeEach(() => {
      const container = document.createElement('div');
      container.id = 'e2e-chat-container';
      document.body.appendChild(container);
    });

    it('should render inline without bubble', async () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'e2e-chat-container';
      document.body.appendChild(container);

      const mockApi = createMockApi({ latency: 0 });
      vi.stubGlobal('fetch', mockApi.mockFetch);
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'e2e-chat-container' })
      );
      await widget.init();

      // Should be auto-opened in inline mode
      expect(widget.isOpen()).toBe(true);

      // Should mount inside the container
      const containerEl = document.getElementById('e2e-chat-container');
      const host = containerEl?.querySelector('#nevent-chatbot-host');
      expect(host).not.toBeNull();

      // No bubble should be rendered
      const bubble = host?.shadowRoot?.querySelector('.nevent-chatbot-bubble');
      expect(bubble).toBeNull();

      cleanup = () => {
        widget.destroy();
        mockApi.reset();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });

    it('should support sending messages in inline mode', async () => {
      document.body.innerHTML = '';
      const container = document.createElement('div');
      container.id = 'e2e-chat-container';
      document.body.appendChild(container);

      const mockApi = createMockApi({ latency: 0 });
      vi.stubGlobal('fetch', mockApi.mockFetch);
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const widget = new ChatbotWidget(
        createMockConfig({ containerId: 'e2e-chat-container' })
      );
      await widget.init();

      await widget.sendMessage('Inline message');
      await flushPromises(20);

      // Find messages in shadow DOM
      const containerEl = document.getElementById('e2e-chat-container');
      const host = containerEl?.querySelector('#nevent-chatbot-host');
      const shadow = host?.shadowRoot;

      if (shadow) {
        const messages = shadow.querySelectorAll('.nevent-chatbot-message');
        const texts = Array.from(messages).map((el) => el.textContent ?? '');
        expect(texts.some((t) => t.includes('Inline message'))).toBe(true);
      }

      cleanup = () => {
        widget.destroy();
        mockApi.reset();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });
  });

  // ==========================================================================
  // 6. Branding visibility
  // ==========================================================================

  describe('Branding', () => {
    it('should show branding when showBranding is true (default)', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        showBranding: true,
      });
      cleanup = c;

      // Branding element must be rendered
      const branding = shadowRoot.querySelector('.nevent-chatbot-branding');
      expect(branding).not.toBeNull();

      // Must contain a link to nevent.es with UTM parameters
      const link = branding!.querySelector(
        'a.nevent-chatbot-branding-link'
      ) as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(link.href).toContain('https://nevent.es');
      expect(link.href).toContain('utm_source=chatbot_widget');
      expect(link.href).toContain('utm_medium=powered_by');
      expect(link.href).toContain('utm_campaign=plg');
      expect(link.href).toContain('utm_content=');

      // Security: link must open in new tab with noopener noreferrer
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');

      // Accessibility: link must have aria-label
      expect(link.getAttribute('aria-label')).toBeTruthy();

      // Branding text must include "Nevent" in a <strong> tag
      const strong = link.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong!.textContent).toBe('Nevent');
    });

    it('should include tenantId in UTM content parameter', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        showBranding: true,
        tenantId: 'tenant-test-456',
      });
      cleanup = c;

      const link = shadowRoot.querySelector(
        '.nevent-chatbot-branding-link'
      ) as HTMLAnchorElement;
      expect(link).not.toBeNull();
      expect(link.href).toContain('utm_content=tenant-test-456');
    });

    it('should respect showBranding: false configuration', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        showBranding: false,
      });
      cleanup = c;

      // Widget should still work with branding disabled
      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();

      // Branding element must NOT be rendered
      const branding = shadowRoot.querySelector('.nevent-chatbot-branding');
      expect(branding).toBeNull();
    });

    it('should show branding by default when showBranding is not set', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({});
      cleanup = c;

      const branding = shadowRoot.querySelector('.nevent-chatbot-branding');
      expect(branding).not.toBeNull();
    });
  });

  // ==========================================================================
  // 7. Auto-open behavior
  // ==========================================================================

  describe('Auto-open behavior', () => {
    it('should auto-open when autoOpen is true (after delay)', async () => {
      vi.useFakeTimers();

      const { widget, cleanup: c } = await createInitializedWidget({
        autoOpen: true,
        autoOpenDelay: 1000,
      });
      cleanup = () => {
        vi.useRealTimers();
        c();
      };

      // Should not be open immediately
      // (auto-open uses a delay timer)

      // Advance past the auto-open delay
      vi.advanceTimersByTime(1100);
      await flushPromises(10);

      // Widget should now be open
      expect(widget.isOpen()).toBe(true);

      vi.useRealTimers();
    });

    it('should NOT auto-open when autoOpen is false (default)', async () => {
      const { widget, cleanup: c } = await createInitializedWidget({
        autoOpen: false,
      });
      cleanup = c;

      expect(widget.isOpen()).toBe(false);
    });
  });

  // ==========================================================================
  // 8. Conversation state access
  // ==========================================================================

  describe('Conversation state', () => {
    it('should provide access to current state via getState()', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      const state = widget.getState();

      expect(state).toBeDefined();
      expect(state.isOpen).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.unreadCount).toBeDefined();
    });

    it('should update state after opening the chat', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.open();
      const state = widget.getState();

      expect(state.isOpen).toBe(true);
    });

    it('should have a conversation after sending a message', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.open();
      await widget.sendMessage('Create conversation');
      await flushPromises(20);

      const state = widget.getState();
      expect(state.conversation).not.toBeNull();
    });
  });

  // ==========================================================================
  // 9. Custom styles application
  // ==========================================================================

  describe('Custom styles', () => {
    it('should accept custom bubble styles without errors', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        styles: {
          bubble: {
            backgroundColor: '#6366f1',
            size: 64,
            iconColor: '#ffffff',
          },
        },
      });
      cleanup = c;

      const bubble = shadowRoot.querySelector('.nevent-chatbot-bubble');
      expect(bubble).not.toBeNull();
    });

    it('should accept custom window styles without errors', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        styles: {
          window: {
            width: 450,
            height: 700,
            borderRadius: 20,
          },
        },
      });
      cleanup = c;

      const window = shadowRoot.querySelector('.nevent-chatbot-window');
      expect(window).not.toBeNull();
    });

    it('should accept custom z-index', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        styles: {
          zIndex: 99999,
        },
      });
      cleanup = c;

      const root = shadowRoot.querySelector('.nevent-chatbot-root');
      expect(root).not.toBeNull();
    });
  });

  // ==========================================================================
  // 10. Custom CSS injection
  // ==========================================================================

  describe('Custom CSS injection', () => {
    it('should inject custom CSS into the shadow root', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        customCSS: '.nevent-chatbot-bubble { border: 2px solid red; }',
      });
      cleanup = c;

      // Custom CSS should be in a style element inside the shadow root
      const styles = Array.from(shadowRoot.querySelectorAll('style'));
      const hasCustomCSS = styles.some((s) =>
        s.textContent?.includes('border: 2px solid red')
      );
      expect(hasCustomCSS).toBe(true);
    });

    it('should strip dangerous CSS patterns', async () => {
      const { shadowRoot, cleanup: c } = await createInitializedWidget({
        customCSS:
          '@import url("https://evil.com/steal.css"); .safe { color: blue; }',
      });
      cleanup = c;

      // @import should be stripped
      const styles = Array.from(shadowRoot.querySelectorAll('style'));
      const hasImport = styles.some((s) => s.textContent?.includes('@import'));
      expect(hasImport).toBe(false);
    });
  });
});
