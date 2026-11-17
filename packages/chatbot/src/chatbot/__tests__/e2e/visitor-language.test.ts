/**
 * @vitest-environment jsdom
 *
 * nevent-work#40: the chatbot in the visitor's language when the embed sets no locale (FAN-049), its own greeting in
 * that language when neither the web nor the chatbot has one (COMMS-012), the singular countdown (FAN-050) and the
 * Spanish branding (FAN-074).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createInitializedWidget, flushPromises } from './helpers';
import { I18nManager } from '../../i18n-manager';
import { ConfigManager } from '../../config-manager';

function browser(language: string) {
  Object.defineProperty(navigator, 'language', { value: language, configurable: true });
  Object.defineProperty(navigator, 'languages', { value: [language], configurable: true });
}

describe('Chatbot in the visitor\'s language (nevent-work#40)', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    browser('es-ES');
  });

  it('an English browser with no locale in the embed gets the English interface (FAN-049)', async () => {
    browser('en-GB');
    const { widget, cleanup: c, mockApi } = await createInitializedWidget({ locale: undefined });
    cleanup = c;
    expect(new ConfigManager({ chatbotId: 'c', tenantId: 't' }).getConfig().locale).toBeUndefined();
    expect((widget as unknown as { i18n: I18nManager }).i18n.getLocale()).toBe('en');
    expect(mockApi).toBeDefined();
  });

  it('an explicit locale of the embed still wins over the browser', async () => {
    browser('en-GB');
    const { widget, cleanup: c } = await createInitializedWidget({ locale: 'es' });
    cleanup = c;
    expect((widget as unknown as { i18n: I18nManager }).i18n.getLocale()).toBe('es');
  });

  it('with no greeting from the web or the server, the widget greets in its own language (COMMS-012)', async () => {
    browser('en-GB');
    const { shadowRoot, cleanup: c } = await createInitializedWidget(
      { locale: undefined },
      { serverConfig: { welcomeMessage: null as unknown as string } }
    );
    cleanup = c;
    await flushPromises(10);
    const english = new I18nManager('en').t('defaultWelcomeMessage');
    expect(shadowRoot.textContent ?? '').toContain(english);
  });

  it('one second left is «1 segundo» / «1 second»; more is plural (FAN-050)', () => {
    expect(new I18nManager('es').t('rateLimitCountdownOne')).toBe('Demasiados mensajes. Espera 1 segundo.');
    expect(new I18nManager('en').t('rateLimitCountdownOne')).toBe('Too many messages. Please wait 1 second.');
    expect(new I18nManager('es').format('rateLimitCountdown', { seconds: 3 })).toBe('Demasiados mensajes. Espera 3 segundos.');
  });

  it('the branding is in Spanish in the Spanish interface (FAN-074)', () => {
    expect(new I18nManager('es').t('poweredBy')).toBe('Con la tecnología de Nevent');
    expect(new I18nManager('en').t('poweredBy')).toBe('Powered by Nevent');
  });
});
