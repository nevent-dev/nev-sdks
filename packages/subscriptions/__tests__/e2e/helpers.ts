/**
 * E2E Integration Test Helpers
 *
 * Shared utilities for creating widgets, mocking fetch, and simulating
 * user interactions within the Shadow DOM environment.
 */
import { vi } from 'vitest';
import { NewsletterWidget } from '../../src/newsletter-widget';
import type { NewsletterConfig, ServerWidgetConfig } from '../../src/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for configuring mock fetch responses */
export interface MockFetchOptions {
  /** Server widget config response body */
  configResponse?: Partial<ServerWidgetConfig>;
  /** Whether the config endpoint returns ok */
  configOk?: boolean;
  /** HTTP status for the config endpoint */
  configStatus?: number;
  /**
   * Subscription endpoint response data (will be wrapped in ApiResponse format).
   * This is the inner `data` field of `ApiResponse<SubscriptionResponse>`.
   */
  subscriptionData?: Record<string, unknown>;
  /** Whether the subscription endpoint returns ok */
  subscriptionOk?: boolean;
  /** HTTP status for the subscription endpoint */
  subscriptionStatus?: number;
  /** If set, the subscription endpoint rejects with this error */
  subscriptionError?: Error;
  /** Delay in ms before resolving the subscription request */
  subscriptionDelay?: number;
}

// ---------------------------------------------------------------------------
// Default server config
// ---------------------------------------------------------------------------

/** Default server widget config for tests */
const DEFAULT_SERVER_CONFIG: ServerWidgetConfig = {
  title: 'Test Newsletter',
  companyName: 'TestCo',
  privacyPolicyUrl: 'https://example.com/privacy',
  fieldConfigurations: [
    {
      propertyDefinitionId: 'email-prop-id',
      enabled: true,
      required: true,
      displayOrder: 1,
      displayName: 'Email',
      hint: null,
      placeholder: 'Enter your email',
      semanticKey: 'email',
      dataType: 'TEXT',
    },
  ],
};

// ---------------------------------------------------------------------------
// Widget Factory
// ---------------------------------------------------------------------------

/**
 * Creates a NewsletterWidget with sensible defaults for E2E testing.
 *
 * Automatically creates a container element in the DOM if one doesn't
 * exist with the given containerId.
 *
 * @param overrides - Config overrides to apply on top of defaults
 * @returns Object with widget instance and container reference
 */
export function createWidget(overrides: Partial<NewsletterConfig> = {}): {
  widget: NewsletterWidget;
  container: HTMLDivElement;
} {
  const containerId = overrides.containerId || 'e2e-test-container';

  // Create container if it doesn't exist
  let container = document.getElementById(containerId) as HTMLDivElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }

  const config: NewsletterConfig = {
    newsletterId: 'nl-e2e-test',
    tenantId: 'tenant-e2e-test',
    containerId,
    analytics: false,
    debug: false,
    locale: 'en',
    animations: false,
    ...overrides,
  };

  const widget = new NewsletterWidget(config);
  return { widget, container };
}

// ---------------------------------------------------------------------------
// Fetch Mocking
// ---------------------------------------------------------------------------

/**
 * Sets up a global fetch mock that routes requests to different handlers
 * based on URL patterns (config endpoint vs subscription endpoint).
 *
 * @param options - Options for configuring mock responses
 * @returns The mock function for assertions
 */
