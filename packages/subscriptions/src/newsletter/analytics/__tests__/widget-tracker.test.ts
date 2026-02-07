import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WidgetTracker } from '../widget-tracker';

describe('WidgetTracker', () => {
  let mockAnalyticsClient: any;
  let intersectionObserverMock: any;
  let observerCallback: IntersectionObserverCallback;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AnalyticsClient
    mockAnalyticsClient = {
      track: vi.fn(),
    };

    // Mock IntersectionObserver
    intersectionObserverMock = vi.fn((callback, options) => {
      observerCallback = callback;
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
        takeRecords: vi.fn(),
        root: null,
        rootMargin: '',
        thresholds: options?.threshold || [0],
      };
    });

    Object.defineProperty(global, 'IntersectionObserver', {
      value: intersectionObserverMock,
      writable: true,
      configurable: true,
    });
  });

  describe('trackWidgetLoaded()', () => {
    it('should call analyticsClient.track with correct parameters', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackWidgetLoaded();

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith('widget_loaded', {
        event_category: 'newsletter',
        event_label: 'newsletter-123',
        tenant_id: 'tenant-456',
        interaction: false,
      });
    });
  });

  describe('trackFormSubmit()', () => {
    it('should call analyticsClient.track with interaction: true', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackFormSubmit();

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith('form_submit', {
        event_category: 'newsletter',
        event_label: 'newsletter-123',
        tenant_id: 'tenant-456',
        interaction: true,
      });
    });
  });

  describe('trackSubscriptionSuccess()', () => {
    it('should call analyticsClient.track with interaction: true', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackSubscriptionSuccess();

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'subscription_success',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: true,
        }
      );
    });

    it('should set formSubmitted flag', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackSubscriptionSuccess();
      tracker.setupAbandonmentTracking();

      // Trigger beforeunload
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);

      // Should not track abandonment because form was submitted
      expect(mockAnalyticsClient.track).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsClient.track).not.toHaveBeenCalledWith(
        'form_abandonment',
        expect.anything()
      );
    });
  });

  describe('trackSubscriptionError()', () => {
    it('should call analyticsClient.track with error_message when provided', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackSubscriptionError('Network error occurred');

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'subscription_error',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: true,
          error_message: 'Network error occurred',
        }
      );
    });

    it('should call analyticsClient.track without error_message when not provided', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.trackSubscriptionError();

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'subscription_error',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: true,
        }
      );
    });
  });

  describe('setupImpressionTracking()', () => {
    it('should create IntersectionObserver with threshold 0.5', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      expect(intersectionObserverMock).toHaveBeenCalledWith(
        expect.any(Function),
        { threshold: 0.5 }
      );
    });

    it('should track widget_impression when element is 50% visible', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      // Simulate intersection at 50%
      const entries = [
        {
          isIntersecting: true,
          intersectionRatio: 0.5,
          target: container,
        } as IntersectionObserverEntry,
      ];

      observerCallback(entries, {} as IntersectionObserver);

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'widget_impression',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: false,
        }
      );
    });

    it('should only fire once and disconnect observer', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      const observer = intersectionObserverMock.mock.results[0].value;

      // First intersection
      const entries1 = [
        {
          isIntersecting: true,
          intersectionRatio: 0.5,
          target: container,
        } as IntersectionObserverEntry,
      ];
      observerCallback(entries1, {} as IntersectionObserver);

      expect(mockAnalyticsClient.track).toHaveBeenCalledTimes(1);
      expect(observer.disconnect).toHaveBeenCalled();

      // Second intersection (should not track again)
      const entries2 = [
        {
          isIntersecting: true,
          intersectionRatio: 0.6,
          target: container,
        } as IntersectionObserverEntry,
      ];
      observerCallback(entries2, {} as IntersectionObserver);

      expect(mockAnalyticsClient.track).toHaveBeenCalledTimes(1);
    });

    it('should not track when element is less than 50% visible', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      const entries = [
        {
          isIntersecting: true,
          intersectionRatio: 0.4,
          target: container,
        } as IntersectionObserverEntry,
      ];

      observerCallback(entries, {} as IntersectionObserver);

      expect(mockAnalyticsClient.track).not.toHaveBeenCalled();
    });

    it('should not track when element is not intersecting', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      const entries = [
        {
          isIntersecting: false,
          intersectionRatio: 0.5,
          target: container,
        } as IntersectionObserverEntry,
      ];

      observerCallback(entries, {} as IntersectionObserver);

      expect(mockAnalyticsClient.track).not.toHaveBeenCalled();
    });

    it('should handle when IntersectionObserver is not available', () => {
      Object.defineProperty(global, 'IntersectionObserver', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');

      expect(() => {
        tracker.setupImpressionTracking(container);
      }).not.toThrow();
    });
  });

  describe('setupFormInteractionTracking()', () => {
    it('should track form_interaction on first focusin event on INPUT', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const input = document.createElement('input');
      form.appendChild(input);

      tracker.setupFormInteractionTracking(form);

      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });

      form.dispatchEvent(event);

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'form_interaction',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: true,
        }
      );
    });

    it('should track form_interaction on SELECT element', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const select = document.createElement('select');
      form.appendChild(select);

      tracker.setupFormInteractionTracking(form);

      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: select });

      form.dispatchEvent(event);

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'form_interaction',
        expect.any(Object)
      );
    });

    it('should track form_interaction on TEXTAREA element', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const textarea = document.createElement('textarea');
      form.appendChild(textarea);

      tracker.setupFormInteractionTracking(form);

      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });

      form.dispatchEvent(event);

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'form_interaction',
        expect.any(Object)
      );
    });

    it('should only fire once', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const input1 = document.createElement('input');
      const input2 = document.createElement('input');
      form.appendChild(input1);
      form.appendChild(input2);

      tracker.setupFormInteractionTracking(form);

      const event1 = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event1, 'target', { value: input1 });
      form.dispatchEvent(event1);

      const event2 = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event2, 'target', { value: input2 });
      form.dispatchEvent(event2);

      expect(mockAnalyticsClient.track).toHaveBeenCalledTimes(1);
    });

    it('should not fire for non-form elements (e.g., div)', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const div = document.createElement('div');
      form.appendChild(div);

      tracker.setupFormInteractionTracking(form);

      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: div });

      form.dispatchEvent(event);

      expect(mockAnalyticsClient.track).not.toHaveBeenCalled();
    });
  });

  describe('setupAbandonmentTracking()', () => {
    it('should track form_abandonment on beforeunload if form was interacted but not submitted', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const input = document.createElement('input');
      form.appendChild(input);

      tracker.setupFormInteractionTracking(form);
      tracker.setupAbandonmentTracking();

      // Interact with form
      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      form.dispatchEvent(event);

      // Trigger beforeunload
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);

      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'form_abandonment',
        {
          event_category: 'newsletter',
          event_label: 'newsletter-123',
          tenant_id: 'tenant-456',
          interaction: true,
        }
      );
    });

    it('should NOT track if form was not interacted', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      tracker.setupAbandonmentTracking();

      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);

      expect(mockAnalyticsClient.track).not.toHaveBeenCalled();
    });

    it('should NOT track if form was submitted', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const input = document.createElement('input');
      form.appendChild(input);

      tracker.setupFormInteractionTracking(form);
      tracker.setupAbandonmentTracking();

      // Interact with form
      const event = new FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      form.dispatchEvent(event);

      // Mark as submitted
      tracker.trackSubscriptionSuccess();

      // Trigger beforeunload
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);

      // Should only have subscription_success, not abandonment
      expect(mockAnalyticsClient.track).toHaveBeenCalledWith(
        'subscription_success',
        expect.any(Object)
      );
      expect(mockAnalyticsClient.track).not.toHaveBeenCalledWith(
        'form_abandonment',
        expect.any(Object)
      );
    });
  });

  describe('destroy()', () => {
    it('should disconnect IntersectionObserver', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      tracker.setupImpressionTracking(container);

      const observer = intersectionObserverMock.mock.results[0].value;

      tracker.destroy();

      expect(observer.disconnect).toHaveBeenCalled();
    });

    it('should remove beforeunload listener', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      tracker.setupAbandonmentTracking();
      tracker.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should remove focusin listener', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const form = document.createElement('form');
      const removeEventListenerSpy = vi.spyOn(form, 'removeEventListener');

      tracker.setupFormInteractionTracking(form);
      tracker.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'focusin',
        expect.any(Function)
      );
    });

    it('should cleanup all references', () => {
      const tracker = new WidgetTracker(
        mockAnalyticsClient,
        'newsletter-123',
        'tenant-456'
      );

      const container = document.createElement('div');
      const form = document.createElement('form');

      tracker.setupImpressionTracking(container);
      tracker.setupFormInteractionTracking(form);
      tracker.setupAbandonmentTracking();

      tracker.destroy();

      // After destroy, calling destroy again should not throw
      expect(() => {
        tracker.destroy();
      }).not.toThrow();
    });
  });
});
