// @vitest-environment jsdom
/**
 * Regression tests for the submit button label alignment (nevent-work#44).
 *
 * A widget configured with a fixed button height (32px in production) and no
 * explicit padding used to inherit the 12px 24px fallback padding: the 6px
 * content box left the label overflowing downwards against the bottom border.
 *
 * jsdom does not lay out boxes, so these tests assert the cascaded styles of
 * the rendered button (the rules the browser resolves geometry from), not the
 * CSS source text. jsdom ignores shadow-root stylesheets in getComputedStyle,
 * so the widget renders through its no-Shadow-DOM fallback, which injects the
 * same generated CSS into the light DOM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewsletterWidget } from '../../newsletter-widget';

type ButtonStyles = {
  height?: string;
  padding?: string;
  borderWidth?: string;
};

function stubConfig(button: ButtonStyles, direction = 'column') {
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
        messages: { buttonText: 'Enviar' },
        styles: {
          global: { direction },
          button: {
            backgroundColor: '#ffffff',
            textColor: '#131718',
            borderColor: '#ffffff',
            ...button,
          },
        },
      }),
    } as Response)
  );
}

type LoadingState = {
  showLoading: () => void;
  restoreSubmitButton: () => void;
};

async function renderWidget(): Promise<{
  widget: NewsletterWidget;
  button: HTMLButtonElement;
}> {
  const widget = new NewsletterWidget({
    newsletterId: 'n1',
    tenantId: 't1',
    containerId: 'widget-container',
    apiUrl: 'https://api.example.com',
    analytics: false,
    debug: false,
  });
  await widget.init();

  const host = document.querySelector('[data-nevent-widget="newsletter"]');
  const button = host?.querySelector<HTMLButtonElement>(
    '.nevent-submit-button'
  );
  if (!button) {
    throw new Error('submit button was not rendered');
  }
  return { widget, button };
}

async function renderButton(): Promise<HTMLButtonElement> {
  return (await renderWidget()).button;
}

function verticalPadding(style: CSSStyleDeclaration): [string, string] {
  return [style.paddingTop, style.paddingBottom];
}

describe('NewsletterWidget — submit button label centering', () => {
  const attachShadow = Element.prototype.attachShadow;

  beforeEach(() => {
    // Force the light-DOM fallback so jsdom cascades the widget stylesheet
    (Element.prototype as { attachShadow?: unknown }).attachShadow = undefined;
    const container = document.createElement('div');
    container.id = 'widget-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    Element.prototype.attachShadow = attachShadow;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('centres the label on both axes with a border-box flex button', async () => {
    stubConfig({ height: '32px', borderWidth: '1px' });

    const style = getComputedStyle(await renderButton());

    expect(style.display).toBe('inline-flex');
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('center');
    expect(style.boxSizing).toBe('border-box');
  });

  it.each(['32px', '44px'])(
    'drops the vertical fallback padding for a fixed %s height without padding',
    async (height) => {
      stubConfig({ height, borderWidth: '1px' });

      const style = getComputedStyle(await renderButton());

      expect(style.height).toBe(height);
      expect(verticalPadding(style)).toEqual(['0px', '0px']);
      expect(style.paddingLeft).toBe('24px');
      expect(style.paddingRight).toBe('24px');
      expect(style.width).toBe('100%');
    }
  );

  it('keeps the 12px 24px fallback padding when the height is automatic', async () => {
    stubConfig({});

    const style = getComputedStyle(await renderButton());

    expect(style.height).toBe('');
    expect(verticalPadding(style)).toEqual(['12px', '12px']);
    expect(style.paddingLeft).toBe('24px');
  });

  it('treats an explicit auto height as automatic', async () => {
    stubConfig({ height: 'auto' });

    const style = getComputedStyle(await renderButton());

    expect(verticalPadding(style)).toEqual(['12px', '12px']);
  });

  it('keeps rendering when an untyped embed supplies a numeric height', async () => {
    // JavaScript embedders can bypass the public string type. Previously the
    // browser ignored the invalid unitless height; initialization still worked.
    stubConfig({ height: 32 as unknown as string });

    const button = await renderButton();

    expect(button.textContent?.trim()).toBe('Enviar');
    expect(verticalPadding(getComputedStyle(button))).toEqual(['12px', '12px']);
  });

  it('respects an explicit padding even with a fixed height', async () => {
    stubConfig({ height: '32px', padding: '4px 10px' });

    const style = getComputedStyle(await renderButton());

    expect(style.height).toBe('32px');
    expect(verticalPadding(style)).toEqual(['4px', '4px']);
    expect(style.paddingLeft).toBe('10px');
    expect(style.alignItems).toBe('center');
  });

  it('keeps the centering in the row layout', async () => {
    stubConfig({ height: '32px' }, 'row');

    const style = getComputedStyle(await renderButton());

    expect(style.display).toBe('inline-flex');
    expect(style.alignItems).toBe('center');
    expect(verticalPadding(style)).toEqual(['0px', '0px']);
  });

  it('centres the loading spinner and restores the label afterwards', async () => {
    stubConfig({ height: '32px' });
    const { widget, button } = await renderWidget();
    const loading = widget as unknown as LoadingState;

    loading.showLoading();

    expect(button.disabled).toBe(true);
    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild?.className).toBe(
      'nevent-newsletter-spinner'
    );
    expect(button.textContent).toBe('');
    // The spinner is the single flex item of the centred button
    expect(getComputedStyle(button).alignItems).toBe('center');
    expect(getComputedStyle(button).height).toBe('32px');

    loading.restoreSubmitButton();

    expect(button.disabled).toBe(false);
    expect(button.querySelector('.nevent-newsletter-spinner')).toBeNull();
    expect(button.textContent?.trim()).toBe('Enviar');
  });
});
