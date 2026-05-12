// @vitest-environment jsdom
/**
 * Tests for widget-config error handling — the SDK must NEVER render a
 * subscription form when the backend config endpoint returns anything other
 * than 200 with a valid payload.
 *
 * Behavior by status class:
 *  - 4xx (incl. 422, 404): render unavailable panel, skip init, do NOT call
 *    onError (expected "not provisioned" state, not an embedder error).
 *  - 5xx and network errors: render unavailable panel, skip init, DO report
 *    to Sentry via sentryReporter (real server failure, operators must see it).
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

function stubOkWithGdprText(gdprText: string) {
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
        messages: { gdprText },
      }),
    } as Response)
  );
}

function stub404() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ errors: 'Newsletter not found or not active' }),
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

function stubNetworkError() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
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

describe('NewsletterWidget — widget-config error handling', () => {
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

  it('renders the unavailable fallback when /config returns 404', async () => {
    stub404();

    const widget = new NewsletterWidget(minimalConfig());
    const onError = vi.fn();
    (widget as unknown as { config: { onError: typeof onError } }).config.onError = onError;
    await widget.init();

    const root = getShadowRoot(container);
    expect(root).not.toBeNull();

    const unavailablePanel = root?.querySelector('.nevent-widget-unavailable');
    expect(unavailablePanel).not.toBeNull();

    const text = unavailablePanel?.textContent ?? '';
    expect(text).toMatch(/unavailable|no disponible/i);

    expect(root?.querySelector('input[type="email"]')).toBeNull();
    expect(root?.querySelector('.nevent-gdpr-text')).toBeNull();
    // 4xx is not a runtime error — must NOT surface to embedder via onError
    expect(onError).not.toHaveBeenCalled();
  });

  it('renders the unavailable fallback when /config returns 500 AND does not render a form', async () => {
    stub500();

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    expect(root).not.toBeNull();

    const unavailablePanel = root?.querySelector('.nevent-widget-unavailable');
    expect(unavailablePanel).not.toBeNull();

    const text = unavailablePanel?.textContent ?? '';
    expect(text).toMatch(/unavailable|no disponible/i);

    expect(root?.querySelector('input[type="email"]')).toBeNull();
  });

  it('renders the unavailable fallback on network error AND does not render a form', async () => {
    stubNetworkError();

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    expect(root).not.toBeNull();

    const unavailablePanel = root?.querySelector('.nevent-widget-unavailable');
    expect(unavailablePanel).not.toBeNull();

    const text = unavailablePanel?.textContent ?? '';
    expect(text).toMatch(/unavailable|no disponible/i);

    expect(root?.querySelector('input[type="email"]')).toBeNull();
  });

  it('renders newlines in gdprText as <br> tags (multi-paragraph consent)', async () => {
    stubOkWithGdprText('Line one.\nLine two.\r\nLine three.');

    const widget = new NewsletterWidget(minimalConfig());
    await widget.init();

    const root = getShadowRoot(container);
    const gdprText = root?.querySelector('.nevent-gdpr-text');
    expect(gdprText).not.toBeNull();
    // After normalization, both \n and \r\n become <br>.
    const html = gdprText?.innerHTML ?? '';
    const brCount = (html.match(/<br\s*\/?>/g) ?? []).length;
    expect(brCount).toBe(2);
    expect(html).toContain('Line one.');
    expect(html).toContain('Line two.');
    expect(html).toContain('Line three.');
    // Raw \n must NOT survive — those would render as spaces, defeating the purpose.
    expect(html.includes('\n')).toBe(false);
  });
});
