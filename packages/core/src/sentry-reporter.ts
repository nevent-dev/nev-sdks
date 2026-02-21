/**
 * SentryReporter - Lightweight Sentry error reporting for Nevent SDKs
 *
 * Implements a minimal Sentry client that sends error events using the
 * Sentry envelope format. Designed for embeddable widgets where using the
 * full `@sentry/browser` package (~30KB gzip) would be too heavy and could
 * conflict with the host page's own Sentry instance.
 *
 * Features:
 * - DSN parsing and validation
 * - Sentry envelope format construction
 * - Delivery via `navigator.sendBeacon()` with `fetch()` fallback
 * - Optional tunnel URL to bypass ad-blockers
 * - Stack trace extraction from Error objects
 * - Browser/OS context from `navigator.userAgent`
 * - Breadcrumb ring buffer (max 20)
 * - Sampling via `sampleRate`
 * - Event filtering/modification via `beforeSend`
 * - Tag and user context management
 * - Fire-and-forget: never throws, never blocks
 *
 * Target bundle size: <3KB gzip.
 *
 * @example
 * ```typescript
 * const reporter = new SentryReporter({
 *   dsn: 'https://key@o123.ingest.sentry.io/456',
 *   tunnel: 'https://api.nevent.es/diagnostics',
 *   environment: 'production',
 *   release: '1.0.0',
 *   tags: { sdk: 'chatbot', tenantId: 'tenant-123' },
 * });
 *
 * reporter.captureException(new Error('Something went wrong'));
 * reporter.captureMessage('User did something unexpected', 'warning');
 *
 * reporter.destroy();
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the SentryReporter.
 *
 * Only `dsn` is strictly required. All other fields have sensible defaults.
 */
export interface SentryReporterConfig {
  /**
   * Sentry DSN (Data Source Name).
   * Format: `https://<public_key>@<host>/<project_id>`
   */
  dsn: string;

  /**
   * Whether error reporting is enabled.
   * When `false`, all capture methods are no-ops.
   * @default true
   */
  enabled?: boolean;

  /**
   * Tunnel URL for forwarding Sentry envelopes through a first-party endpoint.
   * Bypasses ad-blockers that block requests to `*.ingest.sentry.io`.
   * When set, envelopes are POSTed to this URL instead of the Sentry ingest.
   *
   * @example 'https://api.nevent.es/diagnostics'
   */
  tunnel?: string;

  /**
   * Environment name attached to every event.
   * @example 'production', 'staging', 'development'
   */
  environment?: string;

  /**
   * Release identifier attached to every event.
   * Typically the SDK version string.
   * @example '0.1.0'
   */
  release?: string;

  /**
   * Sample rate controlling what fraction of events are actually sent.
   * A value between 0 (send nothing) and 1 (send everything).
   * @default 1.0
   */
  sampleRate?: number;

  /**
   * Hook invoked before an event is sent.
   * Return the event (possibly modified) to send it, or `null` to drop it.
   *
   * @param event - The Sentry event about to be sent
   * @returns The event to send, or `null` to discard
   */
  beforeSend?: (event: SentryEvent) => SentryEvent | null;

  /**
   * Default tags attached to every event.
   * Useful for SDK name, tenant ID, widget type, etc.
   */
  tags?: Record<string, string>;
}

/**
 * Sentry event payload.
 *
 * A simplified subset of the full Sentry event protocol, containing only
 * the fields needed for error and message capture.
 */
