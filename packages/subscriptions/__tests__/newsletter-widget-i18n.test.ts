/**
 * Newsletter widget i18n tests
 *
 * Tests for all locales, interpolation, locale switching,
 * and auto-detection behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nManager } from '@nevent/core';
import {
  createNewsletterI18n,
  NEWSLETTER_LOCALES,
  DEFAULT_LOCALE,
} from '../src/newsletter/i18n/index';
import type { NewsletterLabels } from '../src/newsletter/i18n/types';
import { es } from '../src/newsletter/i18n/es';
import { en } from '../src/newsletter/i18n/en';
import { ca } from '../src/newsletter/i18n/ca';
import { pt } from '../src/newsletter/i18n/pt';

// ---------------------------------------------------------------------------
// Locale registry
// ---------------------------------------------------------------------------

describe('Newsletter i18n locale registry', () => {
  it('should export all four locales', () => {
    expect(Object.keys(NEWSLETTER_LOCALES)).toEqual(
      expect.arrayContaining(['es', 'en', 'ca', 'pt']),
    );
  });

  it('should have "es" as default locale', () => {
    expect(DEFAULT_LOCALE).toBe('es');
  });
});

// ---------------------------------------------------------------------------
// Locale completeness
// ---------------------------------------------------------------------------

describe('Locale completeness', () => {
  const requiredKeys: (keyof NewsletterLabels)[] = [
    'formTitle',
    'formAriaLabel',
    'submitButton',
    'loadingButton',
    'successMessage',
    'errorMessage',
    'alreadySubscribed',
    'invalidEmail',
    'offlineMessage',
    'retryMessage',
    'gdprText',
    'gdprRequired',
    'privacyPolicyLabel',
    'fieldRequired',
    'invalidEmailFormat',
    'invalidPhoneFormat',
    'invalidNumberFormat',
    'invalidUrlFormat',
    'statusRegionLabel',
    'errorPrefix',
    'successPrefix',
  ];

  const locales = { es, en, ca, pt };

  for (const [code, dict] of Object.entries(locales)) {
    describe(`Locale: ${code}`, () => {
      for (const key of requiredKeys) {
        it(`should have key "${key}"`, () => {
          expect(dict[key]).toBeDefined();
          expect(typeof dict[key]).toBe('string');
          expect(dict[key].length).toBeGreaterThan(0);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// I18nManager factory
// ---------------------------------------------------------------------------

describe('createNewsletterI18n()', () => {
  it('should create an I18nManager instance', () => {
    const i18n = createNewsletterI18n('es');
    expect(i18n).toBeInstanceOf(I18nManager);
  });

  it('should use the requested locale', () => {
    const i18n = createNewsletterI18n('en');
    expect(i18n.getLocale()).toBe('en');
  });

  it('should fall back to default locale for unknown locale', () => {
    const i18n = createNewsletterI18n('xx');
    expect(i18n.getLocale()).toBe(DEFAULT_LOCALE);
  });

  it('should auto-detect locale when no argument provided', () => {
    // jsdom's navigator.language is typically 'en'
    const i18n = createNewsletterI18n();
    const locale = i18n.getLocale();
    expect(typeof locale).toBe('string');
  });

  it('should list all available locales', () => {
    const i18n = createNewsletterI18n('es');
    expect(i18n.getAvailableLocales()).toEqual(
      expect.arrayContaining(['es', 'en', 'ca', 'pt']),
    );
  });
});

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

describe('Translation (t)', () => {
  it('should translate basic keys in Spanish', () => {
    const i18n = createNewsletterI18n('es');
    expect(i18n.t('submitButton')).toBe('Suscribirse');
  });

  it('should translate basic keys in English', () => {
    const i18n = createNewsletterI18n('en');
    expect(i18n.t('submitButton')).toBe('Subscribe');
  });

  it('should translate basic keys in Catalan', () => {
    const i18n = createNewsletterI18n('ca');
    expect(i18n.t('submitButton')).toBe("Subscriure's");
  });

  it('should translate basic keys in Portuguese', () => {
    const i18n = createNewsletterI18n('pt');
    expect(i18n.t('submitButton')).toBe('Subscrever');
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe('Interpolation', () => {
  it('should interpolate {{fieldName}} in fieldRequired', () => {
    const i18n = createNewsletterI18n('en');
    const result = i18n.t('fieldRequired', { fieldName: 'Email' });
    expect(result).toBe('Email is required');
  });

  it('should interpolate {{companyName}} in gdprText', () => {
    const i18n = createNewsletterI18n('en');
    const result = i18n.t('gdprText', {
      companyName: 'TestCo',
      privacyPolicyLink: 'Privacy Policy',
    });
    expect(result).toContain('TestCo');
    expect(result).toContain('Privacy Policy');
  });

  it('should preserve unmatched placeholders', () => {
    const i18n = createNewsletterI18n('en');
    // Only provide companyName, not privacyPolicyLink
    const result = i18n.t('gdprText', { companyName: 'TestCo' });
    expect(result).toContain('TestCo');
    expect(result).toContain('{{privacyPolicyLink}}');
  });
});

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

describe('Locale switching', () => {
  it('should switch locale and return translated strings', () => {
    const i18n = createNewsletterI18n('es');
    expect(i18n.t('submitButton')).toBe('Suscribirse');

    i18n.setLocale('en');
    expect(i18n.t('submitButton')).toBe('Subscribe');

    i18n.setLocale('pt');
    expect(i18n.t('submitButton')).toBe('Subscrever');
  });

  it('should fall back to default locale for missing keys', () => {
    const i18n = createNewsletterI18n('en');
    // Cast to test a key that might be missing
    const result = i18n.t('nonExistentKey' as keyof NewsletterLabels);
    // Should return the key itself as fallback
    expect(result).toBe('nonExistentKey');
  });

  it('should warn but not throw for invalid locale', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i18n = createNewsletterI18n('es');

    i18n.setLocale('invalid_locale');

    expect(warnSpy).toHaveBeenCalled();
    // Locale should remain unchanged
    expect(i18n.getLocale()).toBe('es');

    warnSpy.mockRestore();
  });
});
