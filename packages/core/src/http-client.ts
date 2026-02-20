import type { ApiError, ApiResponse, RequestConfig } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the HttpClient.
 *
 * Controls timeout, retry behavior, and other client-level settings.
 */
export interface HttpClientConfig {
  /**
   * Default request timeout in milliseconds.
   * Applies to all requests unless overridden per-request via
   * `RequestConfig.timeout`.
   *
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for failed requests.
   * Set to `0` to disable retries entirely.
   *
   * Only retries on network errors and 5xx status codes.
   * Does not retry 4xx client errors.
   *
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for exponential backoff between retries.
   * Actual delay = `retryDelay * 2^attemptNumber` (with jitter).
   *
   * @default 1000 (1 second)
   */
  retryDelay?: number;

  /**
   * Whether to check `navigator.onLine` before making requests.
   * When enabled and the browser reports offline status, requests
   * are immediately rejected with an OFFLINE error.
   *
   * @default true
   */
  offlineDetection?: boolean;
}

/**
 * Request interceptor function.
 *
 * Called before each request is sent. Can modify the URL, headers, or
 * other fetch options. Must return the (possibly modified) fetch options.
 *
 * @param url - The full request URL
 * @param options - The fetch options (method, headers, body, etc.)
 * @returns The (possibly modified) fetch options
 */
export type RequestInterceptor = (
  url: string,
  options: RequestInit,
) => RequestInit | Promise<RequestInit>;

/**
 * Response interceptor function.
 *
 * Called after each successful response is received (before JSON parsing).
 * Can inspect or modify the response. Must return the (possibly modified)
 * response.
 *
 * @param response - The fetch Response object
 * @returns The (possibly modified) Response
 */
export type ResponseInterceptor = (
  response: Response,
) => Response | Promise<Response>;

// ============================================================================
// Constants
// ============================================================================

/** Default request timeout: 30 seconds */
const DEFAULT_TIMEOUT = 30_000;

/** Default maximum retry attempts */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay for exponential backoff: 1 second */
const DEFAULT_RETRY_DELAY = 1_000;

/**
 * HTTP status codes that are eligible for retry.
 * Only server errors (5xx) are retried; client errors (4xx) are not.
 */
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504, 408, 429]);

// ============================================================================
// HttpClient Class
// ============================================================================

/**
 * HTTP client for Nevent API requests.
 *
 * Provides a consistent interface for making HTTP requests with:
 * - Automatic JSON parsing
 * - Configurable timeout with AbortController
 * - Retry logic with exponential backoff and jitter
 * - Offline detection (navigator.onLine)
 * - Request/response interceptors
 * - Typed error handling
 *
 * @example
 * ```typescript
 * const client = new HttpClient('https://api.nevent.io', 'api-key-123', {
 *   timeout: 15000,
 *   maxRetries: 2,
 * });
 *
 * // Add a request interceptor for logging
 * client.addRequestInterceptor((url, options) => {
 *   console.log(`[API] ${options.method} ${url}`);
 *   return options;
 * });
 *
 * const response = await client.get<UserData>('/users/me');
 * ```
 */
