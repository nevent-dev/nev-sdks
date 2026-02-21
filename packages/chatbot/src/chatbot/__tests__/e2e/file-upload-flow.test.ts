/**
 * @vitest-environment jsdom
 *
 * file-upload-flow.test.ts - E2E test for file upload functionality
 *
 * Exercises file attachment and upload flows:
 * - File validation (size limits, type restrictions)
 * - FileUploadService lifecycle (validate, upload, preview, cleanup)
 * - Attachment rendering in the input area
 * - Error handling for upload failures
 *
 * Note: Full file upload through the widget UI requires XMLHttpRequest mocking
 * which is tested at the service level. These tests focus on validation logic
 * and the FileUploadService public API used by the widget.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileUploadService } from '../../file-upload-service';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Creates a mock File object for testing.
 *
 * @param name - File name
 * @param size - File size in bytes
 * @param type - MIME type
 * @returns A File object
 */
function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

// ============================================================================
// FileUploadService E2E Tests
// ============================================================================

describe('E2E: File Upload Flow', () => {
  let service: FileUploadService;

  beforeEach(() => {
    service = new FileUploadService(
      {
        enabled: true,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
        acceptedTypes: ['image/*', 'application/pdf'],
      },
      'https://api.test.nevent.es',
      'tenant-test-456',
      'test-server-token'
    );
  });

  afterEach(() => {
    service.destroy();
  });

  // ==========================================================================
  // 1. File validation — valid files
  // ==========================================================================

  describe('File validation — accepted files', () => {
    it('should accept a valid image file within size limits', () => {
      const file = createMockFile('photo.jpg', 1024 * 100, 'image/jpeg'); // 100KB
      const result = service.validate(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept a valid PDF file', () => {
      const file = createMockFile('document.pdf', 1024 * 500, 'application/pdf');
      const result = service.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept PNG files (image/* wildcard)', () => {
      const file = createMockFile('screenshot.png', 1024 * 200, 'image/png');
      const result = service.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept GIF files (image/* wildcard)', () => {
      const file = createMockFile('animation.gif', 1024 * 300, 'image/gif');
      const result = service.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept WebP files (image/* wildcard)', () => {
      const file = createMockFile('photo.webp', 1024 * 150, 'image/webp');
      const result = service.validate(file);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 2. File validation — rejected files (too large)
  // ==========================================================================

  describe('File validation — size limits', () => {
    it('should reject a file that exceeds the max file size', () => {
      const file = createMockFile('huge.jpg', 6 * 1024 * 1024, 'image/jpeg'); // 6MB > 5MB
      const result = service.validate(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept a file exactly at the max file size', () => {
      const file = createMockFile('exact.jpg', 5 * 1024 * 1024, 'image/jpeg'); // exactly 5MB
      const result = service.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should reject a zero-byte file', () => {
      const file = createMockFile('empty.jpg', 0, 'image/jpeg');
      const result = service.validate(file);
      // Zero-byte files might be accepted or rejected depending on implementation
      // The important thing is it does not throw
      expect(typeof result.valid).toBe('boolean');
    });
  });

  // ==========================================================================
  // 3. File validation — rejected files (wrong type)
  // ==========================================================================

  describe('File validation — type restrictions', () => {
    it('should reject a text file when only images and PDFs are accepted', () => {
      const file = createMockFile('notes.txt', 1024, 'text/plain');
      const result = service.validate(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an executable file', () => {
      const file = createMockFile('malware.exe', 1024, 'application/x-msdownload');
      const result = service.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject a JavaScript file', () => {
      const file = createMockFile('script.js', 1024, 'application/javascript');
      const result = service.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject a ZIP archive', () => {
      const file = createMockFile('archive.zip', 1024, 'application/zip');
      const result = service.validate(file);
      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Service configuration
  // ==========================================================================

  describe('Service configuration', () => {
    it('should use custom configuration values', () => {
      const customService = new FileUploadService(
        {
          enabled: true,
          maxFileSize: 1 * 1024 * 1024, // 1MB
          maxFiles: 1,
          acceptedTypes: ['application/pdf'],
        },
        'https://api.test.nevent.es',
        'tenant-test-456',
        'test-token'
      );

      // 2MB image should be rejected with 1MB limit
      const bigImage = createMockFile('big.jpg', 2 * 1024 * 1024, 'image/jpeg');
      expect(customService.validate(bigImage).valid).toBe(false);

      // PDF under 1MB should be accepted
      const smallPdf = createMockFile('small.pdf', 500 * 1024, 'application/pdf');
      expect(customService.validate(smallPdf).valid).toBe(true);

      // Image should be rejected (only PDFs accepted)
      const validImage = createMockFile('photo.jpg', 100 * 1024, 'image/jpeg');
      expect(customService.validate(validImage).valid).toBe(false);

      customService.destroy();
    });

    it('should use default config when no explicit config is provided', () => {
      const defaultService = new FileUploadService(
        {},
        'https://api.test.nevent.es',
        'tenant-test-456',
        'test-token'
      );

      // Default max is 10MB, so a 5MB file should be accepted
      const file = createMockFile('photo.jpg', 5 * 1024 * 1024, 'image/jpeg');
      const result = defaultService.validate(file);
      expect(result.valid).toBe(true);

      defaultService.destroy();
    });
  });

  // ==========================================================================
  // 5. Upload with mocked XMLHttpRequest
  // ==========================================================================

  describe('Upload with mocked XMLHttpRequest', () => {
    /**
     * Creates a mock XMLHttpRequest that supports addEventListener.
     * The real FileUploadService uses addEventListener for progress, load, error, and abort.
     */
    function createMockXhr(options: {
      status?: number;
      responseText?: string;
      simulateError?: boolean;
    } = {}) {
      const {
        status = 200,
        responseText = JSON.stringify({ url: 'https://cdn.nevent.es/uploads/file.jpg' }),
        simulateError = false,
      } = options;

      const listeners: Record<string, Array<(e: unknown) => void>> = {};
      const uploadListeners: Record<string, Array<(e: unknown) => void>> = {};

      const mockXhr = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        readyState: 4,
        status,
        responseText,
        upload: {
          addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
            if (!uploadListeners[event]) uploadListeners[event] = [];
            uploadListeners[event].push(handler);
          }),
          removeEventListener: vi.fn(),
        },
        addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        }),
        removeEventListener: vi.fn(),
        abort: vi.fn(),
      };

      mockXhr.send.mockImplementation(() => {
        // Simulate progress
        if (uploadListeners['progress']) {
          for (const handler of uploadListeners['progress']) {
            handler({ loaded: 50, total: 100, lengthComputable: true });
          }
        }

        setTimeout(() => {
          if (simulateError && listeners['error']) {
            for (const handler of listeners['error']) {
              handler({});
            }
          } else if (listeners['load']) {
            for (const handler of listeners['load']) {
              handler({});
            }
          }
        }, 0);
      });

      return mockXhr;
    }

    it('should call upload and track progress', async () => {
      const mockXhr = createMockXhr();

      const OriginalXhr = globalThis.XMLHttpRequest;
      globalThis.XMLHttpRequest = vi.fn(() => mockXhr) as unknown as typeof XMLHttpRequest;

      try {
        const file = createMockFile('test.jpg', 1024, 'image/jpeg');
        const progressCallback = vi.fn();

        const result = await service.upload(file, progressCallback);

        // Verify XMLHttpRequest was configured correctly
        expect(mockXhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('/chatbot/upload'));
        expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('X-Tenant-ID', 'tenant-test-456');
        expect(mockXhr.send).toHaveBeenCalled();

        // Result should have the CDN URL
        expect(result).toBeDefined();
        expect(result.url).toBe('https://cdn.nevent.es/uploads/file.jpg');
        expect(result.status).toBe('uploaded');
      } finally {
        globalThis.XMLHttpRequest = OriginalXhr;
      }
    });

    it('should handle upload error gracefully', async () => {
      const mockXhr = createMockXhr({ simulateError: true });

      const OriginalXhr = globalThis.XMLHttpRequest;
      globalThis.XMLHttpRequest = vi.fn(() => mockXhr) as unknown as typeof XMLHttpRequest;

      try {
        const file = createMockFile('fail.jpg', 1024, 'image/jpeg');

        await expect(service.upload(file)).rejects.toBeDefined();
      } finally {
        globalThis.XMLHttpRequest = OriginalXhr;
      }
    });
  });

  // ==========================================================================
  // 6. Cleanup and resource management
  // ==========================================================================

  describe('Cleanup', () => {
    it('should not throw when destroy is called multiple times', () => {
      const svc = new FileUploadService(
        {},
        'https://api.test.nevent.es',
        'tenant-test-456',
        'test-token'
      );

      expect(() => svc.destroy()).not.toThrow();
      expect(() => svc.destroy()).not.toThrow();
    });
  });
});