export function mockFetch(
  options: MockFetchOptions = {}
): ReturnType<typeof vi.fn> {
  const {
    configResponse = {},
    configOk = true,
    configStatus = 200,
    subscriptionData = { success: true, message: 'Subscription successful!' },
    subscriptionOk = true,
    subscriptionStatus = 200,
    subscriptionError,
    subscriptionDelay = 0,
  } = options;

  const serverConfig = { ...DEFAULT_SERVER_CONFIG, ...configResponse };

  // Wrap the subscription data in the ApiResponse<T> envelope that
  // HttpClient expects from the fetch JSON body.
  const apiResponse = subscriptionOk
    ? { data: subscriptionData, success: true }
    : {
        message:
          (subscriptionData as Record<string, unknown>).message || 'Error',
        status: subscriptionStatus,
      };

  const mockFn = vi.fn().mockImplementation((url: string) => {
    const urlStr = typeof url === 'string' ? url : String(url);

    // Route: Widget config endpoint
    if (urlStr.includes('/public/widget/') && urlStr.includes('/config')) {
      return Promise.resolve({
        ok: configOk,
        status: configStatus,
        json: () => Promise.resolve(serverConfig),
      });
    }

    // Route: Subscription endpoint
    if (urlStr.includes('/subscribe')) {
      if (subscriptionError) {
        return Promise.reject(subscriptionError);
      }

      const response = {
        ok: subscriptionOk,
        status: subscriptionStatus,
        json: () => Promise.resolve(apiResponse),
      };

      if (subscriptionDelay > 0) {
        return new Promise((resolve) =>
          setTimeout(() => resolve(response), subscriptionDelay)
        );
      }

      return Promise.resolve(response);
    }

    // Default: analytics or other endpoints
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });

  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/**
 * Sets up fetch mock for a successful subscription response.
 *
 * @param data - The inner subscription data (will be wrapped in ApiResponse envelope)
 * @returns The mock function
 */
export function mockFetchSuccess(
  data: Record<string, unknown> = {
    success: true,
    message: 'Subscription successful!',
  }
): ReturnType<typeof vi.fn> {
  return mockFetch({ subscriptionData: data });
}

/**
 * Sets up fetch mock for a failed subscription response.
 *
 * @param status - HTTP status code for the subscription endpoint
 * @param body - Response body for the subscription endpoint
 * @returns The mock function
 */
export function mockFetchError(
  status: number,
  body: Record<string, unknown> = { message: 'Server error' }
): ReturnType<typeof vi.fn> {
  return mockFetch({
    subscriptionOk: false,
    subscriptionStatus: status,
    subscriptionData: body,
  });
}

// ---------------------------------------------------------------------------
// Shadow DOM Interaction Helpers
// ---------------------------------------------------------------------------

/**
 * Gets the shadow root from the widget host element inside a container.
 *
 * @param container - The container element
 * @returns The ShadowRoot or null
 */
export function getShadowRoot(container: HTMLElement): ShadowRoot | null {
  const hostEl = container.querySelector(
    '[data-nevent-widget="newsletter"]'
  ) as HTMLElement | null;
  return hostEl?.shadowRoot ?? null;
}

/**
 * Fills an input field inside the shadow root by simulating user typing.
 *
 * Sets the input value and dispatches input + change events to trigger
 * any reactive handlers.
 *
 * @param shadowRoot - The shadow root containing the input
 * @param selector - CSS selector for the input element
 * @param value - The value to set
 * @returns The input element, or null if not found
 */
export function fillInput(
  shadowRoot: ShadowRoot,
  selector: string,
  value: string
): HTMLInputElement | null {
  const input = shadowRoot.querySelector(selector) as HTMLInputElement | null;
  if (!input) return null;

  // Focus the input
  input.focus();
  input.dispatchEvent(new Event('focus', { bubbles: true }));

  // Set value and dispatch events to simulate user typing
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur to trigger validation state
  input.blur();
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  return input;
}

/**
 * Clicks an element inside the shadow root.
 *
 * @param shadowRoot - The shadow root containing the element
 * @param selector - CSS selector for the element to click
 * @returns The clicked element, or null if not found
 */
export function clickElement(
  shadowRoot: ShadowRoot,
  selector: string
): HTMLElement | null {
  const element = shadowRoot.querySelector(selector) as HTMLElement | null;
  if (!element) return null;

  element.click();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  return element;
}

/**
 * Toggles a checkbox inside the shadow root.
 *
 * @param shadowRoot - The shadow root containing the checkbox
 * @param selector - CSS selector for the checkbox
 * @param checked - The desired checked state
 * @returns The checkbox element, or null if not found
 */
export function toggleCheckbox(
  shadowRoot: ShadowRoot,
  selector: string,
  checked: boolean
): HTMLInputElement | null {
  const checkbox = shadowRoot.querySelector(
    selector
  ) as HTMLInputElement | null;
  if (!checkbox) return null;

  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  checkbox.dispatchEvent(new Event('input', { bubbles: true }));

  return checkbox;
}

/**
 * Submits the form inside the shadow root by dispatching a submit event.
 *
 * @param shadowRoot - The shadow root containing the form
 * @returns The form element, or null if not found
 */
export function submitForm(shadowRoot: ShadowRoot): HTMLFormElement | null {
  const form = shadowRoot.querySelector('form') as HTMLFormElement | null;
  if (!form) return null;

  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  return form;
}

// ---------------------------------------------------------------------------
// Wait Utilities
// ---------------------------------------------------------------------------

/**
 * Waits for a condition to become true, polling at regular intervals.
 *
 * @param condition - Function that returns true when the condition is met
 * @param timeout - Maximum time to wait in ms (default: 3000)
 * @param interval - Polling interval in ms (default: 50)
 * @returns Promise that resolves when condition is met or rejects on timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 3000,
  interval = 50
): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) {
        resolve();
        return;
      }

      if (Date.now() - start > timeout) {
        reject(new Error(`waitFor timed out after ${timeout}ms`));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}

/**
 * Flushes all pending microtasks and timers.
 * Useful after form submission to let async handlers complete.
 *
 * @param ms - Additional delay in ms (default: 0)
 */
export async function flush(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  // Flush microtask queue
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Query Helpers
// ---------------------------------------------------------------------------

/**
 * Queries for the status message element inside the shadow root and
 * returns its text content and CSS classes.
 *
 * @param shadowRoot - The shadow root
 * @returns Object with text, visible flag, and class info
 */
export function getStatusMessage(shadowRoot: ShadowRoot): {
  text: string;
  visible: boolean;
  isSuccess: boolean;
  isError: boolean;
} {
  const status = shadowRoot.querySelector(
    '.nevent-status-message'
  ) as HTMLElement | null;

  if (!status) {
    return { text: '', visible: false, isSuccess: false, isError: false };
  }

  return {
    text: status.textContent?.trim() || '',
    visible: status.style.display !== 'none',
    isSuccess: status.classList.contains('success'),
    isError: status.classList.contains('error'),
  };
}

/**
 * Gets the submit button element from the shadow root.
 *
 * @param shadowRoot - The shadow root
 * @returns The button element or null
 */
export function getSubmitButton(
  shadowRoot: ShadowRoot
): HTMLButtonElement | null {
  return shadowRoot.querySelector(
    '.nevent-submit-button'
  ) as HTMLButtonElement | null;
}
