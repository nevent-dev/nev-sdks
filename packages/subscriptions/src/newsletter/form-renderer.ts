import type { FieldConfiguration, FieldType } from '../types';

/**
 * FormRenderer: Dynamic form rendering engine
 *
 * Renders form fields dynamically based on FieldConfiguration array from API.
 * Supports multiple field types: text, email, tel, number, url, password, textarea, date.
 *
 * Features:
 * - Dynamic field rendering from API config
 * - Display name and hint text support
 * - Required field validation
 * - Type-based validation (email format, number range, etc.)
 * - Backward compatibility fallback to default email field
 *
 * @example
 * ```typescript
 * const renderer = new FormRenderer(fieldConfigurations);
 * const formContainer = document.getElementById('form-container');
 * renderer.render(formContainer);
 *
 * if (renderer.validateFields()) {
 *   const formData = renderer.getFormData();
 *   // Submit data
 * }
 * ```
 */
export class FormRenderer {
  private fieldConfigurations: FieldConfiguration[];
  private fieldElements: Map<string, HTMLInputElement | HTMLTextAreaElement> =
    new Map();

  /**
   * Creates a new FormRenderer instance
   *
   * @param fieldConfigurations - Array of field configurations from API
   */
  constructor(fieldConfigurations: FieldConfiguration[] = []) {
    this.fieldConfigurations = fieldConfigurations;
  }

  /**
   * Sets field configurations (useful for updating after API call)
   *
   * @param fieldConfigurations - Array of field configurations
   */
  public setFieldConfigurations(
    fieldConfigurations: FieldConfiguration[]
  ): void {
    this.fieldConfigurations = fieldConfigurations;
  }

  /**
   * Renders all fields into the container
   *
   * @param container - HTML element to render fields into
   */
  public render(container: HTMLElement): void {
    this.fieldElements.clear();

    // Fallback to default email field if no configurations provided
    if (!this.fieldConfigurations || this.fieldConfigurations.length === 0) {
      this.renderDefaultEmailField(container);
      return;
    }

    // Render each field from configuration
    this.fieldConfigurations.forEach((config) => {
      const fieldElement = this.renderField(config);
      container.appendChild(fieldElement);
    });
  }

  /**
   * Renders a single field based on configuration
   *
   * @param config - Field configuration
   * @returns HTMLElement containing the field
   */
  public renderField(config: FieldConfiguration): HTMLElement {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'nevent-field';
    fieldContainer.setAttribute('data-field-name', config.fieldName);

    // Create label
    const label = this.createLabel(config);
    fieldContainer.appendChild(label);

    // Create input based on type
    const input = this.createInput(config);
    fieldContainer.appendChild(input);

    // Store reference to input element
    this.fieldElements.set(config.fieldName, input);

    // Create hint text if provided
    if (config.hint) {
      const hint = this.createHint(config.hint);
      fieldContainer.appendChild(hint);
    }

    // Create error container (hidden by default)
    const errorContainer = document.createElement('span');
    errorContainer.className = 'nevent-field-error';
    errorContainer.style.display = 'none';
    errorContainer.style.color = '#dc3545';
    errorContainer.style.fontSize = '12px';
    errorContainer.style.marginTop = '4px';
    fieldContainer.appendChild(errorContainer);

    return fieldContainer;
  }

  /**
   * Creates a label element for the field
   *
   * @param config - Field configuration
   * @returns HTMLLabelElement
   */
  private createLabel(config: FieldConfiguration): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'nevent-field-label';
    label.htmlFor = `nevent-field-${config.fieldName}`;
    label.textContent = config.displayName;

    // Add required indicator
    if (config.required) {
      const requiredSpan = document.createElement('span');
      requiredSpan.className = 'nevent-required';
      requiredSpan.textContent = ' *';
      requiredSpan.style.color = '#dc3545';
      label.appendChild(requiredSpan);
    }

    // Hide label (using display: none for now, can be customized)
    label.style.display = 'none';

