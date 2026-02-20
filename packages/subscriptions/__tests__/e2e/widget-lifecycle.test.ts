/**
 * Widget Lifecycle E2E Integration Tests
 *
 * Tests the full widget lifecycle from initialization through destruction,
 * including Shadow DOM creation, form rendering, submission, success/error
 * states, and proper cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWidget,
  mockFetch,
  mockFetchSuccess,
  mockFetchError,
  getShadowRoot,
  fillInput,
  toggleCheckbox,
  submitForm,
  flush,
  getStatusMessage,
  getSubmitButton,
} from './helpers';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Widget Lifecycle (E2E)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should initialize widget with minimal config and create Shadow DOM', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      await widget.init();

      // Verify host element exists
      const hostEl = container.querySelector('[data-nevent-widget="newsletter"]');
      expect(hostEl).not.toBeNull();

      // Verify Shadow DOM is attached
      const shadow = getShadowRoot(container);
      expect(shadow).not.toBeNull();

      widget.destroy();
    });

    it('should render form inside Shadow DOM with all expected elements', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Verify form exists
      const form = shadow.querySelector('form');
      expect(form).not.toBeNull();
      expect(form!.getAttribute('role')).toBe('form');

      // Verify styles are injected inside shadow root
      const styles = shadow.querySelectorAll('style');
      expect(styles.length).toBeGreaterThan(0);

      // Verify submit button exists
      const submitButton = getSubmitButton(shadow);
      expect(submitButton).not.toBeNull();

      // Verify GDPR checkbox exists
      const gdprCheckbox = shadow.querySelector('.nevent-gdpr-checkbox');
      expect(gdprCheckbox).not.toBeNull();

      // Verify status message container exists
      const statusEl = shadow.querySelector('.nevent-status-message');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.getAttribute('aria-live')).toBe('polite');

      widget.destroy();
    });

    it('should render email field from server field configurations', async () => {
      mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-id',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email Address',
              hint: null,
              placeholder: 'you@example.com',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const emailInput = shadow.querySelector('input[name="email"]') as HTMLInputElement;
      expect(emailInput).not.toBeNull();
      // dataType 'TEXT' maps to HTML input type 'text'; the widget detects email
      // by fieldName/semanticKey rather than HTML input type
      expect(emailInput.type).toBe('text');

      widget.destroy();
    });

    it('should call onLoad callback after successful initialization', async () => {
      mockFetchSuccess();
      const onLoad = vi.fn();
      const { widget } = createWidget({ onLoad });

      await widget.init();

      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(onLoad).toHaveBeenCalledWith(widget);

      widget.destroy();
    });

    it('should fall back to defaults when config endpoint fails', async () => {
      mockFetch({ configOk: false, configStatus: 500 });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      const form = shadow.querySelector('form');
      expect(form).not.toBeNull();

      // Should still render at least an email field
      const emailInput = shadow.querySelector('input[name="email"]');
      expect(emailInput).not.toBeNull();

      widget.destroy();
    });

    it('should fall back to defaults when config endpoint throws network error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      );
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      // Widget should still render with default fields
      const form = shadow.querySelector('form');
      expect(form).not.toBeNull();

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Form Submission - Success
  // -------------------------------------------------------------------------

  describe('Form Submission - Success', () => {
    it('should show success message after valid form submission', async () => {
      const fetchMock = mockFetchSuccess({
        success: true,
        message: 'You are now subscribed!',
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Fill email
      fillInput(shadow, 'input[name="email"]', 'test@example.com');

      // Accept GDPR
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      // Submit form
      submitForm(shadow);

      // Wait for async submission to complete
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Verify subscription API was called
      const subscriptionCall = fetchMock.mock.calls.find(
        (call: unknown[]) => String(call[0]).includes('/subscribe'),
      );
      expect(subscriptionCall).toBeDefined();

      // Verify success state
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });

    it('should call onSubmit callback with subscription data', async () => {
      mockFetchSuccess();
      const onSubmit = vi.fn();
      const { widget, container } = createWidget({ onSubmit });

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      expect(onSubmit).toHaveBeenCalledTimes(1);
      const submitData = onSubmit.mock.calls[0][0];
      expect(submitData.email).toBe('test@example.com');
      expect(submitData.consent).toBeDefined();
      expect(submitData.consent.marketing).toBe(true);

      widget.destroy();
    });

    it('should call onSuccess callback with API response', async () => {
      mockFetchSuccess({
        success: true,
        message: 'Subscribed!',
        subscriptionId: 'sub-123',
      });

      const onSuccess = vi.fn();
      const { widget, container } = createWidget({ onSuccess });

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      expect(onSuccess).toHaveBeenCalledTimes(1);

      widget.destroy();
    });

    it('should disable submit button during submission', async () => {
      // Add a delay to the subscription response so we can check the loading state
      mockFetch({ subscriptionDelay: 500 });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      // Check button is disabled during loading
      await vi.advanceTimersByTimeAsync(50);
      await flush();

      const button = getSubmitButton(shadow);
      expect(button?.disabled).toBe(true);

      // Let the response complete
      await vi.advanceTimersByTimeAsync(600);
      await flush();

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Form Submission - Error
  // -------------------------------------------------------------------------

  describe('Form Submission - Error', () => {
    it('should show error message on API failure', async () => {
      // Use 422 (non-retryable) to avoid retry timing complexity
      mockFetchError(422, { message: 'Unprocessable Entity' });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      // Advance enough for the async submission to complete (not 5s auto-hide)
      await vi.advanceTimersByTimeAsync(500);
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });

    it('should show error for invalid email', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'not-an-email');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });

    it('should show error when GDPR checkbox is not checked', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      // Do NOT check GDPR
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });

    it('should display error and show error state on submission failure', async () => {
      // Use 422 status (not retryable by HttpClient) for instant error
      mockFetchError(422, { message: 'Validation failed' });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      // Advance enough for async submission (not 5s auto-hide)
      await vi.advanceTimersByTimeAsync(500);
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      // Verify error message is displayed in the status element
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });

    it('should re-enable submit button after error', async () => {
      // Use 422 status (not retryable) for instant error
      mockFetchError(422, { message: 'Server error' });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      // Advance enough for async submission (not 5s auto-hide)
      await vi.advanceTimersByTimeAsync(500);
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      const button = getSubmitButton(shadow);
      expect(button?.disabled).toBe(false);

      widget.destroy();
    });

    it('should auto-hide error message after 5 seconds', async () => {
      // Use 422 status (not retryable) for instant error
      mockFetchError(422, { message: 'Server error' });
      const { widget, container } = createWidget();

      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      // Advance enough for async submission (not 5s auto-hide)
      await vi.advanceTimersByTimeAsync(500);
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      // Error should be visible initially
      let status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      // Advance 5+ seconds to auto-hide
      await vi.advanceTimersByTimeAsync(5100);

      status = getStatusMessage(shadow);
      expect(status.visible).toBe(false);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Destroy / Cleanup
  // -------------------------------------------------------------------------

  describe('Destroy and Cleanup', () => {
    it('should remove host element from DOM on destroy', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      await widget.init();

      expect(
        container.querySelector('[data-nevent-widget="newsletter"]'),
      ).not.toBeNull();

      widget.destroy();

      expect(
        container.querySelector('[data-nevent-widget="newsletter"]'),
      ).toBeNull();
    });

    it('should remove injected head elements on destroy', async () => {
      mockFetch({
        configResponse: {
          styles: {
            global: {
              font: {
                family: 'Roboto',
                type: 'GOOGLE_FONT',
              },
            },
          },
        },
      });

      const { widget } = createWidget();
      await widget.init();

      // Google Fonts link should be in head
      const fontLink = document.getElementById('nevent-google-fonts');
      expect(fontLink).not.toBeNull();

      widget.destroy();

      // Google Fonts link should be removed
      const fontLinkAfter = document.getElementById('nevent-google-fonts');
      expect(fontLinkAfter).toBeNull();
    });

    it('should be safe to call destroy multiple times', async () => {
      mockFetchSuccess();
      const { widget } = createWidget();

      await widget.init();

      widget.destroy();
      expect(() => widget.destroy()).not.toThrow();
      expect(() => widget.destroy()).not.toThrow();
    });

    it('should prevent re-initialization after destroy', async () => {
      mockFetchSuccess();
      const { widget } = createWidget();

      await widget.init();
      widget.destroy();

      // Re-init should return undefined (error boundary catches it)
      const result = await widget.init();
      expect(result).toBeUndefined();
    });

    it('should not leak DOM elements after init-destroy cycle', async () => {
      mockFetchSuccess();

      const initialChildCount = document.body.children.length;

      const { widget, container } = createWidget();
      await widget.init();
      widget.destroy();

      // Remove the container we created
      container.remove();

      // No extra elements should remain
      expect(document.body.children.length).toBe(initialChildCount);
    });

    it('should clean up event listeners on destroy', async () => {
      mockFetchSuccess();

      const addEventSpy = vi.spyOn(window, 'addEventListener');
      const removeEventSpy = vi.spyOn(window, 'removeEventListener');

      const { widget } = createWidget();
      await widget.init();

      // Online/offline handlers should have been added
      const onlineAdds = addEventSpy.mock.calls.filter(
        (call) => call[0] === 'online',
      );
      const offlineAdds = addEventSpy.mock.calls.filter(
        (call) => call[0] === 'offline',
      );
      expect(onlineAdds.length).toBeGreaterThan(0);
      expect(offlineAdds.length).toBeGreaterThan(0);

      widget.destroy();

      // Handlers should have been removed
      const onlineRemoves = removeEventSpy.mock.calls.filter(
        (call) => call[0] === 'online',
      );
      const offlineRemoves = removeEventSpy.mock.calls.filter(
        (call) => call[0] === 'offline',
      );
      expect(onlineRemoves.length).toBeGreaterThan(0);
      expect(offlineRemoves.length).toBeGreaterThan(0);

      addEventSpy.mockRestore();
      removeEventSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Full Lifecycle Cycle
  // -------------------------------------------------------------------------

  describe('Full Lifecycle Cycle', () => {
    it('should support complete init -> interact -> submit -> success -> destroy cycle', async () => {
      const fetchMock = mockFetchSuccess({
        success: true,
        message: 'Welcome aboard!',
      });

      const onLoad = vi.fn();
      const onSubmit = vi.fn();
      const onSuccess = vi.fn();

      const { widget, container } = createWidget({
        onLoad,
        onSubmit,
        onSuccess,
      });

      // 1. Initialize
      await widget.init();
      expect(onLoad).toHaveBeenCalledTimes(1);

      const shadow = getShadowRoot(container)!;
      expect(shadow).not.toBeNull();

      // 2. Fill form
      fillInput(shadow, 'input[name="email"]', 'user@company.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      // 3. Submit
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // 4. Verify API call
      const subCall = fetchMock.mock.calls.find(
        (call: unknown[]) => String(call[0]).includes('/subscribe'),
      );
      expect(subCall).toBeDefined();

      // 5. Verify callbacks
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      // 6. Verify success state
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      // 7. Destroy
      widget.destroy();

      // 8. Verify cleanup
      expect(
        container.querySelector('[data-nevent-widget="newsletter"]'),
      ).toBeNull();
    });
  });
});
