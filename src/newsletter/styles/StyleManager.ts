/**
 * StyleManager - Centralized CSS custom properties management
 *
 * This class generates CSS with custom properties (CSS variables) that can be
 * overridden by the user without !important. This enables better customization
 * while maintaining security through XSS sanitization.
 *
 * @example
 * ```typescript
 * const styles = StyleManager.generateStyles({
 *   primaryColor: '#ff6600',
 *   buttonRadius: '8px'
 * });
 * ```
 */

import { NewsletterWidgetConfig } from '../types';

/**
 * CSS Variable definitions with default values
 */
export interface CSSVariables {
  // Colors - Primary palette
  'primary-color': string;
  'primary-color-hover': string;
  'primary-color-active': string;
  'primary-text-color': string;

  // Colors - Secondary palette
  'secondary-color': string;
  'secondary-color-hover': string;
  'secondary-text-color': string;

  // Colors - Semantic
  'success-color': string;
  'error-color': string;
  'warning-color': string;
  'info-color': string;

  // Colors - Neutrals
  'text-color': string;
  'text-color-secondary': string;
  'border-color': string;
  'background-color': string;
  'surface-color': string;

  // Typography
  'font-family': string;
  'font-size-base': string;
  'font-size-sm': string;
  'font-size-lg': string;
  'font-weight-normal': string;
  'font-weight-medium': string;
  'font-weight-bold': string;
  'line-height': string;

  // Spacing
  'spacing-xs': string;
  'spacing-sm': string;
  'spacing-md': string;
  'spacing-lg': string;
  'spacing-xl': string;

  // Form elements
  'input-border-color': string;
  'input-border-color-focus': string;
  'input-border-color-error': string;
  'input-bg-color': string;
  'input-text-color': string;
  'input-placeholder-color': string;
  'input-padding': string;
  'input-border-radius': string;
  'input-border-width': string;

  // Buttons
  'button-padding': string;
  'button-border-radius': string;
  'button-font-weight': string;
  'button-text-transform': string;
  'button-box-shadow': string;
  'button-box-shadow-hover': string;

  // Labels and hints
  'label-color': string;
  'label-font-size': string;
  'label-font-weight': string;
  'label-margin-bottom': string;
  'hint-color': string;
  'hint-font-size': string;

  // Transitions
  'transition-duration': string;
  'transition-timing': string;
}

/**
 * Default CSS variable values
 */
const DEFAULT_CSS_VARIABLES: CSSVariables = {
  // Colors - Primary
  'primary-color': '#007bff',
  'primary-color-hover': '#0056b3',
  'primary-color-active': '#004085',
  'primary-text-color': '#ffffff',

  // Colors - Secondary
  'secondary-color': '#6c757d',
  'secondary-color-hover': '#5a6268',
  'secondary-text-color': '#ffffff',

  // Colors - Semantic
  'success-color': '#28a745',
  'error-color': '#dc3545',
  'warning-color': '#ffc107',
  'info-color': '#17a2b8',

  // Colors - Neutrals
  'text-color': '#212529',
  'text-color-secondary': '#6c757d',
  'border-color': '#dee2e6',
  'background-color': '#ffffff',
  'surface-color': '#f8f9fa',

  // Typography
  'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'font-size-base': '16px',
  'font-size-sm': '14px',
  'font-size-lg': '18px',
  'font-weight-normal': '400',
  'font-weight-medium': '500',
  'font-weight-bold': '700',
  'line-height': '1.5',

  // Spacing
  'spacing-xs': '4px',
  'spacing-sm': '8px',
  'spacing-md': '16px',
  'spacing-lg': '24px',
  'spacing-xl': '32px',

  // Form elements
  'input-border-color': '#ced4da',
  'input-border-color-focus': '#80bdff',
  'input-border-color-error': '#dc3545',
  'input-bg-color': '#ffffff',
  'input-text-color': '#495057',
  'input-placeholder-color': '#6c757d',
  'input-padding': '0.75rem 1rem',
  'input-border-radius': '6px',
  'input-border-width': '1px',

  // Buttons
  'button-padding': '0.75rem 1.5rem',
  'button-border-radius': '6px',
  'button-font-weight': '500',
  'button-text-transform': 'none',
  'button-box-shadow': '0 2px 4px rgba(0, 0, 0, 0.1)',
  'button-box-shadow-hover': '0 4px 8px rgba(0, 0, 0, 0.15)',

  // Labels and hints
  'label-color': '#495057',
  'label-font-size': '14px',
  'label-font-weight': '500',
  'label-margin-bottom': '0.5rem',
  'hint-color': '#6c757d',
  'hint-font-size': '12px',

  // Transitions
  'transition-duration': '0.2s',
  'transition-timing': 'ease-in-out',
};

