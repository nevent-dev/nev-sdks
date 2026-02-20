/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VirtualScroller } from '../ui/virtual-scroller';
import type { VirtualItem, VirtualScrollerConfig } from '../ui/virtual-scroller';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a mock scroll container element with configurable dimensions.
 *
 * @param height - The visible (client) height of the container in pixels
 * @returns A div element configured as a scroll container
 */
function createContainer(height = 400): HTMLElement {
  const container = document.createElement('div');
  container.style.height = `${height}px`;
  container.style.overflowY = 'auto';
  document.body.appendChild(container);

  // JSDOM does not implement layout — stub clientHeight.
  // scrollHeight is left as the JSDOM default (0) and overridden per-test
  // where needed, to avoid recursive getter issues.
  Object.defineProperty(container, 'clientHeight', {
    value: height,
    writable: true,
    configurable: true,
  });

  return container;
}

/**
 * Creates a VirtualItem with a simple div element of the given height.
 *
 * @param id - Unique item identifier
 * @param itemHeight - Height of the rendered element in pixels
 * @param text - Optional text content for the element
 * @returns A VirtualItem
 */
function createItem(id: string, itemHeight = 80, text?: string): VirtualItem {
  return {
    id,
    renderFn: () => {
      const el = document.createElement('div');
      el.textContent = text ?? `Item ${id}`;
      el.style.height = `${itemHeight}px`;
      el.setAttribute('data-test-id', id);
      return el;
    },
  };
}

/**
 * Generates an array of VirtualItems.
 *
 * @param count - Number of items to generate
 * @param heightFn - Optional function to determine height per item index
 * @returns Array of VirtualItems
 */
function createItems(
  count: number,
  heightFn?: (index: number) => number,
): VirtualItem[] {
  return Array.from({ length: count }, (_, i) =>
    createItem(`item-${i}`, heightFn ? heightFn(i) : 80),
  );
}

/**
 * Stubs ResizeObserver for JSDOM which does not implement it.
 *
 * Returns a reference to the mock so tests can inspect observe/unobserve calls.
 */
function stubResizeObserver(): {
  instances: Array<{
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    callback: ResizeObserverCallback;
  }>;
} {
  const tracker = { instances: [] as Array<{
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    callback: ResizeObserverCallback;
  }> };

  const MockResizeObserver = vi.fn().mockImplementation((callback: ResizeObserverCallback) => {
    const instance = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      callback,
    };
    tracker.instances.push(instance);
    return instance;
  });

  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  return tracker;
}

// ============================================================================
// Tests
// ============================================================================

