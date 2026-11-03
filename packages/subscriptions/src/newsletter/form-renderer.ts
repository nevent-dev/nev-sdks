import type { FieldConfiguration, FieldType, WidgetStyles } from '../types';

/**
 * Translates an i18n key of the widget (e.g. `fieldRequired`) with its
 * `{{param}}` values. Without one, the renderer keeps its English texts.
 */
export type FieldTranslator = (
  key: string,
  params?: Record<string, string>
) => string;

/** Value of a field in {@link FormRenderer.getFormData}: a LIST with options gives the checked options. */
export type FormFieldValue = string | string[];

/**
 * FormRenderer: Dynamic form rendering engine
 *
 * Renders form fields dynamically based on FieldConfiguration array from API.
 * Supports multiple field types: text, email, tel, number, url, password, textarea, date,
 * select (a `<select>`) and list with options (checkboxes, multiple choice).
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
  /** Checkboxes of each multiple choice field (a LIST with options), by fieldName. */
  private checkboxGroups: Map<string, HTMLInputElement[]> = new Map();
  private widgetStyles: WidgetStyles | null = null;
  private translate: FieldTranslator | null;

  /**
   * Creates a new FormRenderer instance
   *
   * @param fieldConfigurations - Array of field configurations from API
   * @param widgetStyles - Optional widget styles configuration for labelHidden/hintHidden
   * @param translate - Optional i18n lookup for the validation messages
   */
  constructor(
    fieldConfigurations: FieldConfiguration[] = [],
    widgetStyles: WidgetStyles | null = null,
    translate: FieldTranslator | null = null
  ) {
    this.fieldConfigurations = fieldConfigurations;
    this.widgetStyles = widgetStyles;
    this.translate = translate;
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
   * Sets widget styles (useful for updating after API call)
   *
   * @param widgetStyles - Widget styles configuration
   */
  public setWidgetStyles(widgetStyles: WidgetStyles | null): void {
    this.widgetStyles = widgetStyles;
  }

  /**
   * Renders all fields into the container
   *
   * @param container - HTML element to render fields into
   */
  public render(container: HTMLElement): void {
    this.fieldElements.clear();
    this.checkboxGroups.clear();

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

    if (this.isMultipleChoice(config)) {
      // A LIST with options: one checkbox per option inside a fieldset
      fieldContainer.appendChild(this.createCheckboxGroup(config));
    } else {
      // Create label (only if not hidden)
      const label = this.createLabel(config);
      if (label) {
        fieldContainer.appendChild(label);
      }

      // Create input based on type
      const input = this.createInput(config);
      fieldContainer.appendChild(input);

      // Store reference to input element
      this.fieldElements.set(config.fieldName, input);
    }

    // Create hint text if provided and not hidden
    const hintHidden = this.widgetStyles?.input?.hintHidden ?? false;
    if (config.hint && !hintHidden) {
      const hint = this.createHint(config.hint);
      fieldContainer.appendChild(hint);
    }

    // Create error container (hidden by default)
    const errorContainer = document.createElement('span');
    errorContainer.className = 'nevent-field-error nevent-field-error--hidden';
    if (this.checkboxGroups.has(config.fieldName)) {
      // The checkboxes point at it with aria-describedby
      errorContainer.id = this.errorId(config.fieldName);
      errorContainer.setAttribute('role', 'alert');
    }
    fieldContainer.appendChild(errorContainer);

    return fieldContainer;
  }

  /**
   * Whether a field is answered with checkboxes: a LIST with options.
   * A SELECT keeps its `<select>`, and a LIST without options too.
   *
   * @param config - Field configuration
   */
  private isMultipleChoice(config: FieldConfiguration): boolean {
    return (
      config.type === 'list' && this.extractAllowedValues(config).length > 0
    );
  }

  /** Id of the error message of a field. */
  private errorId(fieldName: string): string {
    return `nevent-field-${fieldName}-error`;
  }

  /**
   * Creates the checkbox group of a multiple choice field: a `<fieldset>`
   * named by its `<legend>` (label and required asterisk), with a native
   * checkbox and its own `<label>` per option, so it works with the keyboard
   * (Tab and Space) and is announced as a group by screen readers.
   *
   * @param config - Field configuration (a LIST with options)
   * @returns HTMLFieldSetElement
   */
  private createCheckboxGroup(config: FieldConfiguration): HTMLFieldSetElement {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'nevent-checkbox-group';

    const legend = document.createElement('legend');
    legend.className = 'nevent-field-label nevent-checkbox-legend';
    legend.textContent = config.displayName;
    if (config.required) {
      const requiredSpan = document.createElement('span');
      requiredSpan.className = 'nevent-required';
      requiredSpan.textContent = ' *';
      legend.appendChild(requiredSpan);
    }
    // Hidden labels stay readable for screen readers: the group needs its name
    if (this.widgetStyles?.input?.labelHidden ?? false) {
      legend.classList.add('nevent-visually-hidden');
    }
    fieldset.appendChild(legend);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'nevent-checkbox-options';

    const boxes: HTMLInputElement[] = [];
    this.extractAllowedValues(config).forEach((raw, index) => {
      const { value, label } = this.optionValueAndLabel(raw);

      const optionLabel = document.createElement('label');
      optionLabel.className = 'nevent-checkbox-option';

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'nevent-checkbox-input';
      box.id = `nevent-field-${config.fieldName}-${index}`;
      box.name = config.fieldName;
      box.value = value;
      box.setAttribute('aria-describedby', this.errorId(config.fieldName));
      box.addEventListener('change', () => {
        optionLabel.classList.toggle(
          'nevent-checkbox-option--checked',
          box.checked
        );
      });
      optionLabel.htmlFor = box.id;

      const text = document.createElement('span');
      text.className = 'nevent-checkbox-label';
      text.textContent = label;

      optionLabel.appendChild(box);
      optionLabel.appendChild(text);
      optionsContainer.appendChild(optionLabel);
      boxes.push(box);
    });

    fieldset.appendChild(optionsContainer);
    this.checkboxGroups.set(config.fieldName, boxes);
    return fieldset;
  }

  /**
   * Value and visible text of an option, from either an allowed value
   * (`'Techno'`) or a FieldOption (`{ value, label }`).
   */
  private optionValueAndLabel(raw: unknown): { value: string; label: string } {
    if (typeof raw === 'object' && raw !== null) {
      const option = raw as { value?: unknown; label?: unknown };
      const value = String(option.value ?? '');
      return { value, label: String(option.label ?? value) };
    }
    return { value: String(raw), label: String(raw) };
  }

  /** The `fieldRequired` message of a field, in the widget's language when there is a translator. */
  private requiredMessage(config: FieldConfiguration): string {
    return this.translate
      ? this.translate('fieldRequired', { fieldName: config.displayName })
      : `${config.displayName} is required`;
  }

  /**
   * Creates a label element for the field
   *
   * @param config - Field configuration
   * @returns HTMLLabelElement or null if label is hidden
   */
  private createLabel(config: FieldConfiguration): HTMLLabelElement | null {
    // Check if labels should be hidden via widget styles
    const labelHidden = this.widgetStyles?.input?.labelHidden ?? false;

    if (labelHidden) {
      return null;
    }

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
      const boxes = this.checkboxGroups.get(config.fieldName);
      if (boxes) {
        const groupContainer = this.fieldContainerOf(config.fieldName);
        if (!groupContainer) return;
        this.clearError(groupContainer);
        // Required = at least one option checked
        if (config.required && !boxes.some((box) => box.checked)) {
          this.showError(
            groupContainer,
            this.requiredMessage(config),
            groupContainer.querySelector('.nevent-field-error') as HTMLSpanElement
          );
          isValid = false;
        }
        return;
      }

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
          this.requiredMessage(config),
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
    fieldContainer
      .querySelectorAll('.nevent-checkbox-input')
      .forEach((box) => box.setAttribute('aria-invalid', 'true'));

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
    fieldContainer
      .querySelectorAll('.nevent-checkbox-input')
      .forEach((box) => box.removeAttribute('aria-invalid'));

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
   * Shows a message next to a rendered field, e.g. a value the API rejected.
   *
   * @param fieldName - The field's fieldName
   * @param message - Text to show (already translated)
   * @returns `true` when the field is rendered and the message is shown
   */
  public showFieldError(fieldName: string, message: string): boolean {
    const fieldContainer = this.fieldContainerOf(fieldName);
    if (!fieldContainer) return false;
    this.showError(
      fieldContainer,
      message,
      fieldContainer.querySelector('.nevent-field-error') as HTMLSpanElement
    );
    return true;
  }

  /** The `.nevent-field` container of a rendered field. */
  private fieldContainerOf(fieldName: string): HTMLElement | null {
    const element =
      this.fieldElements.get(fieldName) ?? this.checkboxGroups.get(fieldName)?.[0];
    return (element?.closest('.nevent-field') as HTMLElement | null) ?? null;
  }

  /**
   * Gets form data from all fields
   *
   * @returns Record of field names to values: a string, or the checked
   *   options (in option order) of a LIST with options
   */
  public getFormData(): Record<string, FormFieldValue> {
    const formData: Record<string, FormFieldValue> = {};

    this.fieldElements.forEach((input, fieldName) => {
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        formData[fieldName] = String(input.checked);
      } else {
        formData[fieldName] = input.value;
      }
    });

    this.checkboxGroups.forEach((boxes, fieldName) => {
      formData[fieldName] = boxes
        .filter((box) => box.checked)
        .map((box) => box.value);
    });

    return formData;
  }

  /**
   * Resets all fields to empty values
   */
  public reset(): void {
    this.fieldElements.forEach((input) => {
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = '';
      }

      // Clear errors
      const fieldContainer = input.closest('.nevent-field') as HTMLElement;
      if (fieldContainer) {
        this.clearError(fieldContainer);
      }
    });

    this.checkboxGroups.forEach((boxes, fieldName) => {
      boxes.forEach((box) => {
        box.checked = false;
        box
          .closest('.nevent-checkbox-option')
          ?.classList.remove('nevent-checkbox-option--checked');
      });
      const fieldContainer = this.fieldContainerOf(fieldName);
      if (fieldContainer) {
        this.clearError(fieldContainer);
      }
    });
  }
}
