import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { SentryReporter } from '../src/sentry-reporter';
import type { SentryReporterConfig, SentryEvent } from '../src/sentry-reporter';

// ============================================================================
// Test Helpers
// ============================================================================

const VALID_DSN =
  'https://abc123@o4504651545640960.ingest.sentry.io/4504788728872960';

const TUNNEL_URL = 'https://api.nevent.es/diagnostics';

function createReporter(
  overrides?: Partial<SentryReporterConfig>
): SentryReporter {
  return new SentryReporter({
    dsn: VALID_DSN,
    ...overrides,
  });
}

/**
 * Parses a Sentry envelope string into its three parts:
 * header, item header, and event payload.
 */
function parseEnvelope(envelope: string): {
  header: Record<string, unknown>;
  itemHeader: Record<string, unknown>;
  event: SentryEvent;
} {
  const [headerLine, itemHeaderLine, payloadLine] = envelope.split('\n');
  return {
    header: JSON.parse(headerLine),
    itemHeader: JSON.parse(itemHeaderLine),
    event: JSON.parse(payloadLine) as SentryEvent,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SentryReporter', () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock sendBeacon
    sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    });

    // Mock fetch
    fetchSpy = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetchSpy);

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: () => 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee',
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
        return arr;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // --------------------------------------------------------------------------
  // Construction & DSN Parsing
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should construct with a valid DSN', () => {
      const reporter = createReporter();
      expect(reporter).toBeInstanceOf(SentryReporter);
    });

    it('should disable reporting with an invalid DSN', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const reporter = new SentryReporter({ dsn: 'not-a-valid-dsn' });
      const eventId = reporter.captureMessage('test');

      expect(eventId).toBe('');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid DSN')
      );

      consoleSpy.mockRestore();
    });

    it('should disable reporting when enabled is false', () => {
      const reporter = createReporter({ enabled: false });
      const eventId = reporter.captureMessage('test');
      expect(eventId).toBe('');
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // DSN Parsing (static)
  // --------------------------------------------------------------------------

  describe('parseDSN', () => {
    it('should parse a valid DSN', () => {
      const parsed = SentryReporter.parseDSN(VALID_DSN);
      expect(parsed).not.toBeNull();
      expect(parsed!.publicKey).toBe('abc123');
      expect(parsed!.host).toBe('o4504651545640960.ingest.sentry.io');
      expect(parsed!.projectId).toBe('4504788728872960');
      expect(parsed!.ingestUrl).toContain('/api/4504788728872960/envelope/');
      expect(parsed!.ingestUrl).toContain('sentry_key=abc123');
      expect(parsed!.ingestUrl).toContain('sentry_version=7');
    });

    it('should return null for a DSN without a public key', () => {
      const parsed = SentryReporter.parseDSN(
        'https://example.ingest.sentry.io/123'
      );
      expect(parsed).toBeNull();
    });

    it('should return null for a DSN without a project ID', () => {
      const parsed = SentryReporter.parseDSN(
        'https://key@example.ingest.sentry.io/'
      );
      expect(parsed).toBeNull();
    });

    it('should return null for a completely invalid string', () => {
      const parsed = SentryReporter.parseDSN('not a url at all');
      expect(parsed).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // captureException
  // --------------------------------------------------------------------------

  describe('captureException', () => {
    it('should build a correct envelope for an Error', () => {
      const reporter = createReporter({ environment: 'test' });
      const error = new Error('Something broke');

      const eventId = reporter.captureException(error);

      expect(eventId).toBeTruthy();
      expect(eventId.length).toBe(32); // UUID without dashes
      expect(sendBeaconSpy).toHaveBeenCalledOnce();

      // Parse the envelope sent to sendBeacon
      const blob: Blob = sendBeaconSpy.mock.calls[0][1];
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should include exception type and value in the event', () => {
      // Use fetch fallback by disabling sendBeacon
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.captureException(new TypeError('type error'));

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.exception?.values?.[0]?.type).toBe('TypeError');
      expect(event.exception?.values?.[0]?.value).toBe('type error');
      expect(event.platform).toBe('javascript');
      expect(event.level).toBe('error');
    });

    it('should handle non-Error values gracefully', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.captureException('string error');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('string error');
    });

    it('should include extra data in the event', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.captureException(new Error('test'), {
        userId: '123',
        action: 'submit',
      });

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.extra).toEqual({ userId: '123', action: 'submit' });
    });

    it('should return empty string when disabled', () => {
      const reporter = createReporter({ enabled: false });
      const eventId = reporter.captureException(new Error('test'));
      expect(eventId).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // captureMessage
  // --------------------------------------------------------------------------

  describe('captureMessage', () => {
    it('should build a correct message event', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter({ environment: 'production' });
      const eventId = reporter.captureMessage('User reached limit', 'warning');

      expect(eventId).toBeTruthy();
      expect(fetchSpy).toHaveBeenCalledOnce();

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.message?.formatted).toBe('User reached limit');
      expect(event.level).toBe('warning');
      expect(event.environment).toBe('production');
    });

    it('should default to info level', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.captureMessage('informational');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.level).toBe('info');
    });
  });

  // --------------------------------------------------------------------------
  // Delivery: sendBeacon vs fetch
  // --------------------------------------------------------------------------

  describe('delivery', () => {
    it('should prefer sendBeacon when available', () => {
      const reporter = createReporter();
      reporter.captureMessage('test');

      expect(sendBeaconSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should fall back to fetch when sendBeacon returns false', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.captureMessage('test');

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][1].keepalive).toBe(true);
    });

    it('should fall back to fetch when sendBeacon throws', () => {
      sendBeaconSpy.mockImplementation(() => {
        throw new Error('sendBeacon failed');
      });

      const reporter = createReporter();
      reporter.captureMessage('test');

      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('should use tunnel URL when configured', () => {
      const reporter = createReporter({ tunnel: TUNNEL_URL });
      reporter.captureMessage('test');

      const url = sendBeaconSpy.mock.calls[0][0];
      expect(url).toBe(TUNNEL_URL);
    });

    it('should use direct ingest URL when no tunnel', () => {
      const reporter = createReporter();
      reporter.captureMessage('test');

      const url = sendBeaconSpy.mock.calls[0][0];
      expect(url).toContain('ingest.sentry.io');
      expect(url).toContain('/api/4504788728872960/envelope/');
    });
  });

  // --------------------------------------------------------------------------
  // Sampling
  // --------------------------------------------------------------------------

  describe('sampleRate', () => {
    it('should send all events when sampleRate is 1.0', () => {
      const reporter = createReporter({ sampleRate: 1.0 });

      for (let i = 0; i < 10; i++) {
        reporter.captureMessage(`msg-${i}`);
      }

      expect(sendBeaconSpy).toHaveBeenCalledTimes(10);
    });

    it('should send no events when sampleRate is 0', () => {
      const reporter = createReporter({ sampleRate: 0 });

      for (let i = 0; i < 10; i++) {
        reporter.captureMessage(`msg-${i}`);
      }

      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('should respect sampleRate with mocked Math.random', () => {
      const randomSpy = vi.spyOn(Math, 'random');

      const reporter = createReporter({ sampleRate: 0.5 });

      // Math.random returns 0.3 -> below 0.5 -> should send
      randomSpy.mockReturnValue(0.3);
      reporter.captureMessage('should send');
      expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

      // Math.random returns 0.7 -> above 0.5 -> should NOT send
      randomSpy.mockReturnValue(0.7);
      reporter.captureMessage('should not send');
      expect(sendBeaconSpy).toHaveBeenCalledTimes(1); // still 1

      randomSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // beforeSend
  // --------------------------------------------------------------------------

  describe('beforeSend', () => {
    it('should allow modifying the event before sending', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter({
        beforeSend: (event) => {
          event.tags = { ...event.tags, custom: 'tag' };
          return event;
        },
      });

      reporter.captureMessage('modified');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.tags?.custom).toBe('tag');
    });

    it('should drop the event when beforeSend returns null', () => {
      const reporter = createReporter({
        beforeSend: () => null,
      });

      const eventId = reporter.captureMessage('dropped');

      expect(eventId).toBe('');
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('should drop exception events when beforeSend returns null', () => {
      const reporter = createReporter({
        beforeSend: () => null,
      });

      const eventId = reporter.captureException(new Error('dropped'));

      expect(eventId).toBe('');
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Tags
  // --------------------------------------------------------------------------

  describe('tags', () => {
    it('should include default tags in events', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter({
        tags: { sdk: 'chatbot', tenantId: 't-123' },
      });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.tags?.sdk).toBe('chatbot');
      expect(event.tags?.tenantId).toBe('t-123');
    });

    it('should include tags added via setTag', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.setTag('version', '1.0.0');

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.tags?.version).toBe('1.0.0');
    });

    it('should include tags added via setTags', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.setTags({ a: '1', b: '2' });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.tags?.a).toBe('1');
      expect(event.tags?.b).toBe('2');
    });
  });

  // --------------------------------------------------------------------------
  // User Context
  // --------------------------------------------------------------------------

  describe('user context', () => {
    it('should include user context in events', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.setUser({ id: 'user-1', email: 'user@test.com' });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.user?.id).toBe('user-1');
      expect(event.user?.email).toBe('user@test.com');
    });

    it('should clear user context when set to null', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.setUser({ id: 'user-1' });
      reporter.setUser(null);

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.user).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Breadcrumbs
  // --------------------------------------------------------------------------

  describe('breadcrumbs', () => {
    it('should include breadcrumbs in events', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();
      reporter.addBreadcrumb({
        category: 'ui',
        message: 'Button clicked',
      });
      reporter.addBreadcrumb({
        category: 'http',
        message: 'POST /api/data',
        level: 'info',
        data: { status: 200 },
      });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.breadcrumbs).toHaveLength(2);
      expect(event.breadcrumbs![0].category).toBe('ui');
      expect(event.breadcrumbs![0].message).toBe('Button clicked');
      expect(event.breadcrumbs![1].category).toBe('http');
      expect(event.breadcrumbs![1].data?.status).toBe(200);
    });

    it('should limit breadcrumbs to 20 (ring buffer)', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter();

      // Add 25 breadcrumbs
      for (let i = 0; i < 25; i++) {
        reporter.addBreadcrumb({
          category: 'test',
          message: `breadcrumb-${i}`,
        });
      }

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.breadcrumbs).toHaveLength(20);
      // The first 5 should have been dropped
      expect(event.breadcrumbs![0].message).toBe('breadcrumb-5');
      expect(event.breadcrumbs![19].message).toBe('breadcrumb-24');
    });

    it('should add timestamps to breadcrumbs', () => {
      sendBeaconSpy.mockReturnValue(false);
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const reporter = createReporter();
      reporter.addBreadcrumb({
        category: 'test',
        message: 'timed',
      });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.breadcrumbs![0].timestamp).toBe(now / 1000);

      vi.restoreAllMocks();
    });
  });

  // --------------------------------------------------------------------------
  // Stack Trace Parsing
  // --------------------------------------------------------------------------

  describe('parseStackTrace', () => {
    it('should parse Chrome-style stack traces', () => {
      const error = new Error('test');
      error.stack = `Error: test
    at functionName (http://example.com/script.js:10:5)
    at http://example.com/script.js:20:10`;

      const result = SentryReporter.parseStackTrace(error);

      expect(result).toBeDefined();
      expect(result!.frames).toHaveLength(2);
      // Sentry convention: most recent call is last
      expect(result!.frames[1].function).toBe('functionName');
      expect(result!.frames[1].filename).toBe('http://example.com/script.js');
      expect(result!.frames[1].lineno).toBe(10);
      expect(result!.frames[1].colno).toBe(5);
      expect(result!.frames[0].function).toBe('<anonymous>');
    });

    it('should parse Firefox-style stack traces', () => {
      const error = new Error('test');
      error.stack = `myFunction@http://example.com/script.js:15:3
anotherFn@http://example.com/script.js:25:7`;

      const result = SentryReporter.parseStackTrace(error);

      expect(result).toBeDefined();
      expect(result!.frames).toHaveLength(2);
      // Reversed: anotherFn is first (deepest frame), myFunction is last
      expect(result!.frames[1].function).toBe('myFunction');
      expect(result!.frames[0].function).toBe('anotherFn');
    });

    it('should return undefined when stack is empty', () => {
      const error = new Error('test');
      error.stack = '';

      const result = SentryReporter.parseStackTrace(error);
      expect(result).toBeUndefined();
    });

    it('should return undefined when stack is undefined', () => {
      const error = new Error('test');
      Object.defineProperty(error, 'stack', { value: undefined });

      const result = SentryReporter.parseStackTrace(error);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no frames can be parsed', () => {
      const error = new Error('test');
      error.stack = 'No parseable frames here\njust some text';

      const result = SentryReporter.parseStackTrace(error);
      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Envelope Format
  // --------------------------------------------------------------------------

  describe('envelope format', () => {
    it('should produce a valid three-line envelope', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter({
        environment: 'test',
        release: '1.0.0',
      });

      reporter.captureMessage('envelope test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const lines = body.split('\n');

      expect(lines).toHaveLength(3);

      // Header line: JSON with event_id, dsn, sdk, sent_at
      const header = JSON.parse(lines[0]);
      expect(header.event_id).toBeTruthy();
      expect(header.dsn).toContain('abc123');
      expect(header.sdk.name).toBe('nevent.javascript.minimal');
      expect(header.sent_at).toBeTruthy();

      // Item header: JSON with type and length
      const itemHeader = JSON.parse(lines[1]);
      expect(itemHeader.type).toBe('event');
      expect(typeof itemHeader.length).toBe('number');

      // Payload: valid JSON SentryEvent
      const event = JSON.parse(lines[2]) as SentryEvent;
      expect(event.platform).toBe('javascript');
      expect(event.environment).toBe('test');
      expect(event.release).toBe('1.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // Fire-and-Forget
  // --------------------------------------------------------------------------

  describe('fire-and-forget', () => {
    it('should never throw from captureException', () => {
      // Force internal failure by breaking sendBeacon and fetch
      sendBeaconSpy.mockImplementation(() => {
        throw new Error('beacon crash');
      });
      fetchSpy.mockImplementation(() => {
        throw new Error('fetch crash');
      });

      const reporter = createReporter();

      expect(() => {
        reporter.captureException(new Error('test'));
      }).not.toThrow();
    });

    it('should never throw from captureMessage', () => {
      sendBeaconSpy.mockImplementation(() => {
        throw new Error('beacon crash');
      });
      fetchSpy.mockImplementation(() => {
        throw new Error('fetch crash');
      });

      const reporter = createReporter();

      expect(() => {
        reporter.captureMessage('test');
      }).not.toThrow();
    });

    it('should never throw from addBreadcrumb', () => {
      const reporter = createReporter();

      expect(() => {
        reporter.addBreadcrumb({
          category: 'test',
          message: 'safe',
        });
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // destroy
  // --------------------------------------------------------------------------

  describe('destroy', () => {
    it('should disable reporting after destroy', () => {
      const reporter = createReporter();
      reporter.destroy();

      const eventId = reporter.captureMessage('after destroy');
      expect(eventId).toBe('');
      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('should clear all state on destroy', () => {
      const reporter = createReporter({
        tags: { sdk: 'chatbot' },
      });
      reporter.setUser({ id: 'user-1' });
      reporter.addBreadcrumb({ category: 'test', message: 'bc' });

      reporter.destroy();

      // After destroy, capturing should be a no-op
      const eventId = reporter.captureException(new Error('test'));
      expect(eventId).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Event ID Generation
  // --------------------------------------------------------------------------

  describe('generateEventId', () => {
    it('should generate a 32-character hex string', () => {
      const id = SentryReporter.generateEventId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should fallback gracefully when crypto is unavailable', () => {
      // Remove crypto
      vi.stubGlobal('crypto', undefined);

      const id = SentryReporter.generateEventId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);

      vi.unstubAllGlobals();
    });
  });

  // --------------------------------------------------------------------------
  // User Agent Parsing
  // --------------------------------------------------------------------------

  describe('user agent parsing', () => {
    it('should detect Chrome', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
      expect(SentryReporter.parseBrowserName(ua)).toBe('Chrome');
      expect(SentryReporter.parseBrowserVersion(ua)).toBe('120.0.0.0');
    });

    it('should detect Firefox', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0';
      expect(SentryReporter.parseBrowserName(ua)).toBe('Firefox');
      expect(SentryReporter.parseBrowserVersion(ua)).toBe('121.0');
    });

    it('should detect Safari', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15';
      expect(SentryReporter.parseBrowserName(ua)).toBe('Safari');
      expect(SentryReporter.parseBrowserVersion(ua)).toBe('17.2');
    });

    it('should detect Edge', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
      expect(SentryReporter.parseBrowserName(ua)).toBe('Edge');
    });

    it('should detect OS names', () => {
      expect(SentryReporter.parseOSName('Windows NT 10.0')).toBe('Windows');
      expect(SentryReporter.parseOSName('Mac OS X 10_15')).toBe('macOS');
      expect(SentryReporter.parseOSName('Linux x86_64')).toBe('Linux');
      expect(SentryReporter.parseOSName('iPhone; CPU iPhone OS')).toBe('iOS');
      expect(SentryReporter.parseOSName('Android 13')).toBe('Android');
    });

    it('should detect device families', () => {
      expect(SentryReporter.parseDeviceFamily('iPad; CPU OS 16')).toBe(
        'Tablet'
      );
      expect(SentryReporter.parseDeviceFamily('iPhone; CPU iPhone')).toBe(
        'Mobile'
      );
      expect(SentryReporter.parseDeviceFamily('Windows NT 10.0; Win64')).toBe(
        'Desktop'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Integration: environment and release
  // --------------------------------------------------------------------------

  describe('environment and release', () => {
    it('should include environment and release in events', () => {
      sendBeaconSpy.mockReturnValue(false);

      const reporter = createReporter({
        environment: 'staging',
        release: '2.0.0-beta.1',
      });

      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      expect(event.environment).toBe('staging');
      expect(event.release).toBe('2.0.0-beta.1');
    });
  });

  // --------------------------------------------------------------------------
  // Contexts
  // --------------------------------------------------------------------------

  describe('contexts', () => {
    it('should include browser context from navigator.userAgent', () => {
      sendBeaconSpy.mockReturnValue(false);

      // navigator.userAgent is read-only in most environments
      // The test environment should already have some UA string
      const reporter = createReporter();
      reporter.captureMessage('test');

      const body = fetchSpy.mock.calls[0][1].body as string;
      const { event } = parseEnvelope(body);

      // Contexts should be present (even if UA parsing yields 'Unknown')
      expect(event.contexts).toBeDefined();
      expect(event.contexts?.browser).toBeDefined();
      expect(event.contexts?.os).toBeDefined();
      expect(event.contexts?.device).toBeDefined();
    });
  });
});
