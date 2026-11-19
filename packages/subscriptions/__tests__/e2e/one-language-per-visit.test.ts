/**
 * nevent-work#40 (FAN-045, FAN-046, FAN-063): one language per visit. The widget asks the API for the default texts in
 * the visitor's locale (?language=), shows its own texts in the language of the texts it got (textsLanguage) when it
 * could not tell the visitor's, and sends that language back on subscribe so the consent recorded is the one shown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWidget,
  mockFetch,
  getShadowRoot,
  fillInput,
  toggleCheckbox,
  submitForm,
  flush,
} from './helpers';
import { preferredWidgetLocale, visitLocale } from '../../src/newsletter/i18n/index';

const ENGLISH_TEXTS = {
  tenantLanguage: 'es',
  textsLanguage: 'en',
  messages: {
    title: 'Subscribe to our newsletter',
    buttonText: 'Subscribe',
    privacyText: 'Privacy Policy',
    gdprText:
      'I agree to the processing of my personal data to receive commercial communications and promotions related to [COMPANY_NAME], in accordance with the [PRIVACY_POLICY_LINK].',
  },
};

function browser(languages: string[]) {
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(navigator, 'language', { value: languages[0] ?? '', configurable: true });
}

function configUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/config'));
  return String(call![0]);
}

describe('One language per visit (nevent-work#40)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('an English browser on a Spanish organisation asks for English texts and shows no Spanish', async () => {
    browser(['en-GB', 'en']);
    const fetchMock = mockFetch({ configResponse: ENGLISH_TEXTS });
    const { widget, container } = createWidget({ locale: undefined });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('&language=en');
    expect(widget.getLocale()).toBe('en');
    const shadow = getShadowRoot(container)!;
    const text = shadow.textContent ?? '';
    expect(text).toContain('I agree to the processing of my personal data');
    expect(text).not.toMatch(/Acepto|Suscr|Política|obligatorio/);
    expect(shadow.querySelector('form')!.getAttribute('aria-label')).toBe('Newsletter subscription form');
    widget.destroy();
  });

  it('sends back the language of the texts it showed, so the consent recorded is the one seen', async () => {
    browser(['en-GB']);
    const fetchMock = mockFetch({ configResponse: ENGLISH_TEXTS });
    const { widget, container } = createWidget({ locale: undefined });
    await widget.init();
    const shadow = getShadowRoot(container)!;
    fillInput(shadow, 'input[name="email"]', 'fan@example.com');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/subscribe'));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.textsLanguage).toBe('en');
    expect(body.displayLanguage).toBe('en');
    widget.destroy();
  });

  it('without fields from the API, the default email field is in the visitor\'s language (FAN-048)', async () => {
    browser(['en-GB']);
    mockFetch({ configResponse: { ...ENGLISH_TEXTS, fieldConfigurations: [] } });
    const { widget, container } = createWidget({ locale: undefined });
    await widget.init();

    const email = getShadowRoot(container)!.querySelector('input[type="email"]') as HTMLInputElement;
    expect(email.placeholder).toBe('Your email');
    widget.destroy();
  });

  it('a Catalan browser does not ask for Catalan and gets the one language of the texts', async () => {
    browser(['ca-ES', 'ca']);
    const fetchMock = mockFetch({ configResponse: { tenantLanguage: 'es', textsLanguage: 'es' } });
    const { widget } = createWidget({ locale: undefined });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('language=auto');
    expect(widget.getLocale()).toBe('es');
    widget.destroy();
  });

  it('a browser the widget has no labels for gets the language of the texts, not a second one', async () => {
    browser(['de-DE']);
    const fetchMock = mockFetch({ configResponse: { tenantLanguage: 'de', textsLanguage: 'es' } });
    const { widget } = createWidget({ locale: undefined });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('language=auto');
    // Before nevent-work#40 the widget showed English (no labels for de) around Spanish texts from the API.
    expect(widget.getLocale()).toBe('es');
    widget.destroy();
  });

  it.each(['pt-PT', 'pt-BR'])('requests pt-PT texts for a %s browser and records the shown consent', async (locale) => {
    browser([locale, 'es']);
    const consent = 'Aceito o tratamento dos meus dados pessoais para receber comunicações comerciais.';
    const fetchMock = mockFetch({ configResponse: {
      tenantLanguage: 'es',
      textsLanguage: 'pt',
      messages: { title: 'Newsletter do festival', gdprText: consent },
    } });
    const { widget, container } = createWidget({ locale: undefined });
    await widget.init();
    expect(configUrl(fetchMock)).toContain('language=pt');
    expect(widget.getLocale()).toBe('pt');
    let shadow = getShadowRoot(container)!;
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Formulário de subscrição da newsletter');
    expect(shadow.textContent).toContain('Newsletter do festival');
    expect(shadow.textContent).toContain(consent);

    widget.setLocale('en');
    shadow = getShadowRoot(container)!;
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Newsletter subscription form');
    expect(shadow.textContent).toContain(consent);
    expect(fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('/config'))).toHaveLength(1);

    fillInput(shadow, 'input[name="email"]', 'fan@example.com');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/subscribe'));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.textsLanguage).toBe('pt');
    expect(body.displayLanguage).toBe('en');
    widget.destroy();
  });

  it('follows the actual texts of the previous API for an explicit Portuguese embed', async () => {
    browser(['en-GB']);
    const fetchMock = mockFetch({ configResponse: ENGLISH_TEXTS });
    const { widget, container } = createWidget({ locale: 'pt-PT' });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('language=pt');
    expect(widget.getLocale()).toBe('en');
    expect(getShadowRoot(container)?.textContent).toContain('I agree to the processing of my personal data');
    widget.destroy();
  });

  it('falls back to the actual texts of the previous API for an explicit French embed', async () => {
    browser(['en-GB']);
    const fetchMock = mockFetch({ configResponse: ENGLISH_TEXTS });
    const { widget, container } = createWidget({ locale: 'fr-CA' });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('language=fr');
    expect(widget.getLocale()).toBe('en');
    expect(getShadowRoot(container)?.textContent).toContain('I agree to the processing of my personal data');
    widget.destroy();
  });

  it('falls back to the actual texts of the previous API for an explicit Italian embed', async () => {
    browser(['en-GB']);
    const fetchMock = mockFetch({ configResponse: ENGLISH_TEXTS });
    const { widget, container } = createWidget({ locale: 'it-CH' });
    await widget.init();

    expect(configUrl(fetchMock)).toContain('language=it');
    expect(widget.getLocale()).toBe('en');
    expect(getShadowRoot(container)?.textContent).toContain('I agree to the processing of my personal data');
    widget.destroy();
  });

  it.each([
    { browserLocale: 'fr-CA', tenantLanguage: 'es', explicit: undefined, requested: 'fr' },
    { browserLocale: 'de-DE', tenantLanguage: 'fr', explicit: undefined, requested: 'auto' },
    { browserLocale: 'en-GB', tenantLanguage: 'fr', explicit: 'fr-BE', requested: 'fr' },
  ])('keeps French config, local labels and consent aligned ($browserLocale, $requested)', async ({
    browserLocale, tenantLanguage, explicit, requested,
  }) => {
    browser([browserLocale]);
    const consent = 'J’accepte le traitement de mes données personnelles.';
    const fetchMock = mockFetch({ configResponse: {
      tenantLanguage,
      textsLanguage: 'fr',
      messages: { title: 'Newsletter du festival', gdprText: consent },
    } });
    const { widget, container } = createWidget({ locale: explicit });
    await widget.init();

    expect(configUrl(fetchMock)).toContain(`language=${requested}`);
    expect(widget.getLocale()).toBe('fr');
    let shadow = getShadowRoot(container)!;
    expect(shadow.host.getAttribute('lang')).toBe('fr');
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Formulaire d’inscription à la newsletter');
    expect(shadow.textContent).toContain('Newsletter du festival');
    expect(shadow.textContent).toContain(consent);
    widget.setLocale('en');
    shadow = getShadowRoot(container)!;
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Newsletter subscription form');
    expect(shadow.textContent).toContain(consent);
    expect(fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes('/config'))).toHaveLength(1);

    fillInput(shadow, 'input[name="email"]', 'fan@example.com');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/subscribe'));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.textsLanguage).toBe('fr');
    expect(body.displayLanguage).toBe('en');
    widget.destroy();
  });

  it.each([
    { browserLocale: 'de-DE', tenantLanguage: 'it', explicit: undefined, requested: 'auto' },
    { browserLocale: 'en-GB', tenantLanguage: 'it', explicit: 'it-CH', requested: 'it' },
  ])('keeps Italian config, local labels and consent aligned ($browserLocale, $requested)', async ({
    browserLocale, tenantLanguage, explicit, requested,
  }) => {
    browser([browserLocale]);
    const consent = 'Acconsento al trattamento dei miei dati personali.';
    const fetchMock = mockFetch({ configResponse: {
      tenantLanguage,
      textsLanguage: 'it',
      messages: { title: 'Newsletter del festival', gdprText: consent },
    } });
    const { widget, container } = createWidget({ locale: explicit });
    await widget.init();

    const config = new URL(configUrl(fetchMock));
    expect(config.searchParams.get('language')).toBe(requested);
    expect(config.searchParams.get('sdkLanguages')?.split(',').sort()).toEqual(
      requested === 'auto' ? ['ca', 'en', 'es', 'fr', 'it', 'pt'] : undefined
    );
    expect(widget.getLocale()).toBe('it');
    let shadow = getShadowRoot(container)!;
    expect(shadow.host.getAttribute('lang')).toBe('it');
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Modulo di iscrizione alla newsletter');
    expect(shadow.textContent).toContain('Newsletter del festival');
    expect(shadow.textContent).toContain(consent);
    widget.setLocale('en');
    shadow = getShadowRoot(container)!;
    expect(shadow.querySelector('form')?.getAttribute('aria-label')).toBe('Newsletter subscription form');
    expect(shadow.textContent).toContain(consent);
    expect(fetchMock.mock.calls.filter((call: unknown[]) => String(call[0]).includes('/config'))).toHaveLength(1);

    fillInput(shadow, 'input[name="email"]', 'fan@example.com');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/subscribe'));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.textsLanguage).toBe('it');
    expect(body.displayLanguage).toBe('en');
    widget.destroy();
  });

  it('shows the complete French validation message for an invalid email', async () => {
    browser(['fr-FR']);
    const fetchMock = mockFetch({ configResponse: { tenantLanguage: 'fr', textsLanguage: 'fr', fieldConfigurations: [] } });
    const { widget, container } = createWidget({ locale: 'fr' });
    await widget.init();

    const shadow = getShadowRoot(container)!;
    fillInput(shadow, 'input[name="email"]', 'adresse-invalide');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();

    expect(shadow.querySelector('.nevent-field-error')?.textContent).toBe('Saisissez une adresse e-mail valide.');
    expect(fetchMock.mock.calls.some((call: unknown[]) => String(call[0]).includes('/subscribe'))).toBe(false);
    widget.destroy();
  });

  it('an older API (no textsLanguage) keeps the negotiation of nevent-work#279 and no textsLanguage is sent', async () => {
    browser(['en-GB']);
    const fetchMock = mockFetch({ configResponse: { tenantLanguage: 'es' } });
    const { widget, container } = createWidget({ locale: undefined });
    await widget.init();
    expect(widget.getLocale()).toBe('en');

    const shadow = getShadowRoot(container)!;
    fillInput(shadow, 'input[name="email"]', 'fan@example.com');
    toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
    submitForm(shadow);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/subscribe'));
    expect(JSON.parse((call![1] as RequestInit).body as string).textsLanguage).toBeUndefined();
    widget.destroy();
  });
});

describe('preferredWidgetLocale and visitLocale', () => {
  it('the embed locale, else the first browser language the API has texts for, else none', () => {
    expect(preferredWidgetLocale(['en-GB'], undefined)).toBe('en');
    expect(preferredWidgetLocale(['fr-CH', 'ca-ES', 'en'], undefined)).toBe('fr');
    expect(preferredWidgetLocale(['ca-ES'], undefined)).toBeUndefined();
    expect(preferredWidgetLocale(['pt-BR', 'es'], undefined)).toBe('pt');
    expect(preferredWidgetLocale(['en-GB'], 'ca')).toBe('ca');
    expect(preferredWidgetLocale(['en-GB'], 'es')).toBe('es');
    expect(preferredWidgetLocale(['de-DE'], 'xx')).toBeUndefined();
    expect(preferredWidgetLocale([], undefined)).toBeUndefined();
  });

  it('with textsLanguage, the visitor first and then the texts; without it, the negotiation of #279', () => {
    expect(visitLocale(['en-GB'], 'es', undefined, 'en')).toBe('en');
    expect(visitLocale(['fr-FR'], 'en-GB', undefined, 'en')).toBe('en');
    expect(visitLocale(['de-DE'], 'pt-PT', undefined, 'es')).toBe('es');
    // a Catalan or Portuguese browser follows the language of the texts, never Catalan around Spanish
    expect(visitLocale(['ca-ES'], 'es', undefined, 'es')).toBe('es');
    expect(visitLocale(['pt-BR'], 'en', undefined, 'en')).toBe('en');
    expect(visitLocale(['en-GB'], 'es', 'pt-PT', 'es')).toBe('es');
    expect(visitLocale(['en-GB'], 'es', 'pt-BR', 'pt')).toBe('pt');
    // Legacy explicit Catalan remains the operator's choice
    expect(visitLocale(['en-GB'], 'es', 'ca', 'es')).toBe('ca');
    expect(visitLocale(['de-DE'], 'pt-PT', undefined, undefined)).toBe('pt');
    expect(visitLocale(['en-GB'], undefined, undefined, undefined)).toBeUndefined();
  });
});
