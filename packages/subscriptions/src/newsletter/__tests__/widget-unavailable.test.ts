// @vitest-environment jsdom
/**
 * Tests for HTTP 422 graceful fallback behavior.
 *
 * When GET /public/widget/{id}/config returns 422, the backend is signaling
 * that the tenant's legal data (companyName / privacyPolicyUrl) is not yet
 * provisioned. The SDK must render a localized fallback message and skip
 * the rest of widget initialization — without calling onError.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsletterWidget } from '../../newsletter-widget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stub422() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'LEGAL_DATA_INCOMPLETE',
        missingFields: ['companyName'],
      }),
    } as Response)
  );
}

function stubOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Test Newsletter',
        companyName: 'TestCo',
        privacyPolicyUrl: 'https://example.com/privacy',
      }),
    } as Response)
  );
}

function stub500() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'INTERNAL_SERVER_ERROR' }),
    } as Response)
  );
}

function minimalConfig(containerId = 'widget-container') {
  return {
    newsletterId: 'n1',
    tenantId: 't1',
    containerId,
    apiUrl: 'https://api.example.com',
    analytics: false,
    debug: false,
  };
}

/** Queries the shadow root of the widget host element inside the given container. */
function getShadowRoot(container: HTMLElement): ShadowRoot | null {
  const host = container.querySelector('[data-nevent-widget="newsletter"]');
  return host ? host.shadowRoot : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewsletterWidget — HTTP 422 (tenant legal incomplete)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'widget-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the unavailable fallback message when /config returns 422', async () => {
    stub422();

    const widget = new NewsletterWidget(minimalConfig());
    const onError = vi.fn();
    // Access the private config object to inject onError
    (widget as unknown as { config: { onError: typeof onError } }).config.onError = onError;

    await widget.init();

    // The shadow root should contain the unavailable panel
    const root = getShadowRoot(container);
    expect(root).not.toBeNull();

    const unavailablePanel = root?.querySelector('.nevent-widget-unavailable');
    expect(unavailablePanel).not.toBeNull();

    // The text must contain the Spanish fallback (default locale in test env)
    const text = unavailablePanel?.textContent ?? '';
    expect(text).toMatch(/unavailable|no disponible/i);
  });

  it('does NOT render a subscription form when /config returns 422', async () => {
    stub422();

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    // No form, no email input
    expect(root?.querySelector('form')).toBeNull();
    expect(root?.querySelector('input[type="email"]')).toBeNull();
  });

  it('does NOT call onError for a 422 response', async () => {
    stub422();

    const onError = vi.fn();
    const widget = new NewsletterWidget({
      ...minimalConfig(),
      onError,
    });

    await widget.init();

    // 422 is an expected "not provisioned" state — not a runtime error
    expect(onError).not.toHaveBeenCalled();
  });

  it('still renders the form normally when /config returns 200', async () => {
    stubOk();

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    const form = root?.querySelector('form');
    expect(form).not.toBeNull();
  });

  it('does NOT show the unavailable panel when /config returns 500 (falls back to defaults)', async () => {
    stub500();

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    // 500 falls back to defaults and still renders a form
    expect(root?.querySelector('.nevent-widget-unavailable')).toBeNull();
    expect(root?.querySelector('form')).not.toBeNull();
  });
});
