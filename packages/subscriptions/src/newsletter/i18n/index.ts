/**
 * Newsletter widget i18n locale registry
 *
 * Aggregates all supported locale dictionaries and provides a factory
 * function to create an I18nManager instance pre-loaded with all locales.
 *
 * @packageDocumentation
 */

import { I18nManager } from '@nevent/core';
import type { NewsletterLabels } from './types';
import { es } from './es';
import { en } from './en';
import { ca } from './ca';
import { pt } from './pt';
import { fr } from './fr';
import { it } from './it';
import { de } from './de';
import { nl } from './nl';

export type { NewsletterLabels } from './types';

/**
 * All supported locale dictionaries keyed by BCP 47 language subtag.
 */
export const NEWSLETTER_LOCALES: Record<string, NewsletterLabels> = {
  es,
  en,
  ca,
  pt,
  fr,
  it,
  de,
  nl,
};

/**
 * Default locale used when auto-detection fails or requested locale
 * is not available.
 */
export const DEFAULT_LOCALE = 'es';

/**
 * Creates an I18nManager configured with all newsletter widget locales.
 *
 * @param locale - Initial locale to use. If not provided, auto-detects
 *   from `navigator.language` and falls back to {@link DEFAULT_LOCALE}.
 * @returns An I18nManager instance typed with {@link NewsletterLabels}
 *
 * @example
 * ```typescript
 * const i18n = createNewsletterI18n('en');
 * i18n.t('submitButton'); // 'Subscribe'
 * i18n.t('fieldRequired', { fieldName: 'Email' }); // 'Email is required'
 * ```
 */
export function createNewsletterI18n(
  locale?: string
): I18nManager<NewsletterLabels> {
  const resolvedLocale = initialLocale(locale);

  const i18n = new I18nManager<NewsletterLabels>(
    NEWSLETTER_LOCALES,
    DEFAULT_LOCALE
  );
  i18n.setLocale(resolvedLocale);

  return i18n;
}

/** The base language of a BCP 47 tag, lower case ('pt-BR' → 'pt'); undefined when there is none. */
function baseLanguage(tag: string | null | undefined): string | undefined {
  const base = typeof tag === 'string' ? tag.trim().split(/[-_]/)[0]?.toLowerCase() : undefined;
  return base ? base : undefined;
}

function initialLocale(locale?: string | null): string {
  const detected = baseLanguage(locale || I18nManager.detectLocale());
  return detected && Object.prototype.hasOwnProperty.call(NEWSLETTER_LOCALES, detected)
    ? detected
    : DEFAULT_LOCALE;
}

/**
 * The locale an anonymous visitor sees the widget in (nevent-work#279, decision 4 of #274, option B):
 * 1. a locale the operator set in the embed, if the widget has labels for it;
 * 2. the first browser language whose labels the widget has (it negotiates among the tenant's language and the
 *    widget's own: es, en, ca, pt, fr, it, de, nl);
 * 3. the tenant's language (`tenantLanguage` of the public config), if the widget has labels for it;
 * 4. English — never a fixed Spanish.
 * Without `tenantLanguage` (an API that does not send it yet) it is exactly today's choice, {@link createNewsletterI18n}:
 * the explicit locale or the browser language, negotiated to its base, else {@link DEFAULT_LOCALE} (M1 of
 * i18n-rev2: an old API changes nothing).
 */
export function negotiateWidgetLocale(
  browserLanguages: readonly string[],
  tenantLanguage?: string | null,
  explicitLocale?: string | null
): string {
  if (tenantLanguage === undefined || tenantLanguage === null || tenantLanguage.trim() === '') {
    return initialLocale(explicitLocale);
  }
  const has = (l: string | undefined): l is string => !!l && Object.prototype.hasOwnProperty.call(NEWSLETTER_LOCALES, l);
  const explicit = baseLanguage(explicitLocale);
  if (has(explicit)) {
    return explicit;
  }
  for (const browser of browserLanguages) {
    const base = baseLanguage(browser);
    if (has(base)) {
      return base;
    }
  }
  const tenant = baseLanguage(tenantLanguage);
  return has(tenant) ? tenant : 'en';
}

/**
 * The languages the API has default texts for (title, button, messages, consent): the widget can only show a visit in
 * one language if the API serves its texts in it (nevent-work#40).
 */
export const API_TEXT_LANGUAGES: readonly string[] = ['es', 'en', 'pt', 'fr', 'it', 'de'];

/**
 * The language the widget asks the API for, before it reads the config (nevent-work#40), as `?language=`: the embed's
 * explicit locale if the widget has labels for it, else the first browser language the API has texts for,
 * so a Catalan browser that also reads English gets English, not Catalan around Spanish texts. `undefined` when
 * neither matches: then the API answers in the organisation's language and the widget follows it.
 */
export function preferredWidgetLocale(
  browserLanguages: readonly string[],
  explicitLocale?: string | null
): string | undefined {
  const explicit = baseLanguage(explicitLocale);
  if (explicit && Object.prototype.hasOwnProperty.call(NEWSLETTER_LOCALES, explicit)) {
    return explicit;
  }
  for (const browser of browserLanguages) {
    const base = baseLanguage(browser);
    if (base && API_TEXT_LANGUAGES.includes(base)) {
      return base;
    }
  }
  return undefined;
}

/**
 * The one locale of a visit (nevent-work#40). With an API that says the language of its default texts
 * (`textsLanguage`), the visit is in that language, so title, fields, consent, errors and messages never mix two; only
 * an explicit locale of the embed overrides it (the operator chose it, and usually wrote the newsletter's own texts in
 * it). For Portuguese, French, Italian, German and Dutch requests, follow the reported language during API rollouts. Without `textsLanguage`, {@link negotiateWidgetLocale} as before.
 */
export function visitLocale(
  browserLanguages: readonly string[],
  tenantLanguage?: string | null,
  explicitLocale?: string | null,
  textsLanguage?: string | null
): string | undefined {
  const texts = baseLanguage(textsLanguage);
  if (texts && Object.prototype.hasOwnProperty.call(NEWSLETTER_LOCALES, texts)) {
    const explicit = baseLanguage(explicitLocale);
    // An older API may have fallen back to its tenant language for Portuguese, French, Italian, German or Dutch.
    // Follow the actual texts so the form and the consent have the same language.
    if (explicit === 'pt' || explicit === 'fr' || explicit === 'it' || explicit === 'de' || explicit === 'nl') return texts;
    return explicit && Object.prototype.hasOwnProperty.call(NEWSLETTER_LOCALES, explicit) ? explicit : texts;
  }
  if (tenantLanguage === undefined || tenantLanguage === null || tenantLanguage.trim() === '') {
    return undefined;
  }
  return negotiateWidgetLocale(browserLanguages, tenantLanguage, explicitLocale);
}

/** The browser's languages in order of preference (navigator.languages, else navigator.language). */
export function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  const list = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return list.filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
}

/**
 * The language the browser reports for the visitor (BCP 47), before any fallback to the
 * locales the widget has labels for (nevent-work#286). `undefined` when there is none:
 * the widget never invents a preference.
 */
export function observedBrowserLanguage(): string | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  const candidate = navigator.languages?.[0] || navigator.language;
  const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}