export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private readonly config: Required<HttpClientConfig>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  /**
   * Creates a new HTTP client instance.
   *
   * @param baseUrl - Base URL for all requests (trailing slash is removed)
   * @param apiKey - API key for authentication (sent via X-API-Key header)
   * @param config - Optional client configuration for timeout, retry, etc.
   */
  constructor(
    baseUrl: string,
    apiKey: string,
    config?: HttpClientConfig,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    };
    this.config = {
      timeout: config?.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelay: config?.retryDelay ?? DEFAULT_RETRY_DELAY,
      offlineDetection: config?.offlineDetection ?? true,
    };
  }

  // --------------------------------------------------------------------------
  // Interceptor Management
  // --------------------------------------------------------------------------

  /**
   * Registers a request interceptor.
   *
   * Request interceptors are called in registration order before each
   * request. Each interceptor receives the URL and fetch options and must
   * return the (possibly modified) options.
   *
   * @param interceptor - The request interceptor function
   *
   * @example
   * ```typescript
   * client.addRequestInterceptor((url, options) => {
   *   options.headers = {
   *     ...options.headers as Record<string, string>,
   *     'X-Request-Id': crypto.randomUUID(),
   *   };
   *   return options;
   * });
   * ```
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Registers a response interceptor.
   *
   * Response interceptors are called in registration order after each
   * successful fetch (before JSON parsing). Each interceptor receives
   * the Response object and must return the (possibly modified) response.
   *
   * @param interceptor - The response interceptor function
   *
   * @example
   * ```typescript
   * client.addResponseInterceptor((response) => {
   *   console.log(`[API] ${response.status} ${response.url}`);
   *   return response;
   * });
   * ```
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------

  /**
   * Makes an HTTP request with timeout, retry, and offline detection.
   *
   * @typeParam T - Expected response data type
   * @param endpoint - API endpoint path (e.g., '/subscriptions')
   * @param config - Request configuration (method, headers, body, timeout)
   * @returns Promise resolving to the API response
   * @throws {ApiError} When request fails, times out, or device is offline
   *
   * @example
   * ```typescript
   * const response = await client.request<User[]>('/users', {
   *   method: 'GET',
   *   timeout: 5000, // Override default timeout for this request
   * });
   * ```
   */
  async request<T>(
    endpoint: string,
    config: RequestConfig,
  ): Promise<ApiResponse<T>> {
    // Offline detection
    if (this.config.offlineDetection && !this.isOnline()) {
      throw this.createError(0, {
        message: 'No internet connection',
        code: 'OFFLINE',
      });
    }

    const url = `${this.baseUrl}${endpoint}`;
    const timeout = config.timeout ?? this.config.timeout;
    let lastError: ApiError | undefined;

    // Attempt request with retries
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Wait before retry (skip delay on first attempt)
      if (attempt > 0) {
        await this.backoff(attempt);
      }

      try {
        return await this.executeRequest<T>(url, config, timeout);
      } catch (error) {
        lastError = error as ApiError;

        // Only retry on retryable errors
        if (!this.isRetryable(lastError) || attempt === this.config.maxRetries) {
          throw lastError;
        }
      }
    }

    // This should never be reached due to the throw in the loop,
    // but TypeScript needs it for completeness
    throw lastError ?? this.createError(0, { message: 'Request failed' });
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Makes a GET request.
   *
   * @typeParam T - Expected response data type
   * @param endpoint - API endpoint path
   * @returns Promise resolving to the API response
   */
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * Makes a POST request.
   *
   * @typeParam T - Expected response data type
   * @param endpoint - API endpoint path
   * @param body - Request body (will be JSON stringified)
   * @returns Promise resolving to the API response
   */
  async post<T>(
    endpoint: string,
    body: unknown,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  /**
   * Makes a PUT request.
   *
   * @typeParam T - Expected response data type
   * @param endpoint - API endpoint path
   * @param body - Request body (will be JSON stringified)
   * @returns Promise resolving to the API response
   */
  async put<T>(
    endpoint: string,
    body: unknown,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  /**
   * Makes a DELETE request.
   *
   * @typeParam T - Expected response data type
   * @param endpoint - API endpoint path
   * @returns Promise resolving to the API response
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // --------------------------------------------------------------------------
  // Private: Request Execution
  // --------------------------------------------------------------------------

  /**
   * Executes a single HTTP request with timeout and interceptors.
   *
   * @typeParam T - Expected response data type
   * @param url - Full request URL
   * @param config - Request configuration
   * @param timeout - Timeout in milliseconds
   * @returns Promise resolving to the API response
   */
  private async executeRequest<T>(
    url: string,
    config: RequestConfig,
    timeout: number,
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let fetchOptions: RequestInit = {
        method: config.method,
        headers: { ...this.defaultHeaders, ...config.headers },
        signal: controller.signal,
      };

      if (config.body) {
        fetchOptions.body = JSON.stringify(config.body);
      }

      // Apply request interceptors
      for (const interceptor of this.requestInterceptors) {
        fetchOptions = await interceptor(url, fetchOptions);
      }

      let response = await fetch(url, fetchOptions);

      // Apply response interceptors
      for (const interceptor of this.responseInterceptors) {
        response = await interceptor(response);
      }

      const data = (await response.json()) as ApiResponse<T>;

      if (!response.ok) {
        throw this.createError(response.status, data);
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(408, {
          message: 'Request timeout',
          code: 'TIMEOUT',
        });
      }

      // Re-throw ApiErrors as-is
      if (this.isApiError(error)) {
        throw error;
      }

      // Wrap unexpected errors
      throw this.createError(0, {
        message:
          error instanceof Error
            ? error.message
            : 'Network request failed',
        code: 'NETWORK_ERROR',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --------------------------------------------------------------------------
  // Private: Retry Logic
  // --------------------------------------------------------------------------

  /**
   * Determines whether a failed request should be retried.
   *
   * Retryable conditions:
   * - Network errors (status 0)
   * - Server errors: 500, 502, 503, 504
   * - Timeout: 408
   * - Rate limited: 429
   *
   * Non-retryable:
   * - Client errors: 400, 401, 403, 404, 409, 422, etc.
   *
   * @param error - The API error to evaluate
   * @returns `true` if the request should be retried
   */
  private isRetryable(error: ApiError): boolean {
    // Network errors (no status) are retryable
    if (!error.status || error.status === 0) return true;

    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  /**
   * Waits for an exponentially increasing delay with jitter before retrying.
   *
   * Delay formula: `baseDelay * 2^attempt + random jitter`
   * The jitter prevents thundering herd problems when multiple clients
   * retry simultaneously.
   *
   * @param attempt - The retry attempt number (1-based)
   * @returns Promise that resolves after the delay
   */
  private backoff(attempt: number): Promise<void> {
    const baseDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * this.config.retryDelay * 0.5;
    const delay = baseDelay + jitter;

    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  // --------------------------------------------------------------------------
  // Private: Error Handling
  // --------------------------------------------------------------------------

  /**
   * Creates a standardized API error object.
   *
   * @param status - HTTP status code (0 for network errors)
   * @param data - Error data payload
   * @returns A structured ApiError object
   */
  private createError(status: number, data: unknown): ApiError {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : 'Request failed';

    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? String(data.code)
        : `HTTP_${status}`;

    return {
      message,
      status,
      code,
      details:
        typeof data === 'object' ? (data as Record<string, unknown>) : {},
    };
  }

  /**
   * Type guard to check if a value is an ApiError.
   *
   * @param error - The value to check
   * @returns `true` if the value has ApiError shape
   */
  private isApiError(error: unknown): error is ApiError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'status' in error
    );
  }

  // --------------------------------------------------------------------------
  // Private: Connectivity
  // --------------------------------------------------------------------------

  /**
   * Checks whether the device has an active internet connection.
   *
   * Uses `navigator.onLine` when available. Returns `true` in environments
   * where `navigator` is not available (SSR, Node.js).
   *
   * @returns `true` if online or connectivity cannot be determined
   */
  private isOnline(): boolean {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }

    // Assume online in non-browser environments
    return true;
  }
}
