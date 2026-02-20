/**
 * error-boundary.test.ts - Unit and integration tests for ErrorBoundary
 *
 * Tests verify:
 * - Synchronous guard: returns value on success, undefined on error
 * - Async guard: returns value on success, undefined on rejection
 * - Callback wrapper: wraps throwing callbacks safely, handles undefined
 * - Timer wrapper: wraps timer callbacks safely
 * - Error handler invocation with normalized ChatbotError
 * - Error handler throwing does not propagate
 * - Debug mode logs to console
 * - normalize() handles Error, string, object, and unknown error types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorBoundary } from '../error-boundary';
import type { ChatbotError } from '../../types';

describe('ErrorBoundary', () => {
  let boundary: ErrorBoundary;
  let errorHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    boundary = new ErrorBoundary(false);
    errorHandler = vi.fn();
    boundary.setErrorHandler(errorHandler);
  });

  // ==========================================================================
  // guard() — synchronous
  // ==========================================================================

  describe('guard()', () => {
    it('returns the value on success', () => {
      const result = boundary.guard(() => 42, 'test');
      expect(result).toBe(42);
    });

    it('returns undefined on error without throwing', () => {
      const result = boundary.guard(() => {
        throw new Error('boom');
      }, 'test');

      expect(result).toBeUndefined();
    });

    it('does not throw when the guarded function throws', () => {
      expect(() => {
        boundary.guard(() => {
          throw new Error('sync error');
        }, 'test');
      }).not.toThrow();
    });

    it('calls the error handler with a normalized ChatbotError', () => {
      boundary.guard(() => {
        throw new Error('test error message');
      }, 'myContext');

      expect(errorHandler).toHaveBeenCalledOnce();
      const error = errorHandler.mock.calls[0][0] as ChatbotError;
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.message).toContain('myContext');
      expect(error.message).toContain('test error message');
    });

    it('returns complex objects correctly on success', () => {
      const obj = { foo: 'bar', nested: { count: 5 } };
      const result = boundary.guard(() => obj, 'test');
      expect(result).toEqual(obj);
    });

    it('works without a context parameter', () => {
      const result = boundary.guard(() => {
        throw new Error('no context');
      });

      expect(result).toBeUndefined();
      expect(errorHandler).toHaveBeenCalledOnce();
    });
  });

  // ==========================================================================
  // guardAsync() — asynchronous
  // ==========================================================================

  describe('guardAsync()', () => {
    it('returns the resolved value on success', async () => {
      const result = await boundary.guardAsync(async () => 'hello', 'test');
      expect(result).toBe('hello');
    });

    it('returns undefined on rejection without throwing', async () => {
      const result = await boundary.guardAsync(async () => {
        throw new Error('async boom');
      }, 'test');

      expect(result).toBeUndefined();
    });

    it('does not reject when the async function rejects', async () => {
      await expect(
        boundary.guardAsync(async () => {
          throw new Error('async error');
        }, 'test'),
      ).resolves.toBeUndefined();
    });

    it('calls the error handler with a normalized ChatbotError', async () => {
      await boundary.guardAsync(async () => {
        throw new Error('async fail');
      }, 'asyncContext');

      expect(errorHandler).toHaveBeenCalledOnce();
      const error = errorHandler.mock.calls[0][0] as ChatbotError;
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.message).toContain('asyncContext');
      expect(error.message).toContain('async fail');
    });

    it('handles rejected promises (not just thrown errors)', async () => {
      await boundary.guardAsync(
        () => Promise.reject(new Error('rejected')),
        'test',
      );

      expect(errorHandler).toHaveBeenCalledOnce();
    });
  });

  // ==========================================================================
  // wrapCallback()
  // ==========================================================================

  describe('wrapCallback()', () => {
    it('wraps a throwing callback safely — does not propagate', () => {
      const throwingFn = () => {
        throw new Error('callback error');
      };
      const safeFn = boundary.wrapCallback(throwingFn, 'onOpen');

      expect(() => safeFn()).not.toThrow();
      expect(errorHandler).toHaveBeenCalledOnce();
      const error = errorHandler.mock.calls[0][0] as ChatbotError;
      expect(error.message).toContain('callback:onOpen');
    });

    it('returns the callback return value on success', () => {
      const fn = (x: number) => x * 2;
      const safeFn = boundary.wrapCallback(fn, 'multiply');

      // Need to cast since wrapCallback uses unknown args
      const result = (safeFn as (x: number) => number)(5);
      expect(result).toBe(10);
    });

    it('handles undefined callback — returns a no-op function', () => {
      const safeFn = boundary.wrapCallback(undefined, 'optional');

      expect(typeof safeFn).toBe('function');
      expect(() => safeFn()).not.toThrow();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('handles null callback — returns a no-op function', () => {
      const safeFn = boundary.wrapCallback(null, 'optional');

      expect(typeof safeFn).toBe('function');
      expect(() => safeFn()).not.toThrow();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('passes through arguments to the wrapped callback', () => {
      const spy = vi.fn();
      const safeFn = boundary.wrapCallback(spy, 'test');

      safeFn('arg1', 'arg2');

      expect(spy).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  // ==========================================================================
  // guardTimer()
  // ==========================================================================

  describe('guardTimer()', () => {
    it('wraps timer callbacks safely — does not throw', () => {
      const throwingTimer = () => {
        throw new Error('timer error');
      };
      const safeTimer = boundary.guardTimer(throwingTimer, 'heartbeat');

      expect(() => safeTimer()).not.toThrow();
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    it('executes the timer callback on success', () => {
      const spy = vi.fn();
      const safeTimer = boundary.guardTimer(spy, 'tick');

      safeTimer();

      expect(spy).toHaveBeenCalledOnce();
    });

    it('reports error with timer context prefix', () => {
      boundary.guardTimer(() => {
        throw new Error('tick failed');
      }, 'myTimer')();

      const error = errorHandler.mock.calls[0][0] as ChatbotError;
      expect(error.message).toContain('timer:myTimer');
    });

    it('works with setTimeout', () => {
      vi.useFakeTimers();
      const spy = vi.fn();

      setTimeout(boundary.guardTimer(spy, 'delayed'), 100);
      vi.advanceTimersByTime(100);

      expect(spy).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Error handler behavior
  // ==========================================================================

  describe('error handler', () => {
    it('error handler throwing does not propagate', () => {
      const throwingHandler = vi.fn(() => {
        throw new Error('handler itself threw');
      });
      boundary.setErrorHandler(throwingHandler);

      expect(() => {
        boundary.guard(() => {
          throw new Error('trigger');
        }, 'test');
      }).not.toThrow();

      expect(throwingHandler).toHaveBeenCalledOnce();
    });

    it('works without an error handler set', () => {
      const noHandlerBoundary = new ErrorBoundary(false);
      // No setErrorHandler called

      expect(() => {
        noHandlerBoundary.guard(() => {
          throw new Error('no handler');
        }, 'test');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Debug mode
  // ==========================================================================

  describe('debug mode', () => {
    it('logs to console.error when debug is true', () => {
      const debugBoundary = new ErrorBoundary(true);
      debugBoundary.setErrorHandler(vi.fn());
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      debugBoundary.guard(() => {
        throw new Error('debug error');
      }, 'debugContext');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logMessage = consoleErrorSpy.mock.calls[0][0] as string;
      expect(logMessage).toContain('[NeventChatbot]');
      expect(logMessage).toContain('debugContext');

      consoleErrorSpy.mockRestore();
    });

    it('does not log to console when debug is false', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      boundary.guard(() => {
        throw new Error('silent error');
      }, 'test');

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('logs when error handler itself throws in debug mode', () => {
      const debugBoundary = new ErrorBoundary(true);
      debugBoundary.setErrorHandler(() => {
        throw new Error('handler error');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      debugBoundary.guard(() => {
        throw new Error('trigger');
      }, 'test');

      // Should have at least 2 console.error calls: one for the original error
      // and one for the handler error
      expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

      consoleErrorSpy.mockRestore();
    });
  });

  // ==========================================================================
  // normalize() — static
  // ==========================================================================

  describe('normalize()', () => {
    it('normalizes a standard Error', () => {
      const result = ErrorBoundary.normalize(new Error('test message'), 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: test message');
    });

    it('normalizes a string', () => {
      const result = ErrorBoundary.normalize('string error', 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: string error');
    });

    it('normalizes a ChatbotError-like object', () => {
      const errorObj = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        status: 429,
        details: { retryAfter: 60 },
      };
      const result = ErrorBoundary.normalize(errorObj, 'ctx');

      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.message).toBe('ctx: Too many requests');
      expect(result.status).toBe(429);
      expect(result.details).toEqual({ retryAfter: 60 });
    });

    it('normalizes null', () => {
      const result = ErrorBoundary.normalize(null, 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: Unknown error occurred');
    });

    it('normalizes undefined', () => {
      const result = ErrorBoundary.normalize(undefined, 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: Unknown error occurred');
    });

    it('normalizes a number', () => {
      const result = ErrorBoundary.normalize(404, 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: 404');
    });

    it('normalizes without context', () => {
      const result = ErrorBoundary.normalize(new Error('no context'));

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('no context');
    });

    it('normalizes an object with code but no message', () => {
      // Should fall through to generic object handling since 'message' is missing
      const result = ErrorBoundary.normalize({ code: 'SOME_CODE' });

      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    it('preserves ChatbotError-like object without optional fields', () => {
      const errorObj = {
        code: 'API_ERROR',
        message: 'Server error',
      };
      const result = ErrorBoundary.normalize(errorObj);

      expect(result.code).toBe('API_ERROR');
      expect(result.message).toBe('Server error');
      expect(result.status).toBeUndefined();
      expect(result.details).toBeUndefined();
    });

    it('normalizes a boolean', () => {
      const result = ErrorBoundary.normalize(false, 'ctx');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('ctx: false');
    });
  });

  // ==========================================================================
  // Integration: ErrorBoundary in realistic scenarios
  // ==========================================================================

  describe('integration scenarios', () => {
    it('nested guard calls are isolated', () => {
      const outerResult = boundary.guard(() => {
        const innerResult = boundary.guard(() => {
          throw new Error('inner failure');
        }, 'innerOp');
        // Inner guard returns undefined, outer continues
        return innerResult ?? 'fallback';
      }, 'outerOp');

      expect(outerResult).toBe('fallback');
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    it('guardAsync handles synchronous throws inside async functions', async () => {
      const result = await boundary.guardAsync(async () => {
        // This is a sync throw inside an async context
        throw new TypeError('type mismatch');
      }, 'asyncSyncThrow');

      expect(result).toBeUndefined();
      expect(errorHandler).toHaveBeenCalledOnce();
    });

    it('multiple sequential errors are all reported', () => {
      boundary.guard(() => { throw new Error('first'); }, 'op1');
      boundary.guard(() => { throw new Error('second'); }, 'op2');
      boundary.guard(() => { throw new Error('third'); }, 'op3');

      expect(errorHandler).toHaveBeenCalledTimes(3);
    });

    it('wrapped callback can be called multiple times', () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        if (callCount === 2) throw new Error('second call fails');
        return callCount;
      };

      const safeFn = boundary.wrapCallback(fn, 'repeated');

      expect(safeFn()).toBe(1);
      expect(safeFn()).toBeUndefined(); // second call throws
      expect(safeFn()).toBe(3); // third call succeeds

      expect(errorHandler).toHaveBeenCalledOnce();
      expect(callCount).toBe(3);
    });
  });
});
