import { describe, it, expect } from 'vitest';
import { ConfigManager } from '../config-manager';
import type { ChatbotConfig, ServerChatbotConfig } from '../../types';

/**
 * Minimal valid configuration that satisfies all required fields.
 * Used as a base in most tests and extended with overrides as needed.
 */
function createMinimalConfig(
  overrides: Partial<ChatbotConfig> = {}
): ChatbotConfig {
  return {
    chatbotId: 'bot-123',
    tenantId: 'tenant-456',
    ...overrides,
  };
}

/**
 * Factory for a valid ServerChatbotConfig, used in mergeServerConfig tests.
 */
function createServerConfig(
  overrides: Partial<ServerChatbotConfig> = {}
): ServerChatbotConfig {
  return {
    chatbotId: 'bot-123',
    tenantId: 'tenant-456',
    name: 'Test Bot',
    welcomeMessage: 'Hola desde el servidor',
    placeholder: 'Escribe aqui...',
    theme: {
      primaryColor: '#ff0000',
      mode: 'dark',
    },
    features: {
      quickReplies: true,
      richContent: false,
      persistence: true,
      typingIndicator: true,
      fileAttachments: false,
      reactions: false,
      eventSuggestions: false,
      streaming: false,
      showBranding: true,
    },
    rateLimit: {
      messagesPerMinute: 10,
      conversationsPerHour: 3,
      minMessageInterval: 2000,
      maxMessageLength: 300,
    },
    token: 'server-token-abc',
    ...overrides,
  };
}