    return label;
  }

  /**
   * Creates an input element based on field type
   *
   * @param config - Field configuration
   * @returns HTMLInputElement or HTMLTextAreaElement
   */
  private createInput(
    config: FieldConfiguration
  ): HTMLInputElement | HTMLTextAreaElement {
    let input: HTMLInputElement | HTMLTextAreaElement;

    if (config.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 4;
    } else {
      input = document.createElement('input');
      input.type = this.mapFieldType(config.type);
    }

    input.id = `nevent-field-${config.fieldName}`;
    input.name = config.fieldName;
    input.className = 'nevent-input';
    input.placeholder = config.placeholder || config.displayName;

    if (config.required) {
      input.required = true;
    }

    return input;
  }

  /**
   * Maps FieldType to HTML input type
   *
   * @param type - Field type from configuration
   * @returns HTML input type string
   */
  private mapFieldType(type: FieldType): string {
    const typeMap: Record<FieldType, string> = {
      text: 'text',
      email: 'email',
      tel: 'tel',
      number: 'number',
      url: 'url',
      password: 'password',
      date: 'date',
      time: 'time',
      file: 'file',
      // These types need special handling, default to text for now
      select: 'text',
      checkbox: 'checkbox',
      radio: 'radio',
      textarea: 'text', // Not used, handled separately
    };

    return typeMap[type] || 'text';
  }

  /**
   * Creates a hint text element
   *
   * @param hintText - Hint text to display
   * @returns HTMLSpanElement
   */
  private createHint(hintText: string): HTMLSpanElement {
    const hint = document.createElement('span');
    hint.className = 'nevent-field-hint';
    hint.textContent = hintText;
    hint.style.fontSize = '12px';
    hint.style.color = '#6c757d';
    hint.style.marginTop = '4px';
    hint.style.display = 'block';

    return hint;
  }

  /**
   * Renders a default email field (backward compatibility fallback)
   *
   * @param container - Container to render into
   */
  private renderDefaultEmailField(container: HTMLElement): void {
    const defaultEmailConfig: FieldConfiguration = {
      fieldName: 'email',
      displayName: 'Email Address',
      hint: null,
      required: true,
      type: 'email',
      placeholder: 'Enter your email',
    };

    const fieldElement = this.renderField(defaultEmailConfig);
    container.appendChild(fieldElement);
  }

  /**
   * Validates all fields in the form
   *
   * @returns true if all fields are valid, false otherwise
   */
  public validateFields(): boolean {
    let isValid = true;

    this.fieldConfigurations.forEach((config) => {
      const input = this.fieldElements.get(config.fieldName);
      if (!input) {
        return;
      }

      const fieldContainer = input.closest('.nevent-field') as HTMLElement;
      const errorContainer = fieldContainer?.querySelector(
        '.nevent-field-error'
      ) as HTMLSpanElement;

      // Clear previous errors
      this.clearError(fieldContainer);

      // Required validation
      if (config.required && !input.value.trim()) {
        this.showError(
          fieldContainer,
          `${config.displayName} is required`,
          errorContainer
        );
        isValid = false;
        return;
      }

      // Type-specific validation
      const typeValidation = this.validateFieldType(config, input.value);
      if (!typeValidation.valid) {
        this.showError(fieldContainer, typeValidation.error!, errorContainer);
        isValid = false;
      }
    });

    return isValid;
  }

  /**
   * Validates field based on its type
   *
   * @param config - Field configuration
   * @param value - Field value
   * @returns Validation result
   */
  private validateFieldType(
    config: FieldConfiguration,
    value: string
  ): { valid: boolean; error?: string } {
    // Skip validation if field is empty and not required
    if (!value.trim() && !config.required) {
      return { valid: true };
    }

    switch (config.type) {
      case 'email':
        return this.validateEmail(value);
      case 'tel':
        return this.validatePhone(value);
      case 'number':
        return this.validateNumber(value);
      case 'url':
        return this.validateUrl(value);
      default:
        return { valid: true };
    }
  }

  /**
   * Validates email format
   *
   * @param email - Email string to validate
   * @returns Validation result
   */
  private validateEmail(email: string): { valid: boolean; error?: string } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        error: 'Please enter a valid email address',
      };
    }
    return { valid: true };
  }

  /**
   * Validates phone number format
   *
   * @param phone - Phone string to validate
   * @returns Validation result
   */
  private validatePhone(phone: string): { valid: boolean; error?: string } {
    // Basic phone validation: at least 9 digits
    const phoneRegex = /^\+?[\d\s\-()]{9,}$/;
    if (!phoneRegex.test(phone)) {
      return {
        valid: false,
        error: 'Please enter a valid phone number',
      };
    }
    return { valid: true };
  }

  /**
   * Validates number format
   *
   * @param value - Number string to validate
   * @returns Validation result
   */
  private validateNumber(value: string): { valid: boolean; error?: string } {
    if (isNaN(Number(value))) {
      return {
        valid: false,
        error: 'Please enter a valid number',
      };
    }
    return { valid: true };
  }

  /**
   * Validates URL format
   *
   * @param url - URL string to validate
   * @returns Validation result
   */
  private validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      new URL(url);
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Please enter a valid URL',
      };
    }
  }

  /**
   * Shows error message for a field
   *
   * @param fieldContainer - Field container element
   * @param message - Error message
   * @param errorContainer - Error message container
   */
  private showError(
    fieldContainer: HTMLElement,
    message: string,
    errorContainer: HTMLSpanElement
  ): void {
    const input = fieldContainer.querySelector(
      '.nevent-input'
    ) as HTMLInputElement;
    if (input) {
      input.style.borderColor = '#dc3545';
    }

    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.style.display = 'block';
    }
  }

  /**
   * Clears error state for a field
   *
   * @param fieldContainer - Field container element
   */
  private clearError(fieldContainer: HTMLElement): void {
    const input = fieldContainer.querySelector(
      '.nevent-input'
    ) as HTMLInputElement;
    if (input) {
      input.style.borderColor = '';
    }

    const errorContainer = fieldContainer.querySelector(
      '.nevent-field-error'
    ) as HTMLSpanElement;
    if (errorContainer) {
      errorContainer.textContent = '';
      errorContainer.style.display = 'none';
    }
  }

  /**
   * Gets form data from all fields
   *
   * @returns Record of field names to values
   */
  public getFormData(): Record<string, string> {
    const formData: Record<string, string> = {};

    this.fieldElements.forEach((input, fieldName) => {
      formData[fieldName] = input.value;
    });

    return formData;
  }

  /**
   * Resets all fields to empty values
   */
  public reset(): void {
    this.fieldElements.forEach((input) => {
      input.value = '';

      // Clear errors
      const fieldContainer = input.closest('.nevent-field') as HTMLElement;
      if (fieldContainer) {
        this.clearError(fieldContainer);
      }
    });
  }
}
