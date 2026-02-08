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
  private fieldElements: Map<
    string,
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  > = new Map();

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

    // Apply flex-wrap layout styles to container
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '12px';

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

    // Add field-type class
    fieldContainer.classList.add('nevent-field--' + config.type);

    // Add required modifier class
    if (config.required) {
      fieldContainer.classList.add('nevent-field--required');
    }

    // Apply width from configuration (default: 100%)
    const width = config.width || 100;
    if (width < 100) {
      fieldContainer.style.width = `calc(${width}% - 12px)`;
    } else {
      fieldContainer.style.width = '100%';
    }
    fieldContainer.style.boxSizing = 'border-box';

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
    errorContainer.className = 'nevent-field-error nevent-field-error--hidden';
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
      label.appendChild(requiredSpan);
    }

    return label;
  }

  /**
   * Creates an input element based on field type
   *
   * @param config - Field configuration
   * @returns HTMLInputElement, HTMLTextAreaElement, or HTMLSelectElement
   */
  private createInput(
    config: FieldConfiguration
  ): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    // Handle select/LIST type
    if (config.type === 'select' || config.type === 'list') {
      return this.createSelect(config);
    }

    // Handle textarea
    if (config.type === 'textarea') {
      const input = document.createElement('textarea');
      input.rows = 4;
      input.id = `nevent-field-${config.fieldName}`;
      input.name = config.fieldName;
      input.className = 'nevent-input';
      input.placeholder = config.placeholder || config.displayName;

      // Add field-type class to input
      input.classList.add('nevent-input--textarea');

      // Initialize with empty state
      input.classList.add('nevent-input--empty');

      if (config.required) {
        input.required = true;
      }

      // Add focus/blur event listeners for state classes
      input.addEventListener('focus', () => {
        input.classList.add('nevent-input--focused');
      });

      input.addEventListener('blur', () => {
        input.classList.remove('nevent-input--focused');

        // Toggle empty/filled state
        if (input.value.trim()) {
          input.classList.add('nevent-input--filled');
          input.classList.remove('nevent-input--empty');
        } else {
          input.classList.add('nevent-input--empty');
          input.classList.remove('nevent-input--filled');
        }
      });

      return input;
    }

    // Handle all other input types
    const input = document.createElement('input');
    input.type = this.mapFieldType(config.type);
    input.id = `nevent-field-${config.fieldName}`;
    input.name = config.fieldName;
    input.className = 'nevent-input';
    input.placeholder = config.placeholder || config.displayName;

    // Add field-type class to input
    input.classList.add('nevent-input--' + this.mapFieldType(config.type));

    // Initialize with empty state
    input.classList.add('nevent-input--empty');

    if (config.required) {
      input.required = true;
    }

    // Add focus/blur event listeners for state classes
    input.addEventListener('focus', () => {
      input.classList.add('nevent-input--focused');
    });

    input.addEventListener('blur', () => {
      input.classList.remove('nevent-input--focused');

      // Toggle empty/filled state
      if (input.value.trim()) {
        input.classList.add('nevent-input--filled');
        input.classList.remove('nevent-input--empty');
      } else {
        input.classList.add('nevent-input--empty');
        input.classList.remove('nevent-input--filled');
      }
    });

    return input;
  }

  /**
   * Creates a select element for LIST/enum fields
   *
   * Reads allowed values from validatorConfiguration.config.allowedValues
   * or from options array (backward compatibility)
   *
   * @param config - Field configuration
   * @returns HTMLSelectElement
   */
  private createSelect(config: FieldConfiguration): HTMLSelectElement {
    const select = document.createElement('select');
    select.id = `nevent-field-${config.fieldName}`;
    select.name = config.fieldName;
    select.className = 'nevent-input nevent-select';

    // Add field-type class
    select.classList.add('nevent-input--select');

    // Initialize with empty state
    select.classList.add('nevent-input--empty');

    if (config.required) {
      select.required = true;
    }

    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = config.placeholder || config.displayName;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    // Get allowed values from validatorConfiguration (backend LIST format)
    const allowedValues = this.extractAllowedValues(config);

    // Render options
    allowedValues.forEach((value) => {
      const option = document.createElement('option');
      if (typeof value === 'object' && value !== null) {
        // FieldOption format: { value, label }
        option.value = String((value as any).value ?? value);
        option.textContent = String(
          (value as any).label ?? (value as any).value ?? value
        );
      } else {
        // Simple string format from allowedValues
        option.value = String(value);
        option.textContent = String(value);
      }
      select.appendChild(option);
    });

    // Add focus/blur event listeners for state classes
    select.addEventListener('focus', () => {
      select.classList.add('nevent-input--focused');
    });

    select.addEventListener('blur', () => {
      select.classList.remove('nevent-input--focused');
    });

    // Add change event listener for empty/filled state
    select.addEventListener('change', () => {
      if (select.value) {
        select.classList.add('nevent-input--filled');
        select.classList.remove('nevent-input--empty');
      } else {
        select.classList.add('nevent-input--empty');
        select.classList.remove('nevent-input--filled');
      }
    });

    return select;
  }

  /**
   * Extracts allowed values from field configuration
   *
   * Supports both:
   * - validatorConfiguration.config.allowedValues (backend LIST/ENUM format)
   * - options array (legacy FieldOption format)
   *
   * @param config - Field configuration
   * @returns Array of allowed values
   */
  private extractAllowedValues(config: FieldConfiguration): unknown[] {
    // Priority 1: validatorConfiguration from backend
    const validatorConfig = config.validatorConfiguration;
    if (validatorConfig?.config?.allowedValues) {
      return validatorConfig.config.allowedValues;
    }

    // Priority 2: options array (backward compat)
    if (config.options && config.options.length > 0) {
      return config.options;
    }

    return [];
  }

  /**
   * Maps FieldType to HTML input type
   *
   * @param type - Field type from configuration
   * @returns HTML input type string
   */
  private mapFieldType(type: FieldType): string {
    const typeMap: Record<string, string> = {
      text: 'text',
      email: 'email',
      tel: 'tel',
      number: 'number',
      url: 'url',
      password: 'password',
      date: 'date',
      time: 'time',
      file: 'file',
      checkbox: 'checkbox',
      radio: 'radio',
      textarea: 'text',
      select: 'text',
      list: 'text',
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
      input.classList.add('nevent-input--invalid');
    }

    // Add error state to field container
    fieldContainer.classList.add('nevent-field--error');

    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.classList.remove('nevent-field-error--hidden');
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
      input.classList.remove('nevent-input--invalid');
    }

    // Remove error state from field container
    fieldContainer.classList.remove('nevent-field--error');

    const errorContainer = fieldContainer.querySelector(
      '.nevent-field-error'
    ) as HTMLSpanElement;
    if (errorContainer) {
      errorContainer.textContent = '';
      errorContainer.classList.add('nevent-field-error--hidden');
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