export interface SentryEvent {
  /** Unique event identifier (UUID v4 without dashes) */
  event_id: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  /** Platform identifier */
  platform: 'javascript';
  /** Severity level */
  level: 'error' | 'warning' | 'info';
  /** Environment name */
  environment?: string;
  /** Release identifier */
  release?: string;
  /** Key-value tags for filtering and grouping */
  tags?: Record<string, string>;
  /** Exception chain (for error events) */
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          in_app?: boolean;
        }>;
      };
    }>;
  };
  /** Log message (for message events) */
  message?: {
    formatted: string;
  };
  /** User context */
  user?: {
    id?: string;
    email?: string;
    ip_address?: string;
  };
  /** Breadcrumbs for context trail */
  breadcrumbs?: Array<{
    category: string;
    message: string;
    level?: string;
    timestamp?: number;
    data?: Record<string, unknown>;
  }>;
  /** Runtime contexts (browser, OS, device) */
  contexts?: {
    browser?: { name: string; version: string };
    os?: { name: string };
    device?: { family: string };
  };
  /** Extra data for debugging */
  extra?: Record<string, unknown>;
}

/**
 * Parsed components of a Sentry DSN.
 */
interface ParsedDSN {
  /** Public key (the part before @) */
  publicKey: string;
  /** Sentry ingest host */
  host: string;
  /** Sentry project ID */
  projectId: string;
  /** Full ingest URL for direct posting */
  ingestUrl: string;
}

/**
 * Breadcrumb entry added via {@link SentryReporter.addBreadcrumb}.
 */
export interface SentryBreadcrumb {
  /** Category for grouping (e.g. 'ui', 'http', 'navigation') */
  category: string;
  /** Human-readable description */
  message: string;
  /** Severity level */
  level?: string;
  /** Additional structured data */
  data?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of breadcrumbs retained (ring buffer) */
const MAX_BREADCRUMBS = 20;

/** Sentry envelope protocol version */
const SENTRY_VERSION = '7';

/** SDK identifier sent in the envelope header */
const SDK_NAME = 'nevent.javascript.minimal';

/** SDK version */
const SDK_VERSION = '0.1.0';

// ============================================================================
// SentryReporter Class
// ============================================================================

/**
 * Lightweight Sentry error reporter for Nevent embeddable SDKs.
 *
 * Designed as a drop-in replacement for the portions of `@sentry/browser`
 * that the SDK needs (captureException, captureMessage) without the weight
 * or host-page conflict risks of the full library.
 *
 * All public methods are fire-and-forget: they catch internal errors silently
 * so that a failure in error reporting never disrupts widget functionality.
 */
export class SentryReporter {
  /** Whether reporting is active */
  private enabled: boolean;

  /** Parsed DSN components */
  private dsn: ParsedDSN | null = null;

  /** Optional tunnel URL */
  private readonly tunnel: string | undefined;

  /** Environment tag */
  private readonly environment: string | undefined;

  /** Release tag */
  private readonly release: string | undefined;

  /** Sampling rate (0-1) */
  private readonly sampleRate: number;

  /** Pre-send hook */
  private readonly beforeSend:
    | ((event: SentryEvent) => SentryEvent | null)
    | undefined;

  /** Default tags */
  private tags: Record<string, string>;

  /** User context */
  private user: { id?: string; email?: string; ip_address?: string } | null =
    null;

  /** Breadcrumb ring buffer */
  private breadcrumbs: Array<{
    category: string;
    message: string;
    level?: string;
    timestamp?: number;
    data?: Record<string, unknown>;
  }> = [];

