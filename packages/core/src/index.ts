/**
 * @nevent/core - Core utilities and shared types for Nevent SDKs
 *
 * This package provides common functionality used across all Nevent SDKs:
 * - HTTP client for API communication
 * - Form validation utilities
 * - LocalStorage wrapper
 * - Logging utilities
 * - Shared TypeScript types
 *
 * @packageDocumentation
 */

export * from './types';
export { HttpClient } from './http-client';
export { EmailValidator, FormValidator } from './validators';
export { Logger } from './logger';
export { Storage } from './storage';

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