/**
 * StyleManager - Generates CSS with custom properties
 */
export class StyleManager {
  /**
   * Generate CSS with custom properties from config
   *
   * @param config - Newsletter widget configuration
   * @returns CSS string with :root variables
   */
  static generateStyles(config: NewsletterWidgetConfig): string {
    const variables = this.mapConfigToVariables(config);
    const sanitizedVariables = this.sanitizeVariables(variables);

    return this.buildCSSString(sanitizedVariables, config);
  }

  /**
   * Map config to CSS variables
   *
   * @param config - Widget configuration
   * @returns Partial CSS variables object
   */
  private static mapConfigToVariables(config: NewsletterWidgetConfig): Partial<CSSVariables> {
    const variables: Partial<CSSVariables> = {};

    // Map primary color
    if (config.styles?.button?.backgroundColor) {
      variables['primary-color'] = config.styles.button.backgroundColor;
      variables['primary-color-hover'] = this.darkenColor(config.styles.button.backgroundColor, 10);
      variables['primary-color-active'] = this.darkenColor(config.styles.button.backgroundColor, 20);
    }

    // Map text color
    if (config.styles?.button?.color) {
      variables['primary-text-color'] = config.styles.button.color;
    }

    // Map font family
    if (config.styles?.fontFamily) {
      variables['font-family'] = config.styles.fontFamily;
    }

    // Map border radius
    if (config.styles?.borderRadius) {
      variables['input-border-radius'] = config.styles.borderRadius;
      variables['button-border-radius'] = config.styles.borderRadius;
    }

    return variables;
  }

