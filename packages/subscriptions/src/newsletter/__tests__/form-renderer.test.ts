import { describe, it, expect, beforeEach } from 'vitest';
import { FormRenderer } from '../form-renderer';
import type { FieldConfiguration } from '../../types';

describe('FormRenderer', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('Basic Rendering', () => {
    it('should render fields from fieldConfigurations', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email Address',
          hint: null,
          required: true,
          type: 'email',
          placeholder: 'Enter your email',
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          placeholder: 'Enter your name',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Check if fields are rendered
      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      // Check email field
      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      expect(emailInput).toBeTruthy();
      expect(emailInput.type).toBe('email');
      expect(emailInput.required).toBe(true);
      expect(emailInput.placeholder).toBe('Enter your email');

      // Check firstName field
      const firstNameInput = container.querySelector(
        'input[name="firstName"]'
      ) as HTMLInputElement;
      expect(firstNameInput).toBeTruthy();
      expect(firstNameInput.type).toBe('text');
      expect(firstNameInput.required).toBe(true);
    });

    it('should display hint text when provided', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: 'We will never share your email',
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const hint = container.querySelector('.nevent-field-hint');
      expect(hint).toBeTruthy();
      expect(hint?.textContent).toBe('We will never share your email');
    });

    it('should not display hint when not provided', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const hint = container.querySelector('.nevent-field-hint');
      expect(hint).toBeFalsy();
    });

    it('should fallback to default email field if no fieldConfigurations', () => {
      const renderer = new FormRenderer([]);
      renderer.render(container);

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(1);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      expect(emailInput).toBeTruthy();
      expect(emailInput.type).toBe('email');
      expect(emailInput.required).toBe(true);
    });
  });

  describe('Field Types', () => {
    it('should render different field types correctly', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
        {
          fieldName: 'phone',
          displayName: 'Phone',
          hint: null,
          required: false,
          type: 'tel',
        },
        {
          fieldName: 'age',
          displayName: 'Age',
          hint: null,
          required: false,
          type: 'number',
        },
        {
          fieldName: 'website',
          displayName: 'Website',
          hint: null,
          required: false,
          type: 'url',
        },
        {
          fieldName: 'bio',
          displayName: 'Bio',
          hint: null,
          required: false,
          type: 'textarea',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      expect(
        (container.querySelector('input[name="email"]') as HTMLInputElement)
          .type
      ).toBe('email');
      expect(
        (container.querySelector('input[name="phone"]') as HTMLInputElement)
          .type
      ).toBe('tel');
      expect(
        (container.querySelector('input[name="age"]') as HTMLInputElement).type
      ).toBe('number');
      expect(
        (container.querySelector('input[name="website"]') as HTMLInputElement)
          .type
      ).toBe('url');
      expect(container.querySelector('textarea[name="bio"]')).toBeTruthy();
    });
  });

  describe('Validation', () => {
    it('should validate required fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email Address',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Validate without filling the field
      const isValid = renderer.validateFields();
      expect(isValid).toBe(false);

      // Fill the field and validate again
      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      emailInput.value = 'test@example.com';

      const isValidAfterFill = renderer.validateFields();
      expect(isValidAfterFill).toBe(true);
    });

    it('should validate email format', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;

      // Invalid email
      emailInput.value = 'invalid-email';
      expect(renderer.validateFields()).toBe(false);

      // Valid email
      emailInput.value = 'valid@example.com';
      expect(renderer.validateFields()).toBe(true);
    });

    it('should validate phone number format', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'phone',
          displayName: 'Phone',
          hint: null,
          required: true,
          type: 'tel',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const phoneInput = container.querySelector(
        'input[name="phone"]'
      ) as HTMLInputElement;

      // Invalid phone (too short)
      phoneInput.value = '123';
      expect(renderer.validateFields()).toBe(false);

      // Valid phone
      phoneInput.value = '+34 600 123 456';
      expect(renderer.validateFields()).toBe(true);
    });

    it('should validate number format', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'age',
          displayName: 'Age',
          hint: null,
          required: true,
          type: 'number',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const ageInput = container.querySelector(
        'input[name="age"]'
      ) as HTMLInputElement;

      // Invalid number
      ageInput.value = 'abc';
      expect(renderer.validateFields()).toBe(false);

      // Valid number
      ageInput.value = '25';
      expect(renderer.validateFields()).toBe(true);
    });

    it('should validate URL format', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'website',
          displayName: 'Website',
          hint: null,
          required: true,
          type: 'url',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const urlInput = container.querySelector(
        'input[name="website"]'
      ) as HTMLInputElement;

      // Invalid URL
      urlInput.value = 'not-a-url';
      expect(renderer.validateFields()).toBe(false);

      // Valid URL
      urlInput.value = 'https://example.com';
      expect(renderer.validateFields()).toBe(true);
    });

    it('should not validate optional empty fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
        {
          fieldName: 'phone',
          displayName: 'Phone',
          hint: null,
          required: false,
          type: 'tel',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      emailInput.value = 'test@example.com';

      // Phone is optional and empty - should still be valid
      const isValid = renderer.validateFields();
      expect(isValid).toBe(true);
    });
  });

  describe('Form Data', () => {
    it('should get form data from all fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      const firstNameInput = container.querySelector(
        'input[name="firstName"]'
      ) as HTMLInputElement;

      emailInput.value = 'test@example.com';
      firstNameInput.value = 'John';

      const formData = renderer.getFormData();

      expect(formData.email).toBe('test@example.com');
      expect(formData.firstName).toBe('John');
    });
  });

  describe('Reset', () => {
    it('should reset all fields to empty values', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      const firstNameInput = container.querySelector(
        'input[name="firstName"]'
      ) as HTMLInputElement;

      emailInput.value = 'test@example.com';
      firstNameInput.value = 'John';

      renderer.reset();

      expect(emailInput.value).toBe('');
      expect(firstNameInput.value).toBe('');
    });
  });

  describe('Error Display', () => {
    it('should show error messages for invalid fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email Address',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Validate without filling (should show required error)
      renderer.validateFields();

      const errorContainer = container.querySelector('.nevent-field-error');
      expect(errorContainer).toBeTruthy();
      expect(errorContainer?.textContent).toContain('Email Address is required');
      expect((errorContainer as HTMLElement).style.display).not.toBe('none');
    });

    it('should clear error messages when field becomes valid', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // First validation - should fail
      renderer.validateFields();

      let errorContainer = container.querySelector(
        '.nevent-field-error'
      ) as HTMLElement;
      expect(errorContainer.style.display).not.toBe('none');

      // Fill field and revalidate
      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      emailInput.value = 'test@example.com';
      renderer.validateFields();

      errorContainer = container.querySelector(
        '.nevent-field-error'
      ) as HTMLElement;
      expect(errorContainer.style.display).toBe('none');
    });
  });
});
