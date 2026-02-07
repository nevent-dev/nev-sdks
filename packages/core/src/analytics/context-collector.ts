import type { AnalyticsContext } from './types';

/**
 * Collects contextual information for analytics events
 *
 * Gathers device, screen, session, network, and preference data
 * to provide rich context for each analytics event.
 */
export class ContextCollector {
  private sessionId: string;
  private sessionStart: string;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.sessionStart = this.getOrCreateSessionStart();
  }

  /**
   * Collects all context information
   *
   * @returns Complete analytics context object
   */
  collect(): AnalyticsContext {
    return {
      device: this.collectDevice(),
      screen: this.collectScreen(),
      session: this.collectSession(),
      network: this.collectNetwork(),
      preferences: this.collectPreferences(),
    };
  }

  /**
   * Collects device information from user agent
   */
  private collectDevice() {
    const ua = navigator.userAgent;
    const { os, osVersion } = this.parseUserAgent(ua);
    return {
      os,
      osVersion,
      model: 'browser',
      manufacturer: 'unknown',
      platform: 'web',
      appVersion: '__SDK_VERSION__',
    };
  }

  /**
   * Collects screen and viewport dimensions
   */
  private collectScreen() {
    const orientation = window.matchMedia('(orientation: portrait)').matches
      ? 'portrait'
      : 'landscape';
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      screenWidth: screen.width,
      screenHeight: screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      orientation,
    };
  }

  /**
   * Collects session information
   */
  private collectSession() {
    const start = new Date(this.sessionStart);
    const duration = Math.floor((Date.now() - start.getTime()) / 1000);
    let timezone = 'unknown';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      // Graceful fallback if timezone detection fails
    }

    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      duration,
      timezone,
      referrer: document.referrer || '',
      url: window.location.href,
    };
  }

  /**
   * Collects network connection information
   */
  private collectNetwork() {
    try {
      const conn = (navigator as any).connection;
      if (conn) {
        return {
          type: conn.type || 'unknown',
          effectiveType: conn.effectiveType || 'unknown',
          downlink: conn.downlink,
        };
      }
    } catch {
      // navigator.connection not available
    }
    return {};
  }

  /**
   * Collects user preferences
   */
  private collectPreferences() {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
      .matches
      ? 'dark'
      : 'light';
    return {
      language: navigator.language || 'unknown',
      colorScheme,
    };
  }

  /**
   * Parses user agent string to extract OS information
   */
  private parseUserAgent(ua: string): { os: string; osVersion: string } {
    if (/Windows NT (\d+\.\d+)/.test(ua)) {
      return { os: 'Windows', osVersion: RegExp.$1 };
    }
    if (/Mac OS X (\d+[._]\d+[._]?\d*)/.test(ua)) {
      return { os: 'macOS', osVersion: RegExp.$1.replace(/_/g, '.') };
    }
    if (/Android (\d+\.?\d*)/.test(ua)) {
      return { os: 'Android', osVersion: RegExp.$1 };
    }
    if (/iPhone OS (\d+_\d+)/.test(ua)) {
      return { os: 'iOS', osVersion: RegExp.$1.replace(/_/g, '.') };
    }
    if (/Linux/.test(ua)) {
      return { os: 'Linux', osVersion: 'unknown' };
    }
    return { os: 'unknown', osVersion: 'unknown' };
  }

  /**
   * Generates a UUID v4
   */
  private generateUUID(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
  }

  /**
   * Gets or creates session ID in sessionStorage
   */
  private getOrCreateSessionId(): string {
    const key = 'nev_session_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = this.generateUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  /**
   * Gets or creates session start timestamp
   */
  private getOrCreateSessionStart(): string {
    const key = 'nev_session_start';
    let start = sessionStorage.getItem(key);
    if (!start) {
      start = new Date().toISOString();
      sessionStorage.setItem(key, start);
    }
    return start;
  }
}
