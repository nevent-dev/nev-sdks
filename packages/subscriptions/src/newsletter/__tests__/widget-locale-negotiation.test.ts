/**
 * nevent-work#279 (decision 4 of #274, option B): the locale an anonymous visitor sees the newsletter widget in.
 * The cases of the before/after mock (evidencias/i18n-eventos/d4-3-mock-widget-idioma.html).
 */
import { describe, expect, it } from 'vitest';
import { negotiateWidgetLocale } from '../i18n/index';

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

  it('an API that does not send tenantLanguage keeps today\'s fallback (es), as before', () => {
    expect(negotiateWidgetLocale(['fr-FR'], undefined)).toBe('es');
    expect(negotiateWidgetLocale(['en-US'], undefined)).toBe('en');
  });

  it('counter-experiment: today\'s fixed «es» would be wrong for a non-Spanish tenant', () => {
    expect(negotiateWidgetLocale(['fr-FR'], 'en-GB')).not.toBe('es');
  });
});
