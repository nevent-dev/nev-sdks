/**
 * Simple logger with debug mode support
 */
export class Logger {
  private debugMode: boolean;
  private prefix: string;

  /**
   * Creates a new logger instance
   *
   * @param prefix - Prefix for all log messages (e.g., '[NeventSDK]')
   * @param debug - Enable debug logging
   */
  constructor(prefix: string, debug = false) {
    this.prefix = prefix;
    this.debugMode = debug;
  }

  /**
   * Log debug message (only in debug mode)
   */
  debug(...args: unknown[]): void {
    if (this.debugMode) {
      console.log(this.prefix, '[DEBUG]', ...args);
    }
  }

  /**
   * Log info message (only in debug mode)
   */
  info(...args: unknown[]): void {
    if (this.debugMode) {
      console.log(this.prefix, '[INFO]', ...args);
    }
  }

  /**
   * Log warning (always shown)
   */
  warn(...args: unknown[]): void {
    console.warn(this.prefix, '[WARN]', ...args);
  }

  /**
   * Log error (always shown)
   */
  error(...args: unknown[]): void {
    console.error(this.prefix, '[ERROR]', ...args);
  }

  /**
   * Enable or disable debug mode
   */
  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }
}
