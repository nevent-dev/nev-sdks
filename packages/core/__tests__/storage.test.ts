import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { Storage } from '../src/storage';

describe('Storage', () => {
  let storage: Storage;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    storage = new Storage('test_');
  });

  afterEach(() => {
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // set / get
  // --------------------------------------------------------------------------

  describe('set / get', () => {
    it('should store and retrieve a string value', () => {
      storage.set('name', 'Alice');
      expect(storage.get<string>('name')).toBe('Alice');
    });

    it('should store and retrieve a number value', () => {
      storage.set('count', 42);
      expect(storage.get<number>('count')).toBe(42);
    });

    it('should store and retrieve an object value', () => {
      const data = { id: 1, name: 'Test' };
      storage.set('user', data);
      expect(storage.get<typeof data>('user')).toEqual(data);
    });

    it('should store and retrieve an array value', () => {
      const items = [1, 2, 3];
      storage.set('items', items);
      expect(storage.get<number[]>('items')).toEqual(items);
    });

    it('should store and retrieve a boolean value', () => {
      storage.set('flag', true);
      expect(storage.get<boolean>('flag')).toBe(true);
    });

    it('should store null value', () => {
      storage.set('nullable', null);
      expect(storage.get('nullable')).toBeNull();
    });

    it('should return null for non-existent keys', () => {
      expect(storage.get('nonexistent')).toBeNull();
    });

    it('should use the prefix for storage keys', () => {
      storage.set('key', 'value');
      expect(localStorage.getItem('test_key')).toBe('"value"');
    });
  });

  // --------------------------------------------------------------------------
  // remove
  // --------------------------------------------------------------------------

  describe('remove', () => {
    it('should remove a stored key', () => {
      storage.set('key', 'value');
      expect(storage.get('key')).toBe('value');

      storage.remove('key');
      expect(storage.get('key')).toBeNull();
    });

    it('should not throw when removing a non-existent key', () => {
      expect(() => storage.remove('nonexistent')).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // has
  // --------------------------------------------------------------------------

  describe('has', () => {
    it('should return true for existing keys', () => {
      storage.set('key', 'value');
      expect(storage.has('key')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(storage.has('missing')).toBe(false);
    });

    it('should return false after key is removed', () => {
      storage.set('key', 'value');
      storage.remove('key');
      expect(storage.has('key')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should remove all keys with the configured prefix', () => {
      storage.set('a', 1);
      storage.set('b', 2);
      storage.set('c', 3);

      storage.clear();

      expect(storage.get('a')).toBeNull();
      expect(storage.get('b')).toBeNull();
      expect(storage.get('c')).toBeNull();
    });

    it('should NOT remove keys with different prefixes', () => {
      storage.set('myKey', 'myValue');
      localStorage.setItem('other_key', 'other_value');

      storage.clear();

      expect(localStorage.getItem('other_key')).toBe('other_value');
    });
  });

  // --------------------------------------------------------------------------
  // Default prefix
  // --------------------------------------------------------------------------

  describe('default prefix', () => {
    it('should use "nevent_" as default prefix', () => {
      const defaultStorage = new Storage();
      defaultStorage.set('key', 'value');
      expect(localStorage.getItem('nevent_key')).toBe('"value"');

      // Clean up
      defaultStorage.remove('key');
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle localStorage.setItem errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock via prototype to properly intercept jsdom's localStorage
      const setItemSpy = vi
        .spyOn(Object.getPrototypeOf(localStorage), 'setItem')
        .mockImplementation(() => {
          throw new DOMException('QuotaExceededError');
        });

      expect(() => storage.set('key', 'value')).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();

      setItemSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle localStorage.getItem errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const getItemSpy = vi
        .spyOn(Object.getPrototypeOf(localStorage), 'getItem')
        .mockImplementation(() => {
          throw new Error('Access denied');
        });

      const result = storage.get('key');
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();

      getItemSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle invalid JSON in localStorage', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      localStorage.setItem('test_invalid', '{not valid json');
      const result = storage.get('invalid');
      expect(result).toBeNull();

      errorSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Overwriting values
  // --------------------------------------------------------------------------

  describe('overwriting values', () => {
    it('should overwrite existing values', () => {
      storage.set('key', 'first');
      expect(storage.get('key')).toBe('first');

      storage.set('key', 'second');
      expect(storage.get('key')).toBe('second');
    });

    it('should change value type when overwritten', () => {
      storage.set('key', 'string');
      expect(storage.get('key')).toBe('string');

      storage.set('key', 42);
      expect(storage.get('key')).toBe(42);
    });
  });
});
