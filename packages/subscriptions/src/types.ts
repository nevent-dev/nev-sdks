import type { ConsentData, I18nDictionary } from '@nevent/core';

/**
 * Widget layout direction
 */
export type LayoutDirection = 'column' | 'row';

/**
 * Form field configuration
 */
export interface FieldConfig {
  enabled: boolean;
  required: boolean;
  placeholder?: string;
  label?: string;
}

/**
 * Field type for dynamic form fields
 */
export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'url'
  | 'password'
  | 'select'
  | 'list'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'date'
  | 'time'
  | 'file';

/**
 * Field option for select, radio, and checkbox inputs
 */
export interface FieldOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
}

/**
 * Dynamic field configuration from API
 */
export interface FieldConfiguration {
  fieldName: string;
  displayName: string;
  hint?: string | null;
  required: boolean;
  type: FieldType;
  options?: FieldOption[];
  placeholder?: string;
  width?: 25 | 50 | 75 | 100;
  metadata?: Record<string, unknown>;
  validatorConfiguration?: {
    type: string;
    config?: {
      allowedValues?: string[];
      [key: string]: unknown;
    };
  };
}

/**
 * Font type enum
 */
export type FontType = 'GOOGLE_FONT' | 'CUSTOM_FONT';

/**
 * Font configuration
 */
export interface FontConfig {
  family?: string;
  category?: string;
  type?: FontType;
  customFontId?: string;
  files?: Record<string, string>;
}

/**
 * Layout element type for unified form layout
 */
export type LayoutElementType = 'field' | 'legalTerms' | 'submitButton';

/**
 * Layout element configuration
 * Defines width, order, and type for form elements
 */
export interface LayoutElement {
  type: LayoutElementType;
  key: string; // for 'field': matches fieldName; for others: 'legalTerms' or 'submitButton'
  width: 25 | 50 | 75 | 100;
  order: number;
}

/**
 * Widget style configuration
 */
export interface WidgetStyles {
  global?: {
    backgroundColor?: string;
    direction?: LayoutDirection;
    innerPadding?: string;
    spacingBetweenElements?: string;
    containerHeight?: string;
    columnsDistribution?: string;
    font?: FontConfig;
    layoutElements?: LayoutElement[];
  };
  title?: {
    hidden?: boolean;
    fontSize?: string;
    fontWeight?: string;
    color?: string;
    font?: FontConfig;
  };
  subtitle?: {
    hidden?: boolean;
    fontSize?: string;
    color?: string;
    font?: FontConfig;
  };
  input?: {
    font?: FontConfig;
    fontFamily?: string;
    labelFont?: FontConfig;
    labelFontSize?: string;
    labelColor?: string;
    placeholderFont?: FontConfig;
    placeholderFontFamily?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: string;
    borderRadius?: string;
    padding?: string;
    height?: string;
    textColor?: string;
  };
  button?: {
    font?: FontConfig;
    fontFamily?: string;
    backgroundColor?: string;
    hoverBackgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    borderWidth?: string;
    borderRadius?: string;
    padding?: string;
    height?: string;
  };
  layout?: {
    value?: LayoutDirection;
  };
}

/**
 * Newsletter widget configuration
 */
export interface NewsletterConfig {
  // Required
  newsletterId: string;
  tenantId: string;

  // API Configuration
  apiUrl?: string;
  containerId?: string | null;

  // Legacy styles (for backward compatibility)
  theme?: string;
  primaryColor?: string;
  backgroundColor?: string;
  borderRadius?: number | string;

  // Form fields
  fields?: {
    email?: FieldConfig;
    firstName?: FieldConfig;
    lastName?: FieldConfig;
    postalCode?: FieldConfig;
    birthDate?: FieldConfig;
  };

  // Messages
  messages?: I18nDictionary & {
    submit?: string;
    loading?: string;
    success?: string;
    error?: string;
    alreadySubscribed?: string;
    invalidEmail?: string;
    gdprText?: string;
    privacyText?: string;
  };

  // Widget behavior
  analytics?: boolean;
  analyticsUrl?: string;
  resetOnSuccess?: boolean;
  showLabels?: boolean;
  animations?: boolean;
  debug?: boolean;

  // New structure
  styles?: WidgetStyles | null;
  customCSS?: string;

  // Server-provided
  token?: string;
  companyName?: string;
  privacyPolicyUrl?: string;
  title?: string;
  subtitle?: string;

  // Callbacks
  onLoad?: ((widget: unknown) => void) | undefined;
  onSubmit?: ((data: unknown) => void) | undefined;
  onSuccess?: ((response: unknown) => void) | undefined;
  onError?: ((error: Error) => void) | undefined;
}

/**
 * Server configuration response
 */
export interface ServerWidgetConfig {
  theme?: string;
  primaryColor?: string;
  backgroundColor?: string;
  borderRadius?: number | string;
  fields?: NewsletterConfig['fields'];
  messages?: NewsletterConfig['messages'];
  styles?: WidgetStyles;
  customCSS?: string;
  token?: string;
  companyName?: string;
  privacyPolicyUrl?: string;
  title?: string;
  subtitle?: string;
  fieldConfigurations?: FieldConfiguration[];
}

/**
 * Custom font configuration from server
 */
export interface CustomFont {
  id: string;
  family: string;
  files?: Record<string, string>;
}

/**
 * Fonts API response
 */
export interface FontsResponse {
  customFonts?: CustomFont[];
}

/**
 * Subscription form data
 */
export interface SubscriptionData {
  email: string;
  firstName?: string;
  lastName?: string;
  postalCode?: string;
  birthDate?: string;
  consent: ConsentData;
}

/**
 * Subscription API response
 */
export interface SubscriptionResponse {
  success: boolean;
  message?: string;
  subscriptionId?: string;
}
