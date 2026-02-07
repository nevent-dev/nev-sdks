import type { AnalyticsClient, AnalyticsEventParams } from '@nevent/core';

/**
 * Tracks newsletter widget analytics events
 *
 * Handles tracking of:
 * - Widget lifecycle events (loaded, impression)
 * - User interactions (form interaction, submit)
 * - Outcomes (success, error, abandonment)
 */
export class WidgetTracker {
  private analyticsClient: AnalyticsClient;
  private newsletterId: string;
  private tenantId: string;

  private hasTrackedImpression = false;
  private hasTrackedInteraction = false;
  private formSubmitted = false;
  private formInteracted = false;

  private intersectionObserver: IntersectionObserver | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private focusinHandler: ((e: Event) => void) | null = null;
  private focusinTarget: HTMLElement | null = null;

  constructor(
    analyticsClient: AnalyticsClient,
    newsletterId: string,
    tenantId: string
  ) {
    this.analyticsClient = analyticsClient;
    this.newsletterId = newsletterId;
    this.tenantId = tenantId;
  }

  /**
   * Returns base event parameters shared across all events
   */
  private baseParams(): Partial<AnalyticsEventParams> {
    return {
      event_category: 'newsletter',
      event_label: this.newsletterId,
      tenant_id: this.tenantId,
    };
  }

  /**
   * Tracks widget loaded event
   */
  trackWidgetLoaded(): void {
    this.analyticsClient.track('widget_loaded', {
      ...this.baseParams(),
      interaction: false,
    });
  }

  /**
   * Tracks successful subscription
   */
  trackSubscriptionSuccess(): void {
    this.formSubmitted = true;
    this.analyticsClient.track('subscription_success', {
      ...this.baseParams(),
      interaction: true,
    });
  }

  /**
   * Tracks subscription error
   *
   * @param errorMessage - Optional error message
   */
  trackSubscriptionError(errorMessage?: string): void {
    this.analyticsClient.track('subscription_error', {
      ...this.baseParams(),
      interaction: true,
      ...(errorMessage && { error_message: errorMessage }),
    });
  }

  /**
   * Tracks form submission attempt
   */
  trackFormSubmit(): void {
    this.analyticsClient.track('form_submit', {
      ...this.baseParams(),
      interaction: true,
    });
  }

  /**
   * Sets up impression tracking using IntersectionObserver
   *
   * Tracks when widget is 50% visible in viewport.
   * Fires only once then disconnects observer.
   *
   * @param container - Widget container element
   */
  setupImpressionTracking(container: HTMLElement): void {
    if (typeof IntersectionObserver === 'undefined') return;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= 0.5 &&
            !this.hasTrackedImpression
          ) {
            this.hasTrackedImpression = true;
            this.analyticsClient.track('widget_impression', {
              ...this.baseParams(),
              interaction: false,
            });
            this.intersectionObserver?.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );

    this.intersectionObserver.observe(container);
  }

  /**
   * Sets up form interaction tracking
   *
   * Tracks when user first focuses on any form field.
   * Fires only once then removes listener.
   *
   * @param form - Form element
   */
  setupFormInteractionTracking(form: HTMLElement): void {
    this.focusinTarget = form;
    this.focusinHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      const isFormField =
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA';

      if (isFormField && !this.hasTrackedInteraction) {
        this.hasTrackedInteraction = true;
        this.formInteracted = true;
        this.analyticsClient.track('form_interaction', {
          ...this.baseParams(),
          interaction: true,
        });
        this.focusinTarget?.removeEventListener('focusin', this.focusinHandler!);
      }
    };

    form.addEventListener('focusin', this.focusinHandler);
  }

  /**
   * Sets up form abandonment tracking
   *
   * Tracks when user interacted with form but left page without submitting.
   * Uses beforeunload event to catch page navigation/close.
   */
  setupAbandonmentTracking(): void {
    this.beforeUnloadHandler = () => {
      if (this.formInteracted && !this.formSubmitted) {
        this.analyticsClient.track('form_abandonment', {
          ...this.baseParams(),
          interaction: true,
        });
      }
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  /**
   * Cleans up all event listeners and observers
   *
   * Should be called when widget is destroyed
   */
  destroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    if (this.focusinHandler && this.focusinTarget) {
      this.focusinTarget.removeEventListener('focusin', this.focusinHandler);
      this.focusinHandler = null;
      this.focusinTarget = null;
    }
  }
}
