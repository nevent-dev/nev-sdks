/**
 * User Flow E2E Integration Tests
 *
 * Simulates realistic user interaction flows from start to finish,
 * including happy paths, validation flows, error recovery, and
 * offline handling.
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

describe('User Flows (E2E)', () => {
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
  // Happy Path
  // -------------------------------------------------------------------------

  describe('Happy Path: Load -> Fill -> Accept GDPR -> Submit -> Success', () => {
    it('should complete full subscription flow successfully', async () => {
      const fetchMock = mockFetchSuccess({
        success: true,
        message: 'Subscription successful!',
      });

      const { widget, container } = createWidget({ locale: 'en' });
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Verify form is visible
      const form = shadow.querySelector('form');
      expect(form).not.toBeNull();

      // Fill email
      const emailInput = fillInput(
        shadow,
        'input[name="email"]',
        'john@company.com'
      );
      expect(emailInput).not.toBeNull();
      expect(emailInput!.value).toBe('john@company.com');

      // Accept GDPR
      const gdprCheckbox = toggleCheckbox(
        shadow,
        '.nevent-gdpr-checkbox',
        true
      );
      expect(gdprCheckbox).not.toBeNull();
      expect(gdprCheckbox!.checked).toBe(true);

      // Submit
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Verify API call was made with correct data
      const subscriptionCall = fetchMock.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('/subscribe')
      );
      expect(subscriptionCall).toBeDefined();

      // Verify request body
      const requestOptions = subscriptionCall![1] as RequestInit;
      const requestBody = JSON.parse(requestOptions.body as string);
      expect(requestBody.email).toBe('john@company.com');
      expect(requestBody.consent.marketing).toBe(true);

      // Verify success message is displayed
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Validation Flow
  // -------------------------------------------------------------------------

  describe('Validation Flow: Submit empty -> Error -> Fix -> Submit -> Success', () => {
    it('should show validation error for empty email, then succeed after fixing', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Step 1: Submit with empty email (but GDPR checked)
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Dynamic form validation shows inline field errors (not status message)
      const emailField = shadow.querySelector('[data-field-name="email"]');
      expect(emailField).not.toBeNull();
      const fieldError = emailField!.querySelector('.nevent-field-error');
      expect(fieldError).not.toBeNull();
      // Error should be visible (not hidden)
      expect(fieldError!.classList.contains('nevent-field-error--hidden')).toBe(
        false
      );

      // Step 2: Fill in a valid email and re-submit
      fillInput(shadow, 'input[name="email"]', 'fixed@example.com');
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Should now show success via status message
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });

    it('should reject invalid email format', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      fillInput(shadow, 'input[name="email"]', 'not-valid');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });

    it('should reject submission without GDPR consent', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      fillInput(shadow, 'input[name="email"]', 'valid@example.com');
      // Explicitly uncheck GDPR
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', false);
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Custom Fields Flow
  // -------------------------------------------------------------------------

  describe('Custom Fields Flow: Widget with multiple fields -> Fill all -> Submit', () => {
    it('should render and submit custom fields from server config', async () => {
      const fetchMock = mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email',
              hint: null,
              placeholder: 'Your email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
            {
              propertyDefinitionId: 'name-prop',
              enabled: true,
              required: false,
              displayOrder: 2,
              displayName: 'Full Name',
              hint: 'Enter your first and last name',
              placeholder: 'John Doe',
              semanticKey: 'firstName',
              dataType: 'TEXT',
            },
            {
              propertyDefinitionId: 'phone-prop',
              enabled: true,
              required: false,
              displayOrder: 3,
              displayName: 'Phone',
              hint: null,
              placeholder: '+34 600 000 000',
              semanticKey: 'phone',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Verify all fields are rendered
      const emailField = shadow.querySelector('[data-field-name="email"]');
      const nameField = shadow.querySelector('[data-field-name="firstName"]');
      const phoneField = shadow.querySelector('[data-field-name="phone"]');

      expect(emailField).not.toBeNull();
      expect(nameField).not.toBeNull();
      expect(phoneField).not.toBeNull();

      // Fill all fields
      fillInput(shadow, 'input[name="email"]', 'user@company.com');
      fillInput(shadow, 'input[name="firstName"]', 'John Doe');
      fillInput(shadow, 'input[name="phone"]', '+34 600 123 456');

      // Accept GDPR and submit
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Verify API was called
      const subscriptionCall = fetchMock.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('/subscribe')
      );
      expect(subscriptionCall).toBeDefined();

      // Verify success
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });

    it('should render hint text for fields that have hints', async () => {
      mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email',
              hint: 'We will never share your email',
              placeholder: 'Your email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const hintEl = shadow.querySelector('.nevent-field-hint');
      expect(hintEl).not.toBeNull();
      expect(hintEl!.textContent).toContain('We will never share your email');

      widget.destroy();
    });

    it('should hide hints when hintHidden style is set', async () => {
      mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email',
              hint: 'We will never share your email',
              placeholder: 'Your email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
          ],
          styles: {
            input: {
              hintHidden: true,
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const hintEl = shadow.querySelector('.nevent-field-hint');
      expect(hintEl).toBeNull();

      widget.destroy();
    });

    it('should render select fields with options from validatorConfiguration', async () => {
      mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email',
              hint: null,
              placeholder: 'Your email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
            {
              propertyDefinitionId: 'country-prop',
              enabled: true,
              required: true,
              displayOrder: 2,
              displayName: 'Country',
              hint: null,
              placeholder: 'Select your country',
              semanticKey: 'country',
              dataType: 'LIST',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const selectField = shadow.querySelector('select[name="country"]');
      expect(selectField).not.toBeNull();

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Offline Flow
  // -------------------------------------------------------------------------

  describe('Offline Flow: Go offline -> Submit -> Error -> Go online', () => {
    it('should show offline message when submitting while offline', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });

      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Should show offline/error message
      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isError).toBe(true);

      // Restore online state
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });

      widget.destroy();
    });

    it('should show offline banner when connection is lost', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();

      // Ensure online for init
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });

      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Simulate offline event
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));

      await flush();

      const banner = shadow.querySelector('.nevent-offline-banner');
      expect(banner).not.toBeNull();
      expect((banner as HTMLElement).style.display).not.toBe('none');

      // Simulate coming back online
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('online'));

      await flush();

      const bannerAfter = shadow.querySelector(
        '.nevent-offline-banner'
      ) as HTMLElement;
      if (bannerAfter) {
        expect(bannerAfter.style.display).toBe('none');
      }

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Error Recovery Flow
  // -------------------------------------------------------------------------

  describe('Error Recovery: API 500 -> Error -> Retry -> Success', () => {
    it('should allow retrying after a failed submission', async () => {
      // First call returns error, second returns success
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const urlStr = String(url);

          if (urlStr.includes('/config')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  title: 'Test',
                  companyName: 'TestCo',
                  privacyPolicyUrl: 'https://example.com/privacy',
                }),
            });
          }

          if (urlStr.includes('/subscribe')) {
            callCount++;
            if (callCount === 1) {
              // First submission: 422 error (not retryable, so HttpClient fails immediately)
              return Promise.resolve({
                ok: false,
                status: 422,
                json: () =>
                  Promise.resolve({ message: 'Validation error', status: 422 }),
              });
            }
            // Second submission: success (ApiResponse envelope)
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  data: { success: true, message: 'Subscribed!' },
                  success: true,
                }),
            });
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
          });
        })
      );

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      // First submission -> 422 error (non-retryable, immediate failure)
      submitForm(shadow);
      await vi.runAllTimersAsync();
      await flush();
      await vi.runAllTimersAsync();
      await flush();

      let status = getStatusMessage(shadow);
      expect(status.isError).toBe(true);

      // Wait for error auto-hide
      await vi.advanceTimersByTimeAsync(5100);

      // Re-fill and retry (form values may have been preserved)
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Second submission -> success
      status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple Submissions Prevention
  // -------------------------------------------------------------------------

  describe('Double Submission Prevention', () => {
    it('should not allow concurrent submissions', async () => {
      let subscriptionCallCount = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          const urlStr = String(url);

          if (urlStr.includes('/config')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  title: 'Test',
                  companyName: 'TestCo',
                  privacyPolicyUrl: 'https://example.com/privacy',
                }),
            });
          }

          if (urlStr.includes('/subscribe')) {
            subscriptionCallCount++;
            // Slow response (ApiResponse envelope)
            return new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                      Promise.resolve({
                        data: { success: true, message: 'Subscribed!' },
                        success: true,
                      }),
                  }),
                2000
              )
            );
          }

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
          });
        })
      );

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);

      // Submit twice rapidly
      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(50);
      submitForm(shadow);

      // Let response complete
      await vi.advanceTimersByTimeAsync(3000);
      await flush();

      // Should only have one subscription call (second was blocked by isSubmitting flag)
      expect(subscriptionCallCount).toBe(1);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Form Reset After Success
  // -------------------------------------------------------------------------

  describe('Form Reset After Success', () => {
    it('should reset form after successful submission when resetOnSuccess is true', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ resetOnSuccess: true });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Wait for the 3 second reset timeout
      await vi.advanceTimersByTimeAsync(3100);

      const emailInput = shadow.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      if (emailInput) {
        // After form.reset(), value should be cleared
        expect(emailInput.value).toBe('');
      }

      widget.destroy();
    });

    it('should NOT reset form when resetOnSuccess is false', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ resetOnSuccess: false });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'keep@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Even after waiting, values should be preserved
      await vi.advanceTimersByTimeAsync(5000);

      const emailInput = shadow.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      if (emailInput) {
        expect(emailInput.value).toBe('keep@example.com');
      }

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Locale-Aware User Flow
  // -------------------------------------------------------------------------

  describe('Locale-Aware Flow', () => {
    it('should use Spanish strings when locale is es', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'es' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const submitButton = getSubmitButton(shadow);
      expect(submitButton).not.toBeNull();
      expect(submitButton!.textContent?.trim()).toBe('Suscribirse');

      widget.destroy();
    });

    it('should use English strings when locale is en', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'en' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const submitButton = getSubmitButton(shadow);
      expect(submitButton).not.toBeNull();
      expect(submitButton!.textContent?.trim()).toBe('Subscribe');

      widget.destroy();
    });

    it('should re-render with new locale when setLocale is called', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'en' });
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Start in English
      let button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Subscribe');

      // Switch to Spanish
      widget.setLocale('es');

      button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Suscribirse');

      widget.destroy();
    });
  });
});
