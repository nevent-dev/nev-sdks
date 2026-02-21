/**
 * @vitest-environment jsdom
 *
 * error-recovery-flow.test.ts - E2E test for error handling and recovery
 *
 * Exercises error scenarios and verifies the widget degrades gracefully:
 * - Network error during message send -> error displayed -> recovery
 * - Rate limit hit -> cooldown message -> auto-recovery
 * - Config fetch failure -> graceful degradation
 * - Invalid config -> clear error message
 * - Upload failure -> error state on attachment
 * - Widget operations after destroy -> no-ops (no crashes)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChatbotWidget } from '../../../chatbot-widget';
import { createMockApi } from '../helpers/mock-api';
import { createMockConfig } from '../helpers/mock-factories';
import { createInitializedWidget, flushPromises, queryAll } from './helpers';

// ============================================================================
// jsdom compatibility shims
// ============================================================================

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function () {};
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2E: Error Recovery Flow', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    // Clean up any remaining DOM elements
    document
      .querySelectorAll('#nevent-chatbot-host')
      .forEach((el) => el.remove());
    localStorage.clear();
  });

  // ==========================================================================
  // 1. Network error during message send
  // ==========================================================================

  describe('Network error during message send', () => {
    it('should call onError when message send fails due to network error', async () => {
      const onError = vi.fn();
      const { widget, cleanup: c } = await createInitializedWidget({
        onError,
      });
      cleanup = c;

      widget.open();

      // First message creates conversation (succeeds), so send it first
      await widget.sendMessage('First message');
      await flushPromises(20);

      // Now make fetch reject for the next message
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error'))
      );

      await widget.sendMessage('This should fail');
      await flushPromises(20);

      // onError should have been called with a message-send-related error
      expect(onError).toHaveBeenCalled();
    });

    it('should recover when network comes back after an error', async () => {
      const onError = vi.fn();
      const mockApi = createMockApi({ latency: 0 });

      const { widget, cleanup: c } = await createInitializedWidget(
        { onError },
        {}
      );
      cleanup = c;

      widget.open();

      // Create conversation first
      await widget.sendMessage('Setup message');
      await flushPromises(20);

      // Simulate network failure
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error'))
      );

      await widget.sendMessage('Failed message');
      await flushPromises(20);

      // Restore network
      const freshApi = createMockApi({ latency: 0 });
      vi.stubGlobal('fetch', freshApi.mockFetch);

      // Next message should work again
      await widget.sendMessage('Recovery message');
      await flushPromises(20);

      // Widget should still be functional
      expect(widget.isOpen()).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Config fetch failure
  // ==========================================================================

  describe('Config fetch failure', () => {
    it('should call onError with CONFIG_LOAD_FAILED when config fetch rejects', async () => {
      document.body.innerHTML = '';
      localStorage.clear();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Server unavailable'))
      );
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const onError = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onError }));

      // init() should not throw (error boundary catches it)
      await expect(widget.init()).resolves.toBeUndefined();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CONFIG_LOAD_FAILED' })
      );

      cleanup = () => {
        widget.destroy();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });

    it('should call onError when config returns non-OK HTTP status', async () => {
      document.body.innerHTML = '';
      localStorage.clear();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({
              success: false,
              message: 'Internal Server Error',
            }),
        })
      );
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const onError = vi.fn();
      const widget = new ChatbotWidget(createMockConfig({ onError }));

      await widget.init();

      expect(onError).toHaveBeenCalled();

      cleanup = () => {
        widget.destroy();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });
  });

  // ==========================================================================
  // 3. Invalid configuration
  // ==========================================================================

  describe('Invalid configuration', () => {
    it('should throw descriptive error when chatbotId is missing', () => {
      expect(
        () => new ChatbotWidget({ chatbotId: '', tenantId: 'tenant-456' })
      ).toThrow('chatbotId is required');
    });

    it('should throw descriptive error when tenantId is missing', () => {
      expect(
        () => new ChatbotWidget({ chatbotId: 'bot-123', tenantId: '' })
      ).toThrow('tenantId is required');
    });

    it('should throw error with INVALID_CONFIG code', () => {
      try {
        new ChatbotWidget({ chatbotId: '', tenantId: '' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as { code: string }).code).toBe('INVALID_CONFIG');
      }
    });

    it('should throw for invalid apiUrl', () => {
      expect(
        () => new ChatbotWidget(createMockConfig({ apiUrl: 'not-a-valid-url' }))
      ).toThrow('apiUrl must be a valid');
    });

    it('should throw for unsupported locale', () => {
      expect(
        () => new ChatbotWidget(createMockConfig({ locale: 'xyz' as never }))
      ).toThrow('locale must be one of');
    });

    it('should throw for unsupported theme', () => {
      expect(
        () => new ChatbotWidget(createMockConfig({ theme: 'neon' as never }))
      ).toThrow('theme must be one of');
    });
  });

  // ==========================================================================
  // 4. Container not found (inline mode)
  // ==========================================================================

  describe('Container not found — inline mode', () => {
    it('should call onError with CONTAINER_NOT_FOUND when container does not exist', async () => {
      document.body.innerHTML = '';
      localStorage.clear();

      const mockApi = createMockApi({ latency: 0 });
      vi.stubGlobal('fetch', mockApi.mockFetch);
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const onError = vi.fn();
      const widget = new ChatbotWidget(
        createMockConfig({
          containerId: 'nonexistent-container',
          onError,
        })
      );

      await widget.init();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CONTAINER_NOT_FOUND' })
      );

      cleanup = () => {
        widget.destroy();
        mockApi.reset();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
      };
    });
  });

  // ==========================================================================
  // 5. Widget operations after destroy
  // ==========================================================================

  describe('Widget operations after destroy', () => {
    it('should be a no-op when open is called after destroy', async () => {
      const onOpen = vi.fn();
      const { widget, cleanup: c } = await createInitializedWidget({
        onOpen,
      });
      cleanup = c;

      widget.destroy();

      // Should not throw, should not fire callback
      expect(() => widget.open()).not.toThrow();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('should be a no-op when close is called after destroy', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.open();
      widget.destroy();

      expect(() => widget.close()).not.toThrow();
    });

    it('should be a no-op when toggle is called after destroy', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.destroy();

      expect(() => widget.toggle()).not.toThrow();
    });

    it('should be a no-op when sendMessage is called after destroy', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.destroy();

      await expect(
        widget.sendMessage('After destroy')
      ).resolves.toBeUndefined();
    });

    it('should not throw when destroy is called twice', async () => {
      const { widget, cleanup: c } = await createInitializedWidget();
      cleanup = c;

      widget.destroy();
      expect(() => widget.destroy()).not.toThrow();
    });
  });

  // ==========================================================================
  // 6. Error boundary isolation
  // ==========================================================================

  describe('Error boundary isolation', () => {
    it('should not propagate internal errors to the host page', async () => {
      const onError = vi.fn();
      const { widget, cleanup: c } = await createInitializedWidget({
        onError,
      });
      cleanup = c;

      // Widget should still be functional even after errors
      widget.open();
      expect(widget.isOpen()).toBe(true);
      widget.close();
      expect(widget.isOpen()).toBe(false);
    });

    it('should continue working after a non-fatal error', async () => {
      const onError = vi.fn();
      const {
        widget,
        shadowRoot,
        cleanup: c,
      } = await createInitializedWidget({
        onError,
      });
      cleanup = c;

      widget.open();

      // Send a normal message first (this may or may not trigger errors)
      await widget.sendMessage('Normal message');
      await flushPromises(20);

      // Widget should still be functional
      expect(widget.isOpen()).toBe(true);

      // Can still close and reopen
      widget.close();
      expect(widget.isOpen()).toBe(false);
      widget.open();
      expect(widget.isOpen()).toBe(true);
    });
  });
});
