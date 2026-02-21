/**
 * FileUploadService - File upload management for chatbot attachments
 *
 * Handles the full lifecycle of file attachments in the chatbot widget:
 * - **Validation**: File size limits, MIME type restrictions, max file count
 * - **Upload**: Multipart/form-data upload via XMLHttpRequest with progress tracking
 * - **Preview**: Local blob URL creation for instant image previews
 * - **Cancellation**: Mid-upload abort via XMLHttpRequest.abort()
 * - **Cleanup**: Blob URL revocation to prevent memory leaks
 *
 * Uses `XMLHttpRequest` instead of `fetch` to support `upload.onprogress`
 * events for real-time progress tracking (the Fetch API does not expose
 * upload progress in most browser implementations).
 *
 * @remarks
 * Upload endpoint: `{apiUrl}/chatbot/upload` (configurable via `FileUploadConfig.uploadEndpoint`)
 * Method: POST multipart/form-data
 * Headers: `X-Tenant-ID` (required)
 * Response: `{ url: string }` — the CDN URL of the uploaded file
 *
 * @example
 * ```typescript
 * const service = new FileUploadService(
 *   { maxFileSize: 10 * 1024 * 1024, maxFiles: 5 },
 *   'https://api.nevent.es',
 *   'tenant-123',
 *   'server-token',
 * );
 *
 * const validation = service.validate(file);
 * if (!validation.valid) {
 *   console.error(validation.error);
 *   return;
 * }
 *
 * const attachment = await service.upload(file, (progress) => {
 *   console.log(`Upload progress: ${progress}%`);
 * });
 * console.log('Uploaded to:', attachment.url);
 *
 * service.destroy();
 * ```
 */

import { Logger } from '@nevent/core';
import type { FileAttachment, FileUploadConfig } from '../types';

// ============================================================================
// Constants
// ============================================================================

/** Default maximum file size: 10MB */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Default maximum files per message */
const DEFAULT_MAX_FILES = 5;

/** Default accepted MIME type patterns */
const DEFAULT_ACCEPTED_TYPES: readonly string[] = [
  'image/*',
  'application/pdf',
  'text/plain',
];

/** Set of MIME types that support local image preview via blob URL */
const PREVIEWABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

// ============================================================================
// FileUploadService Class
// ============================================================================

/**
 * Manages file validation, upload, preview creation, and cleanup for the
 * chatbot widget's file attachment feature.
 *
 * Each instance maintains a map of active XHR uploads keyed by attachment ID,
 * enabling per-file cancellation. Blob URLs created for image previews are
 * tracked for cleanup to prevent memory leaks.
 *
 * @example
 * ```typescript
 * const service = new FileUploadService(config, apiUrl, tenantId, token);
 *
 * // Validate
 * const result = service.validate(file);
 * if (!result.valid) { showError(result.error); return; }
 *
 * // Upload with progress
 * const attachment = await service.upload(file, (pct) => updateProgress(pct));
 *
 * // Cancel mid-upload
 * service.cancelUpload(attachment.id);
 *
 * // Cleanup
 * service.destroy();
 * ```
 */
export class FileUploadService {
  /** Resolved upload configuration with defaults applied */
  private readonly config: Required<
    Pick<FileUploadConfig, 'enabled' | 'maxFileSize' | 'maxFiles' | 'acceptedTypes'>
  > & { uploadEndpoint: string };

  /** Authentication token for the upload endpoint */
  private readonly token: string;

  /** Tenant ID sent as X-Tenant-ID header */
  private readonly tenantId: string;

  /** Map of active XMLHttpRequest uploads keyed by attachment ID */
  private readonly activeUploads: Map<string, XMLHttpRequest> = new Map();

  /** Set of blob URLs created for previews — tracked for revocation on destroy */
  private readonly blobUrls: Set<string> = new Set();

  /** Logger for debug output */
  private readonly logger: Logger;

