/**
 * Validator - Enterprise Validation System
 *
 * Features:
 * - Type-specific validation (email, URL, phone, number, date)
 * - Custom validation functions
 * - Async validation support (server-side checks)
 * - Composable validation rules
 * - Internationalized error messages
 */

export interface ValidationConfig {
  pattern?: RegExp | string;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  message?: string;
  custom?: (value: any) => boolean | string;
  async?: boolean;
  asyncValidator?: (value: any) => Promise<string | null>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FieldConfig {
  fieldName: string;
  displayName: string;
  type: string;
  required?: boolean;
  validation?: ValidationConfig;
}

export class Validator {
  /**
   * Validates a field value based on its configuration
   */
  async validate(field: FieldConfig, value: any): Promise<ValidationResult> {
    const errors: string[] = [];

    // Required validation
    if (field.required && this.isEmpty(value)) {
      errors.push(`${field.displayName} is required`);
      return { valid: false, errors };
    }

    // Skip further validation if empty and not required
    if (this.isEmpty(value)) {
      return { valid: true, errors: [] };
    }

    // Type-specific validation
    const typeErrors = this.validateByType(field.type, value, field.displayName);
    errors.push(...typeErrors);

    // Custom validation config
    if (field.validation) {
      const configErrors = await this.validateWithConfig(field.validation, value, field.displayName);
      errors.push(...configErrors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if value is empty
   */
  private isEmpty(value: any): boolean {
    return value === null || value === undefined || value === '' ||
           (Array.isArray(value) && value.length === 0);
  }

  /**
   * Validate based on field type
   */
  private validateByType(type: string, value: any, fieldName: string): string[] {
    const errors: string[] = [];

    switch (type) {
      case 'email':
        if (!this.isValidEmail(value)) {
          errors.push(`Please enter a valid email address`);
        }
        break;

      case 'url':
        if (!this.isValidURL(value)) {
          errors.push(`Please enter a valid URL`);
        }
        break;

      case 'tel':
        // Basic phone validation (more detailed in PhoneInput component)
        if (!this.isValidPhone(value)) {
          errors.push(`Please enter a valid phone number`);
        }
        break;

      case 'number':
        if (isNaN(Number(value))) {
          errors.push(`${fieldName} must be a valid number`);
        }
        break;

      case 'date':
        if (!this.isValidDate(value)) {
          errors.push(`Please enter a valid date`);
        }
        break;
    }

    return errors;
  }

  /**
   * Validate with validation config
   */
  private async validateWithConfig(
    config: ValidationConfig,
    value: any,
    fieldName: string
  ): Promise<string[]> {
    const errors: string[] = [];

    // Pattern validation
    if (config.pattern) {
      const regex = typeof config.pattern === 'string'
        ? new RegExp(config.pattern)
        : config.pattern;

      if (!regex.test(String(value))) {
        errors.push(config.message || `${fieldName} format is invalid`);
      }
    }

    // Length validation
    if (config.minLength !== undefined && String(value).length < config.minLength) {
      errors.push(
        config.message || `${fieldName} must be at least ${config.minLength} characters`
      );
    }

    if (config.maxLength !== undefined && String(value).length > config.maxLength) {
      errors.push(
        config.message || `${fieldName} must not exceed ${config.maxLength} characters`
      );
    }

    // Numeric min/max validation
    if (config.min !== undefined) {
      const minValue = typeof config.min === 'string' ? parseFloat(config.min) : config.min;
      const numValue = typeof value === 'string' ? parseFloat(value) : value;

      if (numValue < minValue) {
        errors.push(
          config.message || `${fieldName} must be at least ${config.min}`
        );
      }
    }

    if (config.max !== undefined) {
      const maxValue = typeof config.max === 'string' ? parseFloat(config.max) : config.max;
      const numValue = typeof value === 'string' ? parseFloat(value) : value;

      if (numValue > maxValue) {
        errors.push(
          config.message || `${fieldName} must not exceed ${config.max}`
        );
      }
    }

    // Custom validation function
    if (config.custom) {
      const result = config.custom(value);
      if (result === false) {
        errors.push(config.message || `${fieldName} is invalid`);
      } else if (typeof result === 'string') {
        errors.push(result);
      }
    }

    // Async validation
    if (config.async && config.asyncValidator) {
      try {
        const error = await config.asyncValidator(value);
        if (error) {
          errors.push(error);
        }
      } catch (err) {
        errors.push(`Validation failed: ${err}`);
      }
    }

    return errors;
  }

  /**
   * Email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * URL validation
   */
  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Basic phone validation
   */
  private isValidPhone(phone: string): boolean {
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    // Should have 7-15 digits
    return /^\d{7,15}$/.test(cleaned);
  }

  /**
   * Date validation
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Batch validate multiple fields
   */
  async validateAll(
    fields: Array<{ field: FieldConfig; value: any }>
  ): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const { field, value } of fields) {
      const result = await this.validate(field, value);
      results.set(field.fieldName, result);
    }

    return results;
  }

  /**
   * Check if all validations passed
   */
  isAllValid(results: Map<string, ValidationResult>): boolean {
    return Array.from(results.values()).every(result => result.valid);
  }
}
