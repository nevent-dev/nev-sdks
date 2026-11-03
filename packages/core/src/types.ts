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
  /** Retry policy for this request only; the client's defaults apply to the rest. */
  retry?: RequestRetryPolicy;
}

/**
 * Narrows how one request is retried without touching the client's defaults.
 */
export interface RequestRetryPolicy {
  /** Maximum retry attempts for this request (defaults to the client's). */
  maxRetries?: number;
  /**
   * HTTP statuses this request retries. A network failure (no status) is
   * always retried. Defaults to the client's set (500, 502, 503, 504, 408, 429).
   */
  retryableStatuses?: number[];
}

/** Per-request options of the HttpClient convenience methods. */
export type RequestOptions = Pick<RequestConfig, 'headers' | 'timeout' | 'retry'>;

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