describe('ConfigManager', () => {
  // ==========================================================================
  // Constructor & defaults
  // ==========================================================================

  describe('constructor', () => {
    it('should create instance with minimal config (chatbotId + tenantId)', () => {
      const manager = new ConfigManager(createMinimalConfig());
      const config = manager.getConfig();

      expect(config.chatbotId).toBe('bot-123');
      expect(config.tenantId).toBe('tenant-456');
    });

    it('should apply defaults for all optional fields', () => {
      const manager = new ConfigManager(createMinimalConfig());
      const config = manager.getConfig();

      expect(config.apiUrl).toBe('https://api.nevent.es');
      expect(config.containerId).toBeNull();
      expect(config.position).toBe('bottom-right');
      expect(config.theme).toBe('light');
      expect(config.locale).toBe('es');
      expect(config.analytics).toBe(true);
      expect(config.analyticsUrl).toBe('https://events.neventapis.com');
      expect(config.debug).toBe(false);
      expect(config.welcomeMessage).toBe('');
      expect(config.placeholder).toBe('');
      expect(config.autoOpen).toBe(false);
      expect(config.autoOpenDelay).toBe(3000);
      expect(config.persistConversation).toBe(true);
      expect(config.conversationTTL).toBe(24);
      expect(config.showBranding).toBe(true);
      expect(typeof config.onOpen).toBe('function');
      expect(typeof config.onClose).toBe('function');
      expect(typeof config.onMessage).toBe('function');
      expect(typeof config.onError).toBe('function');
      expect(typeof config.onReady).toBe('function');
    });

    it('should allow user overrides for optional fields', () => {
      const manager = new ConfigManager(
        createMinimalConfig({
          apiUrl: 'https://custom-api.nevent.es',
          theme: 'dark',
          locale: 'en',
          debug: true,
          autoOpen: true,
          autoOpenDelay: 5000,
        })
      );
      const config = manager.getConfig();

      expect(config.apiUrl).toBe('https://custom-api.nevent.es');
      expect(config.theme).toBe('dark');
      expect(config.locale).toBe('en');
      expect(config.debug).toBe(true);
      expect(config.autoOpen).toBe(true);
      expect(config.autoOpenDelay).toBe(5000);
    });

    it('should deep merge user styles with default empty styles', () => {
      const manager = new ConfigManager(
        createMinimalConfig({
          styles: {
            bubble: { backgroundColor: '#6366f1' },
          },
        })
      );
      const config = manager.getConfig();

      expect(config.styles.bubble?.backgroundColor).toBe('#6366f1');
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('validate()', () => {
    it('should throw error if chatbotId is empty', () => {
      expect(
        () => new ConfigManager({ chatbotId: '', tenantId: 'tenant-456' })
      ).toThrow('chatbotId is required');
    });

    it('should throw error if chatbotId is whitespace only', () => {
      expect(
        () => new ConfigManager({ chatbotId: '   ', tenantId: 'tenant-456' })
      ).toThrow('chatbotId is required');
    });

    it('should throw error if tenantId is empty', () => {
      expect(
        () => new ConfigManager({ chatbotId: 'bot-123', tenantId: '' })
      ).toThrow('tenantId is required');
    });

    it('should throw error if tenantId is whitespace only', () => {
      expect(
        () => new ConfigManager({ chatbotId: 'bot-123', tenantId: '   ' })
      ).toThrow('tenantId is required');
    });

    it('should throw error if apiUrl is invalid', () => {
      expect(
        () =>
          new ConfigManager(createMinimalConfig({ apiUrl: 'not-a-url' }))
      ).toThrow('apiUrl must be a valid http or https URL');
    });

    it('should throw error if locale is not supported', () => {
      expect(
        () =>
          new ConfigManager(
            createMinimalConfig({ locale: 'fr' as never })
          )
      ).toThrow('locale must be one of');
    });

    it('should throw error if theme is not supported', () => {
      expect(
        () =>
          new ConfigManager(
            createMinimalConfig({ theme: 'neon' as never })
          )
      ).toThrow('theme must be one of');
    });

    it('should throw error if autoOpenDelay is not positive', () => {
      expect(
        () =>
          new ConfigManager(createMinimalConfig({ autoOpenDelay: -1 }))
      ).toThrow('autoOpenDelay must be a positive number');
    });

    it('should throw error if styles.zIndex is not a positive integer', () => {
      expect(
        () =>
          new ConfigManager(
            createMinimalConfig({ styles: { zIndex: 0 } })
          )
      ).toThrow('styles.zIndex must be a positive integer');
    });

    it('should collect multiple validation errors in a single throw', () => {
      try {
        new ConfigManager({
          chatbotId: '',
          tenantId: '',
          apiUrl: 'bad-url',
          locale: 'xx' as never,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const err = error as Error & { details?: { errors: string[] } };
        expect(err.details?.errors.length).toBeGreaterThanOrEqual(3);
        expect(err.message).toContain('chatbotId');
        expect(err.message).toContain('tenantId');
        expect(err.message).toContain('apiUrl');
      }
    });

    it('should attach INVALID_CONFIG error code', () => {
      try {
        new ConfigManager({ chatbotId: '', tenantId: '' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as { code: string }).code).toBe('INVALID_CONFIG');
      }
    });

    it('should accept valid http and https URLs', () => {
      expect(
        () =>
          new ConfigManager(
            createMinimalConfig({ apiUrl: 'http://localhost:3000' })
          )
      ).not.toThrow();

      expect(
        () =>
          new ConfigManager(
            createMinimalConfig({ apiUrl: 'https://api.example.com' })
          )
      ).not.toThrow();
    });
  });

  // ==========================================================================
  // mergeServerConfig
  // ==========================================================================

  describe('mergeServerConfig()', () => {
    it('should apply server welcome message when user left default (empty)', () => {
      const manager = new ConfigManager(createMinimalConfig());
      manager.mergeServerConfig(createServerConfig());

      expect(manager.getConfig().welcomeMessage).toBe(
        'Hola desde el servidor'
      );
    });

    it('should preserve user welcome message over server value', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ welcomeMessage: 'User welcome' })
      );
      manager.mergeServerConfig(createServerConfig());

      expect(manager.getConfig().welcomeMessage).toBe('User welcome');
    });

    it('should apply server placeholder when user left default (empty)', () => {
      const manager = new ConfigManager(createMinimalConfig());
      manager.mergeServerConfig(createServerConfig());

      expect(manager.getConfig().placeholder).toBe('Escribe aqui...');
    });

    it('should preserve user placeholder over server value', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ placeholder: 'Type here...' })
      );
      manager.mergeServerConfig(createServerConfig());

      expect(manager.getConfig().placeholder).toBe('Type here...');
    });

    it('should apply server theme mode when user used default (light)', () => {
      const manager = new ConfigManager(createMinimalConfig());
      manager.mergeServerConfig(
        createServerConfig({ theme: { primaryColor: '#ff0000', mode: 'dark' } })
      );

      expect(manager.getConfig().theme).toBe('dark');
    });

    it('should preserve user theme when explicitly set (non-default)', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ theme: 'auto' })
      );
      manager.mergeServerConfig(
        createServerConfig({ theme: { primaryColor: '#ff0000', mode: 'dark' } })
      );

      expect(manager.getConfig().theme).toBe('auto');
    });

    it('should let user styles win over server styles', () => {
      const manager = new ConfigManager(
        createMinimalConfig({
          styles: { bubble: { backgroundColor: '#user-color' } },
        })
      );
      manager.mergeServerConfig(
        createServerConfig({
          styles: { bubble: { backgroundColor: '#server-color', size: 80 } },
        })
      );

      const merged = manager.getConfig().styles;
      expect(merged.bubble?.backgroundColor).toBe('#user-color');
      // Server-only property should still be present from deep merge
      expect(merged.bubble?.size).toBe(80);
    });

    it('should store server config accessible via getServerConfig()', () => {
      const manager = new ConfigManager(createMinimalConfig());
      const serverCfg = createServerConfig();
      manager.mergeServerConfig(serverCfg);

      expect(manager.getServerConfig()).not.toBeNull();
      expect(manager.getServerConfig()?.chatbotId).toBe('bot-123');
      expect(manager.getServerConfig()?.token).toBe('server-token-abc');
    });
  });

  // ==========================================================================
  // Typed getters
  // ==========================================================================

  describe('getters', () => {
    it('getConfig() returns Readonly config', () => {
      const manager = new ConfigManager(createMinimalConfig());
      const config = manager.getConfig();

      expect(config).toBeDefined();
      expect(config.chatbotId).toBe('bot-123');
      // Ensure it is a plain object (no mutation attempts tested at compile-time)
      expect(typeof config).toBe('object');
    });

    it('getApiUrl() returns correct API URL', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ apiUrl: 'https://custom.api.com' })
      );
      expect(manager.getApiUrl()).toBe('https://custom.api.com');
    });

    it('getApiUrl() returns default when not specified', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.getApiUrl()).toBe('https://api.nevent.es');
    });

    it('getTenantId() returns correct tenant ID', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.getTenantId()).toBe('tenant-456');
    });

    it('getChatbotId() returns correct chatbot ID', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.getChatbotId()).toBe('bot-123');
    });

    it('getLocale() returns correct locale', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ locale: 'en' })
      );
      expect(manager.getLocale()).toBe('en');
    });

    it('getLocale() returns default locale (es)', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.getLocale()).toBe('es');
    });

    it('getTheme() returns correct theme', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ theme: 'dark' })
      );
      expect(manager.getTheme()).toBe('dark');
    });

    it('isDebug() returns false by default', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.isDebug()).toBe(false);
    });

    it('isDebug() returns true when set', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ debug: true })
      );
      expect(manager.isDebug()).toBe(true);
    });

    it('isAnalyticsEnabled() returns true by default', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.isAnalyticsEnabled()).toBe(true);
    });

    it('isAnalyticsEnabled() returns false when disabled', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ analytics: false })
      );
      expect(manager.isAnalyticsEnabled()).toBe(false);
    });

    it('shouldPersist() returns true by default', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.shouldPersist()).toBe(true);
    });

    it('shouldPersist() returns false when disabled', () => {
      const manager = new ConfigManager(
        createMinimalConfig({ persistConversation: false })
      );
      expect(manager.shouldPersist()).toBe(false);
    });

    it('getServerConfig() returns null before mergeServerConfig()', () => {
      const manager = new ConfigManager(createMinimalConfig());
      expect(manager.getServerConfig()).toBeNull();
    });
  });
});
