import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { Logger } from '../src/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Debug mode OFF (default)
  // --------------------------------------------------------------------------

  describe('debug mode OFF (default)', () => {
    beforeEach(() => {
      logger = new Logger('[TestSDK]');
    });

    it('should NOT log debug messages', () => {
      logger.debug('debug message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should NOT log info messages', () => {
      logger.info('info message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should log warning messages', () => {
      logger.warn('warning message');
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[TestSDK]',
        '[WARN]',
        'warning message'
      );
    });

    it('should log error messages', () => {
      logger.error('error message');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestSDK]',
        '[ERROR]',
        'error message'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Debug mode ON
  // --------------------------------------------------------------------------

  describe('debug mode ON', () => {
    beforeEach(() => {
      logger = new Logger('[TestSDK]', true);
    });

    it('should log debug messages with prefix and level', () => {
      logger.debug('debug data', { key: 'value' });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[TestSDK]',
        '[DEBUG]',
        'debug data',
        { key: 'value' }
      );
    });

    it('should log info messages with prefix and level', () => {
      logger.info('info message', 42);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[TestSDK]',
        '[INFO]',
        'info message',
        42
      );
    });

    it('should log warning messages', () => {
      logger.warn('warning');
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[TestSDK]',
        '[WARN]',
        'warning'
      );
    });

    it('should log error messages', () => {
      logger.error('error', new Error('test'));
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestSDK]',
        '[ERROR]',
        'error',
        expect.any(Error)
      );
    });
  });

  // --------------------------------------------------------------------------
  // setDebug
  // --------------------------------------------------------------------------

  describe('setDebug', () => {
    it('should enable debug mode at runtime', () => {
      logger = new Logger('[SDK]'); // debug off by default
      logger.debug('before');
      expect(consoleSpy.log).not.toHaveBeenCalled();

      logger.setDebug(true);
      logger.debug('after');
      expect(consoleSpy.log).toHaveBeenCalledWith('[SDK]', '[DEBUG]', 'after');
    });

    it('should disable debug mode at runtime', () => {
      logger = new Logger('[SDK]', true); // debug on
      logger.debug('visible');
      expect(consoleSpy.log).toHaveBeenCalledOnce();

      logger.setDebug(false);
      logger.debug('invisible');
      expect(consoleSpy.log).toHaveBeenCalledOnce(); // still just once
    });
  });

  // --------------------------------------------------------------------------
  // Multiple arguments
  // --------------------------------------------------------------------------

  describe('multiple arguments', () => {
    it('should pass multiple arguments to console methods', () => {
      logger = new Logger('[SDK]', true);

      logger.debug('arg1', 'arg2', 'arg3');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[SDK]',
        '[DEBUG]',
        'arg1',
        'arg2',
        'arg3'
      );
    });

    it('should handle no arguments', () => {
      logger = new Logger('[SDK]', true);
      logger.debug();
      expect(consoleSpy.log).toHaveBeenCalledWith('[SDK]', '[DEBUG]');
    });
  });

  // --------------------------------------------------------------------------
  // Prefix formatting
  // --------------------------------------------------------------------------

  describe('prefix formatting', () => {
    it('should use the provided prefix in all log levels', () => {
      logger = new Logger('[MyWidget]', true);

      logger.debug('d');
      expect(consoleSpy.log).toHaveBeenCalledWith('[MyWidget]', '[DEBUG]', 'd');

      logger.info('i');
      expect(consoleSpy.log).toHaveBeenCalledWith('[MyWidget]', '[INFO]', 'i');

      logger.warn('w');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[MyWidget]', '[WARN]', 'w');

      logger.error('e');
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[MyWidget]',
        '[ERROR]',
        'e'
      );
    });
  });
});
