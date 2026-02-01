/**
 * LocalStorage wrapper with error handling and type safety
 */
export declare class Storage {
    private prefix;
    /**
     * Creates a new storage instance
     *
     * @param prefix - Prefix for all storage keys (e.g., 'nevent_')
     */
    constructor(prefix?: string);
    /**
     * Save data to localStorage
     *
     * @param key - Storage key (will be prefixed)
     * @param value - Value to store (will be JSON stringified)
     */
    set<T>(key: string, value: T): void;
    /**
     * Retrieve data from localStorage
     *
     * @param key - Storage key (will be prefixed)
     * @returns Parsed value or null if not found
     */
    get<T>(key: string): T | null;
    /**
     * Remove data from localStorage
     *
     * @param key - Storage key (will be prefixed)
     */
    remove(key: string): void;
    /**
     * Check if a key exists in localStorage
     *
     * @param key - Storage key (will be prefixed)
     */
    has(key: string): boolean;
    /**
     * Clear all keys with the current prefix
     */
    clear(): void;
}
//# sourceMappingURL=storage.d.ts.map