  /** Cached browser context (computed once) */
  private browserContext: SentryEvent['contexts'] | null = null;

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new SentryReporter instance.
   *
   * Parses the DSN immediately. If the DSN is invalid, the reporter is
   * disabled and a console warning is emitted (in environments where
   * `console` is available).
   *
   * @param config - Reporter configuration. See {@link SentryReporterConfig}.
   */
  constructor(config: SentryReporterConfig) {
    this.enabled = config.enabled !== false;
    this.tunnel = config.tunnel;
    this.environment = config.environment;
    this.release = config.release;
    this.sampleRate = config.sampleRate ?? 1.0;
    this.beforeSend = config.beforeSend;
    this.tags = { ...(config.tags ?? {}) };

    if (this.enabled) {
      this.dsn = SentryReporter.parseDSN(config.dsn);
      if (!this.dsn) {
        this.enabled = false;
        try {
          console.warn('[SentryReporter] Invalid DSN — reporting disabled');
        } catch {
          // Silent: console may not be available
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public API: Capture
  // --------------------------------------------------------------------------

  /**
   * Captures an error and sends it to Sentry.
   *
   * Extracts the error type, message, and stack trace from the provided
   * value. Non-Error values are converted to a generic error event.
   *
   * @param error - The error to capture (Error instance or any thrown value)
   * @param extra - Optional extra data to attach to the event
   * @returns The generated event ID, or empty string if not sent
   */
  captureException(
    error: Error | unknown,
    extra?: Record<string, unknown>
  ): string {
    try {
      if (!this.enabled || !this.dsn) return '';
      if (!this.shouldSample()) return '';

      const eventId = SentryReporter.generateEventId();
      let event = this.buildErrorEvent(eventId, error, extra);

      if (this.beforeSend) {
        const result = this.beforeSend(event);
        if (result === null) return '';
        event = result;
      }

      this.sendEnvelope(event);
      return eventId;
    } catch {
      // Fire-and-forget: never throw from the reporter
      return '';
    }
  }

  /**
   * Captures a message and sends it to Sentry.
   *
   * @param message - The message text
   * @param level - Severity level. Default: `'info'`
   * @param extra - Optional extra data to attach to the event
   * @returns The generated event ID, or empty string if not sent
   */
  captureMessage(
    message: string,
    level: 'error' | 'warning' | 'info' = 'info',
    extra?: Record<string, unknown>
  ): string {
    try {
      if (!this.enabled || !this.dsn) return '';
      if (!this.shouldSample()) return '';

      const eventId = SentryReporter.generateEventId();
      let event = this.buildMessageEvent(eventId, message, level, extra);

      if (this.beforeSend) {
        const result = this.beforeSend(event);
        if (result === null) return '';
        event = result;
      }

      this.sendEnvelope(event);
      return eventId;
    } catch {
      // Fire-and-forget: never throw from the reporter
      return '';
    }
  }

  // --------------------------------------------------------------------------
  // Public API: Context Management
  // --------------------------------------------------------------------------

  /**
   * Sets a single tag that will be attached to all subsequent events.
   *
   * @param key - Tag name
   * @param value - Tag value
   */
  setTag(key: string, value: string): void {
    this.tags[key] = value;
  }

  /**
   * Sets multiple tags at once.
   *
   * @param tags - Key-value pairs to merge into existing tags
   */
  setTags(tags: Record<string, string>): void {
    Object.assign(this.tags, tags);
  }

  /**
   * Sets the user context for all subsequent events.
   *
   * Pass `null` to clear user context.
   *
   * @param user - User identity information, or `null` to clear
   */
  setUser(
    user: { id?: string; email?: string; ip_address?: string } | null
  ): void {
    this.user = user;
  }

  /**
   * Adds a breadcrumb to the context trail.
   *
   * Breadcrumbs are included in subsequent events to provide context about
   * what happened leading up to an error. A maximum of {@link MAX_BREADCRUMBS}
   * are retained; older entries are dropped when the limit is exceeded.
   *
   * @param breadcrumb - The breadcrumb entry to add
   */
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    try {
      this.breadcrumbs.push({
        ...breadcrumb,
        timestamp: Date.now() / 1000,
      });

      // Ring buffer: drop oldest when exceeding max
      if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
        this.breadcrumbs = this.breadcrumbs.slice(-MAX_BREADCRUMBS);
      }
    } catch {
      // Silent: never throw from breadcrumb management
    }
  }

  // --------------------------------------------------------------------------
  // Public API: Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Cleans up the reporter, clearing all internal state.
   *
   * After calling destroy(), all capture methods become no-ops.
   */
  destroy(): void {
    this.enabled = false;
    this.dsn = null;
    this.tags = {};
    this.user = null;
    this.breadcrumbs = [];
    this.browserContext = null;
  }

  // --------------------------------------------------------------------------
  // Static: DSN Parsing
  // --------------------------------------------------------------------------

  /**
   * Parses a Sentry DSN string into its component parts.
   *
   * Expected format: `https://<publicKey>@<host>/<projectId>`
   *
   * @param dsn - The DSN string to parse
   * @returns Parsed DSN components, or `null` if the format is invalid
   */
  static parseDSN(dsn: string): ParsedDSN | null {
    try {
      const url = new URL(dsn);
      const publicKey = url.username;
      if (!publicKey) return null;

      // The project ID is the last path segment
      const pathParts = url.pathname.split('/').filter(Boolean);
      const projectId = pathParts[pathParts.length - 1];
      if (!projectId) return null;

      // Reconstruct host without the username (key)
      const host = url.host;

      const ingestUrl = `https://${host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=${SENTRY_VERSION}`;

      return { publicKey, host, projectId, ingestUrl };
    } catch {
      return null;
    }
  }

  /**
   * Generates a random UUID v4 hex string without dashes (32 characters).
   *
   * Uses `crypto.randomUUID()` when available, falling back to
   * `crypto.getRandomValues()`, then to `Math.random()`.
   *
   * @returns A 32-character hex string suitable for Sentry event_id
   */
  static generateEventId(): string {
    try {
      if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
      ) {
        return crypto.randomUUID().replace(/-/g, '');
      }

      if (
        typeof crypto !== 'undefined' &&
        typeof crypto.getRandomValues === 'function'
      ) {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        // Set version (4) and variant (8, 9, a, b)
        buf[6] = ((buf[6] ?? 0) & 0x0f) | 0x40;
        buf[8] = ((buf[8] ?? 0) & 0x3f) | 0x80;
        return Array.from(buf)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch {
      // Fall through to Math.random fallback
    }

    // Fallback: Math.random-based hex string
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // --------------------------------------------------------------------------
  // Private: Event Building
  // --------------------------------------------------------------------------

  /**
   * Builds a Sentry error event from an Error or unknown thrown value.
   *
   * @param eventId - Pre-generated event ID
   * @param error - The caught error
   * @param extra - Additional context data
   * @returns A complete SentryEvent ready for envelope encoding
   */
  private buildErrorEvent(
    eventId: string,
    error: Error | unknown,
    extra?: Record<string, unknown>
  ): SentryEvent {
    const isError = error instanceof Error;
    const errorType = isError ? error.constructor.name : 'Error';
    const errorMessage = isError
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Non-Error exception captured';

    // Build exception value — only include stacktrace if present
    const exceptionValue: {
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          in_app?: boolean;
        }>;
      };
    } = { type: errorType, value: errorMessage };

    if (isError) {
      const stacktrace = SentryReporter.parseStackTrace(error);
      if (stacktrace) {
        exceptionValue.stacktrace = stacktrace;
      }
    }

    // Build event — only include optional fields when they have values
    const event: SentryEvent = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      tags: { ...this.tags },
      exception: { values: [exceptionValue] },
    };

    if (this.environment) event.environment = this.environment;
    if (this.release) event.release = this.release;

    const contexts = this.getContexts();
    if (contexts) event.contexts = contexts;

    if (this.user) {
      event.user = { ...this.user };
    }

    if (this.breadcrumbs.length > 0) {
      event.breadcrumbs = [...this.breadcrumbs];
    }

    if (extra) {
      event.extra = { ...extra };
    }

    return event;
  }

  /**
   * Builds a Sentry message event.
   *
   * @param eventId - Pre-generated event ID
   * @param message - The message text
   * @param level - Severity level
   * @param extra - Additional context data
   * @returns A complete SentryEvent ready for envelope encoding
   */
  private buildMessageEvent(
    eventId: string,
    message: string,
    level: 'error' | 'warning' | 'info',
    extra?: Record<string, unknown>
  ): SentryEvent {
    // Build event — only include optional fields when they have values
    const event: SentryEvent = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level,
      tags: { ...this.tags },
      message: { formatted: message },
    };

    if (this.environment) event.environment = this.environment;
    if (this.release) event.release = this.release;

    const contexts = this.getContexts();
    if (contexts) event.contexts = contexts;

    if (this.user) {
      event.user = { ...this.user };
    }

    if (this.breadcrumbs.length > 0) {
      event.breadcrumbs = [...this.breadcrumbs];
    }

    if (extra) {
      event.extra = { ...extra };
    }

    return event;
  }

