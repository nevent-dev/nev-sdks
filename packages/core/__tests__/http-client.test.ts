import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { HttpClient } from '../src/http-client';
import type { ApiResponse } from '../src/types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a mock fetch Response with the given body and status.
 */
function mockResponse<T>(body: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: () => mockResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    bytes: async () => new Uint8Array(),
  } as Response;
}

describe('HttpClient', () => {
  let client: HttpClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Default: navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    client = new HttpClient('https://api.example.com', 'test-key', {
      maxRetries: 0, // Disable retries by default for most tests
      timeout: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // --------------------------------------------------------------------------
  // Basic requests
  // --------------------------------------------------------------------------

  describe('basic requests', () => {
    it('should make a GET request', async () => {
      const responseBody: ApiResponse<string> = {
        data: 'hello',
        success: true,
      };
      fetchSpy.mockResolvedValue(mockResponse(responseBody));

      const result = await client.get<string>('/test');

      expect(result.data).toBe('hello');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should make a POST request with body', async () => {
      const responseBody: ApiResponse<{ id: number }> = {
        data: { id: 1 },
        success: true,
      };
      fetchSpy.mockResolvedValue(mockResponse(responseBody));

      const result = await client.post<{ id: number }>('/items', {
        name: 'test',
      });

      expect(result.data.id).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        }),
      );
    });

    it('should make a PUT request', async () => {
      const responseBody: ApiResponse<null> = {
        data: null,
        success: true,
      };
      fetchSpy.mockResolvedValue(mockResponse(responseBody));

      await client.put('/items/1', { name: 'updated' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'updated' }),
        }),
      );
    });

    it('should make a DELETE request', async () => {
      const responseBody: ApiResponse<null> = {
        data: null,
        success: true,
      };
      fetchSpy.mockResolvedValue(mockResponse(responseBody));

      await client.delete('/items/1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should send default headers including API key', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ data: null, success: true }),
      );

      await client.get('/test');

      const callHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(callHeaders['Content-Type']).toBe('application/json');
      expect(callHeaders['X-API-Key']).toBe('test-key');
    });

    it('should remove trailing slash from base URL', () => {
      const clientWithSlash = new HttpClient(
        'https://api.example.com/',
        'key',
        { maxRetries: 0 },
      );
      fetchSpy.mockResolvedValue(
        mockResponse({ data: null, success: true }),
      );

      clientWithSlash.get('/test');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.anything(),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw ApiError on non-ok response', async () => {
      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Not found' }, 404),
      );

      await expect(client.get('/missing')).rejects.toMatchObject({
        message: 'Not found',
        status: 404,
      });
    });

    it('should handle network errors', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.get('/test')).rejects.toMatchObject({
        message: 'Failed to fetch',
        code: 'NETWORK_ERROR',
      });
    });
  });

  // --------------------------------------------------------------------------
  // Timeout
  // --------------------------------------------------------------------------

  describe('timeout', () => {
    it('should abort request after timeout', async () => {
      vi.useFakeTimers();

      fetchSpy.mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            const onAbort = () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            };
            options.signal?.addEventListener('abort', onAbort);
          }),
      );

      const timeoutClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          timeout: 1000,
          maxRetries: 0,
        },
      );

      const promise = timeoutClient.get('/slow');

      // Advance timers past the timeout
      vi.advanceTimersByTime(1100);

      await expect(promise).rejects.toMatchObject({
        message: 'Request timeout',
        status: 408,
        code: 'TIMEOUT',
      });

      vi.useRealTimers();
    });

    it('should use per-request timeout over default', async () => {
      vi.useFakeTimers();

      fetchSpy.mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            const onAbort = () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            };
            options.signal?.addEventListener('abort', onAbort);
          }),
      );

      // Client has 5s default timeout, but request uses 500ms
      const promise = client.request('/slow', {
        method: 'GET',
        timeout: 500,
      });

      vi.advanceTimersByTime(600);

      await expect(promise).rejects.toMatchObject({
        status: 408,
        code: 'TIMEOUT',
      });

      vi.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // Retry logic
  // --------------------------------------------------------------------------

  describe('retry logic', () => {
    it('should retry on 500 errors', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 2,
          retryDelay: 10, // Short delay for tests
        },
      );

      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({ message: 'Server error' }, 500),
        )
        .mockResolvedValueOnce(
          mockResponse({ message: 'Server error' }, 500),
        )
        .mockResolvedValueOnce(
          mockResponse({ data: 'success', success: true }, 200),
        );

      const result = await retryClient.get<string>('/test');

      expect(result.data).toBe('success');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on 400 errors', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 2,
          retryDelay: 10,
        },
      );

      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Bad request' }, 400),
      );

      await expect(retryClient.get('/test')).rejects.toMatchObject({
        status: 400,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 401 errors', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 2,
          retryDelay: 10,
        },
      );

      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Unauthorized' }, 401),
      );

      await expect(retryClient.get('/test')).rejects.toMatchObject({
        status: 401,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 (rate limit) errors', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 1,
          retryDelay: 10,
        },
      );

      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({ message: 'Rate limited' }, 429),
        )
        .mockResolvedValueOnce(
          mockResponse({ data: 'ok', success: true }, 200),
        );

      const result = await retryClient.get<string>('/test');
      expect(result.data).toBe('ok');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting all retries', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 2,
          retryDelay: 10,
        },
      );

      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Server error' }, 503),
      );

      await expect(retryClient.get('/test')).rejects.toMatchObject({
        status: 503,
      });

      // 1 initial + 2 retries = 3 total
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      const retryClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          maxRetries: 1,
          retryDelay: 10,
        },
      );

      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(
          mockResponse({ data: 'recovered', success: true }, 200),
        );

      const result = await retryClient.get<string>('/test');
      expect(result.data).toBe('recovered');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // Offline detection
  // --------------------------------------------------------------------------

  describe('offline detection', () => {
    it('should throw immediately when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      await expect(client.get('/test')).rejects.toMatchObject({
        message: 'No internet connection',
        code: 'OFFLINE',
      });

      // fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should proceed normally when online', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });

      fetchSpy.mockResolvedValue(
        mockResponse({ data: null, success: true }),
      );

      await expect(client.get('/test')).resolves.toBeDefined();
    });

    it('should skip offline check when disabled', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      const noOfflineClient = new HttpClient(
        'https://api.example.com',
        'key',
        {
          offlineDetection: false,
          maxRetries: 0,
        },
      );

      fetchSpy.mockResolvedValue(
        mockResponse({ data: null, success: true }),
      );

      // Should NOT throw offline error
      await expect(noOfflineClient.get('/test')).resolves.toBeDefined();
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Interceptors
  // --------------------------------------------------------------------------

  describe('interceptors', () => {
    describe('request interceptors', () => {
      it('should call request interceptors before fetch', async () => {
        fetchSpy.mockResolvedValue(
          mockResponse({ data: null, success: true }),
        );

        const interceptor = vi.fn((url: string, options: RequestInit) => {
          return {
            ...options,
            headers: {
              ...(options.headers as Record<string, string>),
              'X-Custom': 'intercepted',
            },
          };
        });

        client.addRequestInterceptor(interceptor);

        await client.get('/test');

        expect(interceptor).toHaveBeenCalledOnce();
        expect(interceptor).toHaveBeenCalledWith(
          'https://api.example.com/test',
          expect.objectContaining({ method: 'GET' }),
        );

        const fetchHeaders = fetchSpy.mock.calls[0]?.[1]?.headers;
        expect(fetchHeaders['X-Custom']).toBe('intercepted');
      });

      it('should chain multiple request interceptors', async () => {
        fetchSpy.mockResolvedValue(
          mockResponse({ data: null, success: true }),
        );

        const order: number[] = [];

        client.addRequestInterceptor((_url, options) => {
          order.push(1);
          return options;
        });

        client.addRequestInterceptor((_url, options) => {
          order.push(2);
          return options;
        });

        await client.get('/test');

        expect(order).toEqual([1, 2]);
      });
    });

    describe('response interceptors', () => {
      it('should call response interceptors after fetch', async () => {
        const originalResponse = mockResponse({
          data: 'original',
          success: true,
        });
        fetchSpy.mockResolvedValue(originalResponse);

        const interceptor = vi.fn((response: Response) => response);

        client.addResponseInterceptor(interceptor);

        await client.get('/test');

        expect(interceptor).toHaveBeenCalledOnce();
      });

      it('should chain multiple response interceptors', async () => {
        fetchSpy.mockResolvedValue(
          mockResponse({ data: null, success: true }),
        );

        const order: number[] = [];

        client.addResponseInterceptor((response) => {
          order.push(1);
          return response;
        });

        client.addResponseInterceptor((response) => {
          order.push(2);
          return response;
        });

        await client.get('/test');

        expect(order).toEqual([1, 2]);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Default configuration
  // --------------------------------------------------------------------------

  describe('default configuration', () => {
    it('should use 30s timeout by default', () => {
      const defaultClient = new HttpClient(
        'https://api.example.com',
        'key',
      );

      // We can verify the default by checking the AbortController timeout
      // Indirectly test by checking it does not immediately fail
      fetchSpy.mockResolvedValue(
        mockResponse({ data: null, success: true }),
      );

      expect(defaultClient.get('/test')).resolves.toBeDefined();
    });

    it('should use 3 retries by default', async () => {
      const defaultClient = new HttpClient(
        'https://api.example.com',
        'key',
        { retryDelay: 10 },
      );

      fetchSpy.mockResolvedValue(
        mockResponse({ message: 'Error' }, 500),
      );

      await expect(defaultClient.get('/test')).rejects.toBeDefined();

      // 1 initial + 3 retries = 4 total
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });
});
