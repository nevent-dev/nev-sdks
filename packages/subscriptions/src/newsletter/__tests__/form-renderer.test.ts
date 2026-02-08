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
