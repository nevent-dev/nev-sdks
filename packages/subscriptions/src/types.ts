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
 * Font configuration
 */
export interface FontConfig {
  family?: string;
  category?: string;
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
    fontFamily?: string;
    placeholderFontFamily?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderRadius?: string;
    padding?: string;
  };
  button?: {
    fontFamily?: string;
    backgroundColor?: string;
    hoverBackgroundColor?: string;
    textColor?: string;
    borderRadius?: string;
    padding?: string;
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
