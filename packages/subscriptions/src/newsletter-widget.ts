import { EmailValidator, HttpClient, Logger } from '@nevent/core';
import type {
  CustomFont,
  FieldConfiguration,
  FontsResponse,
  NewsletterConfig,
  ServerWidgetConfig,
  SubscriptionData,
  SubscriptionResponse,
} from './types';
import { FormRenderer } from './newsletter/form-renderer';
import { StyleManager } from './newsletter/styles/StyleManager';

/**
 * Nevent Newsletter Subscription Widget
 *
 * A fully-featured newsletter subscription widget with:
 * - GDPR compliance
 * - Customizable layouts (column/row)
 * - Google Fonts and custom font support
 * - Responsive design
 * - Form validation
 * - Error handling
 * - Analytics tracking
 *
 * @example
 * ```typescript
 * const widget = new NewsletterWidget({
 *   newsletterId: 'newsletter-123',
 *   tenantId: 'tenant-456',
 *   containerId: 'newsletter-container',
 * });
 *
 * await widget.init();
 * ```
 */
export class NewsletterWidget {
  private config: Required<NewsletterConfig>;
  private container: HTMLElement | null = null;
  private form: HTMLFormElement | null = null;
  private isSubmitting = false;
  private loadedFontSignature: string | null = null;
  private loadedCustomFonts = new Set<string>();
  private httpClient: HttpClient | null = null;
  private logger: Logger;
  private formRenderer: FormRenderer | null = null;
  private fieldConfigurations: FieldConfiguration[] = [];
  private styleManager: StyleManager | null = null;

  /**
   * Creates a new newsletter widget instance
   *
   * @param config - Widget configuration
   * @throws {Error} When required config options are missing
   */
  constructor(config: NewsletterConfig) {
    if (!config.newsletterId || !config.tenantId) {
      throw new Error(
        'NewsletterWidget: newsletterId and tenantId are required'
      );
    }

    this.config = this.mergeConfig(config);
    this.logger = new Logger('[NeventWidget]', this.config.debug);
  }

  /**
   * Initializes the widget
   *
   * Loads configuration, fonts, renders UI, and sets up event handlers
   *
   * @returns Promise resolving to widget instance
   */
  async init(): Promise<this> {
    try {
      this.findContainer();
      await this.loadWidgetConfig();
      this.initHttpClient();
      this.loadGoogleFonts();
      await this.loadCustomFonts();
      this.render();
      this.attachEvents();
      this.trackEvent('widget_loaded');

      if (this.config.onLoad) {
        this.config.onLoad(this);
      }

      this.logger.info('Widget initialized successfully');
      return this;
    } catch (error) {
      this.logger.error('Failed to initialize widget:', error);
      throw error;
    }
  }

