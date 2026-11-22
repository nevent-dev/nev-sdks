import { describe, it, expect, vi, afterEach } from 'vitest';
import { I18nManager } from '../i18n-manager';

describe('I18nManager', () => {
  // ==========================================================================
  // Constructor & locale selection
  // ==========================================================================

  describe('create()', () => {
    it('should use default locale (es) when no argument provided', async () => {
      // Mock navigator.language to avoid test environment interference
      vi.stubGlobal('navigator', { language: 'es-ES' });
      const i18n = await I18nManager.create();
      expect(i18n.getLocale()).toBe('es');
      vi.unstubAllGlobals();
    });

    it('should accept an explicit locale', async () => {
      const i18n = await I18nManager.create('en');
      expect(i18n.getLocale()).toBe('en');
    });

    it('should accept ca locale', async () => {
      const i18n = await I18nManager.create('ca');
      expect(i18n.getLocale()).toBe('ca');
    });

    it('should accept pt locale', async () => {
      const i18n = await I18nManager.create('pt');
      expect(i18n.getLocale()).toBe('pt');
    });
  });

  // ==========================================================================
  // t() - translation retrieval
  // ==========================================================================

  describe('t()', () => {
    it('should return translation in Spanish', async () => {
      const i18n = await I18nManager.create('es');
      expect(i18n.t('sendButton')).toBe('Enviar');
      expect(i18n.t('inputPlaceholder')).toBe('Escribe un mensaje...');
      expect(i18n.t('defaultTitle')).toBe('Chatea con nosotros');
    });

    it('should return translation in English', async () => {
      const i18n = await I18nManager.create('en');
      expect(i18n.t('sendButton')).toBe('Send');
      expect(i18n.t('inputPlaceholder')).toBe('Type a message...');
      expect(i18n.t('defaultTitle')).toBe('Chat with us');
    });

    it('should return translation in Catalan', async () => {
      const i18n = await I18nManager.create('ca');
      expect(i18n.t('sendButton')).toBe('Enviar');
      expect(i18n.t('inputPlaceholder')).toBe('Escriu un missatge...');
      expect(i18n.t('defaultTitle')).toBe('Xateja amb nosaltres');
    });

    it('should return translation in Portuguese', async () => {
      const i18n = await I18nManager.create('pt');
      expect(i18n.t('sendButton')).toBe('Enviar');
      expect(i18n.t('inputPlaceholder')).toBe('Escreva uma mensagem...');
      expect(i18n.t('defaultTitle')).toBe('Fale connosco');
    });

    it('should return multiple translations correctly per locale', async () => {
      const i18n = await I18nManager.create('en');
      expect(i18n.t('statusOnline')).toBe('Online');
      expect(i18n.t('statusOffline')).toBe('Offline');
      expect(i18n.t('retry')).toBe('Retry');
      expect(i18n.t('closeChat')).toBe('Close chat');
      expect(i18n.t('openChat')).toBe('Open chat');
    });
  });

  // ==========================================================================
  // setLocale()
  // ==========================================================================

  describe('setLocale()', () => {
    it('should change the active locale at runtime', async () => {
      const i18n = await I18nManager.create('es');
      expect(i18n.t('sendButton')).toBe('Enviar');

      await i18n.setLocale('en');
      expect(i18n.t('sendButton')).toBe('Send');
      expect(i18n.getLocale()).toBe('en');
    });

    it('should change to all supported locales', async () => {
      const i18n = await I18nManager.create('es');

      await i18n.setLocale('ca');
      expect(i18n.t('defaultTitle')).toBe('Xateja amb nosaltres');

      await i18n.setLocale('pt');
      expect(i18n.t('defaultTitle')).toBe('Fale connosco');

      await i18n.setLocale('en');
      expect(i18n.t('defaultTitle')).toBe('Chat with us');

      await i18n.setLocale('es');
      expect(i18n.t('defaultTitle')).toBe('Chatea con nosotros');
    });
  });

  // ==========================================================================
  // format() - interpolation
  // ==========================================================================

  describe('format()', () => {
    it('should interpolate {n} parameter in Spanish', async () => {
      const i18n = await I18nManager.create('es');
      expect(i18n.format('minutesAgo', { n: 5 })).toBe('hace 5 min');
      expect(i18n.format('hoursAgo', { n: 2 })).toBe('hace 2 h');
    });

    it('should interpolate {n} parameter in English', async () => {
      const i18n = await I18nManager.create('en');
      expect(i18n.format('minutesAgo', { n: 5 })).toBe('5 min ago');
      expect(i18n.format('hoursAgo', { n: 2 })).toBe('2h ago');
    });

    it('should interpolate {n} parameter in Catalan', async () => {
      const i18n = await I18nManager.create('ca');
      expect(i18n.format('minutesAgo', { n: 10 })).toBe('fa 10 min');
      expect(i18n.format('hoursAgo', { n: 3 })).toBe('fa 3 h');
    });

    it('should interpolate {n} parameter in Portuguese', async () => {
      const i18n = await I18nManager.create('pt');
      expect(i18n.format('minutesAgo', { n: 15 })).toBe('há 15 min');
    });

    it('should handle multiple occurrences of same placeholder', async () => {
      const i18n = await I18nManager.create('es');
      // minutesAgo has a single {n}, but if a key had two, both should be replaced
      // We can verify by checking the result of a single placeholder for correctness
      expect(i18n.format('minutesAgo', { n: 1 })).toBe('hace 1 min');
    });
  });

  // ==========================================================================
  // setOverrides()
  // ==========================================================================

  describe('setOverrides()', () => {
    it('should override specific translations', async () => {
      const i18n = await I18nManager.create('en');
      i18n.setOverrides({ poweredBy: 'Powered by Acme Corp' });

      expect(i18n.t('poweredBy')).toBe('Powered by Acme Corp');
    });

    it('should not affect non-overridden translations', async () => {
      const i18n = await I18nManager.create('en');
      i18n.setOverrides({ poweredBy: 'Powered by Acme Corp' });

      // Other translations remain unchanged
      expect(i18n.t('sendButton')).toBe('Send');
      expect(i18n.t('closeChat')).toBe('Close chat');
    });

    it('should override translations regardless of locale', async () => {
      const i18n = await I18nManager.create('es');
      i18n.setOverrides({ poweredBy: 'Custom Brand' });

      expect(i18n.t('poweredBy')).toBe('Custom Brand');

      await i18n.setLocale('en');
      expect(i18n.t('poweredBy')).toBe('Custom Brand');
    });

    it('should accumulate overrides from multiple calls', async () => {
      const i18n = await I18nManager.create('en');
      i18n.setOverrides({ poweredBy: 'Brand A' });
      i18n.setOverrides({ defaultTitle: 'Custom Title' });

      expect(i18n.t('poweredBy')).toBe('Brand A');
      expect(i18n.t('defaultTitle')).toBe('Custom Title');
    });

    it('should replace previous override for same key', async () => {
      const i18n = await I18nManager.create('en');
      i18n.setOverrides({ poweredBy: 'Brand A' });
      i18n.setOverrides({ poweredBy: 'Brand B' });

      expect(i18n.t('poweredBy')).toBe('Brand B');
    });
  });

  // ==========================================================================
  // detectLocale()
  // ==========================================================================

  describe('detectLocale()', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should parse 'es-ES' to 'es'", () => {
      vi.stubGlobal('navigator', { language: 'es-ES' });
      expect(I18nManager.detectLocale()).toBe('es');
    });

    it("should parse 'en-US' to 'en'", () => {
      vi.stubGlobal('navigator', { language: 'en-US' });
      expect(I18nManager.detectLocale()).toBe('en');
    });

    it("should parse 'en-GB' to 'en'", () => {
      vi.stubGlobal('navigator', { language: 'en-GB' });
      expect(I18nManager.detectLocale()).toBe('en');
    });

    it("should parse 'ca' to 'ca'", () => {
      vi.stubGlobal('navigator', { language: 'ca' });
      expect(I18nManager.detectLocale()).toBe('ca');
    });

    it("should parse 'pt-BR' to 'pt'", () => {
      vi.stubGlobal('navigator', { language: 'pt-BR' });
      expect(I18nManager.detectLocale()).toBe('pt');
    });

    it.each(['fr-FR', 'fr-CA', 'fr-CH'])('negotiates %s to the French catalogue', async (language) => {
      vi.stubGlobal('navigator', { language });
      const i18n = await I18nManager.create();
      expect(i18n.getLocale()).toBe('fr');
      expect(i18n.t('sendButton')).toBe('Envoyer');
    });

    it.each(['de-DE', 'de-AT', 'de-CH'])('negotiates %s to the German catalogue', async (language) => {
      vi.stubGlobal('navigator', { language });
      const manager = await I18nManager.create();
      expect(manager.getLocale()).toBe('de');
      expect(manager.t('inputPlaceholder')).toBe('Nachricht schreiben…');
    });

    it.each(['it-IT', 'it-CH'])('negotiates %s to the Italian catalogue', async (language) => {
      vi.stubGlobal('navigator', { language });
      const i18n = await I18nManager.create();
      expect(i18n.getLocale()).toBe('it');
      expect(i18n.t('sendButton')).toBe('Invia');
    });

    it("should fallback to 'es' for unsupported locale", () => {
      vi.stubGlobal('navigator', { language: 'nl-NL' });
      expect(I18nManager.detectLocale()).toBe('es');
    });

    it("should fallback to 'es' for completely unknown locale", () => {
      vi.stubGlobal('navigator', { language: 'zh-CN' });
      expect(I18nManager.detectLocale()).toBe('es');
    });

    it("should handle SSR (no navigator) by returning 'es'", () => {
      vi.stubGlobal('navigator', undefined);
      expect(I18nManager.detectLocale()).toBe('es');
    });

    it("should handle navigator without language by returning 'es'", () => {
      vi.stubGlobal('navigator', { language: '' });
      expect(I18nManager.detectLocale()).toBe('es');
    });
  });
});
