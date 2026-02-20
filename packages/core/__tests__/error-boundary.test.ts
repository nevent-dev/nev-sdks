import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ErrorBoundary } from '../src/error-boundary';
import type { NormalizedError } from '../src/error-boundary';

describe('ErrorBoundary', () => {
  let boundary: ErrorBoundary;

  beforeEach(() => {
    boundary = new ErrorBoundary();
  });

  // --------------------------------------------------------------------------
  // guard (synchronous)
  // --------------------------------------------------------------------------

  describe('guard', () => {
    it('should return the result of a successful function', () => {
      const result = boundary.guard(() => 42, 'test');
      expect(result).toBe(42);
    });

    it('should return undefined when the function throws', () => {
      const result = boundary.guard(() => {
        throw new Error('boom');
      }, 'test');
      expect(result).toBeUndefined();
    });

    it('should call the error handler when the function throws', () => {
      const handler = vi.fn();
      boundary.setErrorHandler(handler);

      boundary.guard(() => {
        throw new Error('boom');
      }, 'testContext');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'UNKNOWN_ERROR',
          message: 'testContext: boom',
        }),
      );
    });

    it('should work without a context parameter', () => {
      const handler = vi.fn();
      boundary.setErrorHandler(handler);

      boundary.guard(() => {
        throw new Error('no context');
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'no context',
        }),
      );
    });

    it('should not throw even if error handler throws', () => {
      boundary.setErrorHandler(() => {
        throw new Error('handler crash');
      });

      const result = boundary.guard(() => {
        throw new Error('original');
      }, 'test');

      expect(result).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // guardAsync
  // --------------------------------------------------------------------------

  describe('guardAsync', () => {
    it('should return the result of a successful async function', async () => {
      const result = await boundary.guardAsync(
        async () => 'async-result',
        'test',
      );
      expect(result).toBe('async-result');
    });

    it('should return undefined when the async function rejects', async () => {
      const result = await boundary.guardAsync(async () => {
        throw new Error('async boom');
      }, 'test');
      expect(result).toBeUndefined();
    });

    it('should call the error handler on async rejection', async () => {
      const handler = vi.fn();
      boundary.setErrorHandler(handler);

      await boundary.guardAsync(async () => {
        throw new Error('async error');
      }, 'asyncCtx');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'UNKNOWN_ERROR',
          message: 'asyncCtx: async error',
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // wrapCallback
  // --------------------------------------------------------------------------

  describe('wrapCallback', () => {
    it('should return a no-op for null/undefined callbacks', () => {
      const wrapped = boundary.wrapCallback(null, 'test');
      expect(wrapped).toBeTypeOf('function');
      expect(wrapped()).toBeUndefined();

      const wrapped2 = boundary.wrapCallback(undefined, 'test');
      expect(wrapped2()).toBeUndefined();
    });

    it('should execute the callback and return its result', () => {
      const fn = vi.fn().mockReturnValue('result');
      const wrapped = boundary.wrapCallback(fn, 'test');

      const result = wrapped('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('result');
    });

    it('should catch errors in the callback', () => {
      const handler = vi.fn();
      boundary.setErrorHandler(handler);

      const fn = () => {
        throw new Error('callback crash');
      };
      const wrapped = boundary.wrapCallback(fn, 'onMessage');

      const result = wrapped();

      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'callback:onMessage: callback crash',
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // guardTimer
  // --------------------------------------------------------------------------

  describe('guardTimer', () => {
    it('should start an interval that calls the function', () => {
      vi.useFakeTimers();
      const fn = vi.fn();

      const timerId = boundary.guardTimer(fn, 100, 'heartbeat');

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);

      clearInterval(timerId);
      vi.useRealTimers();
    });

    it('should catch errors in the timer callback', () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      boundary.setErrorHandler(handler);

      const timerId = boundary.guardTimer(
        () => {
          throw new Error('timer crash');
        },
        100,
        'tick',
      );

      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'timer:tick: timer crash',
        }),
      );

      clearInterval(timerId);
      vi.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // normalize (static)
  // --------------------------------------------------------------------------

  describe('normalize', () => {
    it('should normalize Error instances', () => {
      const result = ErrorBoundary.normalize(new Error('test error'));
      expect(result).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'test error',
      });
    });

    it('should normalize Error instances with context', () => {
      const result = ErrorBoundary.normalize(
        new Error('test error'),
        'myContext',
      );
      expect(result).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'myContext: test error',
      });
    });

    it('should normalize strings', () => {
      const result = ErrorBoundary.normalize('string error');
      expect(result).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'string error',
      });
    });

    it('should normalize objects with code and message', () => {
      const result = ErrorBoundary.normalize({
        code: 'CUSTOM_CODE',
        message: 'custom message',
        status: 404,
        details: { field: 'email' },
      });
      expect(result).toEqual({
        code: 'CUSTOM_CODE',
        message: 'custom message',
        status: 404,
        details: { field: 'email' },
      });
    });

    it('should normalize null/undefined', () => {
      const nullResult = ErrorBoundary.normalize(null);
      expect(nullResult.message).toBe('Unknown error occurred');

      const undefinedResult = ErrorBoundary.normalize(undefined);
      expect(undefinedResult.message).toBe('Unknown error occurred');
    });

    it('should normalize numbers and other primitives', () => {
      const result = ErrorBoundary.normalize(42);
      expect(result.message).toBe('42');
      expect(result.code).toBe('UNKNOWN_ERROR');
    });
  });

  // --------------------------------------------------------------------------
  // Debug mode
  // --------------------------------------------------------------------------

  describe('debug mode', () => {
    it('should log errors to console when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugBoundary = new ErrorBoundary(true);

      debugBoundary.guard(() => {
        throw new Error('debug test');
      }, 'debugCtx');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in debugCtx'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should NOT log errors when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      boundary.guard(() => {
        throw new Error('no debug');
      }, 'ctx');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should use custom log prefix', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const customBoundary = new ErrorBoundary(true, '[MySDK]');

      customBoundary.guard(() => {
        throw new Error('custom prefix');
      }, 'ctx');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MySDK]'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should log when error handler itself throws (debug mode)', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugBoundary = new ErrorBoundary(true);

      debugBoundary.setErrorHandler(() => {
        throw new Error('handler boom');
      });

      debugBoundary.guard(() => {
        throw new Error('original');
      }, 'ctx');

      // Should have two calls: one for the original error, one for the handler crash
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // setErrorHandler
  // --------------------------------------------------------------------------

  describe('setErrorHandler', () => {
    it('should allow replacing the error handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      boundary.setErrorHandler(handler1);
      boundary.guard(() => {
        throw new Error('first');
      });
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).not.toHaveBeenCalled();

      boundary.setErrorHandler(handler2);
      boundary.guard(() => {
        throw new Error('second');
      });
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should silently swallow errors when no handler is set', () => {
      // No handler set - should not throw
      expect(() => {
        boundary.guard(() => {
          throw new Error('no handler');
        });
      }).not.toThrow();
    });
  });
});
