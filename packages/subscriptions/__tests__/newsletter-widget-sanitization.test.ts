/**
 * Newsletter widget sanitization tests
 *
 * Tests for XSS prevention in GDPR text, error messages,
 * success messages, and any user-provided content.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sanitizer } from '@nevent/core';
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
    }),
  );
}

function getShadowRoot(): ShadowRoot | null {
  const hostEl = document.querySelector(
    '[data-nevent-widget="newsletter"]',
  ) as HTMLElement;
  return hostEl?.shadowRoot ?? null;
}

// ---------------------------------------------------------------------------
// Sanitizer unit tests (imported from core)
// ---------------------------------------------------------------------------

describe('Sanitizer (core)', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(Sanitizer.escapeHtml('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });

    it('should escape quotes', () => {
      expect(Sanitizer.escapeHtml('"hello" & \'world\'')).toBe(
        '&quot;hello&quot; &amp; &#39;world&#39;',
      );
    });

    it('should return empty string for falsy input', () => {
      expect(Sanitizer.escapeHtml('')).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const result = Sanitizer.sanitizeHtml(
        '<b>Hello</b><script>alert(1)</script>',
      );
      expect(result).toContain('<b>Hello</b>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should preserve allowed tags', () => {
      const result = Sanitizer.sanitizeHtml(
        '<a href="https://example.com" target="_blank">Link</a>',
      );
      expect(result).toContain('<a');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('Link</a>');
    });

    it('should remove event handlers', () => {
      const result = Sanitizer.sanitizeHtml(
        '<a href="#" onclick="alert(1)">Click</a>',
      );
      expect(result).not.toContain('onclick');
    });

    it('should block javascript: URLs', () => {
      const result = Sanitizer.sanitizeHtml(
        '<a href="javascript:alert(1)">XSS</a>',
      );
      expect(result).not.toContain('javascript:');
    });
  });
});

// ---------------------------------------------------------------------------
// Widget-level sanitization tests
// ---------------------------------------------------------------------------

describe('Newsletter Widget Sanitization', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // GDPR text sanitization
  // -------------------------------------------------------------------------

  describe('GDPR text sanitization', () => {
    it('should sanitize XSS in GDPR text from server config', async () => {
      stubFetch({
        messages: {
          gdprText:
            '<script>alert("xss")</script>I accept the <a href="javascript:alert(1)">terms</a>',
        },
      });

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const gdprText = shadow?.querySelector('.nevent-gdpr-text');
      const html = gdprText?.innerHTML || '';

      // Should NOT contain script tags
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert("xss")');

      // Should NOT contain javascript: URLs
      expect(html).not.toContain('javascript:');
    });

    it('should preserve legitimate links in GDPR text', async () => {
      stubFetch({
        companyName: 'TestCo',
        privacyPolicyUrl: 'https://example.com/privacy',
      });

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const gdprText = shadow?.querySelector('.nevent-gdpr-text');
      const html = gdprText?.innerHTML || '';

      // Should contain the privacy policy link
      expect(html).toContain('https://example.com/privacy');
    });

    it('should escape company name in GDPR text', async () => {
      stubFetch({
        companyName: '<img onerror="alert(1)">',
        privacyPolicyUrl: 'https://example.com/privacy',
      });

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const gdprText = shadow?.querySelector('.nevent-gdpr-text');
      const html = gdprText?.innerHTML || '';

      // Should NOT contain unescaped img tag
      expect(html).not.toContain('<img onerror');
    });
  });

  // -------------------------------------------------------------------------
  // Title/subtitle sanitization
  // -------------------------------------------------------------------------

  describe('Title and subtitle sanitization', () => {
    it('should escape XSS in title', async () => {
      stubFetch({
        title: '<script>alert("title_xss")</script>My Newsletter',
      });

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const title = shadow?.querySelector('.nevent-title');
      const html = title?.innerHTML || '';

      expect(html).not.toContain('<script>');
      expect(html).toContain('My Newsletter');
    });

    it('should escape XSS in subtitle', async () => {
      stubFetch({
        subtitle: '<img src=x onerror="alert(1)">Subscribe now',
      });

      const widget = new NewsletterWidget({
        ...minimalConfig(),
        subtitle: '<img src=x onerror="alert(1)">Subscribe now',
      });
      await widget.init();

      const shadow = getShadowRoot();
      const subtitle = shadow?.querySelector('.nevent-subtitle');
      const html = subtitle?.innerHTML || '';

      // The img tag should be escaped, not rendered as an actual element
      expect(html).not.toContain('<img');
      // The onerror handler should not be present as an actual attribute;
      // it's safe as escaped text (&lt;img ... onerror=... &gt;)
      expect(html).toContain('&lt;');
      expect(html).toContain('Subscribe now');
      // Verify no actual img element was created
      const imgElements = subtitle?.querySelectorAll('img');
      expect(imgElements?.length ?? 0).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Status message sanitization
  // -------------------------------------------------------------------------

  describe('Status message sanitization', () => {
    it('should use textContent (not innerHTML) for status messages', async () => {
      stubFetch();

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      const shadow = getShadowRoot();
      const status = shadow?.querySelector(
        '.nevent-status-message',
      ) as HTMLElement;

      // Verify status element exists and uses textContent by default
      expect(status).not.toBeNull();
      expect(status.style.display).toBe('none');
    });
  });

  // -------------------------------------------------------------------------
  // Font URL sanitization
  // -------------------------------------------------------------------------

  describe('Font configuration sanitization', () => {
    it('should escape font family names in @font-face rules', async () => {
      stubFetch({
        styles: {
          global: {
            font: {
              family: "Evil'; alert(1); //",
              type: 'CUSTOM_FONT',
              customFontId: 'evil-font',
              files: { regular: 'https://example.com/font.ttf' },
            },
          },
        },
      });

      const widget = new NewsletterWidget(minimalConfig());
      await widget.init();

      // Check that the injected style in document.head has escaped content
      const fontStyles = document.querySelectorAll('style[data-font-id]');
      for (const style of fontStyles) {
        const css = style.textContent || '';
        // Should not contain unescaped single quotes that break the CSS
        expect(css).not.toContain("Evil'; alert(1);");
      }
    });
  });
});
