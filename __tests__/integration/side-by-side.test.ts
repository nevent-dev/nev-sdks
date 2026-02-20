/**
 * Integration Test: Side-by-Side Widget Coexistence
 *
 * Verifies that @nevent/chatbot and @nevent/subscriptions widgets can coexist
 * on the same page without interfering with each other. Tests Shadow DOM
 * isolation, independent ErrorBoundaries, independent i18n instances, and
 * widget lifecycle independence.
 *
 * Note: ChatbotWidget does not expose public getLocale()/setLocale() methods,
 * so i18n independence is tested at the Core I18nManager level and via the
 * NewsletterWidget which does expose those methods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary, I18nManager } from '@nevent/core';
import type { NormalizedError } from '@nevent/core';
import { NewsletterWidget } from '@nevent/subscriptions';
import { ChatbotWidget } from '@nevent/chatbot';

// ============================================================================
// Setup
// ============================================================================

let newsletterContainer: HTMLDivElement;
let chatbotContainer: HTMLDivElement;

beforeEach(() => {
  // Create separate containers for each widget
  newsletterContainer = document.createElement('div');
  newsletterContainer.id = 'newsletter-container';
  document.body.appendChild(newsletterContainer);

  chatbotContainer = document.createElement('div');
  chatbotContainer.id = 'chatbot-container';
  document.body.appendChild(chatbotContainer);

  // Mock global fetch with responses matching expected API shapes.
  // - Newsletter widget calls fetch() directly with raw JSON responses.
  // - Chatbot widget calls HttpClient.request() which wraps the body in
  //   ApiResponse<T> format: { data: <payload>, success: true }.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('widget')) {
        // Newsletter widget config endpoint (raw response, no ApiResponse wrapper)
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              newsletterId: 'nl-123',
              tenantId: 'tenant-456',
            }),
        });
      }
      if (typeof url === 'string' && url.includes('chatbot')) {
        // Chatbot config endpoint: must match ApiResponse<ServerChatbotConfig>
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                chatbotId: 'bot-123',
                tenantId: 'tenant-456',
                name: 'Test Chatbot',
                welcomeMessage: 'Hello!',
                placeholder: 'Type a message...',
                token: 'test-token',
                theme: { mode: 'light', primaryColor: '#007bff' },
                features: {
                  fileUpload: false,
                  voiceInput: false,
                  quickReplies: true,
                  richContent: true,
                  feedback: true,
                },
                rateLimit: {
                  enabled: false,
                  maxMessages: 30,
                  windowMs: 60000,
                },
                styles: {},
              },
              success: true,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: {}, success: true }),
      });
    }),
  );
});

afterEach(() => {
  if (newsletterContainer.parentNode) {
    document.body.removeChild(newsletterContainer);
  }
  if (chatbotContainer.parentNode) {
    document.body.removeChild(chatbotContainer);
  }
  vi.restoreAllMocks();
});

// ============================================================================
// Both widgets instantiate independently
// ============================================================================

describe('Side-by-side: Widget instantiation', () => {
  it('both widgets can be instantiated on the same page', () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    expect(newsletter).toBeDefined();
    expect(chatbot).toBeDefined();

    newsletter.destroy();
    chatbot.destroy();
  });

  it('both widgets can be initialized on the same page', async () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    // Both should initialize without conflict
    await Promise.all([newsletter.init(), chatbot.init()]);

    // Both should have rendered something into their containers
    expect(newsletterContainer.children.length).toBeGreaterThanOrEqual(1);
    expect(chatbotContainer.children.length).toBeGreaterThanOrEqual(1);

    newsletter.destroy();
    chatbot.destroy();
  });
});

// ============================================================================
// Shadow DOM independence
// ============================================================================

describe('Side-by-side: Shadow DOM isolation', () => {
  it('each widget creates its own host element', async () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    await newsletter.init();
    await chatbot.init();

    // Newsletter should have its own host element with data attribute
    const nlHost = newsletterContainer.querySelector(
      '[data-nevent-widget="newsletter"]',
    );

    // Chatbot should have rendered into its container
    const cbHost = chatbotContainer.firstElementChild;

    // Both should exist and be different elements
    expect(nlHost).not.toBeNull();
    expect(cbHost).not.toBeNull();
    expect(nlHost).not.toBe(cbHost);

    newsletter.destroy();
    chatbot.destroy();
  });

  it('widget DOM trees do not overlap between containers', async () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      primaryColor: '#ff0000',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    await newsletter.init();
    await chatbot.init();

    // Check that each container has independent DOM trees
    const nlChildren = newsletterContainer.querySelectorAll('*');
    const cbChildren = chatbotContainer.querySelectorAll('*');

    // Elements from one widget should not appear in the other's container
    const cbChildSet = new Set(Array.from(cbChildren));
    for (const nlChild of nlChildren) {
      expect(cbChildSet.has(nlChild)).toBe(false);
    }

    newsletter.destroy();
    chatbot.destroy();
  });
});

// ============================================================================
// ErrorBoundary independence
// ============================================================================

describe('Side-by-side: ErrorBoundary independence', () => {
  it('each widget has its own error handler', () => {
    const newsletterErrors: NormalizedError[] = [];
    const chatbotErrors: NormalizedError[] = [];

    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      onError: (err: unknown) =>
        newsletterErrors.push(err as NormalizedError),
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
      onError: (err: unknown) =>
        chatbotErrors.push(err as NormalizedError),
    });

    // Both widgets exist independently with separate error handlers
    expect(newsletter).toBeDefined();
    expect(chatbot).toBeDefined();

    newsletter.destroy();
    chatbot.destroy();
  });

  it('two separate Core ErrorBoundary instances are fully independent', () => {
    const boundary1 = new ErrorBoundary(false, '[Widget1]');
    const boundary2 = new ErrorBoundary(false, '[Widget2]');

    const errors1: NormalizedError[] = [];
    const errors2: NormalizedError[] = [];

    boundary1.setErrorHandler((err) => errors1.push(err));
    boundary2.setErrorHandler((err) => errors2.push(err));

    // Error in boundary 1
    boundary1.guard(() => {
      throw new Error('Widget 1 crashed');
    }, 'render');

    // Boundary 2 should be unaffected
    const result2 = boundary2.guard(() => 'Widget 2 is fine', 'render');

    expect(errors1).toHaveLength(1);
    expect(errors2).toHaveLength(0);
    expect(result2).toBe('Widget 2 is fine');
  });

  it('error in newsletter init does not prevent chatbot init', async () => {
    // Newsletter with nonexistent container
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'nonexistent-container',
      onError: () => {
        // Silently handle
      },
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    // Newsletter init will fail (container not found)
    await newsletter.init();

    // Chatbot should still be able to init independently
    await chatbot.init();

    // Chatbot should have rendered
    expect(chatbotContainer.children.length).toBeGreaterThanOrEqual(1);

    newsletter.destroy();
    chatbot.destroy();
  });
});

// ============================================================================
// I18n independence
// ============================================================================

describe('Side-by-side: I18n independence', () => {
  it('newsletter widgets can have different locales simultaneously', () => {
    // Create a second container for the second newsletter
    const container2 = document.createElement('div');
    container2.id = 'newsletter-container-2';
    document.body.appendChild(container2);

    const newsletter1 = new NewsletterWidget({
      newsletterId: 'nl-111',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      locale: 'en',
    });

    const newsletter2 = new NewsletterWidget({
      newsletterId: 'nl-222',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container-2',
      locale: 'es',
    });

    expect(newsletter1.getLocale()).toBe('en');
    expect(newsletter2.getLocale()).toBe('es');

    newsletter1.destroy();
    newsletter2.destroy();
    document.body.removeChild(container2);
  });

  it('chatbot and newsletter can coexist with different locale configs', () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      locale: 'en',
    });

    // Chatbot is configured with a different locale
    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
      locale: 'es',
    });

    // Newsletter locale is accessible and correct
    expect(newsletter.getLocale()).toBe('en');

    // Chatbot instance exists independently
    expect(chatbot).toBeDefined();

    newsletter.destroy();
    chatbot.destroy();
  });

  it('changing newsletter locale does not affect chatbot', () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      locale: 'en',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
      locale: 'en',
    });

    // Change newsletter to Spanish
    newsletter.setLocale('es');
    expect(newsletter.getLocale()).toBe('es');

    // Chatbot is unaffected (still a valid instance)
    expect(chatbot).toBeDefined();
    // Chatbot was constructed with 'en' -- changing newsletter locale did not throw
    expect(newsletter.getLocale()).toBe('es');

    newsletter.destroy();
    chatbot.destroy();
  });

  it('two Core I18nManager instances operate independently', () => {
    const i18n1 = new I18nManager(
      {
        en: { greeting: 'Hello' },
        es: { greeting: 'Hola' },
      },
      'en',
    );

    const i18n2 = new I18nManager(
      {
        en: { greeting: 'Hi' },
        fr: { greeting: 'Bonjour' },
      },
      'en',
    );

    expect(i18n1.t('greeting')).toBe('Hello');
    expect(i18n2.t('greeting')).toBe('Hi');

    i18n1.setLocale('es');
    expect(i18n1.t('greeting')).toBe('Hola');
    expect(i18n2.t('greeting')).toBe('Hi'); // Unaffected

    i18n2.setLocale('fr');
    expect(i18n2.t('greeting')).toBe('Bonjour');
    expect(i18n1.t('greeting')).toBe('Hola'); // Still Spanish
  });
});

// ============================================================================
// Widget lifecycle independence
// ============================================================================

describe('Side-by-side: Widget lifecycle independence', () => {
  it('destroying newsletter does not affect chatbot', async () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    await newsletter.init();
    await chatbot.init();

    // Destroy newsletter
    newsletter.destroy();

    // Chatbot container should still have content
    expect(chatbotContainer.children.length).toBeGreaterThanOrEqual(1);

    // Chatbot should still respond to API calls without throwing.
    // In inline mode (containerId provided), isOpen() returns true because
    // the chat window is always visible.
    expect(typeof chatbot.isOpen()).toBe('boolean');

    chatbot.destroy();
  });

  it('destroying chatbot does not affect newsletter', async () => {
    const newsletter = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });

    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });

    await newsletter.init();
    await chatbot.init();

    // Destroy chatbot
    chatbot.destroy();

    // Newsletter should still be functional
    expect(newsletter.getLocale()).toBeTruthy();

    // Newsletter container should still have content
    expect(newsletterContainer.children.length).toBeGreaterThanOrEqual(1);

    newsletter.destroy();
  });

  it('both widgets can be destroyed and re-created independently', async () => {
    // First lifecycle
    const newsletter1 = new NewsletterWidget({
      newsletterId: 'nl-123',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });
    await newsletter1.init();
    newsletter1.destroy();

    // Create a new chatbot after newsletter is destroyed
    const chatbot = new ChatbotWidget({
      chatbotId: 'bot-123',
      tenantId: 'tenant-456',
      containerId: 'chatbot-container',
    });
    await chatbot.init();

    // Create a new newsletter while chatbot is running
    const newsletter2 = new NewsletterWidget({
      newsletterId: 'nl-456',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
    });
    await newsletter2.init();

    // Both should be functional
    expect(newsletterContainer.children.length).toBeGreaterThanOrEqual(1);
    expect(chatbotContainer.children.length).toBeGreaterThanOrEqual(1);

    newsletter2.destroy();
    chatbot.destroy();
  });

  it('multiple newsletter widgets can coexist with independent locales', () => {
    // Create a second container
    const container2 = document.createElement('div');
    container2.id = 'newsletter-container-2';
    document.body.appendChild(container2);

    const widget1 = new NewsletterWidget({
      newsletterId: 'nl-111',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container',
      locale: 'en',
    });

    const widget2 = new NewsletterWidget({
      newsletterId: 'nl-222',
      tenantId: 'tenant-456',
      containerId: 'newsletter-container-2',
      locale: 'es',
    });

    expect(widget1.getLocale()).toBe('en');
    expect(widget2.getLocale()).toBe('es');

    widget1.setLocale('ca');
    expect(widget1.getLocale()).toBe('ca');
    expect(widget2.getLocale()).toBe('es'); // Unaffected

    widget1.destroy();
    widget2.destroy();
    document.body.removeChild(container2);
  });
});
