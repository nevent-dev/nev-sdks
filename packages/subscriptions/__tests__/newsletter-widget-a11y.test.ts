/**
 * Newsletter widget accessibility (a11y) tests
 *
 * Tests for WCAG 2.1 AA compliance including ARIA attributes,
 * focus management, label associations, and reduced-motion support.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsletterWidget } from '../src/newsletter-widget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalConfig() {
  return {
    newsletterId: 'nl-123',
    tenantId: 'tenant-456',
    containerId: 'test-container',
    analytics: false,
    debug: false,
  };
}

function stubFetch(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          title: 'Test Newsletter',
          companyName: 'TestCo',
          privacyPolicyUrl: 'https://example.com/privacy',
          ...overrides,
        }),
    })
  );
}

function getShadowRoot(): ShadowRoot | null {
  const hostEl = document.querySelector(
    '[data-nevent-widget="newsletter"]'
  ) as HTMLElement;
  return hostEl?.shadowRoot ?? null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Newsletter Widget Accessibility', () => {
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
  // Form ARIA attributes
  // -------------------------------------------------------------------------

  describe('Form ARIA attributes', () => {
    it('should have role="form" on the form element', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const form = shadow?.querySelector('form');
      expect(form?.getAttribute('role')).toBe('form');
    });

    it('should have aria-label on the form element', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const form = shadow?.querySelector('form');
      const ariaLabel = form?.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(typeof ariaLabel).toBe('string');
      expect(ariaLabel!.length).toBeGreaterThan(0);
    });

    it('should have novalidate attribute on form', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const form = shadow?.querySelector('form');
      expect(form?.hasAttribute('novalidate')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Status message ARIA
  // -------------------------------------------------------------------------

  describe('Status message ARIA', () => {
    it('should have aria-live="polite" on status message', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const status = shadow?.querySelector('.nevent-status-message');
      expect(status?.getAttribute('aria-live')).toBe('polite');
    });

    it('should have role="status" on status message', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const status = shadow?.querySelector('.nevent-status-message');
      expect(status?.getAttribute('role')).toBe('status');
    });

    it('should have aria-label on status message', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const status = shadow?.querySelector('.nevent-status-message');
      const label = status?.getAttribute('aria-label');
      expect(label).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // GDPR checkbox ARIA
  // -------------------------------------------------------------------------

  describe('GDPR checkbox ARIA', () => {
    it('should have required attribute on GDPR checkbox', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const checkbox = shadow?.querySelector(
        '.nevent-gdpr-checkbox'
      ) as HTMLInputElement;
      expect(checkbox?.required).toBe(true);
    });

    it('should have aria-required="true" on GDPR checkbox', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const checkbox = shadow?.querySelector('.nevent-gdpr-checkbox');
      expect(checkbox?.getAttribute('aria-required')).toBe('true');
    });
  });

  // -------------------------------------------------------------------------
  // Focus styles (no outline: none)
  // -------------------------------------------------------------------------

  describe('Focus styles', () => {
    it('should NOT contain outline: none in generated CSS', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      // Must NOT have outline: none (WCAG violation)
      expect(cssText).not.toContain('outline: none');
      expect(cssText).not.toContain('outline:none');
    });

    it('should contain visible focus indicator styles', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      // Should have outline: 2px solid for focus
      expect(cssText).toContain('outline: 2px solid');
    });

    it('should contain focus styles for submit button', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('.nevent-submit-button:focus');
    });

    it('should contain focus styles for checkbox', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('.nevent-gdpr-checkbox:focus');
    });
  });

  // -------------------------------------------------------------------------
  // Prefers-reduced-motion
  // -------------------------------------------------------------------------

  describe('Prefers-reduced-motion', () => {
    it('should include prefers-reduced-motion media query in CSS', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('prefers-reduced-motion: reduce');
      expect(cssText).toContain('transition: none');
      expect(cssText).toContain('animation: none');
    });
  });

  // -------------------------------------------------------------------------
  // Screen reader utility class
  // -------------------------------------------------------------------------

  describe('Screen reader utility', () => {
    it('should include .nevent-sr-only CSS class', async () => {
      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const styles = shadow?.querySelectorAll('style');
      const cssText = Array.from(styles || [])
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('.nevent-sr-only');
      expect(cssText).toContain('clip: rect(0, 0, 0, 0)');
    });
  });
});
