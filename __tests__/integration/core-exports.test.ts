/**
 * Integration Test: Core Exports Verification
 *
 * Validates that all expected utilities and types are properly exported
 * from @nevent/core and are structurally correct. This ensures downstream
 * packages (chatbot, subscriptions) can reliably import the public API.
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorBoundary,
  Sanitizer,
  I18nManager,
  HttpClient,
  Logger,
  Storage,
  EmailValidator,
  FormValidator,
  AnalyticsClient,
  ContextCollector,
} from '@nevent/core';
import type {
  NormalizedError,
  HttpClientConfig,
  ApiError,
  ApiResponse,
  RequestConfig,
  WidgetConfig,
  ConsentData,
  AnalyticsEvent,
  AnalyticsClientConfig,
} from '@nevent/core';

// ============================================================================
// ErrorBoundary
// ============================================================================

describe('Core Exports - ErrorBoundary', () => {
  it('should export ErrorBoundary class', () => {
    expect(ErrorBoundary).toBeDefined();
    expect(typeof ErrorBoundary).toBe('function');
  });

  it('should be instantiable with default parameters', () => {
    const boundary = new ErrorBoundary();
    expect(boundary).toBeInstanceOf(ErrorBoundary);
  });

  it('should be instantiable with debug and logPrefix parameters', () => {
    const boundary = new ErrorBoundary(true, '[Test]');
    expect(boundary).toBeInstanceOf(ErrorBoundary);
  });

  it('should have guard() method that catches synchronous errors', () => {
    const boundary = new ErrorBoundary();
    expect(typeof boundary.guard).toBe('function');

    // Should return value on success
    const result = boundary.guard(() => 42);
    expect(result).toBe(42);

    // Should return undefined on error
    const errResult = boundary.guard(() => {
      throw new Error('test error');
    });
    expect(errResult).toBeUndefined();
  });

  it('should have guardAsync() method that catches async errors', async () => {
    const boundary = new ErrorBoundary();
    expect(typeof boundary.guardAsync).toBe('function');

    // Should resolve on success
    const result = await boundary.guardAsync(async () => 'hello');
    expect(result).toBe('hello');

    // Should return undefined on rejection
    const errResult = await boundary.guardAsync(async () => {
      throw new Error('async error');
    });
    expect(errResult).toBeUndefined();
  });

  it('should have wrapCallback() method', () => {
    const boundary = new ErrorBoundary();
    expect(typeof boundary.wrapCallback).toBe('function');

    // Should return a function
    const wrapped = boundary.wrapCallback(() => 'ok', 'test');
    expect(typeof wrapped).toBe('function');
    expect(wrapped()).toBe('ok');

    // Should handle null/undefined callback
    const noopWrapped = boundary.wrapCallback(null, 'test');
    expect(typeof noopWrapped).toBe('function');
    noopWrapped(); // should not throw
  });

  it('should have guardTimer() method', () => {
    const boundary = new ErrorBoundary();
    expect(typeof boundary.guardTimer).toBe('function');
  });

  it('should have static normalize() method', () => {
    expect(typeof ErrorBoundary.normalize).toBe('function');

    const normalized = ErrorBoundary.normalize(new Error('test'));
    expect(normalized).toHaveProperty('code');
    expect(normalized).toHaveProperty('message');
    expect(normalized.code).toBe('UNKNOWN_ERROR');
    expect(normalized.message).toBe('test');
  });

  it('should normalize various error types correctly', () => {
    // String error
    const strErr = ErrorBoundary.normalize('string error');
    expect(strErr.message).toBe('string error');

    // Error with context
    const ctxErr = ErrorBoundary.normalize(new Error('fail'), 'init');
    expect(ctxErr.message).toBe('init: fail');

    // Null/undefined
    const nullErr = ErrorBoundary.normalize(null);
    expect(nullErr.message).toContain('Unknown error');

    // Object with code and message
    const objErr = ErrorBoundary.normalize({
      code: 'HTTP_500',
      message: 'Server error',
      status: 500,
    });
    expect(objErr.code).toBe('HTTP_500');
    expect(objErr.status).toBe(500);
  });

  it('should invoke error handler set via setErrorHandler()', () => {
    const boundary = new ErrorBoundary();
    const errors: NormalizedError[] = [];

    boundary.setErrorHandler((err) => {
      errors.push(err);
    });

    boundary.guard(() => {
      throw new Error('handled error');
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('handled error');
  });
});

// ============================================================================
// Sanitizer
// ============================================================================

describe('Core Exports - Sanitizer', () => {
  it('should export Sanitizer class', () => {
    expect(Sanitizer).toBeDefined();
    expect(typeof Sanitizer).toBe('function');
  });

  it('should have static escapeHtml() method', () => {
    expect(typeof Sanitizer.escapeHtml).toBe('function');

    const result = Sanitizer.escapeHtml('<script>alert(1)</script>');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should escape all special HTML characters', () => {
    expect(Sanitizer.escapeHtml('&')).toBe('&amp;');
    expect(Sanitizer.escapeHtml('<')).toBe('&lt;');
    expect(Sanitizer.escapeHtml('>')).toBe('&gt;');
    expect(Sanitizer.escapeHtml('"')).toBe('&quot;');
    expect(Sanitizer.escapeHtml("'")).toBe('&#39;');
  });

  it('should have static sanitizeHtml() method', () => {
    expect(typeof Sanitizer.sanitizeHtml).toBe('function');

    const result = Sanitizer.sanitizeHtml(
      '<b>Hello</b><script>alert(1)</script>'
    );
    expect(result).toBe('<b>Hello</b>');
  });

  it('should accept custom allowed tags list', () => {
    const result = Sanitizer.sanitizeHtml(
      '<b>Bold</b><i>Italic</i><u>Underline</u>',
      ['b']
    );
    expect(result).toContain('<b>Bold</b>');
    expect(result).not.toContain('<i>');
    expect(result).not.toContain('<u>');
  });

  it('should have static isValidUrl() method', () => {
    expect(typeof Sanitizer.isValidUrl).toBe('function');

    expect(Sanitizer.isValidUrl('https://example.com')).toBe(true);
    expect(Sanitizer.isValidUrl('http://example.com')).toBe(true);
    expect(Sanitizer.isValidUrl('mailto:user@example.com')).toBe(true);
    expect(Sanitizer.isValidUrl('javascript:alert(1)')).toBe(false);
    expect(Sanitizer.isValidUrl('data:text/html,<h1>Hi</h1>')).toBe(false);
    expect(Sanitizer.isValidUrl('')).toBe(false);
  });

  it('should handle edge cases gracefully', () => {
    expect(Sanitizer.escapeHtml('')).toBe('');
    expect(Sanitizer.sanitizeHtml('')).toBe('');
    // @ts-expect-error Testing non-string input
    expect(Sanitizer.escapeHtml(null)).toBe('');
    // @ts-expect-error Testing non-string input
    expect(Sanitizer.sanitizeHtml(undefined)).toBe('');
  });
});

// ============================================================================
// I18nManager
// ============================================================================

describe('Core Exports - I18nManager', () => {
  const translations = {
    en: { hello: 'Hello', goodbye: 'Goodbye', greeting: 'Hi {{name}}' },
    es: { hello: 'Hola', goodbye: 'Adiós', greeting: 'Hola {{name}}' },
  };

  it('should export I18nManager class', () => {
    expect(I18nManager).toBeDefined();
    expect(typeof I18nManager).toBe('function');
  });

  it('should be instantiable with locales and default locale', () => {
    const i18n = new I18nManager(translations, 'en');
    expect(i18n).toBeInstanceOf(I18nManager);
  });

  it('should have t() method for translation', () => {
    const i18n = new I18nManager(translations, 'en');
    expect(typeof i18n.t).toBe('function');

    expect(i18n.t('hello')).toBe('Hello');
    expect(i18n.t('goodbye')).toBe('Goodbye');
  });

  it('should support parameter interpolation with {{param}} syntax', () => {
    const i18n = new I18nManager(translations, 'en');
    expect(i18n.t('greeting', { name: 'World' })).toBe('Hi World');
  });

  it('should have setLocale() method', () => {
    const i18n = new I18nManager(translations, 'en');
    expect(typeof i18n.setLocale).toBe('function');

    i18n.setLocale('es');
    expect(i18n.t('hello')).toBe('Hola');
  });

  it('should have getLocale() method', () => {
    const i18n = new I18nManager(translations, 'en');
    expect(typeof i18n.getLocale).toBe('function');
    expect(i18n.getLocale()).toBe('en');

    i18n.setLocale('es');
    expect(i18n.getLocale()).toBe('es');
  });

  it('should have static detectLocale() method', () => {
    expect(typeof I18nManager.detectLocale).toBe('function');
    const locale = I18nManager.detectLocale();
    expect(typeof locale).toBe('string');
  });

  it('should fall back to default locale for missing keys', () => {
    const partial = {
      en: { hello: 'Hello', goodbye: 'Goodbye' },
      es: { hello: 'Hola', goodbye: 'Adiós' },
    };
    const i18n = new I18nManager(partial, 'en');
    i18n.setLocale('es');
    expect(i18n.t('hello')).toBe('Hola');
  });

  it('should throw when default locale is not in locales map', () => {
    expect(() => {
      new I18nManager(translations, 'fr');
    }).toThrow('default locale "fr" not found');
  });
});

// ============================================================================
// HttpClient
// ============================================================================

describe('Core Exports - HttpClient', () => {
  it('should export HttpClient class', () => {
    expect(HttpClient).toBeDefined();
    expect(typeof HttpClient).toBe('function');
  });

  it('should be instantiable', () => {
    const client = new HttpClient('https://api.example.com', 'test-key');
    expect(client).toBeInstanceOf(HttpClient);
  });
});

// ============================================================================
// Logger
// ============================================================================

describe('Core Exports - Logger', () => {
  it('should export Logger class', () => {
    expect(Logger).toBeDefined();
    expect(typeof Logger).toBe('function');
  });

  it('should be instantiable with prefix', () => {
    const logger = new Logger('[Test]');
    expect(logger).toBeInstanceOf(Logger);
  });

  it('should have debug, info, warn, error methods', () => {
    const logger = new Logger('[Test]', true);
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

// ============================================================================
// Storage
// ============================================================================

describe('Core Exports - Storage', () => {
  it('should export Storage class', () => {
    expect(Storage).toBeDefined();
    expect(typeof Storage).toBe('function');
  });

  it('should be instantiable with default prefix', () => {
    const storage = new Storage();
    expect(storage).toBeInstanceOf(Storage);
  });

  it('should be instantiable with custom prefix', () => {
    const storage = new Storage('test_');
    expect(storage).toBeInstanceOf(Storage);
  });
});

// ============================================================================
// Additional Exports (Validators, Analytics)
// ============================================================================

describe('Core Exports - Validators', () => {
  it('should export EmailValidator', () => {
    expect(EmailValidator).toBeDefined();
    expect(typeof EmailValidator.validate).toBe('function');
  });

  it('should export FormValidator', () => {
    expect(FormValidator).toBeDefined();
  });
});

describe('Core Exports - Analytics', () => {
  it('should export AnalyticsClient', () => {
    expect(AnalyticsClient).toBeDefined();
    expect(typeof AnalyticsClient).toBe('function');
  });

  it('should export ContextCollector', () => {
    expect(ContextCollector).toBeDefined();
    expect(typeof ContextCollector).toBe('function');
  });
});

// ============================================================================
// Type Imports (compile-time verification)
// ============================================================================

describe('Core Exports - Types (compile-time verification)', () => {
  it('should have importable NormalizedError type', () => {
    const error: NormalizedError = {
      code: 'TEST',
      message: 'test message',
    };
    expect(error.code).toBe('TEST');
    expect(error.message).toBe('test message');
  });

  it('should have importable HttpClientConfig type', () => {
    const config: HttpClientConfig = {
      timeout: 5000,
      maxRetries: 2,
      retryDelay: 1000,
    };
    expect(config.timeout).toBe(5000);
  });

  it('should have importable ApiError type', () => {
    const error: ApiError = {
      message: 'Not found',
      code: 'NOT_FOUND',
      status: 404,
    };
    expect(error.status).toBe(404);
  });

  it('should have importable ApiResponse type', () => {
    const response: ApiResponse<{ id: string }> = {
      data: { id: '123' },
      success: true,
    };
    expect(response.success).toBe(true);
  });

  it('should have importable RequestConfig type', () => {
    const config: RequestConfig = {
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
    expect(config.method).toBe('GET');
  });

  it('should have importable WidgetConfig type', () => {
    const config: WidgetConfig = {
      apiUrl: 'https://api.example.com',
      apiKey: 'test-key',
      locale: 'en',
      debug: false,
    };
    expect(config.apiUrl).toBe('https://api.example.com');
  });

  it('should have importable ConsentData type', () => {
    const consent: ConsentData = {
      marketing: true,
      timestamp: new Date().toISOString(),
    };
    expect(consent.marketing).toBe(true);
  });
});
