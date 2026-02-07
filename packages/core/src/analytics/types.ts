/**
 * Device context information
 */
export interface DeviceContext {
  os: string;
  osVersion: string;
  model: string;
  manufacturer: string;
  platform: string;
  appVersion: string;
}

/**
 * Screen and viewport context
 */
export interface ScreenContext {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  orientation: string;
}

/**
 * Session context information
 */
export interface SessionContext {
  sessionId: string;
  sessionStart: string;
  duration: number;
  timezone: string;
  referrer: string;
  url: string;
}

/**
 * Network connection context
 */
export interface NetworkContext {
  type?: string;
  effectiveType?: string;
  downlink?: number;
}

/**
 * User preferences context
 */
export interface PreferencesContext {
  language: string;
  colorScheme: string;
}

/**
 * Complete analytics context
 */
export interface AnalyticsContext {
  device: DeviceContext;
  screen: ScreenContext;
  session: SessionContext;
  network: NetworkContext;
  preferences: PreferencesContext;
}

/**
 * Analytics event parameters
 */
export interface AnalyticsEventParams {
  event_category: string;
  event_label: string;
  interaction: boolean;
  value?: number;
  error_message?: string;
  tenant_id?: string;
  [key: string]: unknown;
}

/**
 * Complete analytics event payload
 */
export interface AnalyticsEvent {
  event_name: string;
  event_params: Partial<AnalyticsEventParams>;
  context: AnalyticsContext;
  timestamp: string;
  user_id: string | null;
}

/**
 * Analytics client configuration
 */
export interface AnalyticsClientConfig {
  endpoint: string;
  enabled?: boolean;
  debug?: boolean;
}
