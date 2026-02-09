import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { injectSchemaOrg } from '../schema-injector';
import type { SchemaOrgData } from '../schema-injector';

describe('Schema.org JSON-LD Injector', () => {
  beforeEach(() => {
    // Clean up any existing schema scripts before each test
    const existingScripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    existingScripts.forEach((script) => script.remove());
  });

  afterEach(() => {
    // Clean up after tests
    const existingScripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    existingScripts.forEach((script) => script.remove());
  });

  describe('Basic Injection', () => {
    it('should inject script element into document.head', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.head.querySelector(
        'script[type="application/ld+json"]'
      );
      expect(script).toBeTruthy();
      expect(script?.tagName).toBe('SCRIPT');
    });

    it('should set correct script type', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.head.querySelector(
        'script[id="nevent-jsonld-newsletter-123"]'
      );
      expect(script?.getAttribute('type')).toBe('application/ld+json');
    });

    it('should set unique script id based on newsletterId', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      expect(script).toBeTruthy();
    });

    it('should inject valid JSON content', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      expect(script?.textContent).toBeTruthy();

      // Verify it's valid JSON
      expect(() => JSON.parse(script!.textContent!)).not.toThrow();
    });
  });

  describe('Schema.org Structure', () => {
    it('should include @context with schema.org URL', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema['@context']).toBe('https://schema.org');
    });

    it('should set @type to WebPage', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema['@type']).toBe('WebPage');
    });

    it('should include potentialAction with @type SubscribeAction', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction).toBeTruthy();
      expect(schema.potentialAction['@type']).toBe('SubscribeAction');
    });

    it('should include target EntryPoint with urlTemplate', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.target).toBeTruthy();
      expect(schema.potentialAction.target['@type']).toBe('EntryPoint');
      expect(schema.potentialAction.target.urlTemplate).toBe(
        'https://nevent.ai/newsletter/newsletter-123'
      );
    });

    it('should include actionPlatform for desktop and mobile', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.target.actionPlatform).toEqual([
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/MobileWebPlatform',
      ]);
    });

    it('should include object CreativeWork with name', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object).toBeTruthy();
      expect(schema.potentialAction.object['@type']).toBe('CreativeWork');
      expect(schema.potentialAction.object.name).toBe('Newsletter');
    });
  });

  describe('Provider and Publisher', () => {
    it('should include Nevent as provider', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.provider).toBeTruthy();
      expect(schema.potentialAction.object.provider['@type']).toBe(
        'Organization'
      );
      expect(schema.potentialAction.object.provider.name).toBe('Nevent');
      expect(schema.potentialAction.object.provider.url).toBe(
        'https://nevent.ai'
      );
    });

    it('should include publisher when companyName is provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        companyName: 'TechCorp Inc',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.publisher).toBeTruthy();
      expect(schema.potentialAction.object.publisher['@type']).toBe(
        'Organization'
      );
      expect(schema.potentialAction.object.publisher.name).toBe('TechCorp Inc');
    });

    it('should not include publisher when companyName is not provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.publisher).toBeUndefined();
    });

    it('should include publisher URL when privacyPolicyUrl is provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        companyName: 'TechCorp Inc',
        privacyPolicyUrl: 'https://techcorp.com/privacy',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.publisher.url).toBe(
        'https://techcorp.com/privacy'
      );
    });

    it('should not include publisher URL when privacyPolicyUrl is not provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        companyName: 'TechCorp Inc',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.publisher.url).toBeUndefined();
    });

    it('should not include privacyPolicyUrl without companyName', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        privacyPolicyUrl: 'https://example.com/privacy',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      // Publisher should not exist if companyName is not provided
      expect(schema.potentialAction.object.publisher).toBeUndefined();
    });
  });

  describe('Newsletter Metadata', () => {
    it('should use provided title', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: 'Tech Weekly Newsletter',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.name).toBe('Tech Weekly Newsletter');
    });

    it('should default to "Newsletter" when title is not provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.name).toBe('Newsletter');
    });

    it('should include description when provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        description: 'Weekly tech news and insights',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.description).toBe(
        'Weekly tech news and insights'
      );
    });

    it('should not include description when not provided', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.description).toBeUndefined();
    });

    it('should not include description when empty string', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        description: '',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.description).toBeUndefined();
    });
  });

  describe('Idempotency', () => {
    it('should not duplicate script when called twice with same newsletterId', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);
      injectSchemaOrg(data);

      const scripts = document.head.querySelectorAll(
        'script[id="nevent-jsonld-newsletter-123"]'
      );
      expect(scripts.length).toBe(1);
    });

    it('should not duplicate even with different data for same newsletterId', () => {
      const data1: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: 'First Title',
      };

      const data2: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: 'Second Title',
      };

      injectSchemaOrg(data1);
      injectSchemaOrg(data2);

      const scripts = document.head.querySelectorAll(
        'script[id="nevent-jsonld-newsletter-123"]'
      );
      expect(scripts.length).toBe(1);

      // Should keep the first injected schema
      const schema = JSON.parse(scripts[0].textContent!);
      expect(schema.potentialAction.object.name).toBe('First Title');
    });

    it('should allow multiple widgets with different newsletterIds on same page', () => {
      const data1: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      const data2: SchemaOrgData = {
        newsletterId: 'newsletter-456',
      };

      injectSchemaOrg(data1);
      injectSchemaOrg(data2);

      const script1 = document.getElementById('nevent-jsonld-newsletter-123');
      const script2 = document.getElementById('nevent-jsonld-newsletter-456');

      expect(script1).toBeTruthy();
      expect(script2).toBeTruthy();

      const allScripts = document.head.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      expect(allScripts.length).toBe(2);
    });
  });

  describe('Complete Schema Examples', () => {
    it('should generate complete schema with all optional fields', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: 'Tech Weekly Newsletter',
        description: 'Latest tech news and insights every week',
        companyName: 'TechCorp Inc',
        privacyPolicyUrl: 'https://techcorp.com/privacy',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      // Verify complete structure
      expect(schema).toEqual({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        potentialAction: {
          '@type': 'SubscribeAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://nevent.ai/newsletter/newsletter-123',
            actionPlatform: [
              'https://schema.org/DesktopWebPlatform',
              'https://schema.org/MobileWebPlatform',
            ],
          },
          object: {
            '@type': 'CreativeWork',
            name: 'Tech Weekly Newsletter',
            description: 'Latest tech news and insights every week',
            provider: {
              '@type': 'Organization',
              name: 'Nevent',
              url: 'https://nevent.ai',
            },
            publisher: {
              '@type': 'Organization',
              name: 'TechCorp Inc',
              url: 'https://techcorp.com/privacy',
            },
          },
        },
      });
    });

    it('should generate minimal schema with only required fields', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      // Verify minimal structure
      expect(schema).toEqual({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        potentialAction: {
          '@type': 'SubscribeAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://nevent.ai/newsletter/newsletter-123',
            actionPlatform: [
              'https://schema.org/DesktopWebPlatform',
              'https://schema.org/MobileWebPlatform',
            ],
          },
          object: {
            '@type': 'CreativeWork',
            name: 'Newsletter',
            provider: {
              '@type': 'Organization',
              name: 'Nevent',
              url: 'https://nevent.ai',
            },
          },
        },
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in title', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: 'Tech & Innovation: "Weekly" Newsletter',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.name).toBe(
        'Tech & Innovation: "Weekly" Newsletter'
      );
    });

    it('should handle special characters in companyName', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        companyName: 'TechCorp & Co. "Innovators"',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.publisher.name).toBe(
        'TechCorp & Co. "Innovators"'
      );
    });

    it('should handle newsletterId with special characters', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123-abc_xyz',
      };

      injectSchemaOrg(data);

      const script = document.getElementById(
        'nevent-jsonld-newsletter-123-abc_xyz'
      );
      expect(script).toBeTruthy();

      const schema = JSON.parse(script!.textContent!);
      expect(schema.potentialAction.target.urlTemplate).toBe(
        'https://nevent.ai/newsletter/newsletter-123-abc_xyz'
      );
    });

    it('should handle empty title by defaulting to "Newsletter"', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: '',
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      const schema = JSON.parse(script!.textContent!);

      expect(schema.potentialAction.object.name).toBe('Newsletter');
    });

    it('should handle undefined optional fields gracefully', () => {
      const data: SchemaOrgData = {
        newsletterId: 'newsletter-123',
        title: undefined,
        description: undefined,
        companyName: undefined,
        privacyPolicyUrl: undefined,
      };

      injectSchemaOrg(data);

      const script = document.getElementById('nevent-jsonld-newsletter-123');
      expect(script).toBeTruthy();

      // Should not throw when parsing
      expect(() => JSON.parse(script!.textContent!)).not.toThrow();
    });
  });
});