  /**
   * Merges user config with defaults
   */
  private mergeConfig(config: NewsletterConfig): Required<NewsletterConfig> {
    const defaults: Required<NewsletterConfig> = {
      newsletterId: config.newsletterId,
      tenantId: config.tenantId,
      apiUrl: 'https://api.nevent.es',
      containerId: null,
      theme: 'default',
      primaryColor: '#007bff',
      backgroundColor: '#ffffff',
      borderRadius: 8,
      fields: {
        email: { enabled: true, required: true, placeholder: 'Tu email' },
        firstName: {
          enabled: true,
          required: false,
          placeholder: 'Tu nombre',
        },
        lastName: {
          enabled: false,
          required: false,
          placeholder: 'Apellidos',
        },
        postalCode: {
          enabled: false,
          required: false,
          placeholder: 'Código postal',
        },
        birthDate: {
          enabled: false,
          required: false,
          placeholder: 'Fecha de nacimiento',
        },
      },
      messages: {
        submit: 'Suscribirse',
        loading: 'Enviando...',
        success:
          '¡Suscripción exitosa! Ya estás recibiendo nuestras comunicaciones.',
        error: 'Ha ocurrido un error. Inténtalo de nuevo.',
        alreadySubscribed: 'Este email ya está suscrito.',
        invalidEmail: 'Por favor, introduce un email válido.',
        gdprText:
          'Acepto el tratamiento de mis datos personales para recibir comunicaciones comerciales y promociones relacionadas con [COMPANY_NAME], según la [PRIVACY_POLICY_LINK].',
        privacyText: 'Política de Privacidad',
      },
      analytics: true,
      resetOnSuccess: true,
      showLabels: false,
      animations: true,
      debug: false,
      styles: null,
      customCSS: '',
      token: '',
      companyName: '',
      privacyPolicyUrl: '',
      title: '',
      subtitle: '',
      onLoad: undefined,
      onSubmit: undefined,
      onSuccess: undefined,
      onError: undefined,
    };

    return this.deepMerge(defaults, config) as Required<NewsletterConfig>;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends Record<string, unknown>>(
    target: T,
    source: Partial<T>
  ): T {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  /**
   * Loads widget configuration from server
   */
  private async loadWidgetConfig(): Promise<void> {
    try {
      const url = `${this.config.apiUrl}/public/widget/${this.config.newsletterId}/config?tenantId=${this.config.tenantId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const serverConfig = (await response.json()) as ServerWidgetConfig;

        // Store fieldConfigurations if provided by API
        if (serverConfig.fieldConfigurations && serverConfig.fieldConfigurations.length > 0) {
          this.fieldConfigurations = serverConfig.fieldConfigurations;
          this.logger.debug('Dynamic field configurations loaded from API:', this.fieldConfigurations);
        } else {
          // Fallback to default email field configuration
          this.fieldConfigurations = this.getDefaultFieldConfigurations();
          this.logger.debug('Using default field configurations (backward compatibility)');
        }

        // Merge server config, handling optional properties correctly
        const mergedConfig = {
          ...this.config,
          ...serverConfig,
          fields: serverConfig.fields
            ? { ...this.config.fields, ...serverConfig.fields }
            : this.config.fields,
          messages: serverConfig.messages
            ? { ...this.config.messages, ...serverConfig.messages }
            : this.config.messages,
          styles: serverConfig.styles
            ? {
                global: { ...this.config.styles?.global, ...serverConfig.styles.global },
                title: { ...this.config.styles?.title, ...serverConfig.styles.title },
                subtitle: { ...this.config.styles?.subtitle, ...serverConfig.styles.subtitle },
                input: { ...this.config.styles?.input, ...serverConfig.styles.input },
                button: { ...this.config.styles?.button, ...serverConfig.styles.button },
              }
            : this.config.styles,
        };

        this.config = mergedConfig as Required<NewsletterConfig>;
        this.logger.debug('Widget configuration loaded from server');
      } else {
        // Fallback to default field configurations if API fails
        this.fieldConfigurations = this.getDefaultFieldConfigurations();
        this.logger.warn(
          'Could not load widget configuration from server, using defaults'
        );
      }
    } catch (error) {
      this.logger.warn('Error loading widget configuration:', error);
    }
  }

  /**
   * Initializes HTTP client after config is loaded
   */
  private initHttpClient(): void {
    const apiKey = this.config.token || '';
    this.httpClient = new HttpClient(this.config.apiUrl, apiKey);
  }

  /**
   * Returns default field configurations for backward compatibility
   *
   * @returns Default email field configuration
   */
  private getDefaultFieldConfigurations(): FieldConfiguration[] {
    return [
      {
        fieldName: 'email',
        displayName: 'Email Address',
        hint: null,
        required: true,
        type: 'email',
        placeholder: this.config.fields.email?.placeholder || 'Enter your email',
      },
    ];
  }

  /**
   * Loads Google Fonts used in widget styles
   */
  private loadGoogleFonts(): void {
    const googleFonts = new Set<string>();
    const styles = this.config.styles;

    // Collect all Google Fonts from configuration
    if (styles?.global?.font?.family) {
      googleFonts.add(styles.global.font.family);
    }
    if (styles?.title?.font?.family) {
      googleFonts.add(styles.title.font.family);
    }
    if (styles?.subtitle?.font?.family) {
      googleFonts.add(styles.subtitle.font.family);
    }
    if (styles?.input?.fontFamily) {
      googleFonts.add(styles.input.fontFamily);
    }
    if (styles?.button?.fontFamily) {
      googleFonts.add(styles.button.fontFamily);
    }

    if (googleFonts.size === 0) {
      return;
    }

    // Check if already loaded
    const fontSignature = Array.from(googleFonts).sort().join('|');
    if (this.loadedFontSignature === fontSignature) {
      return;
    }

    // Build Google Fonts URL
    const fontFamilies = Array.from(googleFonts).map((family) => {
      const urlFamily = family.replace(/ /g, '+');
      return `${urlFamily}:wght@300;400;500;600;700`;
    });

    const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontFamilies.map((f) => `family=${f}`).join('&')}&display=swap`;

    // Check if link already exists
    if (document.querySelector(`link[href="${googleFontsUrl}"]`)) {
      return;
    }

    // Inject Google Fonts link
    const linkElement = document.createElement('link');
    linkElement.href = googleFontsUrl;
    linkElement.rel = 'stylesheet';
    linkElement.type = 'text/css';
    linkElement.id = 'nevent-google-fonts';
    document.head.appendChild(linkElement);

    this.loadedFontSignature = fontSignature;
    this.logger.debug('Google Fonts loaded:', Array.from(googleFonts));
  }

  /**
   * Loads custom fonts from server
   */
  private async loadCustomFonts(): Promise<void> {
    try {
      const customFontFamilies = new Set<string>();
      const styles = this.config.styles;

      // Collect custom font families
      if (styles?.global?.font?.family) {
        customFontFamilies.add(styles.global.font.family);
      }
      if (styles?.title?.font?.family) {
        customFontFamilies.add(styles.title.font.family);
      }
      if (styles?.subtitle?.font?.family) {
        customFontFamilies.add(styles.subtitle.font.family);
      }

      if (customFontFamilies.size === 0) {
        return;
      }

      // Fetch available custom fonts
      const url = `${this.config.apiUrl}/public/widget/fonts?tenantId=${this.config.tenantId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.warn('Could not load custom fonts from server');
        return;
      }

      const fontsData = (await response.json()) as FontsResponse;
      const customFonts = fontsData.customFonts || [];

      // Inject each custom font
      customFontFamilies.forEach((family) => {
        if (family && family !== 'inherit') {
          const customFont = customFonts.find((font) => font.family === family);
          if (customFont) {
            this.injectCustomFont(customFont);
          }
        }
      });

      this.logger.debug(
        'Custom fonts loaded:',
        Array.from(this.loadedCustomFonts)
      );
    } catch (error) {
      this.logger.warn('Error loading custom fonts:', error);
    }
  }

  /**
   * Injects custom font @font-face CSS
   */
  private injectCustomFont(customFont: CustomFont): void {
    if (!customFont.files || this.loadedCustomFonts.has(customFont.family)) {
      return;
    }

    const fontUrls = Object.values(customFont.files);
    if (fontUrls.length === 0) {
      return;
    }

    const fontUrl = fontUrls[0];
    const fontId = `custom-font-${customFont.id}`;

    if (document.querySelector(`style[data-font-id="${fontId}"]`)) {
      this.loadedCustomFonts.add(customFont.family);
      return;
    }

    const fontFaceCSS = `
      @font-face {
        font-family: '${customFont.family}';
        src: url('${fontUrl}') format('truetype');
        font-display: swap;
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.setAttribute('data-font-id', fontId);
    styleElement.textContent = fontFaceCSS;
    document.head.appendChild(styleElement);

    this.loadedCustomFonts.add(customFont.family);
    this.logger.debug(`Custom font loaded: ${customFont.family}`);
  }

  /**
   * Finds the container element for the widget
   */
  private findContainer(): void {
    if (this.config.containerId) {
      this.container = document.getElementById(this.config.containerId);
    } else {
      this.container = document.querySelector('.nevent-widget');
    }

    if (!this.container) {
      throw new Error('NewsletterWidget: Container element not found');
    }

    // Add theme class
    if (this.config.theme === 'dark') {
      this.container.classList.add('nevent-widget--dark');
    } else {
      this.container.classList.add('nevent-widget--light');
    }

    // Add tenant data attribute
    this.container.setAttribute('data-nev-tenant-id', this.config.tenantId);
  }

  /**
   * Renders the widget UI
   */
  private render(): void {
    if (!this.container) {
      return;
    }

    this.form = document.createElement('form');
    this.form.className = 'nevent-widget-form';
    this.form.id = 'nevent-form-' + this.config.newsletterId;
    this.form.setAttribute('data-nev-newsletter-id', this.config.newsletterId);

    // Check if we should use dynamic rendering or legacy HTML
    if (this.fieldConfigurations && this.fieldConfigurations.length > 0) {
      this.renderDynamicForm();
    } else {
      this.form.innerHTML = this.buildFormHTML();
    }

    // Apply animations
    if (this.config.animations) {
      this.form.style.opacity = '0';
      this.form.style.transform = 'translateY(20px)';
      this.form.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    }

    this.container.appendChild(this.form);
    this.injectStyles();

    if (this.config.animations) {
      requestAnimationFrame(() => {
        if (this.form) {
          this.form.style.opacity = '1';
          this.form.style.transform = 'translateY(0)';
        }
      });
    }

    this.logger.debug('Widget rendered');
  }

  /**
   * Renders form using dynamic FormRenderer
   */
  private renderDynamicForm(): void {
    if (!this.form) {
      return;
    }

    // Create container for dynamic fields
    const titleSubtitleContainer = document.createElement('div');
    titleSubtitleContainer.innerHTML = `
      ${this.buildTitle()}
      ${this.buildSubtitle()}
    `;
    this.form.appendChild(titleSubtitleContainer);

    // Create fields container
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'nevent-fields-container';
    this.form.appendChild(fieldsContainer);

    // Initialize FormRenderer and render fields
    this.formRenderer = new FormRenderer(this.fieldConfigurations);
    this.formRenderer.render(fieldsContainer);

    // Add GDPR and submit button
    const gdprAndSubmitContainer = document.createElement('div');
    gdprAndSubmitContainer.innerHTML = `
      ${this.buildGDPRCheckbox()}
      ${this.buildSubmitButton()}
      <div class="nevent-status-message" style="display: none;"></div>
    `;
    this.form.appendChild(gdprAndSubmitContainer);
  }

  /**
   * Builds form HTML structure
   */
  private buildFormHTML(): string {
    const direction = this.config.styles?.global?.direction || 'column';

    if (direction === 'row') {
      return this.buildRowLayout();
    }

    return this.buildColumnLayout();
  }

  /**
   * Builds column layout HTML
   */
  private buildColumnLayout(): string {
    return `
      ${this.buildTitle()}
      ${this.buildSubtitle()}
      ${this.buildEmailField()}
      ${this.buildOptionalFields()}
      ${this.buildGDPRCheckbox()}
      ${this.buildSubmitButton()}
      <div class="nevent-status-message" style="display: none;"></div>
    `;
  }

  /**
   * Builds row layout HTML
   */
  private buildRowLayout(): string {
    return `
      <div class="nevent-text-section">
        ${this.buildTitle()}
        ${this.buildSubtitle()}
      </div>
      <div class="nevent-fields-section">
        <div class="nevent-fields-grid">
          ${this.buildEmailField()}
          ${this.buildOptionalFields()}
        </div>
        ${this.buildGDPRCheckbox()}
        ${this.buildSubmitButton()}
        <div class="nevent-status-message" style="display: none;"></div>
      </div>
    `;
  }

  /**
   * Builds title HTML
   */
  private buildTitle(): string {
    if (this.config.styles?.title?.hidden) {
      return '';
    }

    const title = this.config.title || 'Suscríbete a nuestro newsletter';
    return `<h2 class="nevent-title">${this.escapeHtml(title)}</h2>`;
  }

  /**
   * Builds subtitle HTML
   */
  private buildSubtitle(): string {
    if (this.config.styles?.subtitle?.hidden || !this.config.subtitle) {
      return '';
    }

    return `<p class="nevent-subtitle">${this.escapeHtml(this.config.subtitle)}</p>`;
  }

  /**
   * Builds email field HTML
   */
  private buildEmailField(): string {
    const field = this.config.fields.email;
    if (!field || !field.enabled) {
      return '';
    }

    return `
      <div class="nevent-field">
        <input
          type="email"
          name="email"
          class="nevent-input"
          placeholder="${this.escapeHtml(field.placeholder || '')}"
          ${field.required ? 'required' : ''}
        />
      </div>
    `;
  }

  /**
   * Builds optional fields HTML
   */
  private buildOptionalFields(): string {
    let html = '';

    const fields = this.config.fields;

    if (fields.firstName?.enabled) {
      html += `
        <div class="nevent-field">
          <input
            type="text"
            name="firstName"
            class="nevent-input"
            placeholder="${this.escapeHtml(fields.firstName.placeholder || '')}"
            ${fields.firstName.required ? 'required' : ''}
          />
        </div>
      `;
    }

    if (fields.lastName?.enabled) {
      html += `
        <div class="nevent-field">
          <input
            type="text"
            name="lastName"
            class="nevent-input"
            placeholder="${this.escapeHtml(fields.lastName.placeholder || '')}"
            ${fields.lastName.required ? 'required' : ''}
          />
        </div>
      `;
    }

    if (fields.postalCode?.enabled) {
      html += `
        <div class="nevent-field">
          <input
            type="text"
            name="postalCode"
            class="nevent-input"
            placeholder="${this.escapeHtml(fields.postalCode.placeholder || '')}"
            ${fields.postalCode.required ? 'required' : ''}
          />
        </div>
      `;
    }

    if (fields.birthDate?.enabled) {
      html += `
        <div class="nevent-field">
          <input
            type="date"
            name="birthDate"
            class="nevent-input"
            placeholder="${this.escapeHtml(fields.birthDate.placeholder || '')}"
            ${fields.birthDate.required ? 'required' : ''}
          />
        </div>
      `;
    }

    return html;
  }

  /**
   * Builds GDPR checkbox HTML
   */
  private buildGDPRCheckbox(): string {
    let gdprText = this.config.messages.gdprText || '';

    // Replace placeholders
    if (this.config.companyName) {
      gdprText = gdprText.replace('[COMPANY_NAME]', this.config.companyName);
    }

    if (this.config.privacyPolicyUrl) {
      const privacyLink = `<a href="${this.escapeHtml(this.config.privacyPolicyUrl)}" target="_blank" rel="noopener noreferrer">${this.config.messages.privacyText}</a>`;
      gdprText = gdprText.replace('[PRIVACY_POLICY_LINK]', privacyLink);
    }

    return `
      <div class="nevent-gdpr">
        <label class="nevent-gdpr-label">
          <input
            type="checkbox"
            name="gdprConsent"
            class="nevent-gdpr-checkbox"
            required
          />
          <span class="nevent-gdpr-text">${gdprText}</span>
        </label>
      </div>
    `;
  }

  /**
   * Builds submit button HTML
   */
  private buildSubmitButton(): string {
    return `
      <button type="submit" class="nevent-submit-button">
        ${this.escapeHtml(this.config.messages.submit || '')}
      </button>
    `;
  }

  /**
   * Injects widget styles
   */
  private injectStyles(): void {
    const styleId = 'nevent-widget-styles';
    if (document.getElementById(styleId)) {
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = this.generateCSS();
    document.head.appendChild(styleElement);

    // Custom CSS
    if (this.config.customCSS) {
      const customStyleElement = document.createElement('style');
      customStyleElement.id = 'nevent-widget-custom-styles';
      customStyleElement.textContent = this.config.customCSS;
      document.head.appendChild(customStyleElement);
    }
  }

  /**
   * Generates CSS for the widget using StyleManager
   */
  private generateCSS(): string {
    // Initialize StyleManager if not already done
    if (!this.styleManager) {
      const customCSS: Record<string, string> = {};

      // Map legacy styles to CSS variables
      if (this.config.primaryColor) {
        customCSS['--nev-primary-color'] = this.config.primaryColor;
        customCSS['--nev-button-bg'] = this.config.primaryColor;
        customCSS['--nev-input-focus-border-color'] = this.config.primaryColor;
      }

      if (this.config.backgroundColor) {
        customCSS['--nev-bg-color'] = this.config.backgroundColor;
      }

      if (this.config.styles?.button?.backgroundColor) {
        customCSS['--nev-button-bg'] = this.config.styles.button.backgroundColor;
      }

      if (this.config.styles?.button?.textColor) {
        customCSS['--nev-button-text-color'] = this.config.styles.button.textColor;
      }

      if (this.config.styles?.input?.borderColor) {
        customCSS['--nev-input-border-color'] = this.config.styles.input.borderColor;
      }

      this.styleManager = new StyleManager({ customCSS });
    }

    // Generate base CSS from StyleManager
    let css = this.styleManager.generateCSS();

    // Add legacy-specific styles for backward compatibility
    const styles = this.config.styles;
    const global = styles?.global || {};
    const borderRadius = this.extractNumericValue(this.config.borderRadius);

    css += `

      /* Legacy widget-specific styles */
      .nevent-widget-form {
        display: flex;
        flex-direction: ${global.direction || 'column'};
        gap: ${global.spacingBetweenElements || 'var(--nev-spacing-md)'};
        padding: ${global.innerPadding || 'var(--nev-spacing-lg)'};
        background: var(--nev-bg-color);
        border: 1px solid #e0e0e0;
        border-radius: ${borderRadius}px;
        font-family: var(--nev-font-family);
        box-sizing: border-box;
      }

      .nevent-title {
        margin: 0 0 8px 0;
        font-size: ${styles?.title?.fontSize || '24px'};
        font-weight: ${styles?.title?.fontWeight || 'var(--nev-font-weight-bold)'};
        color: ${styles?.title?.color || 'var(--nev-text-color)'};
      }

      .nevent-subtitle {
        margin: 0 0 16px 0;
        font-size: ${styles?.subtitle?.fontSize || 'var(--nev-font-size-small)'};
        color: ${styles?.subtitle?.color || 'var(--nev-secondary-color)'};
      }

      .nevent-gdpr {
        margin: 8px 0;
      }

      .nevent-gdpr-label {
        display: flex;
        align-items: flex-start;
        gap: var(--nev-spacing-sm);
        font-size: var(--nev-font-size-small);
        color: var(--nev-secondary-color);
        cursor: pointer;
      }

      .nevent-gdpr-checkbox {
        margin-top: 2px;
        cursor: pointer;
        accent-color: var(--nev-primary-color);
      }

      .nevent-status-message {
        padding: var(--nev-spacing-md);
        border-radius: var(--nev-input-border-radius);
        font-size: var(--nev-font-size-base);
        text-align: center;
      }

      .nevent-status-message.success {
        background: #d4edda;
        color: #155724;
      }

      .nevent-status-message.error {
        background: #f8d7da;
        color: #721c24;
      }

      @media (max-width: 768px) {
        .nevent-widget-form {
          flex-direction: column;
        }

        .nevent-text-section,
        .nevent-fields-section {
          width: 100% !important;
        }
      }
    `;

    return css;
  }

  /**
   * Attaches event handlers
   */
  private attachEvents(): void {
    if (!this.form) {
      return;
    }

    this.form.addEventListener('submit', this.handleSubmit.bind(this));
  }

  /**
   * Handles form submission
   */
  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.isSubmitting || !this.form || !this.httpClient) {
      return;
    }

    // Use FormRenderer validation if available
    if (this.formRenderer) {
      const isValid = this.formRenderer.validateFields();
      if (!isValid) {
        return;
      }
    }

    // Validate form
    const formData = new FormData(this.form);
    const email = formData.get('email') as string;
    const gdprConsent = formData.get('gdprConsent') as string;

    const emailValidation = EmailValidator.validate(email);
    if (!emailValidation.valid) {
      this.showError(this.config.messages.invalidEmail || 'Invalid email');
      return;
    }

    if (!gdprConsent) {
      this.showError('GDPR consent is required');
      return;
    }

    this.isSubmitting = true;
    this.showLoading();

    try {
      // Collect form data - support both dynamic and legacy fields
      let subscriptionData: SubscriptionData;

      if (this.formRenderer) {
        // Get data from FormRenderer
        const dynamicFormData = this.formRenderer.getFormData();
        subscriptionData = {
          email: dynamicFormData.email?.trim() || email.trim(),
          ...(dynamicFormData.firstName && { firstName: dynamicFormData.firstName }),
          ...(dynamicFormData.lastName && { lastName: dynamicFormData.lastName }),
          ...(dynamicFormData.postalCode && { postalCode: dynamicFormData.postalCode }),
          ...(dynamicFormData.birthDate && { birthDate: dynamicFormData.birthDate }),
          // Include any additional dynamic fields
          ...Object.fromEntries(
            Object.entries(dynamicFormData).filter(
              ([key]) => !['email', 'firstName', 'lastName', 'postalCode', 'birthDate'].includes(key)
            )
          ),
          consent: {
            marketing: true,
            timestamp: new Date().toISOString(),
          },
        };
      } else {
        // Legacy form data collection
        const firstName = formData.get('firstName') as string;
        const lastName = formData.get('lastName') as string;
        const postalCode = formData.get('postalCode') as string;
        const birthDate = formData.get('birthDate') as string;

        subscriptionData = {
          email: email.trim(),
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(postalCode && { postalCode }),
          ...(birthDate && { birthDate }),
          consent: {
            marketing: true,
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (this.config.onSubmit) {
        this.config.onSubmit(subscriptionData);
      }

      const response = await this.httpClient.post<SubscriptionResponse>(
        `/public/newsletter/${this.config.newsletterId}/subscribe?tenantId=${this.config.tenantId}`,
        subscriptionData
      );

      this.showSuccess(
        response.data.message || this.config.messages.success || 'Success!'
      );

      if (this.config.onSuccess) {
        this.config.onSuccess(response.data);
      }

      if (this.config.resetOnSuccess) {
        setTimeout(() => {
          this.form?.reset();
          if (this.formRenderer) {
            this.formRenderer.reset();
          }
        }, 3000);
      }

      this.trackEvent('subscription_success');
    } catch (error) {
      this.logger.error('Submission error:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : this.config.messages.error || 'Error';

      this.showError(errorMessage);

      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }

      this.trackEvent('subscription_error');
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Shows loading state
   */
  private showLoading(): void {
    const statusElement = this.form?.querySelector('.nevent-status-message');
    const submitButton = this.form?.querySelector(
      '.nevent-submit-button'
    ) as HTMLButtonElement;

    if (statusElement) {
      statusElement.textContent = this.config.messages.loading || 'Loading...';
      (statusElement as HTMLElement).style.display = 'block';
      statusElement.className = 'nevent-status-message';
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('nevent-submit-button--disabled');
      submitButton.classList.add('nevent-submit-button--loading');
    }
  }

  /**
   * Shows success message
   */
  private showSuccess(message: string): void {
    const statusElement = this.form?.querySelector('.nevent-status-message');
    const submitButton = this.form?.querySelector(
      '.nevent-submit-button'
    ) as HTMLButtonElement;

    if (statusElement) {
      statusElement.textContent = message;
      (statusElement as HTMLElement).style.display = 'block';
      statusElement.className = 'nevent-status-message success';
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.classList.remove('nevent-submit-button--disabled');
      submitButton.classList.remove('nevent-submit-button--loading');
    }
  }

  /**
   * Shows error message
   */
  private showError(message: string): void {
    const statusElement = this.form?.querySelector('.nevent-status-message');
    const submitButton = this.form?.querySelector(
      '.nevent-submit-button'
    ) as HTMLButtonElement;

    if (statusElement) {
      statusElement.textContent = message;
      (statusElement as HTMLElement).style.display = 'block';
      statusElement.className = 'nevent-status-message error';

      // Auto-hide after 5 seconds
      setTimeout(() => {
        (statusElement as HTMLElement).style.display = 'none';
      }, 5000);
    }

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.classList.remove('nevent-submit-button--disabled');
      submitButton.classList.remove('nevent-submit-button--loading');
    }
  }

  /**
   * Tracks analytics events
   */
  private trackEvent(eventName: string): void {
    if (!this.config.analytics) {
      return;
    }

    this.logger.debug('Track event:', eventName);

    // Integration with analytics platforms would go here
    // Example: Google Analytics, Segment, etc.
  }

  /**
   * Extracts numeric value from string or number
   */
  private extractNumericValue(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Escapes HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
