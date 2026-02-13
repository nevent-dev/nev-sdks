/**
 * Schema.org JSON-LD Injector
 *
 * Injects Schema.org SubscribeAction structured data into the document head
 * when the newsletter widget is embedded on third-party websites.
 *
 * This improves SEO and enables search engines to understand the newsletter
 * subscription functionality provided by Nevent.
 *
 * @see https://schema.org/SubscribeAction
 * @see https://schema.org/WebPage
 */

/**
 * Data required to generate Schema.org structured data
 */
export interface SchemaOrgData {
  /** Newsletter identifier */
  newsletterId: string;

  /** Newsletter title (optional) */
  title?: string;

  /** Newsletter description (optional) */
  description?: string;

  /** Company/tenant name (optional) */
  companyName?: string;

  /** Privacy policy URL (optional) */
  privacyPolicyUrl?: string;
}

/**
 * Injects Schema.org JSON-LD structured data into the document head
 *
 * The injected schema describes a SubscribeAction for newsletter subscription,
 * identifying Nevent as the service provider and the tenant as the publisher.
 *
 * This function is idempotent - calling it multiple times with the same
 * newsletterId will not create duplicate script elements.
 *
 * @param data - Schema.org data configuration
 *
 * @example
 * ```typescript
 * injectSchemaOrg({
 *   newsletterId: 'newsletter-123',
 *   title: 'Tech Weekly Newsletter',
 *   description: 'Latest tech news every week',
 *   companyName: 'TechCorp',
 *   privacyPolicyUrl: 'https://techcorp.com/privacy'
 * });
 * ```
 */
export function injectSchemaOrg(data: SchemaOrgData): void {
  const scriptId = `nevent-jsonld-${data.newsletterId}`;

  // Idempotent — don't duplicate if already exists
  if (document.getElementById(scriptId)) {
    return;
  }

  const schema = buildSchema(data);

  const script = document.createElement('script');
  script.id = scriptId;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

/**
 * Builds Schema.org structured data object
 *
 * Constructs a WebPage with a SubscribeAction potentialAction, including:
 * - Nevent as the service provider
 * - The tenant company as the publisher (if provided)
 * - Newsletter metadata (title, description)
 * - Target URL and platform information
 *
 * @param data - Schema.org data configuration
 * @returns Schema.org structured data object
 */
function buildSchema(data: SchemaOrgData): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    potentialAction: {
      '@type': 'SubscribeAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `https://nevent.ai/newsletter/${data.newsletterId}`,
        actionPlatform: [
          'https://schema.org/DesktopWebPlatform',
          'https://schema.org/MobileWebPlatform',
        ],
      },
      object: {
        '@type': 'CreativeWork',
        name: data.title || 'Newsletter',
        ...(data.description ? { description: data.description } : {}),
        provider: {
          '@type': 'Organization',
          name: 'Nevent',
          url: 'https://nevent.ai',
        },
        ...(data.companyName
          ? {
              publisher: {
                '@type': 'Organization',
                name: data.companyName,
                ...(data.privacyPolicyUrl
                  ? { url: data.privacyPolicyUrl }
                  : {}),
              },
            }
          : {}),
      },
    },
  };
}
