/**
 * VirtualScroller - High-performance virtual scrolling for chat message lists
 *
 * Renders only the visible subset of items (plus an overscan buffer) in the DOM,
 * dramatically reducing memory usage and improving scroll performance for long
 * conversations (500+ messages).
 *
 * Architecture:
 * - Below a configurable activation threshold (default: 50 items), all items
 *   render directly in the DOM with zero virtualization overhead.
 * - Above the threshold, a phantom layout with top/bottom spacers is used so
 *   only ~(viewport / itemHeight + 2 * overscan) items exist in the DOM at once.
 * - A ResizeObserver watches rendered items and caches their measured heights for
 *   accurate scroll position calculations even with variable-height messages.
 * - Scroll events are debounced via requestAnimationFrame to maintain 60fps.
 *
 * @example
 * ```typescript
 * const scroller = new VirtualScroller({
 *   container: scrollContainerEl,
 *   estimatedItemHeight: 80,
 *   overscan: 5,
 *   activationThreshold: 50,
 * });
 * scroller.init();
 *
 * scroller.appendItem({ id: 'msg-1', renderFn: () => createBubbleEl() });
 * scroller.scrollToBottom(true);
 *
 * // Cleanup
 * scroller.destroy();
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the VirtualScroller instance.
 */
export interface VirtualScrollerConfig {
  /** Container element with overflow-y: auto that hosts the scrollable content */
  container: HTMLElement;

  /**
   * Estimated item height in pixels. Used as a fallback for items that have
   * not yet been measured by ResizeObserver. A reasonable default for chat
   * messages is 80px.
   * @default 80
   */
  estimatedItemHeight?: number;

  /**
   * Number of extra items to render outside the visible viewport in each
   * direction (top and bottom). Prevents blank flashes during fast scrolling.
   * @default 5
   */
  overscan?: number;

  /**
   * Minimum item count before virtual scrolling activates. Below this
   * threshold all items render directly in the DOM with zero overhead.
   * @default 50
   */
  activationThreshold?: number;
}

/**
 * Represents a single virtualizable item in the list.
 */
export interface VirtualItem {
  /** Unique identifier for the item (typically the message ID) */
  id: string;

  /**
   * Factory function that creates the DOM element for this item.
   * Called every time the item enters the visible range. The returned element
   * is removed from the DOM when it scrolls out of view.
   */
  renderFn: () => HTMLElement;
}

// ============================================================================
// VirtualScroller Class
// ============================================================================

/**
 * Manages a virtualized scrollable list optimized for chat message rendering.
 *
 * The scroller operates in two modes:
 * 1. **Direct mode** (item count < activationThreshold): Items are appended
 *    directly to the container. Zero overhead.
 * 2. **Virtual mode** (item count >= activationThreshold): Only visible items
 *    plus an overscan buffer exist in the DOM. Spacer elements simulate the
 *    full scroll height.
 *
 * Transitions from direct to virtual mode happen automatically when the item
 * count crosses the activation threshold. The reverse transition is not
 * supported (clearing resets to direct mode).
 */
export class VirtualScroller {
  /** Full ordered list of virtualized items */
  private items: VirtualItem[] = [];

  /** Cached measured heights keyed by item ID */
  private heights: Map<string, number> = new Map();

  /** Currently rendered item ID -> DOM element mapping */
  private renderedElements: Map<string, HTMLElement> = new Map();

  /** Currently visible index range (inclusive start, exclusive end) */
  private visibleRange: { start: number; end: number } = { start: 0, end: 0 };

  /** Wrapper element that contains spacers and rendered items */
  private contentElement: HTMLElement | null = null;

  /** Top spacer element representing unrendered items above the viewport */
  private spacerTop: HTMLElement | null = null;

  /** Bottom spacer element representing unrendered items below the viewport */
  private spacerBottom: HTMLElement | null = null;

