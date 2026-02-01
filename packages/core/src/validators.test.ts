import { describe, expect, it } from 'vitest';

import { EmailValidator, FormValidator } from './validators';

describe('EmailValidator', () => {
  describe('validate', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'first+last@company.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        const result = EmailValidator.validate(email);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject empty or whitespace-only emails', () => {
      const invalidEmails = ['', '   ', '\t\n'];

      invalidEmails.forEach((email) => {
        const result = EmailValidator.validate(email);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Email is required');
      });
    });

    it('should reject emails with invalid format', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      invalidEmails.forEach((email) => {
        const result = EmailValidator.validate(email);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('format'))).toBe(true);
      });
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = EmailValidator.validate(longEmail);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
    });

    it('should trim whitespace before validation', () => {
      const result = EmailValidator.validate('  user@example.com  ');
      expect(result.valid).toBe(true);
    });
  });
});

describe('FormValidator', () => {
  describe('required', () => {
    it('should pass for non-empty values', () => {
      const result = FormValidator.required('John Doe', 'Name');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for empty values', () => {
      const result = FormValidator.required('', 'Name');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Name is required');
    });

    it('should fail for whitespace-only values', () => {
      const result = FormValidator.required('   ', 'Name');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateLength', () => {
    it('should validate minimum length', () => {
      const result = FormValidator.validateLength('abc', 'Password', 5);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 5');
    });

    it('should validate maximum length', () => {
      const result = FormValidator.validateLength(
        'abcdefghijk',
        'Username',
        undefined,
        10
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 10');
    });

    it('should validate range', () => {
      const valid = FormValidator.validateLength('abc123', 'Code', 5, 10);
      expect(valid.valid).toBe(true);

      const tooShort = FormValidator.validateLength('abc', 'Code', 5, 10);
      expect(tooShort.valid).toBe(false);

      const tooLong = FormValidator.validateLength(
        'abcdefghijk',
        'Code',
        5,
        10
      );
      expect(tooLong.valid).toBe(false);
    });
  });

  describe('combine', () => {
    it('should combine multiple validation results', () => {
      const result1 = { valid: true, errors: [] };
      const result2 = { valid: false, errors: ['Error 1'] };
      const result3 = { valid: false, errors: ['Error 2', 'Error 3'] };

      const combined = FormValidator.combine(result1, result2, result3);

      expect(combined.valid).toBe(false);
      expect(combined.errors).toHaveLength(3);
      expect(combined.errors).toContain('Error 1');
      expect(combined.errors).toContain('Error 2');
      expect(combined.errors).toContain('Error 3');
    });

    it('should return valid when all results are valid', () => {
      const result1 = { valid: true, errors: [] };
      const result2 = { valid: true, errors: [] };

      const combined = FormValidator.combine(result1, result2);

      expect(combined.valid).toBe(true);
      expect(combined.errors).toHaveLength(0);
    });
  });
});
