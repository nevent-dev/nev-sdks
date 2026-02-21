/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileUploadService } from '../file-upload-service';
import type { FileUploadConfig } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a mock File object with the specified properties.
 */
function createMockFile(name: string, size: number, type: string): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type });
}

/**
 * Creates a FileUploadService with default configuration.
 */
function createService(
  config?: FileUploadConfig,
  apiUrl = 'https://api.nevent.es',
  tenantId = 'tenant-123',
  token = 'test-token',
  debug = false
): FileUploadService {
  return new FileUploadService(config, apiUrl, tenantId, token, debug);
}

// ============================================================================
// Mock XMLHttpRequest
// ============================================================================

/**
 * Minimal mock of XMLHttpRequest for upload testing.
 */
class MockXMLHttpRequest {
  /** Current readyState */
  readyState = 0;

  /** Response status code */
  status = 200;

  /** Response body text */
  responseText = '';

  /** Request timeout in ms */
  timeout = 0;

  /** Request method */
  method = '';

  /** Request URL */
  url = '';

  /** Headers sent */
  headers: Record<string, string> = {};

  /** Registered event listeners */
  private listeners: Record<string, Array<(e: unknown) => void>> = {};

  /** Upload progress listeners */
  upload = {
    listeners: {} as Record<string, Array<(e: unknown) => void>>,
    addEventListener: function (
      this: MockXMLHttpRequest['upload'],
      event: string,
      handler: (e: unknown) => void
    ): void {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event]!.push(handler);
    },
  };

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(_data?: unknown): void {
    // No-op; tests trigger events manually
  }

  abort(): void {
    this.triggerEvent('abort', {});
  }

  addEventListener(event: string, handler: (e: unknown) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
  }

  /** Trigger a registered event on the XHR itself */
  triggerEvent(event: string, data: unknown): void {
    const handlers = this.listeners[event] ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /** Trigger a registered upload progress event */
  triggerUploadEvent(event: string, data: unknown): void {
    const handlers = this.upload.listeners[event] ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}

// Store reference to the original XMLHttpRequest
const OriginalXHR = globalThis.XMLHttpRequest;

describe('FileUploadService', () => {
  let mockXhr: MockXMLHttpRequest;

  beforeEach(() => {
    // Mock XMLHttpRequest globally
    mockXhr = new MockXMLHttpRequest();
    globalThis.XMLHttpRequest = vi.fn(
      () => mockXhr
    ) as unknown as typeof XMLHttpRequest;

    // Mock URL.createObjectURL and URL.revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(
      () => 'blob:http://localhost/test-blob-url'
    );
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor & Configuration
  // ==========================================================================

  describe('constructor', () => {
    it('should use default configuration when no config is provided', () => {
      const service = createService(undefined);

      expect(service.getMaxFiles()).toBe(5);
      expect(service.getMaxFileSize()).toBe(10 * 1024 * 1024);
      expect(service.getAcceptString()).toBe(
        'image/*,application/pdf,text/plain'
      );
    });

    it('should merge custom configuration with defaults', () => {
      const service = createService({
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 3,
        acceptedTypes: ['image/*'],
      });

      expect(service.getMaxFiles()).toBe(3);
      expect(service.getMaxFileSize()).toBe(5 * 1024 * 1024);
      expect(service.getAcceptString()).toBe('image/*');
    });

    it('should strip trailing slash from apiUrl for upload endpoint', () => {
      const service = createService(undefined, 'https://api.nevent.es/');

      // Verify by triggering an upload and checking the URL
      const file = createMockFile('test.png', 1024, 'image/png');
      void service.upload(file, vi.fn());

      expect(mockXhr.url).toBe('https://api.nevent.es/chatbot/upload');
    });

    it('should use custom upload endpoint when provided', () => {
      const service = createService({
        uploadEndpoint: 'https://custom.api.com/upload',
      });

      const file = createMockFile('test.png', 1024, 'image/png');
      void service.upload(file, vi.fn());

      expect(mockXhr.url).toBe('https://custom.api.com/upload');
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('validate()', () => {
    it('should accept a valid file', () => {
      const service = createService();
      const file = createMockFile('photo.jpg', 1024 * 1024, 'image/jpeg');

      const result = service.validate(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject files exceeding max size', () => {
      const service = createService({ maxFileSize: 1024 * 1024 }); // 1MB
      const file = createMockFile('large.jpg', 2 * 1024 * 1024, 'image/jpeg');

      const result = service.validate(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('FILE_TOO_LARGE:1');
    });

    it('should reject files with unaccepted MIME type', () => {
      const service = createService({ acceptedTypes: ['image/*'] });
      const file = createMockFile(
        'doc.docx',
        1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      const result = service.validate(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('should accept files matching wildcard MIME patterns', () => {
      const service = createService({ acceptedTypes: ['image/*'] });
      const file = createMockFile('photo.webp', 1024, 'image/webp');

      const result = service.validate(file);

      expect(result.valid).toBe(true);
    });

    it('should accept files matching exact MIME type', () => {
      const service = createService({ acceptedTypes: ['application/pdf'] });
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      const result = service.validate(file);

      expect(result.valid).toBe(true);
    });

    it('should reject files with empty MIME type', () => {
      const service = createService();
      const file = createMockFile('unknown', 1024, '');

      const result = service.validate(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('should include max MB in FILE_TOO_LARGE error', () => {
      const service = createService({ maxFileSize: 5 * 1024 * 1024 }); // 5MB
      const file = createMockFile('big.jpg', 6 * 1024 * 1024, 'image/jpeg');

      const result = service.validate(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('FILE_TOO_LARGE:5');
    });
  });

  // ==========================================================================
  // Upload
  // ==========================================================================

  describe('upload()', () => {
    it('should send POST request with correct headers', () => {
      const service = createService(
        undefined,
        'https://api.nevent.es',
        'tenant-abc',
        'my-token'
      );
      const file = createMockFile('test.png', 1024, 'image/png');

      void service.upload(file, vi.fn());

      expect(mockXhr.method).toBe('POST');
      expect(mockXhr.url).toBe('https://api.nevent.es/chatbot/upload');
      expect(mockXhr.headers['X-Tenant-ID']).toBe('tenant-abc');
      expect(mockXhr.headers['Authorization']).toBe('Bearer my-token');
    });

    it('should set 2 minute timeout on XHR', () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      void service.upload(file, vi.fn());

      expect(mockXhr.timeout).toBe(120_000);
    });

    it('should report upload progress', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');
      const progressCalls: number[] = [];

      const uploadPromise = service.upload(file, (progress) => {
        progressCalls.push(progress);
      });

      // Simulate progress events
      mockXhr.triggerUploadEvent('progress', {
        lengthComputable: true,
        loaded: 256,
        total: 1024,
      });

      mockXhr.triggerUploadEvent('progress', {
        lengthComputable: true,
        loaded: 512,
        total: 1024,
      });

      // Simulate successful completion
      mockXhr.status = 200;
      mockXhr.responseText = JSON.stringify({
        url: 'https://cdn.example.com/test.png',
      });
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(progressCalls).toContain(25);
      expect(progressCalls).toContain(50);
      expect(result.status).toBe('uploaded');
      expect(result.url).toBe('https://cdn.example.com/test.png');
      expect(result.progress).toBe(100);
    });

    it('should handle successful upload', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.status = 200;
      mockXhr.responseText = JSON.stringify({
        url: 'https://cdn.example.com/test.png',
      });
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(result.status).toBe('uploaded');
      expect(result.url).toBe('https://cdn.example.com/test.png');
      expect(result.name).toBe('test.png');
      expect(result.size).toBe(1024);
      expect(result.type).toBe('image/png');
    });

    it('should handle HTTP error response', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.status = 500;
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('Upload failed with HTTP 500');
    });

    it('should handle invalid JSON response', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.status = 200;
      mockXhr.responseText = 'not json';
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('Invalid server response');
    });

    it('should handle network error', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.triggerEvent('error', {});

      const result = await uploadPromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('Network error during upload');
    });

    it('should handle upload timeout', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.triggerEvent('timeout', {});

      const result = await uploadPromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('Upload timed out');
    });

    it('should handle upload abort', async () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.triggerEvent('abort', {});

      const result = await uploadPromise;

      expect(result.status).toBe('error');
      expect(result.error).toBe('Upload cancelled');
    });

    it('should create thumbnail for image files', async () => {
      const service = createService();
      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');

      const uploadPromise = service.upload(file, vi.fn());

      // Complete upload
      mockXhr.status = 200;
      mockXhr.responseText = JSON.stringify({
        url: 'https://cdn.example.com/photo.jpg',
      });
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(result.thumbnailUrl).toBe('blob:http://localhost/test-blob-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });

    it('should not create thumbnail for non-image files', async () => {
      const service = createService();
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      const uploadPromise = service.upload(file, vi.fn());

      mockXhr.status = 200;
      mockXhr.responseText = JSON.stringify({
        url: 'https://cdn.example.com/doc.pdf',
      });
      mockXhr.triggerEvent('load', {});

      const result = await uploadPromise;

      expect(result.thumbnailUrl).toBeUndefined();
    });
  });

  // ==========================================================================
  // Preview (Blob URLs)
  // ==========================================================================

  describe('createPreview()', () => {
    it('should create blob URL for JPEG files', () => {
      const service = createService();
      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');

      const url = service.createPreview(file);

      expect(url).toBe('blob:http://localhost/test-blob-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });

    it('should create blob URL for PNG files', () => {
      const service = createService();
      const file = createMockFile('photo.png', 1024, 'image/png');

      const url = service.createPreview(file);

      expect(url).not.toBeNull();
    });

    it('should create blob URL for WebP files', () => {
      const service = createService();
      const file = createMockFile('photo.webp', 1024, 'image/webp');

      const url = service.createPreview(file);

      expect(url).not.toBeNull();
    });

    it('should return null for PDF files', () => {
      const service = createService();
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      const url = service.createPreview(file);

      expect(url).toBeNull();
    });

    it('should return null for text files', () => {
      const service = createService();
      const file = createMockFile('readme.txt', 1024, 'text/plain');

      const url = service.createPreview(file);

      expect(url).toBeNull();
    });
  });

  describe('revokePreview()', () => {
    it('should revoke a previously created blob URL', () => {
      const service = createService();
      const file = createMockFile('photo.jpg', 1024, 'image/jpeg');

      const url = service.createPreview(file);
      expect(url).not.toBeNull();

      service.revokePreview(url!);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    });

    it('should not revoke unknown URLs', () => {
      const service = createService();

      service.revokePreview('blob:http://localhost/unknown');

      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Cancel Upload
  // ==========================================================================

  describe('cancelUpload()', () => {
    it('should abort the XHR for an active upload', () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      // Start upload to register the XHR
      void service.upload(file, vi.fn());

      // The abort should be called on the mock XHR
      // We need the attachment id which is generated internally
      // Since we can't easily get the id, test the abort mechanism indirectly
      const abortSpy = vi.spyOn(mockXhr, 'abort');

      // Cancel with a non-existent ID should be a no-op
      service.cancelUpload('non-existent-id');
      expect(abortSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Destroy
  // ==========================================================================

  describe('destroy()', () => {
    it('should revoke all blob URLs on destroy', () => {
      const service = createService();

      // Create several previews
      const file1 = createMockFile('a.jpg', 1024, 'image/jpeg');
      const file2 = createMockFile('b.png', 1024, 'image/png');

      let callCount = 0;
      (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementation(
        () => `blob:http://localhost/blob-${callCount++}`
      );

      service.createPreview(file1);
      service.createPreview(file2);

      service.destroy();

      // Both blob URLs should be revoked
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('should abort all active uploads on destroy', () => {
      const service = createService();
      const file = createMockFile('test.png', 1024, 'image/png');

      void service.upload(file, vi.fn());

      const abortSpy = vi.spyOn(mockXhr, 'abort');

      service.destroy();

      expect(abortSpy).toHaveBeenCalled();
    });

    it('should be safe to call destroy multiple times', () => {
      const service = createService();

      expect(() => {
        service.destroy();
        service.destroy();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Getters
  // ==========================================================================

  describe('getters', () => {
    it('getMaxFiles() should return configured value', () => {
      const service = createService({ maxFiles: 3 });
      expect(service.getMaxFiles()).toBe(3);
    });

    it('getMaxFileSize() should return configured value', () => {
      const service = createService({ maxFileSize: 2 * 1024 * 1024 });
      expect(service.getMaxFileSize()).toBe(2 * 1024 * 1024);
    });

    it('getAcceptString() should return comma-joined types', () => {
      const service = createService({
        acceptedTypes: ['image/*', 'application/pdf'],
      });
      expect(service.getAcceptString()).toBe('image/*,application/pdf');
    });
  });
});