  /** ResizeObserver for measuring rendered item heights */
  private resizeObserver: ResizeObserver | null = null;

  /** Bound scroll handler reference for cleanup */
  private scrollHandler: (() => void) | null = null;

  /** Whether the scroller is currently in virtualized mode */
  private isVirtualized = false;

  /** requestAnimationFrame ID for scroll debouncing */
  private rafId: number | null = null;

  /** Resolved configuration with defaults applied */
  private readonly estimatedItemHeight: number;
  private readonly overscan: number;
  private readonly activationThreshold: number;

  /**
   * Creates a new VirtualScroller instance.
   *
   * @param config - Configuration specifying the scroll container and tuning parameters
   */
  constructor(private config: VirtualScrollerConfig) {
    this.estimatedItemHeight = config.estimatedItemHeight ?? 80;
    this.overscan = config.overscan ?? 5;
    this.activationThreshold = config.activationThreshold ?? 50;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Initializes the virtual scroller by setting up the DOM structure,
   * scroll listener, and ResizeObserver.
   *
   * Must be called once after construction and before any item operations.
   * Calling init() multiple times is a no-op.
   */
  init(): void {
    if (this.contentElement) return; // Already initialized

    // Create the content wrapper that holds spacers and rendered items
    this.contentElement = document.createElement('div');
    this.contentElement.className = 'nevent-chatbot-virtual-content';
    Object.assign(this.contentElement.style, {
      position: 'relative',
      width: '100%',
      minHeight: '100%',
    });

    // Create spacer elements
    this.spacerTop = document.createElement('div');
    this.spacerTop.className = 'nevent-chatbot-virtual-spacer-top';
    this.spacerTop.setAttribute('aria-hidden', 'true');
    Object.assign(this.spacerTop.style, {
      width: '100%',
      height: '0px',
      pointerEvents: 'none',
    });

    this.spacerBottom = document.createElement('div');
    this.spacerBottom.className = 'nevent-chatbot-virtual-spacer-bottom';
    this.spacerBottom.setAttribute('aria-hidden', 'true');
    Object.assign(this.spacerBottom.style, {
      width: '100%',
      height: '0px',
      pointerEvents: 'none',
    });

    this.contentElement.appendChild(this.spacerTop);
    // Rendered items will be inserted between spacerTop and spacerBottom
    this.contentElement.appendChild(this.spacerBottom);

    this.config.container.appendChild(this.contentElement);

    // Set up the scroll listener (rAF-debounced)
    this.scrollHandler = () => this.onScroll();
    this.config.container.addEventListener('scroll', this.scrollHandler, {
      passive: true,
    });

    // Set up ResizeObserver for dynamic height measurement.
    // Guard against environments that lack ResizeObserver (SSR, legacy browsers,
    // JSDOM test environments). Without it the scroller still works but relies
    // on estimated heights instead of measured ones.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        this.onResize(entries);
      });
    }
  }

  /**
   * Replaces all items in the scroller with a new list.
   *
   * Clears existing rendered elements and re-renders the visible range.
   * If the new item count is below the activation threshold, items render
   * directly without virtualization.
   *
   * @param items - Full ordered list of items to display
   */
  setItems(items: VirtualItem[]): void {
    this.items = [...items];
    this.heights.clear();
    this.clearRenderedElements();

    if (this.items.length >= this.activationThreshold) {
      this.activateVirtualMode();
    } else {
      this.deactivateVirtualMode();
      this.renderAllDirect();
    }
  }

  /**
   * Appends a single item to the end of the list.
   *
   * This is the most common operation for a chat (new messages arrive at the
   * bottom). If the item count crosses the activation threshold, the scroller
   * transitions to virtual mode automatically.
   *
   * @param item - The item to append
   */
  appendItem(item: VirtualItem): void {
    this.items.push(item);

    if (!this.isVirtualized && this.items.length >= this.activationThreshold) {
      // Transition: direct -> virtual mode
      this.migrateToVirtual();
      return;
    }

    if (this.isVirtualized) {
      // In virtual mode: re-render if the new item falls within the visible range
      this.updateVirtualRender();
    } else {
      // In direct mode: simply append the DOM element
      this.appendDirectElement(item);
    }
  }

  /**
   * Updates the render function of an existing item and re-renders it if
   * currently visible.
   *
   * @param id - The ID of the item to update
   * @param renderFn - New render function producing the updated DOM element
   */
  updateItem(id: string, renderFn: () => HTMLElement): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;

    this.items[index] = { id, renderFn };

    // If the item is currently rendered, re-render it in place
    const existing = this.renderedElements.get(id);
    if (existing && this.contentElement) {
      this.unobserveElement(existing);
      const newEl = renderFn();
      newEl.setAttribute('data-virtual-id', id);
      existing.replaceWith(newEl);
      this.renderedElements.set(id, newEl);
      this.observeElement(newEl);
      // Invalidate cached height so ResizeObserver re-measures
      this.heights.delete(id);
    }
  }

  /**
   * Removes an item from the list by ID.
   *
   * If the item is currently rendered, its DOM element is removed. The visible
   * range is recalculated after removal.
   *
   * @param id - The ID of the item to remove
   */
  removeItem(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;

    this.items.splice(index, 1);
    this.heights.delete(id);

    // Remove DOM element if rendered
    const el = this.renderedElements.get(id);
    if (el) {
      this.unobserveElement(el);
      el.remove();
      this.renderedElements.delete(id);
    }

    if (this.isVirtualized) {
      this.updateVirtualRender();
    }
  }

  /**
   * Scrolls the container to the bottom to show the most recent messages.
   *
   * @param smooth - When true, uses smooth scrolling animation. Default: false.
   */
  scrollToBottom(smooth = false): void {
    const container = this.config.container;

    // Use requestAnimationFrame to ensure the DOM has been updated before scrolling
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }

  /**
   * Scrolls the container to make a specific item visible.
   *
   * If the item is not currently rendered (virtual mode), the scroller first
   * updates the visible range to include it, then scrolls to its position.
   *
   * @param id - The ID of the item to scroll to
   */
  scrollToItem(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;

    if (this.isVirtualized) {
      // Ensure the item is in the visible range
      const top = this.getItemTop(index);
      this.config.container.scrollTo({ top, behavior: 'auto' });
      // After scroll, the scroll handler will update the visible range
    } else {
      // Direct mode: find the element and scroll to it
      const el = this.renderedElements.get(id);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }
  }

  /**
   * Checks whether the scroll position is at or near the bottom of the container.
   *
   * @returns true if the container is within 50px of the bottom edge
   */
  isAtBottom(): boolean {
    const { scrollTop, scrollHeight, clientHeight } = this.config.container;
    return scrollHeight - scrollTop - clientHeight < 50;
  }

  /**
   * Returns the total number of items in the list.
   *
   * @returns Item count
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Removes all items and resets the scroller to direct mode.
   *
   * Clears all rendered elements, cached heights, and spacer heights.
   * After calling clear(), new items will render in direct mode until the
   * activation threshold is reached again.
   */
  clear(): void {
    this.clearRenderedElements();
    this.items = [];
    this.heights.clear();
    this.isVirtualized = false;
    this.visibleRange = { start: 0, end: 0 };

    if (this.spacerTop) this.spacerTop.style.height = '0px';
    if (this.spacerBottom) this.spacerBottom.style.height = '0px';
  }

  /**
   * Destroys the virtual scroller and releases all resources.
   *
   * Removes the scroll listener, disconnects the ResizeObserver, removes
   * all DOM elements created by the scroller, and cancels any pending
   * requestAnimationFrame callback.
   *
   * After calling destroy(), the instance must not be reused.
   */
  destroy(): void {
    // Cancel pending rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Remove scroll listener
    if (this.scrollHandler) {
      this.config.container.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }

    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clear rendered elements
    this.clearRenderedElements();

    // Remove content element from DOM
    if (this.contentElement) {
      this.contentElement.remove();
      this.contentElement = null;
    }

    this.spacerTop = null;
    this.spacerBottom = null;
    this.items = [];
    this.heights.clear();
  }

  // --------------------------------------------------------------------------
  // Private: Mode Transitions
  // --------------------------------------------------------------------------

  /**
   * Activates virtual scrolling mode.
   *
   * Clears all directly rendered elements and performs a fresh virtual render
   * based on the current scroll position.
   */
  private activateVirtualMode(): void {
    this.isVirtualized = true;
    this.clearRenderedElements();
    this.updateVirtualRender();
  }

  /**
   * Deactivates virtual scrolling mode.
   *
   * Resets spacer heights and switches the scroller to direct rendering.
   */
  private deactivateVirtualMode(): void {
    this.isVirtualized = false;
    if (this.spacerTop) this.spacerTop.style.height = '0px';
    if (this.spacerBottom) this.spacerBottom.style.height = '0px';
  }

  /**
   * Migrates from direct mode to virtual mode.
   *
   * Collects all existing directly rendered elements, measures their heights
   * via getBoundingClientRect, caches them, removes the elements, and then
   * performs a virtual render.
   */
  private migrateToVirtual(): void {
    // Measure and cache heights of all currently rendered elements
    for (const [id, el] of this.renderedElements) {
      const rect = el.getBoundingClientRect();
      this.heights.set(id, rect.height);
    }

    this.activateVirtualMode();
  }

  // --------------------------------------------------------------------------
  // Private: Direct Mode Rendering
  // --------------------------------------------------------------------------

  /**
   * Renders all items directly in the DOM (non-virtualized mode).
   */
  private renderAllDirect(): void {
    if (!this.contentElement || !this.spacerBottom) return;

    for (const item of this.items) {
      this.appendDirectElement(item);
    }
  }

  /**
   * Appends a single item's DOM element in direct mode.
   *
   * @param item - The item to render and append
   */
  private appendDirectElement(item: VirtualItem): void {
    if (!this.contentElement || !this.spacerBottom) return;

    const el = item.renderFn();
    el.setAttribute('data-virtual-id', item.id);
    this.contentElement.insertBefore(el, this.spacerBottom);
    this.renderedElements.set(item.id, el);
    this.observeElement(el);
  }

  // --------------------------------------------------------------------------
  // Private: Virtual Mode Rendering
  // --------------------------------------------------------------------------

  /**
   * Recalculates the visible range and performs a differential render update.
   *
   * Only items that have entered or left the visible range are mounted or
   * unmounted. This avoids full re-renders on every scroll event.
   */
  private updateVirtualRender(): void {
    if (
      !this.isVirtualized ||
      !this.contentElement ||
      !this.spacerTop ||
      !this.spacerBottom
    )
      return;

    const scrollTop = this.config.container.scrollTop;
    const viewportHeight = this.config.container.clientHeight;
    const newRange = this.calculateVisibleRange(scrollTop, viewportHeight);

    // Determine which items need to be added or removed
    const oldStart = this.visibleRange.start;
    const oldEnd = this.visibleRange.end;
    const newStart = newRange.start;
    const newEnd = newRange.end;

    this.visibleRange = newRange;

    // Remove items that are no longer in range
    for (let i = oldStart; i < oldEnd; i++) {
      if (i < newStart || i >= newEnd) {
        const item = this.items[i];
        if (item) {
          const el = this.renderedElements.get(item.id);
          if (el) {
            this.unobserveElement(el);
            el.remove();
            this.renderedElements.delete(item.id);
          }
        }
      }
    }

    // Add items that are newly in range
    // We need to insert them in order, so collect and sort
    const toAdd: { index: number; item: VirtualItem }[] = [];
    for (let i = newStart; i < newEnd; i++) {
      if (i < oldStart || i >= oldEnd) {
        const item = this.items[i];
        if (item && !this.renderedElements.has(item.id)) {
          toAdd.push({ index: i, item });
        }
      }
    }

    // Insert new elements in correct order
    for (const { index, item } of toAdd) {
      const el = item.renderFn();
      el.setAttribute('data-virtual-id', item.id);

      // Find the correct insertion point: before the next rendered item or spacerBottom
      let insertBefore: Node = this.spacerBottom;
      for (let j = index + 1; j < newEnd; j++) {
        const nextItem = this.items[j];
        if (nextItem) {
          const nextEl = this.renderedElements.get(nextItem.id);
          if (nextEl) {
            insertBefore = nextEl;
            break;
          }
        }
      }

      this.contentElement.insertBefore(el, insertBefore);
      this.renderedElements.set(item.id, el);
      this.observeElement(el);
    }

    // Update spacer heights
    const topHeight = this.getItemTop(newStart);
    const bottomHeight = this.getTotalHeight() - this.getItemTop(newEnd);

    this.spacerTop.style.height = `${Math.max(0, topHeight)}px`;
    this.spacerBottom.style.height = `${Math.max(0, bottomHeight)}px`;
  }

  // --------------------------------------------------------------------------
  // Private: Visible Range Calculation
  // --------------------------------------------------------------------------

  /**
   * Calculates the range of item indices that should be rendered based on
   * the current scroll position and viewport height.
   *
   * The range includes the overscan buffer on both sides of the viewport.
   *
   * @param scrollTop - Current scroll position of the container
   * @param viewportHeight - Visible height of the container
   * @returns Object with inclusive `start` and exclusive `end` indices
   */
  private calculateVisibleRange(
    scrollTop: number,
    viewportHeight: number
  ): { start: number; end: number } {
    if (this.items.length === 0) {
      return { start: 0, end: 0 };
    }

    // Find the first item whose bottom edge is below scrollTop (binary search)
    let startIndex = this.findStartIndex(scrollTop);

    // Find the last item whose top edge is above (scrollTop + viewportHeight)
    let endIndex = this.findEndIndex(scrollTop + viewportHeight, startIndex);

    // Apply overscan buffer
    startIndex = Math.max(0, startIndex - this.overscan);
    endIndex = Math.min(this.items.length, endIndex + this.overscan);

    return { start: startIndex, end: endIndex };
  }

  /**
   * Binary search to find the first item visible at the given scroll offset.
   *
   * @param scrollTop - The scroll offset to search for
   * @returns Index of the first visible item
   */
  private findStartIndex(scrollTop: number): number {
    let low = 0;
    let high = this.items.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const itemBottom = this.getItemTop(mid) + this.getItemHeight(mid);

      if (itemBottom <= scrollTop) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return Math.min(low, this.items.length - 1);
  }

  /**
   * Finds the last item index whose top edge is above the given offset.
   *
   * @param bottomEdge - The bottom edge of the viewport (scrollTop + clientHeight)
   * @param startFrom - Minimum index to start searching from
   * @returns Index one past the last visible item (exclusive end)
   */
  private findEndIndex(bottomEdge: number, startFrom: number): number {
    // Linear scan from startFrom since the range is typically small
    for (let i = startFrom; i < this.items.length; i++) {
      const itemTop = this.getItemTop(i);
      if (itemTop >= bottomEdge) {
        return i;
      }
    }
    return this.items.length;
  }

  // --------------------------------------------------------------------------
  // Private: Height Calculations
  // --------------------------------------------------------------------------

  /**
   * Returns the vertical offset (top position) of the item at the given index.
   *
   * Sums the heights of all items before the given index. Uses cached heights
   * when available and falls back to the estimated height for unmeasured items.
   *
   * @param index - The item index to calculate the top position for
   * @returns Vertical offset in pixels from the top of the content area
   */
  private getItemTop(index: number): number {
    let top = 0;
    for (let i = 0; i < index; i++) {
      top += this.getItemHeight(i);
    }
    return top;
  }

  /**
   * Returns the height of the item at the given index.
   *
   * Uses the cached measured height if available, otherwise returns the
   * estimated item height.
   *
   * @param index - The item index
   * @returns Height in pixels
   */
  private getItemHeight(index: number): number {
    const item = this.items[index];
    if (!item) return this.estimatedItemHeight;
    return this.heights.get(item.id) ?? this.estimatedItemHeight;
  }

  /**
   * Returns the total estimated height of all items in the list.
   *
   * @returns Total height in pixels
   */
  private getTotalHeight(): number {
    return this.getItemTop(this.items.length);
  }

  // --------------------------------------------------------------------------
  // Private: Scroll Handler
  // --------------------------------------------------------------------------

  /**
   * Handles scroll events on the container.
   *
   * Debounces updates using requestAnimationFrame so at most one recalculation
   * happens per animation frame (~16ms), maintaining 60fps scroll performance.
   */
  private onScroll(): void {
    if (!this.isVirtualized) return;
    if (this.rafId !== null) return; // Already scheduled

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.updateVirtualRender();
    });
  }

  // --------------------------------------------------------------------------
  // Private: ResizeObserver
  // --------------------------------------------------------------------------

  /**
   * Handles resize events from the ResizeObserver.
   *
   * Updates the cached height for each observed element and triggers a
   * re-render if any height changed, ensuring spacers and scroll position
   * stay accurate.
   *
   * @param entries - ResizeObserver entries with updated sizes
   */
  private onResize(entries: ResizeObserverEntry[]): void {
    let heightChanged = false;

    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const id = el.getAttribute('data-virtual-id');
      if (!id) continue;

      const newHeight =
        entry.borderBoxSize?.[0]?.blockSize ??
        el.getBoundingClientRect().height;
      const oldHeight = this.heights.get(id);

      if (oldHeight === undefined || Math.abs(newHeight - oldHeight) > 0.5) {
        this.heights.set(id, newHeight);
        heightChanged = true;
      }
    }

    // Re-render spacers if heights changed and we are in virtual mode
    if (heightChanged && this.isVirtualized) {
      this.updateSpacers();
    }
  }

  /**
   * Updates spacer heights without re-rendering items.
   *
   * Called after height measurements change to keep the total scroll height
   * accurate.
   */
  private updateSpacers(): void {
    if (!this.spacerTop || !this.spacerBottom) return;

    const topHeight = this.getItemTop(this.visibleRange.start);
    const bottomHeight =
      this.getTotalHeight() - this.getItemTop(this.visibleRange.end);

    this.spacerTop.style.height = `${Math.max(0, topHeight)}px`;
    this.spacerBottom.style.height = `${Math.max(0, bottomHeight)}px`;
  }

  /**
   * Starts observing an element with the ResizeObserver.
   *
   * @param el - The DOM element to observe
   */
  private observeElement(el: HTMLElement): void {
    if (this.resizeObserver) {
      this.resizeObserver.observe(el, { box: 'border-box' });
    }
  }

  /**
   * Stops observing an element with the ResizeObserver.
   *
   * @param el - The DOM element to stop observing
   */
  private unobserveElement(el: HTMLElement): void {
    if (this.resizeObserver) {
      this.resizeObserver.unobserve(el);
    }
  }

  // --------------------------------------------------------------------------
  // Private: DOM Cleanup
  // --------------------------------------------------------------------------

  /**
   * Removes all currently rendered elements from the DOM and clears the
   * rendered elements map.
   */
  private clearRenderedElements(): void {
    for (const [, el] of this.renderedElements) {
      this.unobserveElement(el);
      el.remove();
    }
    this.renderedElements.clear();
  }
}