  // --------------------------------------------------------------------------
  // Private: Envelope Construction & Sending
  // --------------------------------------------------------------------------

  /**
   * Constructs a Sentry envelope and sends it via sendBeacon or fetch.
   *
   * Envelope format (newline-separated):
   * ```
   * {"event_id":"...","dsn":"...","sdk":{"name":"...","version":"..."}}\n
   * {"type":"event","length":N}\n
   * {<event JSON>}
   * ```
   *
   * @param event - The Sentry event to send
   */
  private sendEnvelope(event: SentryEvent): void {
    if (!this.dsn) return;

    const eventPayload = JSON.stringify(event);
    const payloadLength = new Blob([eventPayload]).size;

    const envelopeHeader = JSON.stringify({
      event_id: event.event_id,
      dsn: `https://${this.dsn.publicKey}@${this.dsn.host}/${this.dsn.projectId}`,
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      sent_at: new Date().toISOString(),
    });

    const itemHeader = JSON.stringify({
      type: 'event',
      length: payloadLength,
    });

    const envelope = `${envelopeHeader}\n${itemHeader}\n${eventPayload}`;
    const url = this.tunnel ?? this.dsn.ingestUrl;

    // Prefer sendBeacon for reliability (survives page unload)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      try {
        const blob = new Blob([envelope], { type: 'text/plain;charset=UTF-8' });
        const sent = navigator.sendBeacon(url, blob);
        if (sent) return;
      } catch {
        // Fall through to fetch
      }
    }

