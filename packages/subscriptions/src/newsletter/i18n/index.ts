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

export type { NewsletterLabels } from './types';

/**
 * All supported locale dictionaries keyed by BCP 47 language subtag.
 */
export const NEWSLETTER_LOCALES: Record<string, NewsletterLabels> = {
  es,
  en,
  ca,
  pt,
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
  const detected = locale || I18nManager.detectLocale();
  const resolvedLocale = NEWSLETTER_LOCALES[detected]
    ? detected
    : DEFAULT_LOCALE;

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

/**
 * The locale an anonymous visitor sees the widget in (nevent-work#279, decision 4 of #274, option B):
 * 1. a locale the operator set in the embed, if the widget has labels for it;
 * 2. the first browser language whose labels the widget has (it negotiates among the tenant's language and the
 *    widget's own: es, en, ca, pt);
 * 3. the tenant's language (`tenantLanguage` of the public config), if the widget has labels for it;
 * 4. English — never a fixed Spanish.
 * Without `tenantLanguage` (an API that does not send it yet) step 3–4 keep today's fallback, {@link DEFAULT_LOCALE}.
 */
export function negotiateWidgetLocale(
  browserLanguages: readonly string[],
  tenantLanguage?: string | null,
  explicitLocale?: string | null
): string {
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
  if (tenantLanguage === undefined || tenantLanguage === null) {
    return DEFAULT_LOCALE;
  }
  const tenant = baseLanguage(tenantLanguage);
  return has(tenant) ? tenant : 'en';
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
