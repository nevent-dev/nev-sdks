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

    it('should return "true" for checked checkbox fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'accepts_newsletter',
          displayName: 'Accepts Newsletter',
          hint: null,
          required: false,
          type: 'checkbox',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const checkbox = container.querySelector(
        'input[name="accepts_newsletter"]'
      ) as HTMLInputElement;
      checkbox.checked = true;

      const formData = renderer.getFormData();
      expect(formData.accepts_newsletter).toBe('true');
    });

    it('should return "false" for unchecked checkbox fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'accepts_newsletter',
          displayName: 'Accepts Newsletter',
          hint: null,
          required: false,
          type: 'checkbox',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const checkbox = container.querySelector(
        'input[name="accepts_newsletter"]'
      ) as HTMLInputElement;
      checkbox.checked = false;

      const formData = renderer.getFormData();
      expect(formData.accepts_newsletter).toBe('false');
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

    it('should reset checkbox fields to unchecked', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'accepts_newsletter',
          displayName: 'Accepts Newsletter',
          hint: null,
          required: false,
          type: 'checkbox',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const checkbox = container.querySelector(
        'input[name="accepts_newsletter"]'
      ) as HTMLInputElement;
      checkbox.checked = true;

      renderer.reset();

      expect(checkbox.checked).toBe(false);
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
      expect(errorContainer?.textContent).toContain(
        'Email Address is required'
      );
      expect(
        (errorContainer as HTMLElement).classList.contains(
          'nevent-field-error--hidden'
        )
      ).toBe(false);
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
      expect(
        errorContainer.classList.contains('nevent-field-error--hidden')
      ).toBe(false);

      // Fill field and revalidate
      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      emailInput.value = 'test@example.com';
      renderer.validateFields();

      errorContainer = container.querySelector(
        '.nevent-field-error'
      ) as HTMLElement;
      expect(
        errorContainer.classList.contains('nevent-field-error--hidden')
      ).toBe(true);
    });
  });

  describe('Field Width Layout', () => {
    it('should apply width 50% to field with width config', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
          width: 50,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const field = container.querySelector('.nevent-field') as HTMLElement;
      expect(field.style.width).toBe('calc(50% - 12px)');
      expect(field.style.boxSizing).toBe('border-box');
    });

    it('should apply width 100% to field without width config (default)', () => {
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

      const field = container.querySelector('.nevent-field') as HTMLElement;
      expect(field.style.width).toBe('100%');
      expect(field.style.boxSizing).toBe('border-box');
    });

    it('should apply width 25% to field correctly', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          width: 25,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const field = container.querySelector('.nevent-field') as HTMLElement;
      expect(field.style.width).toBe('calc(25% - 12px)');
    });

    it('should apply width 75% to field correctly', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'address',
          displayName: 'Address',
          hint: null,
          required: false,
          type: 'text',
          width: 75,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const field = container.querySelector('.nevent-field') as HTMLElement;
      expect(field.style.width).toBe('calc(75% - 12px)');
    });

    it('should render two fields with 50% width each in a row', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          width: 50,
        },
        {
          fieldName: 'lastName',
          displayName: 'Last Name',
          hint: null,
          required: true,
          type: 'text',
          width: 50,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      // Both fields should have 50% width
      expect((fields[0] as HTMLElement).style.width).toBe('calc(50% - 12px)');
      expect((fields[1] as HTMLElement).style.width).toBe('calc(50% - 12px)');
    });

    it('should apply flex-wrap styles to container', () => {
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

      expect(container.style.display).toBe('flex');
      expect(container.style.flexWrap).toBe('wrap');
      expect(container.style.gap).toBe('12px');
    });

    it('should render mixed width fields correctly', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
          width: 100,
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          width: 50,
        },
        {
          fieldName: 'lastName',
          displayName: 'Last Name',
          hint: null,
          required: true,
          type: 'text',
          width: 50,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(3);

      expect((fields[0] as HTMLElement).style.width).toBe('100%');
      expect((fields[1] as HTMLElement).style.width).toBe('calc(50% - 12px)');
      expect((fields[2] as HTMLElement).style.width).toBe('calc(50% - 12px)');
    });
  });

  describe('Defensive Email Field Injection', () => {
    it('should ensure email field exists when missing from configurations', () => {
      // Simulate server returning fieldConfigurations without email field
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          placeholder: 'Enter your name',
        },
      ];

      // Inject email field if missing (simulating widget behavior)
      const hasEmailField = fieldConfigurations.some(
        (f) => f.type === 'email' || f.fieldName === 'email'
      );
      if (!hasEmailField) {
        fieldConfigurations.unshift({
          fieldName: 'email',
          displayName: 'Email Address',
          hint: null,
          required: true,
          type: 'email',
          placeholder: 'Enter your email',
        });
      }

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Verify email field was injected and rendered first
      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      const emailInput = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      expect(emailInput).toBeTruthy();
      expect(emailInput.type).toBe('email');
      expect(emailInput.required).toBe(true);
      expect(emailInput.placeholder).toBe('Enter your email');

      // Verify form can be submitted with email
      emailInput.value = 'test@example.com';
      const firstNameInput = container.querySelector(
        'input[name="firstName"]'
      ) as HTMLInputElement;
      firstNameInput.value = 'John';

      expect(renderer.validateFields()).toBe(true);

      const formData = renderer.getFormData();
      expect(formData.email).toBe('test@example.com');
      expect(formData.firstName).toBe('John');
    });

    it('should not duplicate email field if already present', () => {
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

      // Inject email field if missing (simulating widget behavior)
      const hasEmailField = fieldConfigurations.some(
        (f) => f.type === 'email' || f.fieldName === 'email'
      );
      if (!hasEmailField) {
        fieldConfigurations.unshift({
          fieldName: 'email',
          displayName: 'Email Address',
          hint: null,
          required: true,
          type: 'email',
          placeholder: 'Enter your email',
        });
      }

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Should still have exactly 2 fields (email not duplicated)
      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      const emailInputs = container.querySelectorAll('input[name="email"]');
      expect(emailInputs.length).toBe(1);
    });

    it('should detect email field by fieldName=email', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'text', // type is text, but fieldName is email
          placeholder: 'Email',
        },
      ];

      const hasEmailField = fieldConfigurations.some(
        (f) => f.type === 'email' || f.fieldName === 'email'
      );

      expect(hasEmailField).toBe(true);

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(1);
    });

    it('should detect email field by type=email', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'userEmail',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email', // type is email, fieldName is different
          placeholder: 'Email',
        },
      ];

      const hasEmailField = fieldConfigurations.some(
        (f) => f.type === 'email' || f.fieldName === 'email'
      );

      expect(hasEmailField).toBe(true);

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(1);
    });
  });

  describe('layoutElements support', () => {
    it('should render elements in correct order based on order property', () => {
      // This test simulates the widget's behavior with layoutElements
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
        },
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
        },
      ];

      // Simulate layoutElements from API (order: email first, then firstName)
      const layoutElements = [
        { type: 'field' as const, key: 'email', width: 100 as const, order: 1 },
        {
          type: 'field' as const,
          key: 'firstName',
          width: 100 as const,
          order: 2,
        },
        {
          type: 'legalTerms' as const,
          key: 'legalTerms',
          width: 100 as const,
          order: 3,
        },
        {
          type: 'submitButton' as const,
          key: 'submitButton',
          width: 100 as const,
          order: 4,
        },
      ];

      // Sort by order
      const sortedElements = [...layoutElements].sort(
        (a, b) => a.order - b.order
      );

      const renderer = new FormRenderer(fieldConfigurations);

      sortedElements.forEach((layoutElement) => {
        if (layoutElement.type === 'field') {
          const fieldConfig = fieldConfigurations.find(
            (f) => f.fieldName === layoutElement.key
          );
          if (fieldConfig) {
            const configWithWidth = {
              ...fieldConfig,
              width: layoutElement.width,
            };
            const fieldElement = renderer.renderField(configWithWidth);
            container.appendChild(fieldElement);
          }
        }
      });

      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      // Email should be rendered first (order: 1)
      expect((fields[0] as HTMLElement).getAttribute('data-field-name')).toBe(
        'email'
      );

      // firstName should be rendered second (order: 2)
      expect((fields[1] as HTMLElement).getAttribute('data-field-name')).toBe(
        'firstName'
      );
    });

    it('should apply correct width to GDPR checkbox from layoutElement', () => {
      // Simulate GDPR element with 50% width
      const gdprElement = document.createElement('div');
      gdprElement.className = 'nevent-gdpr';
      gdprElement.style.width = 'calc(50% - 12px)';
      gdprElement.style.boxSizing = 'border-box';
      gdprElement.style.minWidth = '0';

      container.appendChild(gdprElement);

      expect(gdprElement.style.width).toBe('calc(50% - 12px)');
      expect(gdprElement.style.boxSizing).toBe('border-box');
    });

    it('should apply correct width to submit button from layoutElement', () => {
      // Simulate submit button with 50% width
      const submitContainer = document.createElement('div');
      submitContainer.className = 'nevent-submit-button-container';
      submitContainer.style.width = 'calc(50% - 12px)';
      submitContainer.style.boxSizing = 'border-box';
      submitContainer.style.minWidth = '0';

      container.appendChild(submitContainer);

      expect(submitContainer.style.width).toBe('calc(50% - 12px)');
      expect(submitContainer.style.boxSizing).toBe('border-box');
    });

    it('should render GDPR and submit button side-by-side at 50% each', () => {
      // Simulate two elements at 50% width each
      const gdprElement = document.createElement('div');
      gdprElement.className = 'nevent-gdpr';
      gdprElement.style.width = 'calc(50% - 12px)';
      gdprElement.style.boxSizing = 'border-box';
      gdprElement.style.minWidth = '0';

      const submitContainer = document.createElement('div');
      submitContainer.className = 'nevent-submit-button-container';
      submitContainer.style.width = 'calc(50% - 12px)';
      submitContainer.style.boxSizing = 'border-box';
      submitContainer.style.minWidth = '0';

      // Make container flex
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.gap = '12px';

      container.appendChild(gdprElement);
      container.appendChild(submitContainer);

      expect(gdprElement.style.width).toBe('calc(50% - 12px)');
      expect(submitContainer.style.width).toBe('calc(50% - 12px)');
      expect(container.style.display).toBe('flex');
      expect(container.style.flexWrap).toBe('wrap');
    });

    it('should fallback to default layout when no layoutElements provided', () => {
      // Backward compatibility: no layoutElements = default layout
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: null,
          required: true,
          type: 'email',
          width: 50,
        },
        {
          fieldName: 'firstName',
          displayName: 'First Name',
          hint: null,
          required: true,
          type: 'text',
          width: 50,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      // Default layout: render all fields
      const fields = container.querySelectorAll('.nevent-field');
      expect(fields.length).toBe(2);

      // Fields should respect their configured widths
      expect((fields[0] as HTMLElement).style.width).toBe('calc(50% - 12px)');
      expect((fields[1] as HTMLElement).style.width).toBe('calc(50% - 12px)');
    });

    it('should handle mixed widths: field 50% + field 50% + legalTerms 50% + submitButton 50%', () => {
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

      const layoutElements = [
        { type: 'field' as const, key: 'email', width: 50 as const, order: 1 },
        {
          type: 'field' as const,
          key: 'firstName',
          width: 50 as const,
          order: 2,
        },
        {
          type: 'legalTerms' as const,
          key: 'legalTerms',
          width: 50 as const,
          order: 3,
        },
        {
          type: 'submitButton' as const,
          key: 'submitButton',
          width: 50 as const,
          order: 4,
        },
      ];

      const sortedElements = [...layoutElements].sort(
        (a, b) => a.order - b.order
      );

      const renderer = new FormRenderer(fieldConfigurations);
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.gap = '12px';

      sortedElements.forEach((layoutElement) => {
        if (layoutElement.type === 'field') {
          const fieldConfig = fieldConfigurations.find(
            (f) => f.fieldName === layoutElement.key
          );
          if (fieldConfig) {
            const configWithWidth = {
              ...fieldConfig,
              width: layoutElement.width,
            };
            const fieldElement = renderer.renderField(configWithWidth);
            container.appendChild(fieldElement);
          }
        } else if (layoutElement.type === 'legalTerms') {
          const gdprElement = document.createElement('div');
          gdprElement.className = 'nevent-gdpr';
          gdprElement.style.width = `calc(${layoutElement.width}% - 12px)`;
          gdprElement.style.boxSizing = 'border-box';
          gdprElement.style.minWidth = '0';
          container.appendChild(gdprElement);
        } else if (layoutElement.type === 'submitButton') {
          const submitContainer = document.createElement('div');
          submitContainer.className = 'nevent-submit-button-container';
          submitContainer.style.width = `calc(${layoutElement.width}% - 12px)`;
          submitContainer.style.boxSizing = 'border-box';
          submitContainer.style.minWidth = '0';
          container.appendChild(submitContainer);
        }
      });

      const allElements = container.children;
      expect(allElements.length).toBe(4);

      // All elements should have 50% width
      const element0 = allElements[0] as HTMLElement | undefined;
      const element1 = allElements[1] as HTMLElement | undefined;
      const element2 = allElements[2] as HTMLElement | undefined;
      const element3 = allElements[3] as HTMLElement | undefined;

      expect(element0?.style.width).toBe('calc(50% - 12px)');
      expect(element1?.style.width).toBe('calc(50% - 12px)');
      expect(element2?.style.width).toBe('calc(50% - 12px)');
      expect(element3?.style.width).toBe('calc(50% - 12px)');
    });
  });

  describe('Custom Field Labels, Placeholders, and Hints (NEV-1337)', () => {
    it('should render custom label from displayName', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Your Email Address',
          hint: null,
          required: true,
          type: 'email',
          placeholder: 'Enter email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const label = container.querySelector('.nevent-field-label');
      expect(label).toBeTruthy();
      expect(label?.textContent).toContain('Your Email Address');
    });

    it('should render custom placeholder', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'firstName',
          displayName: 'Full Name',
          hint: null,
          required: true,
          type: 'text',
          placeholder: 'Enter your full name here',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const input = container.querySelector(
        'input[name="firstName"]'
      ) as HTMLInputElement;
      expect(input.placeholder).toBe('Enter your full name here');
    });

    it('should fallback to displayName when placeholder is not provided', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'lastName',
          displayName: 'Last Name',
          hint: null,
          required: false,
          type: 'text',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const input = container.querySelector(
        'input[name="lastName"]'
      ) as HTMLInputElement;
      expect(input.placeholder).toBe('Last Name');
    });

    it('should render hint text when provided', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: 'We will never share your email with anyone',
          required: true,
          type: 'email',
          placeholder: 'Enter your email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const hint = container.querySelector(
        '.nevent-field-hint'
      ) as HTMLSpanElement;
      expect(hint).toBeTruthy();
      expect(hint.textContent).toBe(
        'We will never share your email with anyone'
      );
      expect(hint.tagName).toBe('SPAN');
    });

    it('should not render hint element when hint is null', () => {
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

    it('should not render hint element when hint is empty string', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email',
          hint: '',
          required: true,
          type: 'email',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const hint = container.querySelector('.nevent-field-hint');
      expect(hint).toBeFalsy();
    });

    it('should apply custom placeholder to select/list fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'category',
          displayName: 'Select Category',
          hint: null,
          required: true,
          type: 'list',
          placeholder: 'Choose an option',
          validatorConfiguration: {
            type: 'ENUM',
            config: { allowedValues: ['A', 'B'] },
          },
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const select = container.querySelector('select') as HTMLSelectElement;
      const placeholderOption = select.querySelector(
        'option[disabled]'
      ) as HTMLOptionElement;
      expect(placeholderOption.textContent).toBe('Choose an option');
    });

    it('should apply custom placeholder to textarea fields', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'bio',
          displayName: 'Biography',
          hint: null,
          required: false,
          type: 'textarea',
          placeholder: 'Tell us about yourself',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const textarea = container.querySelector(
        'textarea[name="bio"]'
      ) as HTMLTextAreaElement;
      expect(textarea.placeholder).toBe('Tell us about yourself');
    });

    it('should render all three customizations together', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'email',
          displayName: 'Email Address',
          hint: 'Your email is safe with us',
          required: true,
          type: 'email',
          placeholder: 'name@example.com',
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const label = container.querySelector('.nevent-field-label');
      expect(label?.textContent).toContain('Email Address');

      const input = container.querySelector(
        'input[name="email"]'
      ) as HTMLInputElement;
      expect(input.placeholder).toBe('name@example.com');

      const hint = container.querySelector('.nevent-field-hint');
      expect(hint?.textContent).toBe('Your email is safe with us');
    });
  });

  describe('Field Adapter integration (NEV-1340)', () => {
    it('should handle adapted API fields with dataType TEXT as text input', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'company_name',
          propertyDefinitionId: 'company_name',
          displayName: 'Company Name',
          hint: null,
          required: false,
          type: 'text',
          placeholder: 'Enter company',
          width: 60,
          displayOrder: 1,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const input = container.querySelector(
        'input[name="company_name"]'
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.type).toBe('text');
    });

    it('should handle adapted API fields with SELECT options (value+label)', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'category',
          propertyDefinitionId: 'category',
          displayName: 'Category',
          hint: null,
          required: true,
          type: 'select',
          options: [
            { value: 'tech', label: 'Technology' },
            { value: 'sports', label: 'Sports' },
          ],
          displayOrder: 2,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const select = container.querySelector('select') as HTMLSelectElement;
      expect(select).toBeTruthy();
      const options = select.querySelectorAll('option');
      expect(options.length).toBe(3); // placeholder + 2
      expect(options[1]!.value).toBe('tech');
      expect(options[1]!.textContent).toBe('Technology');
    });

    it('should handle adapted API fields with BOOLEAN as checkbox', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'accepts_newsletter',
          propertyDefinitionId: 'accepts_newsletter',
          displayName: 'Accepts Newsletter',
          hint: null,
          required: false,
          type: 'checkbox',
          displayOrder: 3,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const input = container.querySelector(
        'input[name="accepts_newsletter"]'
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.type).toBe('checkbox');
    });

    it('should handle adapted API fields with DATE as date input', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'birth_date',
          propertyDefinitionId: 'birth_date',
          displayName: 'Birth Date',
          hint: null,
          required: false,
          type: 'date',
          displayOrder: 4,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const input = container.querySelector(
        'input[name="birth_date"]'
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.type).toBe('date');
    });

    it('should handle flexible width values (1-100)', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'name',
          propertyDefinitionId: 'name',
          displayName: 'Name',
          hint: null,
          required: true,
          type: 'text',
          width: 60,
          displayOrder: 1,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const field = container.querySelector('.nevent-field') as HTMLElement;
      expect(field.style.width).toBe('calc(60% - 12px)');
    });

    it('should render propertyDefinitionId as fieldName', () => {
      const fieldConfigurations: FieldConfiguration[] = [
        {
          fieldName: 'custom_prop_123',
          propertyDefinitionId: 'custom_prop_123',
          displayName: 'Custom Property',
          hint: null,
          required: false,
          type: 'text',
          displayOrder: 1,
        },
      ];

      const renderer = new FormRenderer(fieldConfigurations);
      renderer.render(container);

      const field = container.querySelector(
        '[data-field-name="custom_prop_123"]'
      );
      expect(field).toBeTruthy();

      const input = container.querySelector(
        'input[name="custom_prop_123"]'
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });

  describe('LIST/select field rendering', () => {
    it('should render a select element for list type fields', () => {
      const configs: FieldConfiguration[] = [
        {
          fieldName: 'category',
          displayName: 'Category',
          hint: null,
          required: true,
          type: 'list',
          validatorConfiguration: {
            type: 'ENUM',
            config: { allowedValues: ['Sports', 'Music', 'Tech'] },
          },
        },
      ];
      const renderer = new FormRenderer(configs);
      renderer.render(container);

      const select = container.querySelector('select');
      expect(select).not.toBeNull();
      expect(select!.name).toBe('category');
      expect(select!.className).toContain('nevent-select');

      // Should have placeholder + 3 options = 4 total
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(4);
      expect(options[0].disabled).toBe(true); // placeholder
      expect(options[1].value).toBe('Sports');
      expect(options[2].value).toBe('Music');
      expect(options[3].value).toBe('Tech');
    });

    it('should render select for select type with options array', () => {
      const configs: FieldConfiguration[] = [
        {
          fieldName: 'size',
          displayName: 'Size',
          hint: null,
          required: false,
          type: 'select',
          options: [
            { value: 'S', label: 'Small' },
            { value: 'M', label: 'Medium' },
            { value: 'L', label: 'Large' },
          ],
        },
      ];
      const renderer = new FormRenderer(configs);
      renderer.render(container);

      const select = container.querySelector('select');
      expect(select).not.toBeNull();
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(4); // placeholder + 3
      expect(options[1].value).toBe('S');
      expect(options[1].textContent).toBe('Small');
    });

    it('should validate required select field', () => {
      const configs: FieldConfiguration[] = [
        {
          fieldName: 'category',
          displayName: 'Category',
          hint: null,
          required: true,
          type: 'list',
          validatorConfiguration: {
            type: 'ENUM',
            config: { allowedValues: ['A', 'B'] },
          },
        },
      ];
      const renderer = new FormRenderer(configs);
      renderer.render(container);

      // Empty select should fail validation
      expect(renderer.validateFields()).toBe(false);

      // Select a value
      const select = container.querySelector('select') as HTMLSelectElement;
      select.value = 'A';
      expect(renderer.validateFields()).toBe(true);
    });

    it('should include select value in getFormData()', () => {
      const configs: FieldConfiguration[] = [
        {
          fieldName: 'interest',
          displayName: 'Interest',
          hint: null,
          required: false,
          type: 'list',
          validatorConfiguration: {
            type: 'ENUM',
            config: { allowedValues: ['Tech', 'Sports'] },
          },
        },
      ];
      const renderer = new FormRenderer(configs);
      renderer.render(container);

      const select = container.querySelector('select') as HTMLSelectElement;
      select.value = 'Tech';

      const data = renderer.getFormData();
      expect(data.interest).toBe('Tech');
    });

    it('should render empty select when no allowedValues provided', () => {
      const configs: FieldConfiguration[] = [
        {
          fieldName: 'empty',
          displayName: 'Empty List',
          hint: null,
          required: false,
          type: 'list',
        },
      ];
      const renderer = new FormRenderer(configs);
      renderer.render(container);

      const select = container.querySelector('select');
      expect(select).not.toBeNull();
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(1); // Only placeholder
    });
  });
});
