/**
 * Newsletter widget core tests
 *
 * Tests for initialization, rendering, Shadow DOM encapsulation,
 * destroy lifecycle, and error isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsletterWidget } from '../src/newsletter-widget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid config */
function minimalConfig() {
  return {
    newsletterId: 'nl-123',
    tenantId: 'tenant-456',
    containerId: 'test-container',
    analytics: false,
    debug: false,
  };
}

/** Stubs the global fetch to return a mock server config */
function stubFetch(
  overrides: Record<string, unknown> = {},
  ok = true,
  status = 200
) {
  const serverConfig = {
    title: 'Test Newsletter',
    companyName: 'TestCo',
    privacyPolicyUrl: 'https://example.com/privacy',
    ...overrides,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(serverConfig),
    })
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NewsletterWidget', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
    stubFetch();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should throw when newsletterId is missing', () => {
      expect(
        () =>
          new NewsletterWidget({
            newsletterId: '',
            tenantId: 'tenant-456',
          })
      ).toThrow('newsletterId and tenantId are required');
    });

    it('should throw when tenantId is missing', () => {
      expect(
        () =>
          new NewsletterWidget({
            newsletterId: 'nl-123',
            tenantId: '',
          })
      ).toThrow('newsletterId and tenantId are required');
    });

    it('should create instance with valid config', () => {
      const widget = new NewsletterWidget(minimalConfig());
      expect(widget).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('init()', () => {
    it('should initialize and render the widget', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      // Widget should have created a host element with shadow root
      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      );
      expect(hostEl).not.toBeNull();
    });

    it('should call onLoad callback when initialized', async () => {
      const onLoad = vi.fn();
      const widget = new NewsletterWidget({
        ...minimalConfig(),
        onLoad,
      });
      await widget.init();

      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(onLoad).toHaveBeenCalledWith(widget);
    });

    it('should not throw when container is found', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await expect(widget.init()).resolves.not.toThrow();
    });

    it('should handle failed server config gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error'))
      );

      const widget = new NewsletterWidget(minimalConfig());
      // Should not throw, falls back to defaults
      await expect(widget.init()).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency (NEV-1607 / B1 — duplicate mount guard)
  // -------------------------------------------------------------------------

  describe('idempotency (NEV-1607 B1)', () => {
    it('should mount only one widget when init() is called twice on the same container (snippet duplicado en la página del cliente)', async () => {
      const widget1 = new NewsletterWidget(minimalConfig());
      const widget2 = new NewsletterWidget(minimalConfig());

      await widget1.init();
      await widget2.init();

      const hosts = container.querySelectorAll(
        '[data-nevent-widget="newsletter"]'
      );
      expect(hosts.length).toBe(1);
    });

    it('should mount only one widget after N repeated init() calls (CMS SPA-like que reejecuta el snippet en cada navegación)', async () => {
      for (let i = 0; i < 5; i++) {
        const w = new NewsletterWidget(minimalConfig());
        await w.init();
      }

      const hosts = container.querySelectorAll(
        '[data-nevent-widget="newsletter"]'
      );
      expect(hosts.length).toBe(1);
    });

    it('should return undefined from init() when a widget is already mounted in the container', async () => {
      const widget1 = new NewsletterWidget(minimalConfig());
      await widget1.init();

      const widget2 = new NewsletterWidget(minimalConfig());
      const result = await widget2.init();

      expect(result).toBeUndefined();
    });

    it('should allow a fresh init() after destroy() of the previous widget', async () => {
      const widget1 = new NewsletterWidget(minimalConfig());
      await widget1.init();
      widget1.destroy();

      const widget2 = new NewsletterWidget(minimalConfig());
      await widget2.init();

      const hosts = container.querySelectorAll(
        '[data-nevent-widget="newsletter"]'
      );
      expect(hosts.length).toBe(1);
    });

    it('should mount only one widget when two init() calls race without await between them (snippet duplicado en la misma página, ambos scripts se ejecutan sin pausa)', async () => {
      const widget1 = new NewsletterWidget(minimalConfig());
      const widget2 = new NewsletterWidget(minimalConfig());

      // Both inits start back-to-back, no await between them.
      const p1 = widget1.init();
      const p2 = widget2.init();
      await Promise.all([p1, p2]);

      const hosts = container.querySelectorAll(
        '[data-nevent-widget="newsletter"]'
      );
      expect(hosts.length).toBe(1);
    });

    it('should not poison the container when init() fails after createShadowDOM — the host element is removed and a fresh init() can mount (Codex review hallazgo #1)', async () => {
      const widget1 = new NewsletterWidget(minimalConfig());
      // Force a failure after createShadowDOM has appended the host element.
      // We stub the private `render` method, which runs after loadWidgetConfig.
      (widget1 as unknown as { render: () => void }).render = () => {
        throw new Error('forced render failure');
      };
      const result1 = await widget1.init();
      expect(result1).toBeUndefined();

      // Container must be clean — the host was rolled back.
      expect(
        container.querySelectorAll('[data-nevent-widget="newsletter"]').length
      ).toBe(0);

      // A fresh widget on the same container must succeed.
      const widget2 = new NewsletterWidget(minimalConfig());
      const result2 = await widget2.init();
      expect(result2).toBeDefined();
      expect(
        container.querySelectorAll('[data-nevent-widget="newsletter"]').length
      ).toBe(1);
    });

    it('should not fetch widget config a second time when duplicate is detected (the second init aborts before any network call) (Codex review hallazgo #4)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ title: 'X' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const widget1 = new NewsletterWidget(minimalConfig());
      await widget1.init();
      const callsAfterFirst = fetchMock.mock.calls.length;

      const widget2 = new NewsletterWidget(minimalConfig());
      const result = await widget2.init();

      expect(result).toBeUndefined();
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  // -------------------------------------------------------------------------
  // Shadow DOM
  // -------------------------------------------------------------------------

  describe('Shadow DOM', () => {
    it('should create a shadow root on the host element', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      expect(hostEl).not.toBeNull();
      expect(hostEl.shadowRoot).not.toBeNull();
    });

    it('should render form inside shadow root', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const form = hostEl.shadowRoot?.querySelector('form');
      expect(form).not.toBeNull();
    });

    it('should inject styles inside shadow root', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const styles = hostEl.shadowRoot?.querySelectorAll('style');
      expect(styles).toBeDefined();
      expect(styles!.length).toBeGreaterThan(0);
    });

    it('should not inject widget styles into document.head', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const widgetStyles = document.getElementById('nevent-widget-styles');
      expect(widgetStyles).toBeNull();
    });

    it('should reset inherited styles on host element', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      expect(hostEl.style.all).toBe('initial');
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('should remove the host element from DOM', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      expect(
        container.querySelector('[data-nevent-widget="newsletter"]')
      ).not.toBeNull();

      widget.destroy();

      expect(
        container.querySelector('[data-nevent-widget="newsletter"]')
      ).toBeNull();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      widget.destroy();
      expect(() => widget.destroy()).not.toThrow();
    });

    it('should prevent re-initialization after destroy', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();
      widget.destroy();

      // init should return undefined (error boundary catches the error)
      const result = await widget.init();
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  describe('Error isolation', () => {
    it('should not throw to host page when onLoad callback throws', async () => {
      const onLoad = vi.fn(() => {
        throw new Error('User callback error');
      });

      const widget = new NewsletterWidget({
        ...minimalConfig(),
        onLoad,
      });

      // Should not throw despite onLoad throwing
      await expect(widget.init()).resolves.toBeDefined();
    });

    it('should call onError when an error occurs', async () => {
      const onError = vi.fn();

      // Force an error by using a non-existent container
      const widget = new NewsletterWidget({
        newsletterId: 'nl-123',
        tenantId: 'tenant-456',
        containerId: 'non-existent-container',
        analytics: false,
        onError,
      });

      await widget.init();

      // onError should have been called with the normalized error
      expect(onError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Form rendering
  // -------------------------------------------------------------------------

  describe('Form rendering', () => {
    it('should render a form element with role="form"', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const form = hostEl.shadowRoot?.querySelector('form');
      expect(form?.getAttribute('role')).toBe('form');
    });

    it('should render a submit button', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const button = hostEl.shadowRoot?.querySelector('.nevent-submit-button');
      expect(button).not.toBeNull();
    });

    it('should render GDPR checkbox', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const checkbox = hostEl.shadowRoot?.querySelector(
        '.nevent-gdpr-checkbox'
      );
      expect(checkbox).not.toBeNull();
    });

    it('should render status message container with aria-live', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const hostEl = container.querySelector(
        '[data-nevent-widget="newsletter"]'
      ) as HTMLElement;
      const status = hostEl.shadowRoot?.querySelector('.nevent-status-message');
      expect(status?.getAttribute('aria-live')).toBe('polite');
      expect(status?.getAttribute('role')).toBe('status');
    });
  });

  // -------------------------------------------------------------------------
  // Locale
  // -------------------------------------------------------------------------

  describe('Locale API', () => {
    it('should return default locale', () => {
      const widget = new NewsletterWidget(minimalConfig());
      // Default locale detection -- in jsdom navigator.language is typically 'en'
      expect(typeof widget.getLocale()).toBe('string');
    });

    it('should allow setting locale via config', () => {
      const widget = new NewsletterWidget({
        ...minimalConfig(),
        locale: 'en',
      });
      expect(widget.getLocale()).toBe('en');
    });

    it('should allow changing locale after creation', async () => {
      const widget = new NewsletterWidget({
        ...minimalConfig(),
        locale: 'es',
      });
      await widget.init();

      widget.setLocale('en');
      expect(widget.getLocale()).toBe('en');
    });
  });
});
