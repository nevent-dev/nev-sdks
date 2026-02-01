import type { ValidationResult } from './types';

/**
 * Email validation utilities
 */
export class EmailValidator {
  // RFC 5322 simplified pattern
  private static readonly EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  /**
   * Validates an email address
   *
   * @param email - Email address to validate
   * @returns Validation result with errors if invalid
   *
   * @example
   * ```typescript
   * const result = EmailValidator.validate('user@example.com');
   * if (result.valid) {
   *   console.log('Email is valid');
   * }
   * ```
   */
  static validate(email: string): ValidationResult {
    const errors: string[] = [];

    if (!email || email.trim().length === 0) {
      errors.push('Email is required');
      return { valid: false, errors };
    }

    const trimmed = email.trim();

    if (trimmed.length > 254) {
      errors.push('Email is too long (max 254 characters)');
    }

    if (!this.EMAIL_REGEX.test(trimmed)) {
      errors.push('Email format is invalid');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * General form validation utilities
 */
export class FormValidator {
  /**
   * Validates that a value is not empty
   */
  static required(value: string, fieldName: string): ValidationResult {
    const errors: string[] = [];

    if (!value || value.trim().length === 0) {
      errors.push(`${fieldName} is required`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates string length constraints
   */
  static validateLength(
    value: string,
    fieldName: string,
    min?: number,
    max?: number
  ): ValidationResult {
    const errors: string[] = [];
    const len = value.trim().length;

    if (min !== undefined && len < min) {
      errors.push(`${fieldName} must be at least ${min} characters`);
    }

    if (max !== undefined && len > max) {
      errors.push(`${fieldName} must be at most ${max} characters`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates multiple fields and combines results
   */
  static combine(...results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap((r) => r.errors);

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }
}
