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
