import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsClient } from '../analytics-client';

// Mock ContextCollector
vi.mock('../context-collector', () => ({
  ContextCollector: vi.fn().mockImplementation(() => ({
    collect: vi.fn().mockReturnValue({
      device: { os: 'macOS', osVersion: '10.15' },
      screen: { width: 1920, height: 1080 },
      session: { sessionId: 'test-session' },
      network: { type: 'wifi' },
      preferences: { language: 'en', colorScheme: 'light' },
    }),
  })),
}));

describe('AnalyticsClient', () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleDebugMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.sendBeacon
    sendBeaconMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon: sendBeaconMock,
    });

    // Mock global fetch
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Mock console.debug
    consoleDebugMock = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      expect(client).toBeInstanceOf(AnalyticsClient);
    });

    it('should default enabled to true when not specified', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      client.track('test_event');

      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should respect enabled: false config', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        enabled: false,
      });

      client.track('test_event');

      expect(sendBeaconMock).not.toHaveBeenCalled();
    });

    it('should default debug to false', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      client.track('test_event');

      expect(consoleDebugMock).not.toHaveBeenCalled();
    });
  });

  describe('track()', () => {
    it('should call sendBeacon with correct endpoint and blob when enabled', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        enabled: true,
      });

      client.track('widget_loaded', { value: 1 });

      expect(sendBeaconMock).toHaveBeenCalledWith(
        'https://api.example.com/events',
        expect.any(Blob)
      );
    });

    it('should include event_name, event_params, context, timestamp, user_id in payload', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      client.track('test_event', { interaction: true });

      expect(sendBeaconMock).toHaveBeenCalled();
      const blob = sendBeaconMock.mock.calls[0]?.[1];

      if (blob) {
        // Read blob content
        const reader = new FileReader();
        reader.onload = () => {
          const payload = JSON.parse(reader.result as string);
          expect(payload).toMatchObject({
            event_name: 'test_event',
            event_params: { interaction: true },
            context: expect.objectContaining({
              device: expect.any(Object),
              screen: expect.any(Object),
              session: expect.any(Object),
            }),
            timestamp: expect.any(String),
            user_id: null,
          });
        };
        reader.readAsText(blob);
      }
    });

    it('should not call sendBeacon when disabled', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        enabled: false,
      });

      client.track('test_event');

      expect(sendBeaconMock).not.toHaveBeenCalled();
    });

    it('should fallback to fetch when sendBeacon returns false', () => {
      sendBeaconMock.mockReturnValue(false);

      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      client.track('test_event');

      expect(sendBeaconMock).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/events',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      );
    });

    it('should suppress errors when sendBeacon throws', () => {
      sendBeaconMock.mockImplementation(() => {
        throw new Error('sendBeacon failed');
      });

      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      expect(() => {
        client.track('test_event');
      }).not.toThrow();
    });

    it('should suppress errors when fetch rejects', () => {
      sendBeaconMock.mockReturnValue(false);
      fetchMock.mockRejectedValue(new Error('Network error'));

      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      expect(() => {
        client.track('test_event');
      }).not.toThrow();
    });

    it('should log to console.debug when debug is enabled', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        debug: true,
      });

      client.track('test_event', { value: 123 });

      expect(consoleDebugMock).toHaveBeenCalledWith(
        '[NeventAnalytics]',
        'test_event',
        expect.objectContaining({
          event_name: 'test_event',
          event_params: { value: 123 },
        })
      );
    });
  });

  describe('setUserId()', () => {
    it('should set userId that appears in subsequent track calls', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
      });

      client.setUserId('user-123');
      client.track('test_event');

      expect(sendBeaconMock).toHaveBeenCalled();
      const blob = sendBeaconMock.mock.calls[0]?.[1];

      if (blob) {
        const reader = new FileReader();
        reader.onload = () => {
          const payload = JSON.parse(reader.result as string);
          expect(payload.user_id).toBe('user-123');
        };
        reader.readAsText(blob);
      }
    });
  });

  describe('setEnabled()', () => {
    it('should enable tracking when set to true', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        enabled: false,
      });

      client.setEnabled(true);
      client.track('test_event');

      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should disable tracking when set to false', () => {
      const client = new AnalyticsClient({
        endpoint: 'https://api.example.com/events',
        enabled: true,
      });

      client.setEnabled(false);
      client.track('test_event');

      expect(sendBeaconMock).not.toHaveBeenCalled();
    });
  });
});
