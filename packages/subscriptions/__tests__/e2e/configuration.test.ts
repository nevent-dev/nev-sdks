/**
 * Configuration Variations E2E Integration Tests
 *
 * Tests that the widget correctly renders and behaves under different
 * configuration scenarios: minimal, full, custom themes, locales,
 * GDPR settings, layout directions, and field configurations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createWidget,
  mockFetch,
  mockFetchSuccess,
  getShadowRoot,
  getSubmitButton,
  getStatusMessage,
  fillInput,
  toggleCheckbox,
  submitForm,
  flush,
} from './helpers';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Configuration Variations (E2E)', () => {
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
  // Minimal Config
  // -------------------------------------------------------------------------

  describe('Minimal Configuration', () => {
    it('should render with only newsletterId and tenantId', async () => {
      mockFetchSuccess();

      const container = document.createElement('div');
      container.id = 'minimal-test';
      document.body.appendChild(container);

      const { widget } = createWidget({
        newsletterId: 'nl-minimal',
        tenantId: 'tenant-minimal',
        containerId: 'minimal-test',
      });

      await widget.init();

      const shadow = getShadowRoot(container)!;
      expect(shadow).not.toBeNull();

      const form = shadow.querySelector('form');
      expect(form).not.toBeNull();

      const emailInput = shadow.querySelector('input[name="email"]');
      expect(emailInput).not.toBeNull();

      const gdprCheckbox = shadow.querySelector('.nevent-gdpr-checkbox');
      expect(gdprCheckbox).not.toBeNull();

      const submitButton = getSubmitButton(shadow);
      expect(submitButton).not.toBeNull();

      widget.destroy();
    });

    it('should apply default styles when no styles config provided', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const styles = shadow.querySelectorAll('style');
      expect(styles.length).toBeGreaterThan(0);

      const cssText = Array.from(styles)
        .map((s) => s.textContent)
        .join('');

      // Should contain default primary color
      expect(cssText).toContain('#007bff');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Full Configuration
  // -------------------------------------------------------------------------

  describe('Full Configuration', () => {
    it('should render with all options configured', async () => {
      mockFetch({
        configResponse: {
          title: 'Premium Newsletter',
          subtitle: 'Stay updated with premium content',
          companyName: 'Premium Corp',
          privacyPolicyUrl: 'https://premium.com/privacy',
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email',
              hint: null,
              placeholder: 'Enter email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
            {
              propertyDefinitionId: 'name-prop',
              enabled: true,
              required: true,
              displayOrder: 2,
              displayName: 'Name',
              hint: 'Your full name',
              placeholder: 'Enter name',
              semanticKey: 'firstName',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const onLoad = vi.fn();
      const onSubmit = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const { widget, container } = createWidget({
        newsletterId: 'nl-full',
        tenantId: 'tenant-full',
        locale: 'en',
        analytics: false,
        debug: false,
        resetOnSuccess: true,
        animations: false,
        primaryColor: '#ff6600',
        backgroundColor: '#fafafa',
        borderRadius: 12,
        title: 'Join Our Community',
        subtitle: 'Get exclusive content',
        onLoad,
        onSubmit,
        onSuccess,
        onError,
      });

      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Verify form renders
      expect(shadow.querySelector('form')).not.toBeNull();

      // Verify title renders
      const title = shadow.querySelector('.nevent-title');
      expect(title).not.toBeNull();

      // Verify onLoad was called
      expect(onLoad).toHaveBeenCalledTimes(1);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Custom Theme / Colors
  // -------------------------------------------------------------------------

  describe('Custom Theme and Colors', () => {
    it('should apply custom primaryColor to CSS', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({
        primaryColor: '#e91e63',
      });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('#e91e63');

      widget.destroy();
    });

    it('should apply custom backgroundColor', async () => {
      mockFetch({
        configResponse: {
          styles: {
            global: {
              backgroundColor: '#1a1a2e',
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('#1a1a2e');

      widget.destroy();
    });

    it('should apply custom borderRadius', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({
        borderRadius: 16,
      });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('16px');

      widget.destroy();
    });

    it('should apply custom button styles from server', async () => {
      mockFetch({
        configResponse: {
          styles: {
            button: {
              backgroundColor: '#4CAF50',
              textColor: '#ffffff',
              borderRadius: '20px',
              padding: '16px 32px',
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('#4CAF50');
      expect(cssText).toContain('20px');
      expect(cssText).toContain('16px 32px');

      widget.destroy();
    });

    it('should apply custom input styles from server', async () => {
      mockFetch({
        configResponse: {
          styles: {
            input: {
              backgroundColor: '#f0f0f0',
              borderColor: '#cccccc',
              borderWidth: '2px',
              borderRadius: '8px',
              padding: '14px',
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('#f0f0f0');
      expect(cssText).toContain('#cccccc');
      expect(cssText).toContain('2px');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Custom Locale
  // -------------------------------------------------------------------------

  describe('Custom Locale', () => {
    it('should render with Spanish locale', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'es' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Suscribirse');

      widget.destroy();
    });

    it('should render with English locale', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'en' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Subscribe');

      widget.destroy();
    });

    it('should render with Catalan locale', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'ca' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe("Subscriure's");

      widget.destroy();
    });

    it('should render with Portuguese locale', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'pt' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Subscrever');

      widget.destroy();
    });

    it('should fall back to default locale for unsupported locale', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ locale: 'xx' });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      // Default locale is 'es' -> 'Suscribirse'
      expect(button!.textContent?.trim()).toBe('Suscribirse');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Custom Messages
  // -------------------------------------------------------------------------

  describe('Custom Messages', () => {
    it('should use custom submit button text from messages config', async () => {
      mockFetch({
        configResponse: {
          messages: {
            submit: 'Join Now',
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const button = getSubmitButton(shadow);
      expect(button!.textContent?.trim()).toBe('Join Now');

      widget.destroy();
    });

    it('should use custom success message', async () => {
      mockFetch({
        subscriptionResponse: {
          success: true,
          message: 'Welcome to the club!',
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      toggleCheckbox(shadow, '.nevent-gdpr-checkbox', true);
      submitForm(shadow);

      await vi.advanceTimersByTimeAsync(100);
      await flush();

      const status = getStatusMessage(shadow);
      expect(status.visible).toBe(true);
      expect(status.isSuccess).toBe(true);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Title and Subtitle Visibility
  // -------------------------------------------------------------------------

  describe('Title and Subtitle', () => {
    it('should render title when provided', async () => {
      mockFetch({
        configResponse: {
          title: 'Awesome Newsletter',
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const title = shadow.querySelector('.nevent-title');
      expect(title).not.toBeNull();
      expect(title!.textContent).toContain('Awesome Newsletter');

      widget.destroy();
    });

    it('should hide title when styles.title.hidden is true', async () => {
      mockFetch({
        configResponse: {
          title: 'Hidden Title',
          styles: {
            title: {
              hidden: true,
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const title = shadow.querySelector('.nevent-title');
      expect(title).toBeNull();

      widget.destroy();
    });

    it('should render subtitle when provided', async () => {
      mockFetch({
        configResponse: {
          subtitle: 'Get weekly updates',
        },
      });

      const { widget, container } = createWidget({
        subtitle: 'Get weekly updates',
      });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const subtitle = shadow.querySelector('.nevent-subtitle');
      expect(subtitle).not.toBeNull();

      widget.destroy();
    });

    it('should hide subtitle when styles.subtitle.hidden is true', async () => {
      mockFetch({
        configResponse: {
          subtitle: 'Hidden Subtitle',
          styles: {
            subtitle: {
              hidden: true,
            },
          },
        },
      });

      const { widget, container } = createWidget({
        subtitle: 'Hidden Subtitle',
      });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const subtitle = shadow.querySelector('.nevent-subtitle');
      expect(subtitle).toBeNull();

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // GDPR Configuration
  // -------------------------------------------------------------------------

  describe('GDPR Configuration', () => {
    it('should render GDPR checkbox with company name and privacy link', async () => {
      mockFetch({
        configResponse: {
          companyName: 'TestCo Inc.',
          privacyPolicyUrl: 'https://testco.com/privacy',
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const gdprText = shadow.querySelector('.nevent-gdpr-text');
      expect(gdprText).not.toBeNull();

      const html = gdprText!.innerHTML;
      expect(html).toContain('TestCo Inc.');
      expect(html).toContain('https://testco.com/privacy');

      widget.destroy();
    });

    it('should require GDPR checkbox for form submission', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      fillInput(shadow, 'input[name="email"]', 'test@example.com');
      // Do NOT check GDPR

      submitForm(shadow);
      await vi.advanceTimersByTimeAsync(100);
      await flush();

      // Should show error
      const status = getStatusMessage(shadow);
      expect(status.isError).toBe(true);

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Label Visibility
  // -------------------------------------------------------------------------

  describe('Label Visibility', () => {
    it('should render labels by default for dynamic fields', async () => {
      mockFetch({
        configResponse: {
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email Address',
              hint: null,
              placeholder: 'Enter email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const labels = shadow.querySelectorAll('.nevent-field-label:not(.nevent-sr-only)');
      expect(labels.length).toBeGreaterThan(0);

      widget.destroy();
    });

    it('should hide labels when labelHidden is true', async () => {
      mockFetch({
        configResponse: {
          styles: {
            input: {
              labelHidden: true,
            },
          },
          fieldConfigurations: [
            {
              propertyDefinitionId: 'email-prop',
              enabled: true,
              required: true,
              displayOrder: 1,
              displayName: 'Email Address',
              hint: null,
              placeholder: 'Enter email',
              semanticKey: 'email',
              dataType: 'TEXT',
            },
          ],
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      // In dynamic form mode, labels are omitted entirely when labelHidden is true
      const fieldContainer = shadow.querySelector('[data-field-name="email"]');
      expect(fieldContainer).not.toBeNull();

      // The label should not be rendered inside the dynamic field container
      const label = fieldContainer!.querySelector('.nevent-field-label');
      expect(label).toBeNull();

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Layout Direction
  // -------------------------------------------------------------------------

  describe('Layout Direction', () => {
    it('should render in column layout by default', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      // Default direction is column
      expect(cssText).toContain('column');

      widget.destroy();
    });

    it('should apply row layout when configured', async () => {
      mockFetch({
        configResponse: {
          styles: {
            global: {
              direction: 'row',
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('row');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Layout Elements (Field Ordering and Width)
  // -------------------------------------------------------------------------

  describe('Layout Elements', () => {
    it('should respect layoutElements for field ordering and submit button placement', async () => {
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
              propertyDefinitionId: 'name-prop',
              enabled: true,
              required: false,
              displayOrder: 2,
              displayName: 'Name',
              hint: null,
              placeholder: 'Your name',
              semanticKey: 'firstName',
              dataType: 'TEXT',
            },
          ],
          styles: {
            global: {
              layoutElements: [
                { type: 'field', key: 'email', width: 50, order: 1 },
                { type: 'field', key: 'firstName', width: 50, order: 2 },
                { type: 'legalTerms', key: 'legalTerms', width: 100, order: 3 },
                { type: 'submitButton', key: 'submitButton', width: 100, order: 4 },
              ],
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // All fields should be rendered
      const emailField = shadow.querySelector('[data-field-name="email"]');
      const nameField = shadow.querySelector('[data-field-name="firstName"]');
      const gdpr = shadow.querySelector('.nevent-gdpr');
      const submitBtn = shadow.querySelector('.nevent-submit-button-container');

      expect(emailField).not.toBeNull();
      expect(nameField).not.toBeNull();
      expect(gdpr).not.toBeNull();
      expect(submitBtn).not.toBeNull();

      widget.destroy();
    });

    it('should apply width percentages from layoutElements', async () => {
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
          ],
          styles: {
            global: {
              layoutElements: [
                { type: 'field', key: 'email', width: 75, order: 1 },
                { type: 'submitButton', key: 'submitButton', width: 25, order: 2 },
                { type: 'legalTerms', key: 'legalTerms', width: 100, order: 3 },
              ],
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;

      // Email field should have 75% width
      const emailField = shadow.querySelector('[data-field-name="email"]') as HTMLElement;
      expect(emailField).not.toBeNull();
      expect(emailField.style.width).toContain('75%');

      // Submit button container should have 25% width
      const submitContainer = shadow.querySelector(
        '.nevent-submit-button-container',
      ) as HTMLElement;
      expect(submitContainer).not.toBeNull();
      expect(submitContainer.style.width).toContain('25%');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Custom CSS
  // -------------------------------------------------------------------------

  describe('Custom CSS', () => {
    it('should inject custom CSS into shadow root', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({
        customCSS: '.nevent-submit-button { font-size: 20px; }',
      });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const styles = shadow.querySelectorAll('style');
      const allCSS = Array.from(styles)
        .map((s) => s.textContent)
        .join('');

      expect(allCSS).toContain('font-size: 20px');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Google Fonts Integration
  // -------------------------------------------------------------------------

  describe('Google Fonts', () => {
    it('should inject Google Fonts link into document head', async () => {
      mockFetch({
        configResponse: {
          styles: {
            global: {
              font: {
                family: 'Open Sans',
                type: 'GOOGLE_FONT',
              },
            },
          },
        },
      });

      const { widget } = createWidget();
      await widget.init();

      const fontLink = document.getElementById('nevent-google-fonts') as HTMLLinkElement;
      expect(fontLink).not.toBeNull();
      expect(fontLink.href).toContain('fonts.googleapis.com');
      expect(fontLink.href).toContain('Open+Sans');

      widget.destroy();
    });

    it('should use Google Font family in shadow root CSS', async () => {
      mockFetch({
        configResponse: {
          styles: {
            global: {
              font: {
                family: 'Montserrat',
                type: 'GOOGLE_FONT',
              },
            },
          },
        },
      });

      const { widget, container } = createWidget();
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const cssText = Array.from(shadow.querySelectorAll('style'))
        .map((s) => s.textContent)
        .join('');

      expect(cssText).toContain('Montserrat');

      widget.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // Container Resolution
  // -------------------------------------------------------------------------

  describe('Container Resolution', () => {
    it('should find container by ID', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({
        containerId: 'e2e-test-container',
      });
      await widget.init();

      const hostEl = container.querySelector('[data-nevent-widget="newsletter"]');
      expect(hostEl).not.toBeNull();

      widget.destroy();
    });

    it('should find container by .nevent-widget class when no containerId', async () => {
      mockFetchSuccess();

      const classContainer = document.createElement('div');
      classContainer.className = 'nevent-widget';
      document.body.appendChild(classContainer);

      const { widget } = createWidget({
        containerId: null,
      });
      await widget.init();

      const hostEl = classContainer.querySelector(
        '[data-nevent-widget="newsletter"]',
      );
      expect(hostEl).not.toBeNull();

      widget.destroy();
    });

    it('should report error when container is not found', async () => {
      mockFetchSuccess();
      const onError = vi.fn();

      // Create widget directly (not via createWidget helper which auto-creates container)
      const { NewsletterWidget } = await import('../../src/newsletter-widget');
      const widget = new NewsletterWidget({
        newsletterId: 'nl-e2e-test',
        tenantId: 'tenant-e2e-test',
        containerId: 'non-existent-container-xyz',
        analytics: false,
        debug: false,
        onError,
      });

      await widget.init();

      expect(onError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Animations
  // -------------------------------------------------------------------------

  describe('Animations', () => {
    it('should apply entry animation styles when animations are enabled', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ animations: true });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const form = shadow.querySelector('form') as HTMLElement;

      // With animations, the form should have transition styles
      expect(form.style.transition).toContain('opacity');

      widget.destroy();
    });

    it('should skip animations when disabled', async () => {
      mockFetchSuccess();
      const { widget, container } = createWidget({ animations: false });
      await widget.init();

      const shadow = getShadowRoot(container)!;
      const form = shadow.querySelector('form') as HTMLElement;

      // Without animations, no transition/transform styles should be set
      expect(form.style.opacity).toBe('');
      expect(form.style.transform).toBe('');

      widget.destroy();
    });
  });
});
