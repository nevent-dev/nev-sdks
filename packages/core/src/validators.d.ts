import type { ValidationResult } from './types';
/**
 * Email validation utilities
 */
export declare class EmailValidator {
  private static readonly EMAIL_REGEX;
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
  static validate(email: string): ValidationResult;
}
/**
 * General form validation utilities
 */
export declare class FormValidator {
  /**
   * Validates that a value is not empty
   */
  static required(value: string, fieldName: string): ValidationResult;
  /**
   * Validates string length constraints
   */
  static validateLength(
    value: string,
    fieldName: string,
    min?: number,
    max?: number
  ): ValidationResult;
  /**
   * Validates multiple fields and combines results
   */
  static combine(...results: ValidationResult[]): ValidationResult;
}
//# sourceMappingURL=validators.d.ts.map
