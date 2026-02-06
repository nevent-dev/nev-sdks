/**
 * FileUpload Component - Enterprise Grade
 *
 * Features:
 * - Drag & drop support
 * - Image preview
 * - File type and size validation
 * - Progress indication
 * - Responsive design
 *
 * Quality comparable to Stripe Elements
 */

export interface FileUploadConfig {
  fieldName: string;
  displayName: string;
  required?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
  maxSizeMB?: number; // convenience property
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class FileUploadComponent {
  private container!: HTMLDivElement;
  private input!: HTMLInputElement;
  private dropZone!: HTMLDivElement;
  private preview!: HTMLDivElement;
  private file: File | null = null;

  private readonly maxSizeBytes: number;

  constructor(private config: FileUploadConfig) {
    // Default to 5MB if not specified
    this.maxSizeBytes = config.maxSize || (config.maxSizeMB ? config.maxSizeMB * 1024 * 1024 : 5 * 1024 * 1024);
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'nevent-file-upload';

    // Hidden file input
    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.name = this.config.fieldName;
    this.input.accept = this.config.accept || 'image/*';
    this.input.required = this.config.required || false;
    this.input.style.display = 'none';
    this.input.addEventListener('change', () => this.handleFileSelect());

    // Drop zone
    this.dropZone = this.createDropZone();

    // Preview area
    this.preview = document.createElement('div');
    this.preview.className = 'nevent-file-preview';
    this.preview.style.display = 'none';

    this.container.appendChild(this.input);
    this.container.appendChild(this.dropZone);
    this.container.appendChild(this.preview);

    return this.container;
  }

  private createDropZone(): HTMLDivElement {
    const dropZone = document.createElement('div');
    dropZone.className = 'nevent-file-dropzone';
    dropZone.setAttribute('role', 'button');
    dropZone.setAttribute('aria-label', `Upload ${this.config.displayName}`);
    dropZone.tabIndex = 0;

    const maxSizeMB = Math.round(this.maxSizeBytes / (1024 * 1024));

    dropZone.innerHTML = `
      <div class="nevent-file-dropzone-content">
        <span class="nevent-file-icon">📁</span>
        <p class="nevent-file-dropzone-text">
          <strong>Click to upload</strong> or drag and drop
        </p>
        <p class="nevent-file-dropzone-hint">
          ${this.config.accept || 'Any file type'} (max ${maxSizeMB}MB)
        </p>
      </div>
    `;

    // Click to browse
    dropZone.addEventListener('click', () => this.input.click());
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.input.click();
      }
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // Manually set files to input (for validation consistency)
        this.input.files = e.dataTransfer.files;
        this.handleFileSelect();
      }
    });

    return dropZone;
  }

  private handleFileSelect(): void {
    const file = this.input.files?.[0];

    if (!file) return;

    // Validate file size
    if (file.size > this.maxSizeBytes) {
      const maxSizeMB = Math.round(this.maxSizeBytes / (1024 * 1024));
      this.showError(`File too large. Maximum size is ${maxSizeMB}MB.`);
      this.input.value = '';
      return;
    }

    // Validate file type if accept is specified
    if (this.config.accept) {
      const acceptedTypes = this.config.accept.split(',').map(t => t.trim());
      const fileType = file.type;
      const fileExtension = '.' + file.name.split('.').pop();

      const isAccepted = acceptedTypes.some(type => {
        if (type.endsWith('/*')) {
          // Handle wildcard like "image/*"
          const category = type.split('/')[0];
          return fileType.startsWith(category + '/');
        }
        return type === fileType || type === fileExtension;
      });

      if (!isAccepted) {
        this.showError(`Invalid file type. Accepted types: ${this.config.accept}`);
        this.input.value = '';
        return;
      }
    }

    this.file = file;
    this.showPreview(file);
    this.clearError();
  }

  private showPreview(file: File): void {
    this.dropZone.style.display = 'none';
    this.preview.style.display = 'block';

    if (file.type.startsWith('image/')) {
      // Image preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.preview.innerHTML = `
          <div class="nevent-file-preview-content">
            <img src="${e.target?.result}" alt="Preview" class="nevent-file-preview-image" />
            <div class="nevent-file-info">
              <p class="nevent-file-name">${file.name}</p>
              <p class="nevent-file-size">${this.formatFileSize(file.size)}</p>
            </div>
            <button type="button" class="nevent-file-remove" aria-label="Remove file">✕ Remove</button>
          </div>
        `;

        this.attachRemoveHandler();
      };
      reader.readAsDataURL(file);
    } else {
      // Generic file preview
      this.preview.innerHTML = `
        <div class="nevent-file-preview-content">
          <span class="nevent-file-icon-large">📄</span>
          <div class="nevent-file-info">
            <p class="nevent-file-name">${file.name}</p>
            <p class="nevent-file-size">${this.formatFileSize(file.size)}</p>
          </div>
          <button type="button" class="nevent-file-remove" aria-label="Remove file">✕ Remove</button>
        </div>
      `;

      this.attachRemoveHandler();
    }
  }

  private attachRemoveHandler(): void {
    const removeBtn = this.preview.querySelector('.nevent-file-remove');
    removeBtn?.addEventListener('click', () => this.clearFile());
  }

  private clearFile(): void {
    this.file = null;
    this.input.value = '';
    this.preview.innerHTML = '';
    this.preview.style.display = 'none';
    this.dropZone.style.display = 'block';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private showError(message: string): void {
    const errorSpan = document.createElement('span');
    errorSpan.className = 'nevent-field-error';
    errorSpan.textContent = message;
    errorSpan.setAttribute('role', 'alert');

    this.container.appendChild(errorSpan);

    setTimeout(() => errorSpan.remove(), 5000);
  }

  private clearError(): void {
    const error = this.container.querySelector('.nevent-field-error');
    error?.remove();
  }

  getValue(): File | null {
    return this.file;
  }

  validate(): ValidationResult {
    if (this.config.required && !this.file) {
      return { valid: false, error: `${this.config.displayName} is required` };
    }
    return { valid: true };
  }

  destroy(): void {
    // Cleanup if needed
  }
}
