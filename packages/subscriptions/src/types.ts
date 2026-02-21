import type {
  ConsentData,
  I18nDictionary,
  NormalizedError,
} from '@nevent/core';

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
 * API data types from backend contract
 */
export type ApiDataType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'LIST';

/**
 * Raw field configuration from backend API (GET /public/widget/{id}/config)
 */
export interface ApiFieldConfiguration {
  propertyDefinitionId: string;
  enabled: boolean;
  required: boolean;
  displayOrder: number;
  width?: number;
  displayName: string | null;
  hint: string | null;
  placeholder: string | null;
  semanticKey?: string;
  dataType: ApiDataType;
  options?: Array<{ value: string; label: string } | string> | null;
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
  propertyDefinitionId?: string;
  displayName: string;
  hint?: string | null;
  required: boolean;
  type: FieldType;
  options?: FieldOption[];
  placeholder?: string;
  width?: number;
  displayOrder?: number;
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
  width: number;
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
    labelHidden?: boolean;
    placeholderFont?: FontConfig;
    placeholderFontFamily?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: string;
    borderRadius?: string;
    padding?: string;
    height?: string;
    textColor?: string;
    hintHidden?: boolean;
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

  // Internationalization
  locale?: string;

  // Sentry Error Reporting
  /**
   * Configuration for lightweight Sentry error reporting.
   *
   * When provided (or when not explicitly disabled), errors caught by the
   * ErrorBoundary are automatically forwarded to Sentry for tracking.
   *
   * By default, errors are sent through the Nevent diagnostics tunnel
   * endpoint (`{apiUrl}/diagnostics`) to bypass ad-blockers.
   */
  sentry?:
    | {
        /** Whether Sentry reporting is enabled. Default: true */
        enabled?: boolean;
        /** Sentry DSN. Default: Nevent's shared SDK DSN */
        dsn?: string;
        /** Tunnel URL for bypassing ad-blockers. Default: `{apiUrl}/diagnostics` */
        tunnel?: string;
        /** Environment tag. Default: auto-detected from apiUrl */
        environment?: string;
        /** Sample rate (0-1). Default: 1.0 */
        sampleRate?: number;
        /** Pre-send filter/modifier hook */
        beforeSend?: (event: unknown) => unknown | null;
      }
    | undefined;

  // Widget behavior
  analytics?: boolean;
  analyticsUrl?: string;
  resetOnSuccess?: boolean;
  showLabels?: boolean;
  animations?: boolean;
  debug?: boolean;
  /** Show "Powered by Nevent" branding footer. Default: true */
  showBranding?: boolean;

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
  onError?: ((error: Error | NormalizedError) => void) | undefined;
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
  fieldConfigurations?: ApiFieldConfiguration[];
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
  properties?: Record<string, string>;
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
