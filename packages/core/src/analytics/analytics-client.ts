import type {
  AnalyticsClientConfig,
  AnalyticsEvent,
  AnalyticsEventParams,
} from './types';
import { ContextCollector } from './context-collector';

/**
 * Analytics client for tracking events
 *
 * Uses navigator.sendBeacon for reliable event delivery, with fetch fallback.
 * All analytics operations are fire-and-forget with triple error suppression
 * to ensure analytics never breaks the widget functionality.
 */
export class AnalyticsClient {
  private contextCollector: ContextCollector;
  private endpoint: string;
  private enabled: boolean;
  private debug: boolean;
  private userId: string | null = null;

  constructor(config: AnalyticsClientConfig) {
    this.endpoint = config.endpoint;
    this.enabled = config.enabled !== false;
    this.debug = config.debug || false;
    this.contextCollector = new ContextCollector();
  }

  /**
   * Tracks an analytics event
   *
   * @param name - Event name (e.g., 'widget_loaded', 'form_submit')
   * @param params - Event parameters
   */
  track(name: string, params?: Partial<AnalyticsEventParams>): void {
    if (!this.enabled) return;

    try {
      const event: AnalyticsEvent = {
        event_name: name,
        event_params: params || {},
        context: this.contextCollector.collect(),
        timestamp: new Date().toISOString(),
        user_id: this.userId,
      };

      const payload = JSON.stringify(event);

      if (this.debug) {
        console.debug('[NeventAnalytics]', name, event);
      }

      // Try sendBeacon first (most reliable for page unload events)
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(this.endpoint, blob);

      // Fallback to fetch if sendBeacon fails
      if (!sent) {
        fetch(this.endpoint, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(() => {
          // Triple error suppression: silently fail if both methods fail
        });
      }
    } catch {
      // Triple error suppression: never let analytics break the widget
    }
  }

  /**
   * Sets the user ID for tracking
   *
   * @param userId - User identifier
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Enables or disables analytics tracking
   *
   * @param enabled - Whether analytics should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