  /**
   * Creates a new FileUploadService instance.
   *
   * @param uploadConfig - File upload configuration (merged with defaults)
   * @param apiUrl - Base API URL for constructing the upload endpoint
   * @param tenantId - Tenant identifier for the X-Tenant-ID header
   * @param token - Authentication token for the Authorization header
   * @param debug - Whether to enable debug logging
   */
  constructor(
    uploadConfig: FileUploadConfig | undefined,
    apiUrl: string,
    tenantId: string,
    token: string,
    debug = false,
  ) {
    const baseUrl = apiUrl.replace(/\/$/, '');

    this.config = {
      enabled: uploadConfig?.enabled !== false,
      maxFileSize: uploadConfig?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      maxFiles: uploadConfig?.maxFiles ?? DEFAULT_MAX_FILES,
      acceptedTypes: uploadConfig?.acceptedTypes ?? [...DEFAULT_ACCEPTED_TYPES],
      uploadEndpoint: uploadConfig?.uploadEndpoint ?? `${baseUrl}/chatbot/upload`,
    };

    this.tenantId = tenantId;
    this.token = token;
    this.logger = new Logger('[NeventChatbot:FileUploadService]', debug);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Returns the maximum number of files allowed per message.
   *
   * @returns The configured max files limit
   */
  getMaxFiles(): number {
    return this.config.maxFiles;
  }

  /**
   * Returns the maximum file size in bytes.
   *
   * @returns The configured max file size
   */
  getMaxFileSize(): number {
    return this.config.maxFileSize;
  }

  /**
   * Returns the accepted file type patterns for the file input `accept` attribute.
   *
   * @returns Comma-separated string of accepted MIME type patterns
   */
  getAcceptString(): string {
    return this.config.acceptedTypes.join(',');
  }

  /**
   * Validates a file against the configured size and type restrictions.
   *
   * @param file - The File object to validate
   * @returns Object with `valid: true` on success, or `valid: false` with an `error` string
   *
   * @example
   * ```typescript
   * const result = service.validate(selectedFile);
   * if (!result.valid) {
   *   alert(result.error);
   * }
   * ```
   */
  validate(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      const maxMB = Math.round(this.config.maxFileSize / (1024 * 1024));
      return {
        valid: false,
        error: `FILE_TOO_LARGE:${maxMB}`,
      };
    }

    // Check file type against accepted patterns
    if (!this.isTypeAccepted(file.type)) {
      return {
        valid: false,
        error: 'FILE_TYPE_NOT_ALLOWED',
      };
    }

    return { valid: true };
  }

