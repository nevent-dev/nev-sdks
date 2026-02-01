import type { ApiError, ApiResponse, RequestConfig } from './types';

/**
 * HTTP client for Nevent API requests
 *
 * Provides a consistent interface for making HTTP requests with:
 * - Automatic JSON parsing
 * - Error handling
 * - Timeout support
 * - Custom headers
 *
 * @example
 * ```typescript
 * const client = new HttpClient('https://api.nevent.io', 'api-key-123');
 * const response = await client.request<UserData>('/users/me', { method: 'GET' });
 * ```
 */
export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  /**
   * Creates a new HTTP client instance
   *
   * @param baseUrl - Base URL for all requests
   * @param apiKey - API key for authentication
   */
  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    };
  }

  /**
   * Make an HTTP request
   *
   * @param endpoint - API endpoint path (e.g., '/subscriptions')
   * @param config - Request configuration
   * @returns Promise resolving to API response
   * @throws {ApiError} When request fails or returns error status
   */
  async request<T>(
    endpoint: string,
    config: RequestConfig
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...this.defaultHeaders, ...config.headers };

    const controller = new AbortController();
    const timeoutId =
      config.timeout &&
      setTimeout(() => controller.abort(), config.timeout);

    try {
      const fetchOptions: RequestInit = {
        method: config.method,
        headers,
        signal: controller.signal,
      };

      if (config.body) {
        fetchOptions.body = JSON.stringify(config.body);
      }

      const response = await fetch(url, fetchOptions);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const data = (await response.json()) as ApiResponse<T>;

      if (!response.ok) {
        throw this.createError(response.status, data);
      }

      return data;
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(408, { message: 'Request timeout' });
      }

      throw error;
    }
  }

  /**
   * Make a GET request
   */
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  /**
   * Make a PUT request
   */
  async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Create a standardized API error
   */
  private createError(status: number, data: unknown): ApiError {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : 'Request failed';

    return {
      message,
      status,
      code: `HTTP_${status}`,
      details: typeof data === 'object' ? (data as Record<string, unknown>) : {},
    };
  }
}