    // Fallback: fetch with keepalive
    if (typeof fetch !== 'undefined') {
      try {
        fetch(url, {
          method: 'POST',
          body: envelope,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          keepalive: true,
        }).catch(() => {
          // Silent: fire-and-forget
        });
      } catch {
        // Silent: fire-and-forget
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private: Stack Trace Parsing
  // --------------------------------------------------------------------------

  /**
   * Extracts stack trace frames from an Error object.
   *
   * Parses the `error.stack` string (Chrome/Firefox/Safari format) into
   * Sentry-compatible frame objects. Frames are reversed so that the most
   * recent call is last (Sentry convention).
   *
   * @param error - The Error with a `.stack` property
   * @returns Stacktrace object with frames, or `undefined` if parsing fails
   */
  static parseStackTrace(error: Error):
    | {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          in_app?: boolean;
        }>;
      }
    | undefined {
    if (!error.stack) return undefined;

    try {
      const lines = error.stack.split('\n');
      const frames: Array<{
        filename?: string;
        function?: string;
        lineno?: number;
        colno?: number;
        in_app?: boolean;
      }> = [];

      for (const line of lines) {
        const trimmed = line.trim();

        // Chrome/Node format: "    at FunctionName (file:line:col)"
        // or "    at file:line:col"
        const chromeMatch = trimmed.match(
          /^at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?$/
        );
        if (chromeMatch) {
          const frame: {
            filename?: string;
            function?: string;
            lineno?: number;
            colno?: number;
            in_app?: boolean;
          } = {
            function: chromeMatch[1] ?? '<anonymous>',
            in_app: true,
          };
          if (chromeMatch[2]) frame.filename = chromeMatch[2];
          if (chromeMatch[3]) frame.lineno = parseInt(chromeMatch[3], 10);
          if (chromeMatch[4]) frame.colno = parseInt(chromeMatch[4], 10);
          frames.push(frame);
          continue;
        }

        // Firefox/Safari format: "functionName@file:line:col"
        const firefoxMatch = trimmed.match(/^(.+?)@(.*?):(\d+):(\d+)$/);
        if (firefoxMatch) {
          const frame: {
            filename?: string;
            function?: string;
            lineno?: number;
            colno?: number;
            in_app?: boolean;
          } = {
            function: firefoxMatch[1] ?? '<anonymous>',
            in_app: true,
          };
          if (firefoxMatch[2]) frame.filename = firefoxMatch[2];
          if (firefoxMatch[3]) frame.lineno = parseInt(firefoxMatch[3], 10);
          if (firefoxMatch[4]) frame.colno = parseInt(firefoxMatch[4], 10);
          frames.push(frame);
          continue;
        }
      }

      if (frames.length === 0) return undefined;

      // Sentry expects frames in reverse order (most recent call last)
      return { frames: frames.reverse() };
    } catch {
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Private: Sampling
  // --------------------------------------------------------------------------

  /**
   * Determines whether the current event should be sent based on sample rate.
   *
   * @returns `true` if the event should be sent
   */
  private shouldSample(): boolean {
    if (this.sampleRate >= 1.0) return true;
    if (this.sampleRate <= 0) return false;
    return Math.random() < this.sampleRate;
  }

  // --------------------------------------------------------------------------
  // Private: Context Collection
  // --------------------------------------------------------------------------

  /**
   * Returns browser, OS, and device context parsed from the user agent.
   *
   * The context is computed once and cached for the lifetime of the reporter.
   *
   * @returns Contexts object for the Sentry event
   */
  private getContexts(): SentryEvent['contexts'] {
    if (this.browserContext) return this.browserContext;

    if (typeof navigator === 'undefined') return undefined;

    try {
      const ua = navigator.userAgent || '';
      this.browserContext = {
        browser: {
          name: SentryReporter.parseBrowserName(ua),
          version: SentryReporter.parseBrowserVersion(ua),
        },
        os: { name: SentryReporter.parseOSName(ua) },
        device: { family: SentryReporter.parseDeviceFamily(ua) },
      };
      return this.browserContext;
    } catch {
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Static: User Agent Parsing (minimal)
  // --------------------------------------------------------------------------

  /**
   * Extracts the browser name from a user agent string.
   *
   * @param ua - The user agent string
   * @returns Browser name or 'Unknown'
   */
  static parseBrowserName(ua: string): string {
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
    if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
    return 'Unknown';
  }

  /**
   * Extracts the browser version from a user agent string.
   *
   * @param ua - The user agent string
   * @returns Browser version string or 'Unknown'
   */
  static parseBrowserVersion(ua: string): string {
    const patterns: Array<[string, RegExp]> = [
      ['Firefox', /Firefox\/([\d.]+)/],
      ['Edge', /Edg\/([\d.]+)/],
      ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
      ['Chrome', /Chrome\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+)/],
    ];
    for (const [, regex] of patterns) {
      const match = ua.match(regex);
      if (match?.[1]) return match[1];
    }
    return 'Unknown';
  }

  /**
   * Extracts the OS name from a user agent string.
   *
   * @param ua - The user agent string
   * @returns OS name or 'Unknown'
   */
  static parseOSName(ua: string): string {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown';
  }

  /**
   * Extracts the device family from a user agent string.
   *
   * @param ua - The user agent string
   * @returns Device family ('Mobile', 'Tablet', or 'Desktop')
   */
  static parseDeviceFamily(ua: string): string {
    if (ua.includes('iPad') || ua.includes('Tablet')) return 'Tablet';
    if (
      ua.includes('Mobile') ||
      ua.includes('iPhone') ||
      ua.includes('Android')
    )
      return 'Mobile';
    return 'Desktop';
  }
}
