/**
 * LocalStorage wrapper with error handling and type safety
 */
export class Storage {
  private prefix: string;

  /**
   * Creates a new storage instance
   *
   * @param prefix - Prefix for all storage keys (e.g., 'nevent_')
   */
  constructor(prefix = 'nevent_') {
    this.prefix = prefix;
  }

  /**
   * Save data to localStorage
   *
   * @param key - Storage key (will be prefixed)
   * @param value - Value to store (will be JSON stringified)
   */
  set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(this.prefix + key, serialized);
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  /**
   * Retrieve data from localStorage
   *
   * @param key - Storage key (will be prefixed)
   * @returns Parsed value or null if not found
   */
  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return null;
    }
  }

  /**
   * Remove data from localStorage
   *
   * @param key - Storage key (will be prefixed)
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  }

  /**
   * Check if a key exists in localStorage
   *
   * @param key - Storage key (will be prefixed)
   */
  has(key: string): boolean {
    return localStorage.getItem(this.prefix + key) !== null;
  }

  /**
   * Clear all keys with the current prefix
   */
  clear(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }
}
