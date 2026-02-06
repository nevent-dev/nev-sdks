/**
 * StyleManager - Centralized CSS Variables Management
 *
 * Manages CSS custom properties for newsletter widget theming.
 * Enables deep customization without !important overrides.
 *
 * @example
 * ```typescript
 * const styleManager = new StyleManager({
 *   customCSS: {
 *     '--nev-primary-color': '#ff6b6b',
 *     '--nev-font-family': 'Inter, sans-serif'
 *   }
 * });
 * const css = styleManager.generateCSS();
 * ```
 */

export interface FormStyles {
  theme?: 'light' | 'dark' | 'custom';
  customCSS?: Record<string, string>;
  globalStyles?: string;
}

export interface CSSVariables {
  // Colors
  '--nev-primary-color'?: string;
  '--nev-secondary-color'?: string;
  '--nev-success-color'?: string;
  '--nev-error-color'?: string;
  '--nev-text-color'?: string;
  '--nev-bg-color'?: string;
  '--nev-hover-bg'?: string;
  '--nev-disabled-color'?: string;

  // Typography
  '--nev-font-family'?: string;
  '--nev-font-size-base'?: string;
  '--nev-font-size-small'?: string;
  '--nev-font-size-large'?: string;
  '--nev-font-weight-normal'?: string;
  '--nev-font-weight-bold'?: string;
  '--nev-line-height'?: string;

  // Spacing
  '--nev-spacing-xs'?: string;
  '--nev-spacing-sm'?: string;
  '--nev-spacing-md'?: string;
  '--nev-spacing-lg'?: string;
  '--nev-spacing-xl'?: string;

  // Form Elements
  '--nev-input-border-color'?: string;
  '--nev-input-border-width'?: string;
  '--nev-input-border-radius'?: string;
  '--nev-input-padding'?: string;
  '--nev-input-focus-border-color'?: string;
  '--nev-input-error-border-color'?: string;
  '--nev-input-disabled-bg'?: string;

  // Buttons
  '--nev-button-bg'?: string;
  '--nev-button-text-color'?: string;
  '--nev-button-border-radius'?: string;
  '--nev-button-padding'?: string;
  '--nev-button-hover-opacity'?: string;
  '--nev-button-disabled-opacity'?: string;
}

export class StyleManager {
  private static readonly DEFAULT_VARIABLES: CSSVariables = {
    // Colors
    '--nev-primary-color': '#007bff',
    '--nev-secondary-color': '#6c757d',
    '--nev-success-color': '#28a745',
    '--nev-error-color': '#dc3545',
    '--nev-text-color': '#333333',
    '--nev-bg-color': '#ffffff',
    '--nev-hover-bg': '#f8f9fa',
    '--nev-disabled-color': '#cccccc',

    // Typography
    '--nev-font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    '--nev-font-size-base': '16px',
    '--nev-font-size-small': '14px',
    '--nev-font-size-large': '18px',
    '--nev-font-weight-normal': '400',
    '--nev-font-weight-bold': '600',
    '--nev-line-height': '1.5',

    // Spacing
    '--nev-spacing-xs': '4px',
    '--nev-spacing-sm': '8px',
    '--nev-spacing-md': '16px',
    '--nev-spacing-lg': '24px',
    '--nev-spacing-xl': '32px',

    // Form Elements
    '--nev-input-border-color': '#ced4da',
    '--nev-input-border-width': '1px',
    '--nev-input-border-radius': '4px',
    '--nev-input-padding': '8px 12px',
    '--nev-input-focus-border-color': '#007bff',
    '--nev-input-error-border-color': '#dc3545',
    '--nev-input-disabled-bg': '#e9ecef',

    // Buttons
    '--nev-button-bg': '#007bff',
    '--nev-button-text-color': '#ffffff',
    '--nev-button-border-radius': '4px',
    '--nev-button-padding': '10px 20px',
    '--nev-button-hover-opacity': '0.9',
    '--nev-button-disabled-opacity': '0.6',
  };

  private static readonly DARK_THEME_VARIABLES: Partial<CSSVariables> = {
    '--nev-primary-color': '#4dabf7',
    '--nev-secondary-color': '#adb5bd',
    '--nev-text-color': '#f8f9fa',
    '--nev-bg-color': '#1a1a1a',
    '--nev-hover-bg': '#2d2d2d',
    '--nev-input-border-color': '#495057',
    '--nev-input-disabled-bg': '#343a40',
  };

  private variables: CSSVariables;
  private globalStyles: string;

  constructor(config: FormStyles = {}) {
    // Start with defaults
    this.variables = { ...StyleManager.DEFAULT_VARIABLES };

    // Apply theme preset if specified
    if (config.theme === 'dark') {
      Object.assign(this.variables, StyleManager.DARK_THEME_VARIABLES);
    }

    // Apply custom CSS variables (highest priority)
    if (config.customCSS) {
      Object.assign(this.variables, config.customCSS);
    }

    this.globalStyles = config.globalStyles || '';
  }

  /**
   * Generates complete CSS string with variables and component styles
   */
  generateCSS(): string {
    const cssVariables = this.generateCSSVariables();
    const componentStyles = this.generateComponentStyles();

    return `
      ${cssVariables}
      ${componentStyles}
      ${this.globalStyles}
    `.trim();
  }

