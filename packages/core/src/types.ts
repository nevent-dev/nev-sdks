/**
 * Core types shared across Nevent SDKs
 */

/**
 * API error response structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * API success response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

/**
 * HTTP request configuration
 */
export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Widget base configuration
 */
export interface WidgetConfig {
  apiUrl: string;
  apiKey: string;
  locale?: string;
  debug?: boolean;
}

/**
 * GDPR consent tracking
 */
export interface ConsentData {
  marketing: boolean;
  analytics?: boolean;
  timestamp: string;
}

/**
 * Localization dictionary
 */
export type I18nDictionary = Record<string, string>;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
