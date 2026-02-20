/**
 * @nevent/core - Core utilities and shared types for Nevent SDKs
 *
 * This package provides common functionality used across all Nevent SDKs:
 * - HTTP client for API communication with retry, timeout, and interceptors
 * - Error boundary for error isolation and normalization
 * - HTML sanitization and URL validation
 * - Internationalization (i18n) manager
 * - Form validation utilities
 * - LocalStorage wrapper
 * - Logging utilities
 * - Shared TypeScript types
 *
 * @packageDocumentation
 */

export * from './types';
export { HttpClient } from './http-client';
export type {
  HttpClientConfig,
  RequestInterceptor,
  ResponseInterceptor,
} from './http-client';
export { EmailValidator, FormValidator } from './validators';
export { Logger } from './logger';
export { Storage } from './storage';
export { ErrorBoundary } from './error-boundary';
export type { NormalizedError } from './error-boundary';
export { Sanitizer } from './sanitizer';
export { I18nManager } from './i18n-manager';

// Analytics exports
export { AnalyticsClient } from './analytics/analytics-client';
export { ContextCollector } from './analytics/context-collector';
export type {
  AnalyticsEvent,
  AnalyticsEventParams,
  AnalyticsContext,
  AnalyticsClientConfig,
  DeviceContext,
  ScreenContext,
  SessionContext,
  NetworkContext,
  PreferencesContext,
} from './analytics/types';
