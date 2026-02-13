import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { injectSeoTags } from '../seo-injector';

describe('SEO Injector', () => {
  beforeEach(() => {
    // Clean up any existing SEO elements before each test
    cleanupSeoElements();
  });

  afterEach(() => {
    // Clean up after tests
    cleanupSeoElements();
  });

  /**
   * Helper function to remove all SEO-related elements injected by the module
   */
  function cleanupSeoElements(): void {
    // Remove link elements (dns-prefetch, preconnect)
    const links = document.head.querySelectorAll('link[id^="nevent-seo-"]');
    links.forEach((link) => link.remove());

    // Remove meta generator
    const meta = document.getElementById('nevent-seo-generator');
    if (meta) meta.remove();

    // Remove HTML comments containing "Nevent Newsletter Widget"
    const comments = Array.from(document.head.childNodes).filter(
      (node) =>
        node.nodeType === Node.COMMENT_NODE &&
        node.textContent?.includes('Nevent Newsletter Widget')
    );
    comments.forEach((comment) => comment.remove());
  }

  describe('DNS Prefetch Injection', () => {
    it('should inject dns-prefetch link into document.head', () => {
      injectSeoTags();

      const dnsPrefetch = document.getElementById('nevent-seo-dns-prefetch');
      expect(dnsPrefetch).toBeTruthy();
      expect(dnsPrefetch?.tagName).toBe('LINK');
    });

    it('should set correct rel attribute for dns-prefetch', () => {
      injectSeoTags();

      const dnsPrefetch = document.getElementById(
        'nevent-seo-dns-prefetch'
      ) as HTMLLinkElement;
      expect(dnsPrefetch?.rel).toBe('dns-prefetch');
    });

    it('should set href to https://nevent.ai', () => {
      injectSeoTags();

      const dnsPrefetch = document.getElementById(
        'nevent-seo-dns-prefetch'
      ) as HTMLLinkElement;
      expect(dnsPrefetch?.href).toBe('https://nevent.ai/');
    });
  });

  describe('Preconnect Injection', () => {
    it('should inject preconnect link into document.head', () => {
      injectSeoTags();

      const preconnect = document.getElementById('nevent-seo-preconnect');
      expect(preconnect).toBeTruthy();
      expect(preconnect?.tagName).toBe('LINK');
    });

    it('should set correct rel attribute for preconnect', () => {
      injectSeoTags();

      const preconnect = document.getElementById(
        'nevent-seo-preconnect'
      ) as HTMLLinkElement;
      expect(preconnect?.rel).toBe('preconnect');
    });

    it('should set href to https://nevent.ai', () => {
      injectSeoTags();

      const preconnect = document.getElementById(
        'nevent-seo-preconnect'
      ) as HTMLLinkElement;
      expect(preconnect?.href).toBe('https://nevent.ai/');
    });
  });

  describe('Meta Generator Injection', () => {
    it('should inject meta generator tag into document.head', () => {
      injectSeoTags();

      const metaGenerator = document.getElementById('nevent-seo-generator');
      expect(metaGenerator).toBeTruthy();
      expect(metaGenerator?.tagName).toBe('META');
    });

    it('should set name attribute to "generator"', () => {
      injectSeoTags();

      const metaGenerator = document.getElementById(
        'nevent-seo-generator'
      ) as HTMLMetaElement;
      expect(metaGenerator?.name).toBe('generator');
    });

    it('should set content to "Nevent Newsletter Platform - https://nevent.ai"', () => {
      injectSeoTags();

      const metaGenerator = document.getElementById(
        'nevent-seo-generator'
      ) as HTMLMetaElement;
      expect(metaGenerator?.content).toBe(
        'Nevent Newsletter Platform - https://nevent.ai'
      );
    });
  });

  describe('HTML Comment Branding Injection', () => {
    it('should inject HTML comment into document.head', () => {
      injectSeoTags();

      const comments = Array.from(document.head.childNodes).filter(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.includes('Nevent Newsletter Widget')
      );

      expect(comments.length).toBeGreaterThan(0);
    });

    it('should include version and URL in comment', () => {
      injectSeoTags();

      const comments = Array.from(document.head.childNodes).filter(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.includes('Nevent Newsletter Widget')
      );

      const comment = comments[0];
      expect(comment.textContent).toContain('v2.1.0');
      expect(comment.textContent).toContain('https://nevent.ai');
    });

    it('should insert comment at the beginning of head', () => {
      injectSeoTags();

      const firstChild = document.head.firstChild;
      expect(firstChild?.nodeType).toBe(Node.COMMENT_NODE);
      expect(firstChild?.textContent).toContain('Nevent Newsletter Widget');
    });
  });

  describe('All SEO Elements Injection', () => {
    it('should inject all 4 SEO elements (dns-prefetch, preconnect, meta, comment)', () => {
      injectSeoTags();

      // DNS prefetch
      const dnsPrefetch = document.getElementById('nevent-seo-dns-prefetch');
      expect(dnsPrefetch).toBeTruthy();

      // Preconnect
      const preconnect = document.getElementById('nevent-seo-preconnect');
      expect(preconnect).toBeTruthy();

      // Meta generator
      const metaGenerator = document.getElementById('nevent-seo-generator');
      expect(metaGenerator).toBeTruthy();

      // HTML comment
      const comments = Array.from(document.head.childNodes).filter(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.includes('Nevent Newsletter Widget')
      );
      expect(comments.length).toBeGreaterThan(0);
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate dns-prefetch when called twice', () => {
      injectSeoTags();
      injectSeoTags();

      const dnsPrefetchElements = document.head.querySelectorAll(
        'link[id="nevent-seo-dns-prefetch"]'
      );
      expect(dnsPrefetchElements.length).toBe(1);
    });

    it('should not duplicate preconnect when called twice', () => {
      injectSeoTags();
      injectSeoTags();

      const preconnectElements = document.head.querySelectorAll(
        'link[id="nevent-seo-preconnect"]'
      );
      expect(preconnectElements.length).toBe(1);
    });

    it('should not duplicate meta generator when called twice', () => {
      injectSeoTags();
      injectSeoTags();

      const metaGeneratorElements = document.head.querySelectorAll(
        'meta[id="nevent-seo-generator"]'
      );
      expect(metaGeneratorElements.length).toBe(1);
    });

    it('should not duplicate HTML comment when called twice', () => {
      injectSeoTags();
      injectSeoTags();

      const comments = Array.from(document.head.childNodes).filter(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.includes('Nevent Newsletter Widget')
      );

      expect(comments.length).toBe(1);
    });

    it('should remain idempotent after multiple calls', () => {
      // Call 5 times
      injectSeoTags();
      injectSeoTags();
      injectSeoTags();
      injectSeoTags();
      injectSeoTags();

      // DNS prefetch
      const dnsPrefetchElements = document.head.querySelectorAll(
        'link[id="nevent-seo-dns-prefetch"]'
      );
      expect(dnsPrefetchElements.length).toBe(1);

      // Preconnect
      const preconnectElements = document.head.querySelectorAll(
        'link[id="nevent-seo-preconnect"]'
      );
      expect(preconnectElements.length).toBe(1);

      // Meta generator
      const metaGeneratorElements = document.head.querySelectorAll(
        'meta[id="nevent-seo-generator"]'
      );
      expect(metaGeneratorElements.length).toBe(1);

      // HTML comment
      const comments = Array.from(document.head.childNodes).filter(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent?.includes('Nevent Newsletter Widget')
      );
      expect(comments.length).toBe(1);
    });
  });

  describe('Integration', () => {
    it('should work correctly alongside existing schema.org injection', () => {
      // Simulate schema.org injection
      const schemaScript = document.createElement('script');
      schemaScript.id = 'nevent-jsonld-test-123';
      schemaScript.type = 'application/ld+json';
      schemaScript.textContent = '{"@context": "https://schema.org"}';
      document.head.appendChild(schemaScript);

      // Inject SEO tags
      injectSeoTags();

      // Both should coexist
      const schemaExists = document.getElementById('nevent-jsonld-test-123');
      const dnsPrefetchExists = document.getElementById(
        'nevent-seo-dns-prefetch'
      );
      const preconnectExists = document.getElementById('nevent-seo-preconnect');
      const metaGeneratorExists = document.getElementById(
        'nevent-seo-generator'
      );

      expect(schemaExists).toBeTruthy();
      expect(dnsPrefetchExists).toBeTruthy();
      expect(preconnectExists).toBeTruthy();
      expect(metaGeneratorExists).toBeTruthy();

      // Cleanup schema script
      schemaScript.remove();
    });

    it('should not interfere with other meta tags', () => {
      // Add other meta tags
      const metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      metaViewport.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(metaViewport);

      const metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      metaDescription.content = 'Test description';
      document.head.appendChild(metaDescription);

      // Inject SEO tags
      injectSeoTags();

      // All meta tags should exist
      expect(document.querySelector('meta[name="viewport"]')).toBeTruthy();
      expect(document.querySelector('meta[name="description"]')).toBeTruthy();
      expect(document.getElementById('nevent-seo-generator')).toBeTruthy();

      // Cleanup
      metaViewport.remove();
      metaDescription.remove();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty document head gracefully', () => {
      // Clear head completely (edge case)
      const originalHead = document.head.innerHTML;
      document.head.innerHTML = '';

      expect(() => injectSeoTags()).not.toThrow();

      // Restore head
      document.head.innerHTML = originalHead;
    });

    it('should inject comment even when head has no children', () => {
      const originalHead = document.head.innerHTML;
      document.head.innerHTML = '';

      injectSeoTags();

      const firstChild = document.head.firstChild;
      expect(firstChild?.nodeType).toBe(Node.COMMENT_NODE);

      // Restore head
      document.head.innerHTML = originalHead;
    });
  });
});
