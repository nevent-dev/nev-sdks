import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextCollector } from '../context-collector';

describe('ContextCollector', () => {
  let sessionStorageMock: Record<string, string>;
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock sessionStorage
    sessionStorageMock = {};
    Object.defineProperty(global, 'sessionStorage', {
      value: {
        getItem: vi.fn((key: string) => sessionStorageMock[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          sessionStorageMock[key] = value;
        }),
      },
      writable: true,
      configurable: true,
    });

    // Mock window.matchMedia
    matchMediaMock = vi.fn((query: string) => ({
      matches: query.includes('portrait'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaMock,
      writable: true,
      configurable: true,
    });

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', {
      value: 1920,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 1080,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      writable: true,
      configurable: true,
    });

    // Mock screen dimensions
    Object.defineProperty(screen, 'width', {
      value: 1920,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(screen, 'height', {
      value: 1080,
      writable: true,
      configurable: true,
    });

    // Mock document
    Object.defineProperty(document, 'referrer', {
      value: 'https://example.com',
      writable: true,
      configurable: true,
    });

    // Mock navigator.language
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      writable: true,
      configurable: true,
    });

    // Mock crypto.randomUUID
    Object.defineProperty(global.crypto, 'randomUUID', {
      value: vi.fn(() => 'test-uuid-123'),
      writable: true,
      configurable: true,
    });
  });

  describe('collect()', () => {
    it('should return object with device, screen, session, network, preferences', () => {
      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context).toHaveProperty('device');
      expect(context).toHaveProperty('screen');
      expect(context).toHaveProperty('session');
      expect(context).toHaveProperty('network');
      expect(context).toHaveProperty('preferences');
    });
  });

  describe('device context', () => {
    it('should parse Windows user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('Windows');
      expect(context.device.osVersion).toBe('10.0');
    });

    it('should parse macOS user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('macOS');
      expect(context.device.osVersion).toBe('10.15.7');
    });

    it('should parse Android user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('Android');
      expect(context.device.osVersion).toBe('11');
    });

    it('should parse iOS user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('iOS');
      expect(context.device.osVersion).toBe('14.6');
    });

    it('should parse Linux user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('Linux');
      expect(context.device.osVersion).toBe('unknown');
    });

    it('should handle unknown user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Unknown Browser',
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.device.os).toBe('unknown');
      expect(context.device.osVersion).toBe('unknown');
    });
  });

  describe('screen context', () => {
    it('should return window dimensions and devicePixelRatio', () => {
      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.screen).toEqual({
        width: 1920,
        height: 1080,
        screenWidth: 1920,
        screenHeight: 1080,
        pixelRatio: 2,
        orientation: 'portrait',
      });
    });

    it('should detect landscape orientation', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: !query.includes('portrait'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.screen.orientation).toBe('landscape');
    });

    it('should default pixelRatio to 1 when undefined', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.screen.pixelRatio).toBe(1);
    });
  });

  describe('session context', () => {
    it('should create session ID in sessionStorage on first call', () => {
      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.session.sessionId).toBe('test-uuid-123');
      expect(sessionStorageMock['nev_session_id']).toBe('test-uuid-123');
    });

    it('should reuse existing session ID on subsequent calls', () => {
      sessionStorageMock['nev_session_id'] = 'existing-session-id';

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.session.sessionId).toBe('existing-session-id');
    });

    it('should include timezone, referrer, url', () => {
      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.session).toMatchObject({
        timezone: expect.any(String),
        referrer: 'https://example.com',
        url: expect.stringContaining('http'),
      });
    });

    it('should calculate duration that increases over time', async () => {
      const startTime = new Date().toISOString();
      sessionStorageMock['nev_session_start'] = startTime;

      const collector = new ContextCollector();

      const context1 = collector.collect();
      const duration1 = context1.session.duration;

      // Wait at least 1 second to ensure duration increases
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const context2 = collector.collect();
      const duration2 = context2.session.duration;

      expect(duration2).toBeGreaterThanOrEqual(duration1 + 1);
    });

    it('should handle timezone detection failure gracefully', () => {
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
        throw new Error('Timezone not available');
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.session.timezone).toBe('unknown');
    });
  });

  describe('network context', () => {
    it('should read from navigator.connection when available', () => {
      Object.defineProperty(navigator, 'connection', {
        value: {
          type: 'wifi',
          effectiveType: '4g',
          downlink: 10,
        },
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.network).toEqual({
        type: 'wifi',
        effectiveType: '4g',
        downlink: 10,
      });
    });

    it('should return empty object when navigator.connection is not available', () => {
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.network).toEqual({});
    });

    it('should handle navigator.connection access error', () => {
      Object.defineProperty(navigator, 'connection', {
        get: () => {
          throw new Error('Not available');
        },
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.network).toEqual({});
    });
  });

  describe('preferences', () => {
    it('should return language and color scheme', () => {
      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.preferences).toEqual({
        language: 'en-US',
        colorScheme: 'light',
      });
    });

    it('should detect dark color scheme', () => {
      matchMediaMock.mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.preferences.colorScheme).toBe('dark');
    });

    it('should default language to unknown when not available', () => {
      Object.defineProperty(navigator, 'language', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      expect(context.preferences.language).toBe('unknown');
    });
  });

  describe('UUID generation', () => {
    it('should use crypto.randomUUID when available', () => {
      const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID');

      const collector = new ContextCollector();
      collector.collect();

      expect(randomUUIDSpy).toHaveBeenCalled();
    });

    it('should fallback to Math.random pattern when crypto.randomUUID fails', () => {
      Object.defineProperty(global.crypto, 'randomUUID', {
        value: () => {
          throw new Error('Not available');
        },
        writable: true,
        configurable: true,
      });

      const collector = new ContextCollector();
      const context = collector.collect();

      // Should generate UUID with Math.random fallback
      expect(context.session.sessionId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/
      );
    });
  });
});
