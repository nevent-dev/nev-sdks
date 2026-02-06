import { StyleManager } from '../StyleManager';

describe('StyleManager', () => {
  describe('Constructor', () => {
    it('should initialize with default variables', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('--nev-primary-color: #007bff');
      expect(css).toContain('--nev-font-family');
      expect(css).toContain('--nev-spacing-md');
    });

    it('should apply custom CSS variables', () => {
      const styleManager = new StyleManager({
        customCSS: {
          '--nev-primary-color': '#ff6b6b',
          '--nev-font-family': 'Inter, sans-serif',
        },
      });

      const css = styleManager.generateCSS();

      expect(css).toContain('--nev-primary-color: #ff6b6b');
      expect(css).toContain('--nev-font-family: Inter, sans-serif');
    });

    it('should apply dark theme preset', () => {
      const styleManager = new StyleManager({ theme: 'dark' });
      const css = styleManager.generateCSS();

      expect(css).toContain('--nev-primary-color: #4dabf7');
      expect(css).toContain('--nev-bg-color: #1a1a1a');
      expect(css).toContain('--nev-text-color: #f8f9fa');
    });

    it('should prioritize custom CSS over theme preset', () => {
      const styleManager = new StyleManager({
        theme: 'dark',
        customCSS: {
          '--nev-primary-color': '#custom-color',
        },
      });

      const css = styleManager.generateCSS();

      expect(css).toContain('--nev-primary-color: #custom-color');
    });
  });

  describe('generateCSS', () => {
    it('should generate complete CSS with variables and styles', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      // Check for CSS variables block
      expect(css).toContain(':root {');

      // Check for component styles
      expect(css).toContain('.nevent-newsletter-widget');
      expect(css).toContain('.nevent-form');
      expect(css).toContain('.nevent-input');
      expect(css).toContain('.nevent-submit-button');
    });

    it('should include global styles when provided', () => {
      const customStyles = '.custom-class { color: red; }';
      const styleManager = new StyleManager({
        globalStyles: customStyles,
      });

      const css = styleManager.generateCSS();

      expect(css).toContain(customStyles);
    });

    it('should use CSS variables in component styles', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('var(--nev-font-family)');
      expect(css).toContain('var(--nev-input-padding)');
      expect(css).toContain('var(--nev-primary-color)');
    });
  });

  describe('Variable Management', () => {
    it('should get variable value', () => {
      const styleManager = new StyleManager();
      const primaryColor = styleManager.getVariable('--nev-primary-color');

      expect(primaryColor).toBe('#007bff');
    });

    it('should set variable value at runtime', () => {
      const styleManager = new StyleManager();
      styleManager.setVariable('--nev-primary-color', '#new-color');

      const value = styleManager.getVariable('--nev-primary-color');
      expect(value).toBe('#new-color');
    });

    it('should merge additional variables', () => {
      const styleManager = new StyleManager();
      styleManager.mergeVariables({
        '--nev-primary-color': '#merged-color',
        '--nev-secondary-color': '#another-color',
      });

      const css = styleManager.generateCSS();

      expect(css).toContain('--nev-primary-color: #merged-color');
      expect(css).toContain('--nev-secondary-color: #another-color');
    });

    it('should reset to defaults', () => {
      const styleManager = new StyleManager({
        customCSS: { '--nev-primary-color': '#custom' },
      });

      styleManager.resetToDefaults();
      const value = styleManager.getVariable('--nev-primary-color');

      expect(value).toBe('#007bff');
    });

    it('should export variables as object', () => {
      const styleManager = new StyleManager({
        customCSS: { '--nev-primary-color': '#export-test' },
      });

      const exported = styleManager.exportVariables();

      expect(exported['--nev-primary-color']).toBe('#export-test');
      expect(exported['--nev-font-family']).toBeDefined();
    });
  });

  describe('Responsive Styles', () => {
    it('should include mobile media queries', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('@media (max-width: 768px)');
    });
  });

  describe('Component Styles', () => {
    it('should include all standard form components', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      const expectedClasses = [
        '.nevent-form',
        '.nevent-field',
        '.nevent-label',
        '.nevent-input',
        '.nevent-select',
        '.nevent-textarea',
        '.nevent-checkbox',
        '.nevent-radio',
        '.nevent-submit-button',
        '.nevent-field-hint',
        '.nevent-field-error',
        '.nevent-message',
      ];

      expectedClasses.forEach((className) => {
        expect(css).toContain(className);
      });
    });

    it('should apply proper state styles', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('.nevent-input:focus');
      expect(css).toContain('.nevent-input.error');
      expect(css).toContain('.nevent-input:disabled');
      expect(css).toContain('.nevent-submit-button:hover');
      expect(css).toContain('.nevent-submit-button:disabled');
    });
  });

  describe('Accessibility', () => {
    it('should include focus styles for inputs', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('.nevent-input:focus');
      expect(css).toContain('box-shadow');
    });

    it('should use accent-color for checkboxes', () => {
      const styleManager = new StyleManager();
      const css = styleManager.generateCSS();

      expect(css).toContain('accent-color: var(--nev-primary-color)');
    });
  });
});
