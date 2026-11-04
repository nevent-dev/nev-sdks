/**
 * nevent-work#279 (decision 4 of #274, option B): the locale an anonymous visitor sees the newsletter widget in.
 * The cases of the before/after mock (evidencias/i18n-eventos/d4-3-mock-widget-idioma.html).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewsletterI18n, negotiateWidgetLocale } from '../i18n/index';

describe('negotiateWidgetLocale (decision 4, option B)', () => {
  it.each([
    ['fr-FR · Spanish tenant', ['fr-FR'], 'es', 'es'],
    ['fr-FR · British tenant', ['fr-FR'], 'en-GB', 'en'],
    ['de-DE · Portuguese tenant', ['de-DE'], 'pt-PT', 'pt'],
    ['ar-SA · Saudi tenant (no widget labels in ar)', ['ar-SA'], 'ar', 'en'],
    ['en-GB · Spanish tenant', ['en-GB'], 'es', 'en'],
    ['pt-BR · Spanish tenant', ['pt-BR'], 'es', 'pt'],
    ['no browser language · British tenant', [], 'en-GB', 'en'],
    ['the first browser language with labels wins', ['fr-FR', 'ca-ES', 'en'], 'es', 'ca'],
  ])('%s', (_case, browser, tenant, expected) => {
    expect(negotiateWidgetLocale(browser, tenant)).toBe(expected);
  });

  it('an explicit embed locale with labels wins over everything; one without labels is ignored', () => {
    expect(negotiateWidgetLocale(['en-GB'], 'es', 'pt')).toBe('pt');
    expect(negotiateWidgetLocale(['en-GB'], 'es', 'fr')).toBe('en');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('M1 of i18n-rev2: without tenantLanguage the choice is exactly today\'s, over a grid of explicit × browser', () => {
    const explicits = [undefined, 'en', 'en-GB', 'EN', 'pt', 'ca', 'xx', 'es-MX'];
    const browsers = [['en-US'], ['fr-FR', 'en-US'], ['es'], ['pt-BR'], ['ca'], ['xx'], ['EN'], []];
    const differences: string[] = [];
    for (const explicit of explicits) {
      for (const browser of browsers) {
        vi.stubGlobal('navigator', { language: browser[0] ?? '', languages: browser });
        const today = createNewsletterI18n(explicit).getLocale();
        for (const missing of [undefined, null, '']) {
          const now = negotiateWidgetLocale(browser, missing, explicit);
          if (now !== today) differences.push(`${explicit}/${browser.join(',')}/${String(missing)}: ${now} ≠ ${today}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });

  it('counter-experiment: today\'s fixed «es» would be wrong for a non-Spanish tenant', () => {
    expect(negotiateWidgetLocale(['fr-FR'], 'en-GB')).not.toBe('es');
  });
});
