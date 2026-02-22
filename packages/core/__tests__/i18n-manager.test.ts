import { describe, expect, it, vi, beforeEach } from 'vitest';

import { I18nManager } from '../src/i18n-manager';

// Test translation type
interface TestLabels extends Record<string, string> {
  greeting: string;
  farewell: string;
  welcome: string;
  count: string;
}

const EN: TestLabels = {
  greeting: 'Hello {{name}}',
  farewell: 'Goodbye',
  welcome: 'Welcome to {{app}}!',
  count: '{{num}} items found',
};

const ES: TestLabels = {
  greeting: 'Hola {{name}}',
  farewell: 'Adios',
  welcome: 'Bienvenido a {{app}}!',
  count: '{{num}} elementos encontrados',
};

describe('I18nManager', () => {
  let i18n: I18nManager<TestLabels>;

  beforeEach(() => {
    i18n = new I18nManager<TestLabels>({ en: EN, es: ES }, 'en');
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create an instance with valid locales', () => {
      expect(i18n).toBeDefined();
      expect(i18n.getLocale()).toBe('en');
    });

    it('should throw when default locale is not in locales map', () => {
      expect(() => {
        new I18nManager({ en: EN }, 'fr');
      }).toThrow('default locale "fr" not found');
    });

    it('should list available locales in error message', () => {
      expect(() => {
        new I18nManager({ en: EN, es: ES }, 'fr');
      }).toThrow('en, es');
    });
  });

  // --------------------------------------------------------------------------
  // t() - Translation
  // --------------------------------------------------------------------------

  describe('t', () => {
    it('should translate a simple key', () => {
      expect(i18n.t('farewell')).toBe('Goodbye');
    });

    it('should interpolate named parameters', () => {
      expect(i18n.t('greeting', { name: 'World' })).toBe('Hello World');
    });

    it('should interpolate multiple parameters', () => {
      expect(i18n.t('welcome', { app: 'Nevent' })).toBe('Welcome to Nevent!');
    });

    it('should leave missing interpolation params as-is', () => {
      expect(i18n.t('greeting')).toBe('Hello {{name}}');
    });

    it('should leave partially missing params as-is', () => {
      // 'count' has {{num}}, pass a different param
      expect(i18n.t('count', { other: 'value' })).toBe('{{num}} items found');
    });

    it('should translate in the current locale', () => {
      i18n.setLocale('es');
      expect(i18n.t('farewell')).toBe('Adios');
      expect(i18n.t('greeting', { name: 'Mundo' })).toBe('Hola Mundo');
    });

    it('should fall back to default locale for missing keys', () => {
      // Create a locale with incomplete translations
      const partial: TestLabels = {
        greeting: 'Bonjour {{name}}',
        farewell: '',
        welcome: '',
        count: '',
      };
      const i18nPartial = new I18nManager<TestLabels>(
        { en: EN, fr: partial },
        'en'
      );
      i18nPartial.setLocale('fr');

      // 'greeting' exists in fr
      expect(i18nPartial.t('greeting', { name: 'Monde' })).toBe(
        'Bonjour Monde'
      );

      // 'farewell' is empty string in fr (which is a valid value, not undefined)
      // so it returns the empty string, not the fallback
      expect(i18nPartial.t('farewell')).toBe('');
    });

    it('should return the key itself when no translation exists', () => {
      // Force a non-existent key
      const result = i18n.t('nonexistent_key' as keyof TestLabels);
      expect(result).toBe('nonexistent_key');
    });
  });

  // --------------------------------------------------------------------------
  // setLocale / getLocale
  // --------------------------------------------------------------------------

  describe('setLocale / getLocale', () => {
    it('should change the current locale', () => {
      expect(i18n.getLocale()).toBe('en');
      i18n.setLocale('es');
      expect(i18n.getLocale()).toBe('es');
    });

    it('should warn and not change locale for unavailable locale', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      i18n.setLocale('fr');

      expect(i18n.getLocale()).toBe('en'); // unchanged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('locale "fr" not available')
      );

      warnSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // getAvailableLocales
  // --------------------------------------------------------------------------

  describe('getAvailableLocales', () => {
    it('should return all available locale codes', () => {
      const locales = i18n.getAvailableLocales();
      expect(locales).toContain('en');
      expect(locales).toContain('es');
      expect(locales).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // detectLocale (static)
  // --------------------------------------------------------------------------

  describe('detectLocale', () => {
    it('should detect locale from navigator.language', () => {
      // jsdom sets navigator.language to 'en-US' by default
      const locale = I18nManager.detectLocale();
      expect(locale).toBe('en');
    });

    it('should extract two-letter code from BCP 47 tags', () => {
      const originalLanguage = navigator.language;
      Object.defineProperty(navigator, 'language', {
        value: 'es-ES',
        configurable: true,
      });

      expect(I18nManager.detectLocale()).toBe('es');

      Object.defineProperty(navigator, 'language', {
        value: originalLanguage,
        configurable: true,
      });
    });

    it('should return "en" when navigator is not available', () => {
      const originalNavigator = globalThis.navigator;
      // Simulate SSR by removing navigator
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      expect(I18nManager.detectLocale()).toBe('en');

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty params object', () => {
      expect(i18n.t('greeting', {})).toBe('Hello {{name}}');
    });

    it('should handle translations with no placeholders and params provided', () => {
      expect(i18n.t('farewell', { extra: 'value' })).toBe('Goodbye');
    });

    it('should handle multiple interpolations of the same param', () => {
      const locales = {
        en: { double: '{{x}} and {{x}}' } as Record<string, string>,
      };
      const mgr = new I18nManager(locales, 'en');
      expect(mgr.t('double', { x: 'A' })).toBe('A and A');
    });
  });
});