  /**
   * Sanitize CSS variables to prevent XSS
   *
   * @param variables - Partial CSS variables
   * @returns Sanitized CSS variables
   */
  private static sanitizeVariables(variables: Partial<CSSVariables>): CSSVariables {
    const sanitized = { ...DEFAULT_CSS_VARIABLES };

    for (const [key, value] of Object.entries(variables)) {
      if (value && this.isValidCSSValue(value)) {
        sanitized[key as keyof CSSVariables] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate CSS value to prevent XSS
   *
   * @param value - CSS value to validate
   * @returns True if valid
   */
  private static isValidCSSValue(value: string): boolean {
    // Block dangerous patterns
    const dangerousPatterns = [
      /javascript:/i,
      /expression\(/i,
      /<script/i,
      /on\w+\s*=/i,
      /url\(.*data:.*\)/i,
    ];

    return !dangerousPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Build CSS string with :root variables and component styles
   *
   * @param variables - Sanitized CSS variables
   * @param config - Widget configuration
   * @returns Complete CSS string
   */
  private static buildCSSString(variables: CSSVariables, config: NewsletterWidgetConfig): string {
    const cssVars = Object.entries(variables)
      .map(([key, value]) => `  --nw-${key}: ${value};`)
      .join('\n');

    return `
:root {
${cssVars}
}

.newsletter-widget {
  font-family: var(--nw-font-family);
  color: var(--nw-text-color);
  background-color: var(--nw-background-color);
  font-size: var(--nw-font-size-base);
  line-height: var(--nw-line-height);
}

.newsletter-widget__container {
  background: var(--nw-surface-color);
  padding: var(--nw-spacing-lg);
  border-radius: var(--nw-input-border-radius);
}

.newsletter-widget__form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-spacing-md);
}

.newsletter-widget__field {
  display: flex;
  flex-direction: column;
  gap: var(--nw-spacing-xs);
}

.newsletter-widget__label {
  color: var(--nw-label-color);
  font-size: var(--nw-label-font-size);
  font-weight: var(--nw-label-font-weight);
  margin-bottom: var(--nw-label-margin-bottom);
}

.newsletter-widget__label--required::after {
  content: ' *';
  color: var(--nw-error-color);
}

.newsletter-widget__input,
.newsletter-widget__textarea,
.newsletter-widget__select {
  padding: var(--nw-input-padding);
  border: var(--nw-input-border-width) solid var(--nw-input-border-color);
  border-radius: var(--nw-input-border-radius);
  background-color: var(--nw-input-bg-color);
  color: var(--nw-input-text-color);
  font-size: var(--nw-font-size-base);
  font-family: var(--nw-font-family);
  transition: border-color var(--nw-transition-duration) var(--nw-transition-timing),
              box-shadow var(--nw-transition-duration) var(--nw-transition-timing);
  width: 100%;
  box-sizing: border-box;
}

.newsletter-widget__input::placeholder,
.newsletter-widget__textarea::placeholder {
  color: var(--nw-input-placeholder-color);
}

.newsletter-widget__input:focus,
.newsletter-widget__textarea:focus,
.newsletter-widget__select:focus {
  outline: none;
  border-color: var(--nw-input-border-color-focus);
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.newsletter-widget__input--error,
.newsletter-widget__textarea--error,
.newsletter-widget__select--error {
  border-color: var(--nw-input-border-color-error);
}

.newsletter-widget__input--error:focus,
.newsletter-widget__textarea--error:focus,
.newsletter-widget__select--error:focus {
  box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1);
}

.newsletter-widget__textarea {
  min-height: 100px;
  resize: vertical;
}

.newsletter-widget__hint {
  color: var(--nw-hint-color);
  font-size: var(--nw-hint-font-size);
  margin-top: var(--nw-spacing-xs);
}

.newsletter-widget__error {
  color: var(--nw-error-color);
  font-size: var(--nw-hint-font-size);
  margin-top: var(--nw-spacing-xs);
}

.newsletter-widget__button {
  padding: var(--nw-button-padding);
  background-color: var(--nw-primary-color);
  color: var(--nw-primary-text-color);
  border: none;
  border-radius: var(--nw-button-border-radius);
  font-size: var(--nw-font-size-base);
  font-weight: var(--nw-button-font-weight);
  font-family: var(--nw-font-family);
  text-transform: var(--nw-button-text-transform);
  cursor: pointer;
  transition: background-color var(--nw-transition-duration) var(--nw-transition-timing),
              box-shadow var(--nw-transition-duration) var(--nw-transition-timing),
              transform var(--nw-transition-duration) var(--nw-transition-timing);
  box-shadow: var(--nw-button-box-shadow);
}

.newsletter-widget__button:hover:not(:disabled) {
  background-color: var(--nw-primary-color-hover);
  box-shadow: var(--nw-button-box-shadow-hover);
  transform: translateY(-1px);
}

.newsletter-widget__button:active:not(:disabled) {
  background-color: var(--nw-primary-color-active);
  transform: translateY(0);
}

.newsletter-widget__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.newsletter-widget__success {
  padding: var(--nw-spacing-md);
  background-color: var(--nw-success-color);
  color: white;
  border-radius: var(--nw-input-border-radius);
  text-align: center;
}

.newsletter-widget__error-message {
  padding: var(--nw-spacing-md);
  background-color: var(--nw-error-color);
  color: white;
  border-radius: var(--nw-input-border-radius);
  text-align: center;
}

/* Responsive */
@media (max-width: 640px) {
  .newsletter-widget__container {
    padding: var(--nw-spacing-md);
  }

  .newsletter-widget__form {
    gap: var(--nw-spacing-sm);
  }

  .newsletter-widget__input,
  .newsletter-widget__textarea,
  .newsletter-widget__button {
    font-size: var(--nw-font-size-sm);
  }
}
`;
  }

  /**
   * Darken a color by a percentage
   *
   * @param color - Hex color (e.g., '#007bff')
   * @param percent - Percentage to darken (0-100)
   * @returns Darkened hex color
   */
  private static darkenColor(color: string, percent: number): string {
    // Remove # if present
    const hex = color.replace('#', '');

    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Darken
    const factor = 1 - (percent / 100);
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    // Convert back to hex
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }

  /**
   * Lighten a color by a percentage
   *
   * @param color - Hex color (e.g., '#007bff')
   * @param percent - Percentage to lighten (0-100)
   * @returns Lightened hex color
   */
  static lightenColor(color: string, percent: number): string {
    // Remove # if present
    const hex = color.replace('#', '');

    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Lighten
    const factor = percent / 100;
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);

    // Convert back to hex
    const toHex = (n: number) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }
}