describe('VirtualScroller', () => {
  let container: HTMLElement;
  let scroller: VirtualScroller;
  let roTracker: ReturnType<typeof stubResizeObserver>;

  beforeEach(() => {
    roTracker = stubResizeObserver();
    container = createContainer(400);
  });

  afterEach(() => {
    scroller?.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('init()', () => {
    it('should create content element with spacers inside the container', () => {
      scroller = new VirtualScroller({ container });
      scroller.init();

      const content = container.querySelector('.nevent-chatbot-virtual-content');
      expect(content).not.toBeNull();

      const spacerTop = content?.querySelector('.nevent-chatbot-virtual-spacer-top');
      const spacerBottom = content?.querySelector('.nevent-chatbot-virtual-spacer-bottom');
      expect(spacerTop).not.toBeNull();
      expect(spacerBottom).not.toBeNull();
    });

    it('should be idempotent when called multiple times', () => {
      scroller = new VirtualScroller({ container });
      scroller.init();
      scroller.init();

      const contents = container.querySelectorAll('.nevent-chatbot-virtual-content');
      expect(contents.length).toBe(1);
    });

    it('should set up a ResizeObserver', () => {
      scroller = new VirtualScroller({ container });
      scroller.init();

      expect(roTracker.instances.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Direct Mode (Below Threshold)
  // --------------------------------------------------------------------------

  describe('direct mode (below activation threshold)', () => {
    it('should render all items directly when count is below threshold', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 50,
      });
      scroller.init();

      const items = createItems(10);
      scroller.setItems(items);

      // All 10 items should be in the DOM
      const rendered = container.querySelectorAll('[data-virtual-id]');
      expect(rendered.length).toBe(10);
    });

    it('should append items directly in direct mode', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 50,
      });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.appendItem(createItem('msg-2'));
      scroller.appendItem(createItem('msg-3'));

      const rendered = container.querySelectorAll('[data-virtual-id]');
      expect(rendered.length).toBe(3);
      expect(scroller.getItemCount()).toBe(3);
    });

    it('should render items with correct data-virtual-id attributes', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 50,
      });
      scroller.init();

      scroller.appendItem(createItem('msg-abc'));

      const el = container.querySelector('[data-virtual-id="msg-abc"]');
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe('Item msg-abc');
    });

    it('should observe appended elements with ResizeObserver', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 50,
      });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));

      const roInstance = roTracker.instances[0];
      expect(roInstance.observe).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // Virtual Mode Activation
  // --------------------------------------------------------------------------

  describe('virtual mode activation', () => {
    it('should activate virtualization when setItems exceeds threshold', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 10,
        estimatedItemHeight: 40,
      });
      scroller.init();

      const items = createItems(20);
      scroller.setItems(items);

      // In virtual mode, not all 20 items should be rendered
      // (depends on container height and item height)
      const rendered = container.querySelectorAll('[data-virtual-id]');
      expect(rendered.length).toBeLessThan(20);
      expect(scroller.getItemCount()).toBe(20);
    });

    it('should transition from direct to virtual mode when appendItem crosses threshold', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
        estimatedItemHeight: 40,
      });
      scroller.init();

      // Add 4 items (below threshold) -- all should be in DOM
      for (let i = 0; i < 4; i++) {
        scroller.appendItem(createItem(`msg-${i}`));
      }
      expect(container.querySelectorAll('[data-virtual-id]').length).toBe(4);

      // Add 5th item -- crosses threshold, should trigger migration
      scroller.appendItem(createItem('msg-4'));
      expect(scroller.getItemCount()).toBe(5);

      // After migration, the virtual scroller manages rendering
      // All 5 items should still be accessible via getItemCount
      expect(scroller.getItemCount()).toBe(5);
    });

    it('should render items below threshold without spacers having height', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 50,
      });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));

      const spacerTop = container.querySelector('.nevent-chatbot-virtual-spacer-top') as HTMLElement;
      const spacerBottom = container.querySelector('.nevent-chatbot-virtual-spacer-bottom') as HTMLElement;
      expect(spacerTop.style.height).toBe('0px');
      expect(spacerBottom.style.height).toBe('0px');
    });
  });

  // --------------------------------------------------------------------------
  // Item Operations
  // --------------------------------------------------------------------------

  describe('appendItem()', () => {
    it('should increment item count', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      expect(scroller.getItemCount()).toBe(0);

      scroller.appendItem(createItem('a'));
      expect(scroller.getItemCount()).toBe(1);

      scroller.appendItem(createItem('b'));
      expect(scroller.getItemCount()).toBe(2);
    });

    it('should call renderFn to create the DOM element', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      const renderFn = vi.fn(() => {
        const el = document.createElement('div');
        el.textContent = 'rendered';
        return el;
      });

      scroller.appendItem({ id: 'test', renderFn });
      expect(renderFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateItem()', () => {
    it('should update a rendered item in place', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1', 80, 'Original'));

      // Verify original content
      let el = container.querySelector('[data-virtual-id="msg-1"]');
      expect(el?.textContent).toBe('Original');

      // Update the item
      scroller.updateItem('msg-1', () => {
        const newEl = document.createElement('div');
        newEl.textContent = 'Updated';
        return newEl;
      });

      // Verify updated content
      el = container.querySelector('[data-virtual-id="msg-1"]');
      expect(el?.textContent).toBe('Updated');
    });

    it('should be a no-op for non-existent items', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      // Should not throw
      scroller.updateItem('non-existent', () => document.createElement('div'));
    });
  });

  describe('removeItem()', () => {
    it('should remove the item from the list and DOM', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.appendItem(createItem('msg-2'));
      expect(scroller.getItemCount()).toBe(2);

      scroller.removeItem('msg-1');
      expect(scroller.getItemCount()).toBe(1);

      const el = container.querySelector('[data-virtual-id="msg-1"]');
      expect(el).toBeNull();
    });

    it('should be a no-op for non-existent items', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.removeItem('non-existent');
      expect(scroller.getItemCount()).toBe(1);
    });

    it('should unobserve removed elements', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.removeItem('msg-1');

      const roInstance = roTracker.instances[0];
      expect(roInstance.unobserve).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // Scroll Operations
  // --------------------------------------------------------------------------

  describe('scrollToBottom()', () => {
    it('should call scrollTo on the container via rAF', async () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      const scrollToSpy = vi.fn();
      container.scrollTo = scrollToSpy;

      scroller.scrollToBottom(false);

      // scrollToBottom uses requestAnimationFrame internally.
      // In JSDOM, rAF is implemented as a 0ms setTimeout.
      // Wait for it to resolve.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(scrollToSpy).toHaveBeenCalled();
    });

    it('should use smooth behavior when smooth=true', async () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      const scrollToSpy = vi.fn();
      container.scrollTo = scrollToSpy;

      scroller.scrollToBottom(true);

      // Wait for rAF to fire
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
    });
  });

  describe('isAtBottom()', () => {
    it('should return true when at the bottom of the container', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      // Simulate being at bottom: scrollHeight - scrollTop - clientHeight < 50
      Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 400, configurable: true });
      // clientHeight is already 400

      expect(scroller.isAtBottom()).toBe(true);
    });

    it('should return false when scrolled up from the bottom', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      // Simulate being scrolled up: scrollHeight - scrollTop - clientHeight > 50
      Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });

      expect(scroller.isAtBottom()).toBe(false);
    });

    it('should return true when within 50px of the bottom', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      Object.defineProperty(container, 'scrollTop', { value: 560, configurable: true });
      Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
      // 1000 - 560 - 400 = 40, which is < 50

      expect(scroller.isAtBottom()).toBe(true);
    });
  });

  describe('scrollToItem()', () => {
    it('should not throw for non-existent items', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      expect(() => scroller.scrollToItem('non-existent')).not.toThrow();
    });

    it('should call scrollIntoView on the element in direct mode', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      const el = container.querySelector('[data-virtual-id="msg-1"]') as HTMLElement;

      // JSDOM doesn't implement scrollIntoView natively -- stub it
      el.scrollIntoView = vi.fn();

      scroller.scrollToItem('msg-1');
      expect(el.scrollIntoView).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Clear & Destroy
  // --------------------------------------------------------------------------

  describe('clear()', () => {
    it('should remove all items and reset to direct mode', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
      });
      scroller.init();

      // Add enough items to trigger virtual mode
      const items = createItems(10);
      scroller.setItems(items);
      expect(scroller.getItemCount()).toBe(10);

      scroller.clear();

      expect(scroller.getItemCount()).toBe(0);

      // After clear, spacers should be reset
      const spacerTop = container.querySelector('.nevent-chatbot-virtual-spacer-top') as HTMLElement;
      expect(spacerTop?.style.height).toBe('0px');
    });

    it('should allow adding items again after clear', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.clear();
      scroller.appendItem(createItem('msg-2'));

      expect(scroller.getItemCount()).toBe(1);
      const el = container.querySelector('[data-virtual-id="msg-2"]');
      expect(el).not.toBeNull();
    });
  });

  describe('destroy()', () => {
    it('should remove the content element from the DOM', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.destroy();

      const content = container.querySelector('.nevent-chatbot-virtual-content');
      expect(content).toBeNull();
    });

    it('should disconnect the ResizeObserver', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.destroy();

      const roInstance = roTracker.instances[0];
      expect(roInstance.disconnect).toHaveBeenCalled();
    });

    it('should remove the scroll event listener', () => {
      const removeSpy = vi.spyOn(container, 'removeEventListener');

      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();
      scroller.destroy();

      expect(removeSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
      );
    });

    it('should reset item count to zero', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.destroy();

      expect(scroller.getItemCount()).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Visible Range Calculation
  // --------------------------------------------------------------------------

  describe('visible range calculation (virtual mode)', () => {
    it('should only render items in the visible viewport plus overscan', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
        estimatedItemHeight: 100,
        overscan: 2,
      });
      scroller.init();

      // 400px viewport / 100px items = 4 visible + 2 overscan each side = up to 8
      const items = createItems(50);
      scroller.setItems(items);

      const rendered = container.querySelectorAll('[data-virtual-id]');
      // At scrollTop=0, visible range starts at 0. With 400px viewport
      // and 100px items, ~4 items fit. Plus 2 overscan on bottom = 6
      // (0 overscan above since we're at top)
      expect(rendered.length).toBeLessThanOrEqual(8);
      expect(rendered.length).toBeGreaterThan(0);
    });

    it('should handle empty item list gracefully', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
        estimatedItemHeight: 100,
      });
      scroller.init();

      scroller.setItems([]);

      const rendered = container.querySelectorAll('[data-virtual-id]');
      expect(rendered.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Height Measurement & Caching
  // --------------------------------------------------------------------------

  describe('height measurement and caching', () => {
    it('should use estimated height for unmeasured items', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
        estimatedItemHeight: 120,
      });
      scroller.init();

      // All items use estimated height (120) until ResizeObserver fires
      const items = createItems(20);
      scroller.setItems(items);

      // Total height should be 20 * 120 = 2400 (reflected in spacers)
      const spacerTop = container.querySelector('.nevent-chatbot-virtual-spacer-top') as HTMLElement;
      const spacerBottom = container.querySelector('.nevent-chatbot-virtual-spacer-bottom') as HTMLElement;

      const topH = parseInt(spacerTop?.style.height ?? '0', 10);
      const bottomH = parseInt(spacerBottom?.style.height ?? '0', 10);
      const renderedCount = container.querySelectorAll('[data-virtual-id]').length;

      // Top spacer + rendered items (estimated) + bottom spacer ~= total estimated height
      // The rendered items are in the DOM with their own height
      expect(topH + (renderedCount * 120) + bottomH).toBe(2400);
    });

    it('should observe rendered elements for height changes', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 100,
      });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.appendItem(createItem('msg-2'));

      const roInstance = roTracker.instances[0];
      expect(roInstance.observe).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // getItemCount()
  // --------------------------------------------------------------------------

  describe('getItemCount()', () => {
    it('should return 0 for an empty scroller', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      expect(scroller.getItemCount()).toBe(0);
    });

    it('should return the correct count after appending items', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      for (let i = 0; i < 25; i++) {
        scroller.appendItem(createItem(`msg-${i}`));
      }

      expect(scroller.getItemCount()).toBe(25);
    });

    it('should return the correct count after setItems', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 5 });
      scroller.init();

      scroller.setItems(createItems(100));
      expect(scroller.getItemCount()).toBe(100);
    });

    it('should return 0 after clear', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();

      scroller.appendItem(createItem('msg-1'));
      scroller.clear();
      expect(scroller.getItemCount()).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Configuration Defaults
  // --------------------------------------------------------------------------

  describe('configuration defaults', () => {
    it('should use default estimatedItemHeight of 80', () => {
      scroller = new VirtualScroller({ container });
      scroller.init();

      // Indirectly verify by adding items to virtual mode and checking spacer height
      scroller.setItems(createItems(100));

      const spacerBottom = container.querySelector('.nevent-chatbot-virtual-spacer-bottom') as HTMLElement;
      const bottomH = parseInt(spacerBottom?.style.height ?? '0', 10);
      // With default 80px height and some items rendered, bottom spacer should be > 0
      expect(bottomH).toBeGreaterThan(0);
    });

    it('should use default activationThreshold of 50', () => {
      scroller = new VirtualScroller({ container });
      scroller.init();

      // 49 items should stay in direct mode
      for (let i = 0; i < 49; i++) {
        scroller.appendItem(createItem(`msg-${i}`));
      }

      const renderedBefore = container.querySelectorAll('[data-virtual-id]').length;
      expect(renderedBefore).toBe(49);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle setItems with threshold-exact count', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 10,
      });
      scroller.init();

      // Exactly at threshold should activate virtual mode
      scroller.setItems(createItems(10));
      expect(scroller.getItemCount()).toBe(10);
    });

    it('should handle rapid append calls', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 5,
      });
      scroller.init();

      for (let i = 0; i < 100; i++) {
        scroller.appendItem(createItem(`msg-${i}`));
      }

      expect(scroller.getItemCount()).toBe(100);
    });

    it('should handle setItems replacing existing items', () => {
      scroller = new VirtualScroller({
        container,
        activationThreshold: 100,
      });
      scroller.init();

      scroller.setItems(createItems(5));
      expect(scroller.getItemCount()).toBe(5);

      scroller.setItems(createItems(3));
      expect(scroller.getItemCount()).toBe(3);
    });

    it('should handle operations after destroy gracefully', () => {
      scroller = new VirtualScroller({ container, activationThreshold: 100 });
      scroller.init();
      scroller.destroy();

      // These should not throw
      expect(scroller.getItemCount()).toBe(0);

      // isAtBottom reads from config.container which still exists.
      // In JSDOM with scrollHeight=0 and clientHeight=400: 0 - 0 - 400 = -400 < 50 => true
      expect(() => scroller.isAtBottom()).not.toThrow();
    });
  });
});
