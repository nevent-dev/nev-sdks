import type { ApiResponse, RequestConfig } from './types';
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
export declare class HttpClient {
  private baseUrl;
  private defaultHeaders;
  /**
   * Creates a new HTTP client instance
   *
   * @param baseUrl - Base URL for all requests
   * @param apiKey - API key for authentication
   */
  constructor(baseUrl: string, apiKey: string);
  /**
   * Make an HTTP request
   *
   * @param endpoint - API endpoint path (e.g., '/subscriptions')
   * @param config - Request configuration
   * @returns Promise resolving to API response
   * @throws {ApiError} When request fails or returns error status
   */
  request<T>(endpoint: string, config: RequestConfig): Promise<ApiResponse<T>>;
  /**
   * Make a GET request
   */
  get<T>(endpoint: string): Promise<ApiResponse<T>>;
  /**
   * Make a POST request
   */
  post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>>;
  /**
   * Make a PUT request
   */
  put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>>;
  /**
   * Make a DELETE request
   */
  delete<T>(endpoint: string): Promise<ApiResponse<T>>;
  /**
   * Create a standardized API error
   */
  private createError;
}
//# sourceMappingURL=http-client.d.ts.map
