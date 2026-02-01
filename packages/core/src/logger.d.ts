/**
 * Simple logger with debug mode support
 */
export declare class Logger {
    private debugMode;
    private prefix;
    /**
     * Creates a new logger instance
     *
     * @param prefix - Prefix for all log messages (e.g., '[NeventSDK]')
     * @param debug - Enable debug logging
     */
    constructor(prefix: string, debug?: boolean);
    /**
     * Log debug message (only in debug mode)
     */
    debug(...args: unknown[]): void;
    /**
     * Log info message (only in debug mode)
     */
    info(...args: unknown[]): void;
    /**
     * Log warning (always shown)
     */
    warn(...args: unknown[]): void;
    /**
     * Log error (always shown)
     */
    error(...args: unknown[]): void;
    /**
     * Enable or disable debug mode
     */
    setDebug(enabled: boolean): void;
}
//# sourceMappingURL=logger.d.ts.map