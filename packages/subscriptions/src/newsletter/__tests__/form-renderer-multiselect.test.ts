/**
 * Multiple choice (LIST with options) in the FormRenderer (nevent-work#315).
 *
 * A LIST with options is answered with checkboxes inside a fieldset, its value
 * is a string[] and "required" means at least one box checked. A SELECT keeps
 * its <select>.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FormRenderer } from '../form-renderer';
import type { FieldConfiguration } from '../../types';
import { createNewsletterI18n } from '../i18n';

const GENRES = ['Techno', 'House', 'Hard Techno', 'Hard Groove', 'Tech house'];

function genreField(overrides: Partial<FieldConfiguration> = {}): FieldConfiguration {
  return {
    fieldName: 'gnero_musical',
    propertyDefinitionId: 'prop-genre',
    displayName: 'Género musical',
    hint: null,
    required: true,
    type: 'list',
    options: GENRES.map((g) => ({ value: g, label: g })),
    ...overrides,
  };
}

function boxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  );
}

function check(box: HTMLInputElement, checked = true): void {
  if (box.checked !== checked) box.click();
}

describe('FormRenderer · LIST with options as checkboxes', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('rendering', () => {
    it('renders a fieldset with a legend and one labelled checkbox per option', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      const fieldset = container.querySelector('fieldset');
      expect(fieldset).not.toBeNull();
      expect(container.querySelector('select')).toBeNull();

      const legend = fieldset!.querySelector('legend');
      expect(legend?.textContent).toBe('Género musical *');

      const inputs = boxes(fieldset!);
      expect(inputs.map((i) => i.value)).toEqual(GENRES);
      inputs.forEach((input) => {
        expect(input.name).toBe('gnero_musical');
        expect(input.id).toBeTruthy();
        // Every box has an accessible name from its own <label>
        const label = input.closest('label') ??
          container.querySelector(`label[for="${input.id}"]`);
        expect(label?.textContent?.trim()).toBe(input.value);
      });
      // ids are unique
      expect(new Set(inputs.map((i) => i.id)).size).toBe(inputs.length);
    });

    it('uses the option label as text and the option value as value', () => {
      const renderer = new FormRenderer([
        genreField({
          options: [
            { value: 'tech', label: 'Techno' },
            { value: 'hg', label: 'Hard Groove' },
          ],
        }),
      ]);
      renderer.render(container);

      const inputs = boxes(container);
      expect(inputs.map((i) => i.value)).toEqual(['tech', 'hg']);
      expect(inputs.map((i) => i.closest('label')?.textContent?.trim())).toEqual([
        'Techno',
        'Hard Groove',
      ]);
    });

    it('reads the options from validatorConfiguration.allowedValues too', () => {
      const renderer = new FormRenderer([
        genreField({
          options: undefined,
          validatorConfiguration: {
            type: 'ENUM',
            config: { allowedValues: ['A', 'B'] },
          },
        }),
      ]);
      renderer.render(container);

      expect(boxes(container).map((i) => i.value)).toEqual(['A', 'B']);
    });

    it('has no asterisk in the legend when the field is optional', () => {
      const renderer = new FormRenderer([genreField({ required: false })]);
      renderer.render(container);

      expect(container.querySelector('legend')?.textContent).toBe('Género musical');
    });

    it('keeps the legend for screen readers when labels are hidden', () => {
      const renderer = new FormRenderer([genreField()], {
        input: { labelHidden: true },
      });
      renderer.render(container);

      const legend = container.querySelector('legend');
      expect(legend).not.toBeNull();
      expect(legend!.textContent).toBe('Género musical *');
      expect(legend!.classList.contains('nevent-visually-hidden')).toBe(true);
    });

    it('keeps a SELECT as a <select>', () => {
      const renderer = new FormRenderer([
        genreField({ fieldName: 'talla', type: 'select', options: [{ value: 'M', label: 'M' }] }),
      ]);
      renderer.render(container);

      expect(container.querySelector('select[name="talla"]')).not.toBeNull();
      expect(container.querySelector('fieldset')).toBeNull();
    });

    it('keeps a LIST without options as before (a <select>)', () => {
      const renderer = new FormRenderer([genreField({ options: undefined })]);
      renderer.render(container);

      expect(container.querySelector('fieldset')).toBeNull();
      expect(container.querySelector('select[name="gnero_musical"]')).not.toBeNull();
    });
  });

  describe('keyboard and ARIA', () => {
    it('every box is a native, enabled, focusable checkbox in document order', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      const inputs = boxes(container);
      inputs.forEach((input) => {
        expect(input.disabled).toBe(false);
        expect(input.tabIndex).toBe(0);
        input.focus();
        expect(document.activeElement).toBe(input);
      });
    });

    it('toggling a box (space/click activation) marks its option as checked', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      const [techno] = boxes(container);
      techno.click();
      expect(techno.checked).toBe(true);
      expect(
        techno.closest('.nevent-checkbox-option')?.classList.contains(
          'nevent-checkbox-option--checked'
        )
      ).toBe(true);

      techno.click();
      expect(techno.checked).toBe(false);
      expect(
        techno.closest('.nevent-checkbox-option')?.classList.contains(
          'nevent-checkbox-option--checked'
        )
      ).toBe(false);
    });

    it('a required group with nothing checked is invalid, announced and described by its error', () => {
      const i18n = createNewsletterI18n('es');
      const renderer = new FormRenderer([genreField()], null, (key, params) =>
        i18n.t(key, params)
      );
      renderer.render(container);

      expect(renderer.validateFields()).toBe(false);

      const error = container.querySelector('.nevent-field-error') as HTMLElement;
      expect(error.textContent).toBe('Género musical es obligatorio');
      expect(error.classList.contains('nevent-field-error--hidden')).toBe(false);
      expect(error.id).toBeTruthy();
      expect(error.getAttribute('role')).toBe('alert');

      boxes(container).forEach((input) => {
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
      });
    });
  });

  describe('getFormData, required and reset', () => {
    it('getFormData returns the checked values as string[] in option order', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      const inputs = boxes(container);
      check(inputs[3]); // Hard Groove
      check(inputs[0]); // Techno

      expect(renderer.getFormData().gnero_musical).toEqual(['Techno', 'Hard Groove']);
    });

    it('getFormData returns [] when nothing is checked', () => {
      const renderer = new FormRenderer([genreField({ required: false })]);
      renderer.render(container);

      expect(renderer.getFormData().gnero_musical).toEqual([]);
    });

    it('an option with a comma travels as one element', () => {
      const renderer = new FormRenderer([
        genreField({ options: [{ value: 'Rock, Pop', label: 'Rock, Pop' }] }),
      ]);
      renderer.render(container);

      check(boxes(container)[0]);
      expect(renderer.getFormData().gnero_musical).toEqual(['Rock, Pop']);
    });

    it('required passes with at least one box checked and clears the error', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      expect(renderer.validateFields()).toBe(false);
      check(boxes(container)[1]);
      expect(renderer.validateFields()).toBe(true);

      const error = container.querySelector('.nevent-field-error') as HTMLElement;
      expect(error.classList.contains('nevent-field-error--hidden')).toBe(true);
      boxes(container).forEach((input) => {
        expect(input.getAttribute('aria-invalid')).not.toBe('true');
      });
    });

    it('an optional group with nothing checked is valid', () => {
      const renderer = new FormRenderer([genreField({ required: false })]);
      renderer.render(container);

      expect(renderer.validateFields()).toBe(true);
    });

    it('reset() unchecks every box', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      boxes(container).forEach((b) => check(b));
      renderer.reset();

      boxes(container).forEach((b) => expect(b.checked).toBe(false));
      expect(renderer.getFormData().gnero_musical).toEqual([]);
      expect(container.querySelectorAll('.nevent-checkbox-option--checked').length).toBe(0);
    });
  });

  describe('server field errors', () => {
    it('showFieldError puts a message next to the field and reports whether it found it', () => {
      const renderer = new FormRenderer([genreField()]);
      renderer.render(container);

      expect(renderer.showFieldError('gnero_musical', 'Revisa este campo')).toBe(true);
      const error = container.querySelector('.nevent-field-error') as HTMLElement;
      expect(error.textContent).toBe('Revisa este campo');
      expect(renderer.showFieldError('not-rendered', 'x')).toBe(false);
    });
  });
});