  /**
   * Generates :root CSS variables block
   */
  private generateCSSVariables(): string {
    const entries = Object.entries(this.variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    return `
:root {
${entries}
}
    `.trim();
  }

  /**
   * Generates component-specific styles using CSS variables
   */
  private generateComponentStyles(): string {
    return `
/* Newsletter Widget Container */
.nevent-newsletter-widget {
  font-family: var(--nev-font-family);
  font-size: var(--nev-font-size-base);
  line-height: var(--nev-line-height);
  color: var(--nev-text-color);
  background: var(--nev-bg-color);
}

/* Form Container */
.nevent-form {
  display: flex;
  flex-direction: column;
  gap: var(--nev-spacing-md);
}

/* Field Container */
.nevent-field {
  display: flex;
  flex-direction: column;
  gap: var(--nev-spacing-xs);
}

/* Labels */
.nevent-label {
  font-weight: var(--nev-font-weight-bold);
  font-size: var(--nev-font-size-base);
  color: var(--nev-text-color);
}

.nevent-label .required {
  color: var(--nev-error-color);
  margin-left: 2px;
}

/* Input Fields */
.nevent-input {
  padding: var(--nev-input-padding);
  border: var(--nev-input-border-width) solid var(--nev-input-border-color);
  border-radius: var(--nev-input-border-radius);
  font-family: var(--nev-font-family);
  font-size: var(--nev-font-size-base);
  color: var(--nev-text-color);
  background: var(--nev-bg-color);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.nevent-input:focus {
  outline: none;
  border-color: var(--nev-input-focus-border-color);
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.nevent-input.error {
  border-color: var(--nev-input-error-border-color);
}

.nevent-input:disabled {
  background: var(--nev-input-disabled-bg);
  color: var(--nev-disabled-color);
  cursor: not-allowed;
}

/* Select */
.nevent-select {
  padding: var(--nev-input-padding);
  border: var(--nev-input-border-width) solid var(--nev-input-border-color);
  border-radius: var(--nev-input-border-radius);
  font-family: var(--nev-font-family);
  font-size: var(--nev-font-size-base);
  color: var(--nev-text-color);
  background: var(--nev-bg-color);
  cursor: pointer;
}

/* Textarea */
.nevent-textarea {
  padding: var(--nev-input-padding);
  border: var(--nev-input-border-width) solid var(--nev-input-border-color);
  border-radius: var(--nev-input-border-radius);
  font-family: var(--nev-font-family);
  font-size: var(--nev-font-size-base);
  color: var(--nev-text-color);
  background: var(--nev-bg-color);
  resize: vertical;
  min-height: 100px;
}

/* Checkbox & Radio */
.nevent-checkbox,
.nevent-radio {
  display: flex;
  align-items: center;
  gap: var(--nev-spacing-sm);
  cursor: pointer;
}

.nevent-checkbox input[type="checkbox"],
.nevent-radio input[type="radio"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--nev-primary-color);
}

/* Hint Text */
.nevent-field-hint {
  font-size: var(--nev-font-size-small);
  color: var(--nev-secondary-color);
}

/* Error Messages */
.nevent-field-error {
  font-size: var(--nev-font-size-small);
  color: var(--nev-error-color);
  font-weight: var(--nev-font-weight-normal);
}

/* Submit Button */
.nevent-submit-button {
  padding: var(--nev-button-padding);
  background: var(--nev-button-bg);
  color: var(--nev-button-text-color);
  border: none;
  border-radius: var(--nev-button-border-radius);
  font-family: var(--nev-font-family);
  font-size: var(--nev-font-size-base);
  font-weight: var(--nev-font-weight-bold);
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.nevent-submit-button:hover {
  opacity: var(--nev-button-hover-opacity);
}

.nevent-submit-button:disabled {
  opacity: var(--nev-button-disabled-opacity);
  cursor: not-allowed;
}

/* Success/Error Messages */
.nevent-message {
  padding: var(--nev-spacing-md);
  border-radius: var(--nev-input-border-radius);
  font-size: var(--nev-font-size-base);
  margin-top: var(--nev-spacing-md);
}

.nevent-message.success {
  background: var(--nev-success-color);
  color: white;
}

.nevent-message.error {
  background: var(--nev-error-color);
  color: white;
}

/* Responsive Design */
@media (max-width: 768px) {
  .nevent-newsletter-widget {
    font-size: 14px;
  }

  .nevent-input,
  .nevent-select,
  .nevent-textarea,
  .nevent-submit-button {
    font-size: 14px;
  }
}
    `.trim();
  }

  /**
   * Get current variable value
   */
  getVariable(name: keyof CSSVariables): string | undefined {
    return this.variables[name];
  }

  /**
   * Set variable value at runtime
   */
  setVariable(name: keyof CSSVariables, value: string): void {
    this.variables[name] = value;
  }

  /**
   * Merge additional variables
   */
  mergeVariables(variables: Partial<CSSVariables>): void {
    Object.assign(this.variables, variables);
  }

  /**
   * Reset to default theme
   */
  resetToDefaults(): void {
    this.variables = { ...StyleManager.DEFAULT_VARIABLES };
  }

  /**
   * Export current variables as object
   */
  exportVariables(): CSSVariables {
    return { ...this.variables };
  }
}
