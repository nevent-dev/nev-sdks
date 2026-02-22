/**
 * @vitest-environment jsdom
 *
 * typing-status-flow.test.ts - E2E test for typing indicator functionality
 *
 * Exercises the bidirectional typing status system:
 *
 * Client -> Server:
 * - User types in input -> debounced typing notification sent
 * - User stops typing -> stop notification sent after timeout
 *
 * Server -> Client:
 * - TYPING_START SSE event -> typing indicator shows with agent name
 * - TYPING_STOP SSE event -> typing indicator hides
 *
 * Uses TypingStatusService directly for precise control over timing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TypingStatusService } from '../../typing-status-service';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Advances fake timers and flushes microtasks to process debounced operations.
 *
 * @param ms - Time to advance in milliseconds
 */
async function advanceAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

// ============================================================================
// TypingStatusService E2E Tests
// ============================================================================

describe('E2E: Typing Status Flow', () => {
  let service: TypingStatusService;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let conversationId: string;

  beforeEach(() => {
    vi.useFakeTimers();
    conversationId = 'conv-typing-test-1';

    // Mock fetch for typing notifications (POST /chatbot/typing)
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    // Suppress console noise
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Client -> Server: User typing notifications
  // ==========================================================================

  describe('Client -> Server: User typing notifications', () => {
    beforeEach(() => {
      service = new TypingStatusService(
        {
          enabled: true,
          debounceMs: 2000,
          timeoutMs: 5000,
        },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );
    });

    it('should send typing start notification on first keystroke', async () => {
      service.notifyTyping();
      await advanceAndFlush(100);

      // Verify fetch was called with the typing endpoint
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/chatbot/typing'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"isTyping":true'),
        })
      );
    });

    it('should debounce rapid keystrokes (not send multiple notifications)', async () => {
      // Simulate rapid typing (10 keystrokes in 500ms)
      for (let i = 0; i < 10; i++) {
        service.notifyTyping();
        await advanceAndFlush(50);
      }

      // Count typing-start calls (should be exactly 1 due to debounce)
      const typingCalls = fetchSpy.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes('/chatbot/typing') &&
          opts.body?.toString().includes('"isTyping":true')
      );
      expect(typingCalls.length).toBe(1);
    });

    it('should send typing stop notification after timeout', async () => {
      service.notifyTyping();
      await advanceAndFlush(100);

      // Clear previous calls count
      const callsAfterStart = fetchSpy.mock.calls.length;

      // Advance past the timeout (5000ms)
      await advanceAndFlush(5100);

      // A typing stop notification should have been sent
      const newCalls = fetchSpy.mock.calls.slice(callsAfterStart);
      const stopCalls = newCalls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes('/chatbot/typing') &&
          opts.body?.toString().includes('"isTyping":false')
      );
      expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should send explicit stop when notifyStoppedTyping is called', async () => {
      service.notifyTyping();
      await advanceAndFlush(100);

      service.notifyStoppedTyping();
      await advanceAndFlush(100);

      const stopCalls = fetchSpy.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url.includes('/chatbot/typing') &&
          opts.body?.toString().includes('"isTyping":false')
      );
      expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should not send notifications when disabled', async () => {
      service.destroy();
      service = new TypingStatusService(
        { enabled: false },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      service.notifyTyping();
      await advanceAndFlush(100);

      // No typing calls should have been made
      const typingCalls = fetchSpy.mock.calls.filter(([url]: [string]) =>
        url.includes('/chatbot/typing')
      );
      expect(typingCalls.length).toBe(0);
    });

    it('should not send notifications when conversationId is not available', async () => {
      service.destroy();
      service = new TypingStatusService(
        { enabled: true },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => '', // empty conversation ID
        'test-server-token'
      );

      service.notifyTyping();
      await advanceAndFlush(100);

      // No calls should be made without a conversation ID
      const typingCalls = fetchSpy.mock.calls.filter(([url]: [string]) =>
        url.includes('/chatbot/typing')
      );
      expect(typingCalls.length).toBe(0);
    });
  });

  // ==========================================================================
  // 2. Server -> Client: Typing indicator events
  // ==========================================================================

  describe('Server -> Client: Typing indicator display', () => {
    it('should notify callback when agent starts typing', () => {
      const onTypingChange = vi.fn();

      service = new TypingStatusService(
        { enabled: true },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      // Register the callback via the public API
      service.onServerTyping(onTypingChange);

      // Simulate receiving a TYPING_START event from the server
      service.handleServerTypingEvent({
        isTyping: true,
        displayName: 'Agent Carlos',
        agentId: 'agent-1',
      });

      expect(onTypingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isTyping: true,
          displayName: 'Agent Carlos',
        })
      );
    });

    it('should notify callback when agent stops typing', () => {
      const onTypingChange = vi.fn();

      service = new TypingStatusService(
        { enabled: true },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      // Register the callback via the public API
      service.onServerTyping(onTypingChange);

      // Start typing
      service.handleServerTypingEvent({
        isTyping: true,
        displayName: 'Agent Carlos',
      });

      // Stop typing
      service.handleServerTypingEvent({
        isTyping: false,
        displayName: 'Agent Carlos',
      });

      expect(onTypingChange).toHaveBeenCalledTimes(2);
      expect(onTypingChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isTyping: false,
        })
      );
    });

    it('should handle typing events without displayName', () => {
      const onTypingChange = vi.fn();

      service = new TypingStatusService(
        { enabled: true },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      // Register the callback via the public API
      service.onServerTyping(onTypingChange);

      service.handleServerTypingEvent({
        isTyping: true,
      });

      expect(onTypingChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isTyping: true,
        })
      );
    });
  });

  // ==========================================================================
  // 3. Cleanup and lifecycle
  // ==========================================================================

  describe('Cleanup and lifecycle', () => {
    it('should cancel pending timers on destroy', async () => {
      service = new TypingStatusService(
        { enabled: true, debounceMs: 2000, timeoutMs: 5000 },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      // Start typing
      service.notifyTyping();
      await advanceAndFlush(100);

      const callsBefore = fetchSpy.mock.calls.length;

      // Destroy service
      service.destroy();

      // Advance past timeout — no additional calls should be made
      await advanceAndFlush(6000);

      // After destroy, the stop timeout should not fire
      // (calls might increase by at most 1 for the destroy cleanup)
      const callsAfter = fetchSpy.mock.calls.length;
      expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
    });

    it('should not throw when destroy is called multiple times', () => {
      service = new TypingStatusService(
        { enabled: true },
        'https://api.test.nevent.es',
        'tenant-test-456',
        () => conversationId,
        'test-server-token'
      );

      expect(() => service.destroy()).not.toThrow();
      expect(() => service.destroy()).not.toThrow();
    });
  });
});