  /**
   * Uploads a file to the server with progress tracking.
   *
   * Uses `XMLHttpRequest` for upload progress events. The file is sent as
   * multipart/form-data to the configured upload endpoint with `X-Tenant-ID`
   * and `Authorization` headers.
   *
   * On success, the returned `FileAttachment` has `status: 'uploaded'` and
   * a populated `url` field with the CDN URL from the server response.
   *
   * On failure, the returned `FileAttachment` has `status: 'error'` and
   * a populated `error` field with the failure description.
   *
   * @param file - The File object to upload
   * @param onProgress - Callback invoked with upload progress (0-100)
   * @returns Promise resolving to a FileAttachment with upload result
   *
   * @example
   * ```typescript
   * const attachment = await service.upload(file, (progress) => {
   *   progressBar.style.width = `${progress}%`;
   * });
   * if (attachment.status === 'uploaded') {
   *   console.log('CDN URL:', attachment.url);
   * }
   * ```
   */
  async upload(
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<FileAttachment> {
    const id = this.generateId();
    const thumbnailUrl = this.createPreview(file);

    const attachment: FileAttachment = {
      id,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      progress: 0,
    };

    if (thumbnailUrl) {
      attachment.thumbnailUrl = thumbnailUrl;
    }

    this.logger.debug('Starting file upload', {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
    });

    return new Promise<FileAttachment>((resolve) => {
      const xhr = new XMLHttpRequest();
      this.activeUploads.set(id, xhr);

      const formData = new FormData();
      formData.append('file', file);

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          attachment.progress = progress;
          onProgress(progress);
        }
      });

      // Handle successful upload
      xhr.addEventListener('load', () => {
        this.activeUploads.delete(id);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as { url: string };
            attachment.url = response.url;
            attachment.status = 'uploaded';
            attachment.progress = 100;
            this.logger.debug('File uploaded successfully', { id, url: response.url });
          } catch {
            attachment.status = 'error';
            attachment.error = 'Invalid server response';
            this.logger.error('Failed to parse upload response', {
              id,
              responseText: xhr.responseText,
            });
          }
        } else {
          attachment.status = 'error';
          attachment.error = `Upload failed with HTTP ${xhr.status}`;
          this.logger.error('Upload failed', { id, status: xhr.status });
        }

        resolve(attachment);
      });

      // Handle network error
      xhr.addEventListener('error', () => {
        this.activeUploads.delete(id);
        attachment.status = 'error';
        attachment.error = 'Network error during upload';
        this.logger.error('Upload network error', { id });
        resolve(attachment);
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        this.activeUploads.delete(id);
        attachment.status = 'error';
        attachment.error = 'Upload cancelled';
        this.logger.debug('Upload cancelled', { id });
        resolve(attachment);
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        this.activeUploads.delete(id);
        attachment.status = 'error';
        attachment.error = 'Upload timed out';
        this.logger.error('Upload timed out', { id });
        resolve(attachment);
      });

      // Send the request
      xhr.open('POST', this.config.uploadEndpoint);
      xhr.setRequestHeader('X-Tenant-ID', this.tenantId);
      xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      // Timeout: 2 minutes for large files
      xhr.timeout = 120_000;
      xhr.send(formData);
    });
  }

  /**
   * Creates a local blob URL for previewing image files before upload.
   *
   * Only creates previews for MIME types in the `PREVIEWABLE_TYPES` set
   * (JPEG, PNG, GIF, WebP, SVG, BMP). Returns `null` for non-image files.
   *
   * The blob URL is tracked internally and revoked when `revokePreview()`
   * or `destroy()` is called to prevent memory leaks.
   *
   * @param file - The File object to create a preview for
   * @returns A blob URL string for the image, or `null` for non-image files
   */
  createPreview(file: File): string | null {
    if (!PREVIEWABLE_TYPES.has(file.type)) {
      return null;
    }

    try {
      const url = URL.createObjectURL(file);
      this.blobUrls.add(url);
      return url;
    } catch {
      this.logger.warn('Failed to create preview blob URL', { name: file.name });
      return null;
    }
  }

  /**
   * Revokes a previously created blob URL to free associated memory.
   *
   * Call this when a file preview is removed from the UI (e.g. when the user
   * removes an attachment or the message is sent).
   *
   * @param url - The blob URL to revoke
   */
  revokePreview(url: string): void {
    if (this.blobUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.blobUrls.delete(url);
    }
  }

  /**
   * Cancels an in-progress upload by attachment ID.
   *
   * The XHR is aborted immediately. The upload Promise resolves with
   * `status: 'error'` and `error: 'Upload cancelled'`.
   *
   * @param id - The attachment ID to cancel
   */
  cancelUpload(id: string): void {
    const xhr = this.activeUploads.get(id);
    if (xhr) {
      this.logger.debug('Cancelling upload', { id });
      xhr.abort();
      this.activeUploads.delete(id);
    }
  }

  /**
   * Destroys the service, cancelling all active uploads and revoking all
   * blob URLs.
   *
   * After calling this method, the service should not be used.
   */
  destroy(): void {
    this.logger.debug('Destroying FileUploadService', {
      activeUploads: this.activeUploads.size,
      blobUrls: this.blobUrls.size,
    });

    // Cancel all active uploads
    for (const [id, xhr] of this.activeUploads) {
      xhr.abort();
      this.logger.debug('Aborted upload on destroy', { id });
    }
    this.activeUploads.clear();

    // Revoke all blob URLs
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  }

  // --------------------------------------------------------------------------
  // Private: Type Checking
  // --------------------------------------------------------------------------

  /**
   * Checks whether a MIME type matches any of the configured accepted patterns.
   *
   * Supports wildcard patterns like `image/*` which match any MIME type
   * starting with `image/`. Exact matches (e.g. `application/pdf`) are
   * also supported.
   *
   * @param mimeType - The MIME type to check (e.g. 'image/png')
   * @returns `true` if the type is accepted, `false` otherwise
   */
  private isTypeAccepted(mimeType: string): boolean {
    if (!mimeType) return false;

    for (const pattern of this.config.acceptedTypes) {
      // Wildcard pattern: 'image/*' matches any 'image/...'
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -1); // 'image/'
        if (mimeType.startsWith(prefix)) {
          return true;
        }
      } else if (mimeType === pattern) {
        // Exact match
        return true;
      }
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  /**
   * Generates a unique ID for a file attachment.
   *
   * @returns A unique string identifier
   */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
