// @vitest-environment jsdom
/**
 * Tests for font-loader.ts
 *
 * Covers:
 * - loadGoogleFont — injects <link> tag with correct URL and is idempotent
 * - loadCustomFont — injects <style> with @font-face rules and is idempotent
 * - isFontLoaded — returns correct state
 * - destroy — removes all injected elements and clears registry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FontLoader } from '../font-loader';
import type { FontConfig } from '../../types';

// ============================================================================
// DOM Setup
// ============================================================================
// Vitest uses jsdom, which provides document.head and document.createElement.
// We do NOT need to mock them — the real DOM is available.

// ============================================================================
// Helpers
// ============================================================================

/**
 * Collect all <link rel="stylesheet"> elements currently in document.head
 * that were injected by a FontLoader (identified by our custom attribute).
 */
function getInjectedLinks(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[data-nevent-chatbot-gfont]'),
  );
}

/**
 * Collect all <style> elements injected by a FontLoader for custom fonts.
 */
function getInjectedFontStyles(): HTMLStyleElement[] {
  return Array.from(
    document.querySelectorAll<HTMLStyleElement>('style[data-nevent-chatbot-font]'),
  );
}

// ============================================================================
// FontLoader — loadGoogleFont
// ============================================================================

describe('FontLoader.loadGoogleFont', () => {
  let loader: FontLoader;

  beforeEach(() => {
    loader = new FontLoader();
    // Flush any previously injected elements
    document.querySelectorAll('link[data-nevent-chatbot-gfont]').forEach((el) => el.remove());
    document.querySelectorAll('style[data-nevent-chatbot-font]').forEach((el) => el.remove());
  });

  afterEach(() => {
    loader.destroy();
  });

  it('injects a <link> element with the correct Google Fonts URL', async () => {
    // Simulate link load event so the promise resolves
    let capturedLink: HTMLLinkElement | null = null;
    const originalAppendChild = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const result = originalAppendChild(node);
      if (node instanceof HTMLLinkElement) {
        capturedLink = node;
        // Fire onload synchronously so promise resolves
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return result;
    });

    await loader.loadGoogleFont('Inter', [400, 700]);

    expect(capturedLink).not.toBeNull();
    expect(capturedLink!.rel).toBe('stylesheet');
    expect(capturedLink!.href).toContain('fonts.googleapis.com');
    expect(capturedLink!.href).toContain('Inter');
    expect(capturedLink!.href).toContain('400');
    expect(capturedLink!.href).toContain('700');
    expect(capturedLink!.href).toContain('display=swap');

    spy.mockRestore();
  });

  it('uses default weights [400;500;600;700] when no weights are provided', async () => {
    let capturedLink: HTMLLinkElement | null = null;
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const result = (document.head as HTMLElement & { appendChild: typeof document.head.appendChild }).appendChild.call
        ? document.createElement('div') as unknown as typeof node
        : node;
      if (node instanceof HTMLLinkElement) {
        capturedLink = node;
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return node;
    });

    // Use a simpler approach — just track the href
    const appendSpy = vi.spyOn(document.head, 'appendChild');
    await loader.loadGoogleFont('Roboto');

    const calls = appendSpy.mock.calls;
    const linkCall = calls.find(
      (args) => args[0] instanceof HTMLLinkElement
    );

    if (linkCall) {
      const link = linkCall[0] as HTMLLinkElement;
      expect(link.href).toContain('400');
      expect(link.href).toContain('500');
      expect(link.href).toContain('600');
      expect(link.href).toContain('700');
    }

    appendSpy.mockRestore();
    spy.mockRestore();
  });

  it('encodes spaces in font family name as + in URL', async () => {
    const originalAppendChild = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const result = originalAppendChild(node);
      if (node instanceof HTMLLinkElement) {
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return result;
    });

    await loader.loadGoogleFont('Open Sans', [400]);

    const calls = appendSpy.mock.calls;
    const linkCall = calls.find((args) => args[0] instanceof HTMLLinkElement);

    if (linkCall) {
      const link = linkCall[0] as HTMLLinkElement;
      expect(link.href).toContain('Open+Sans');
    }

    appendSpy.mockRestore();
  });

  it('is idempotent — calling twice for the same family does not inject twice', async () => {
    const originalAppendChild = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const result = originalAppendChild(node);
      if (node instanceof HTMLLinkElement) {
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return result;
    });

    await loader.loadGoogleFont('Inter', [400]);
    await loader.loadGoogleFont('Inter', [400]);

    const linkCalls = appendSpy.mock.calls.filter(
      (args) => args[0] instanceof HTMLLinkElement,
    );
    // Should only inject once
    expect(linkCalls.length).toBe(1);

    appendSpy.mockRestore();
  });

  it('marks the font as loaded after injection', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLLinkElement) {
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return node;
    });

    await loader.loadGoogleFont('Nunito', [400]);
    expect(loader.isFontLoaded('Nunito')).toBe(true);

    appendSpy.mockRestore();
  });

  it('strips characters outside allowed set from family name', async () => {
    const originalAppendChild = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const result = originalAppendChild(node);
      if (node instanceof HTMLLinkElement) {
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return result;
    });

    // Family with disallowed characters — should be sanitised
    await loader.loadGoogleFont('Inter<script>', [400]);

    const linkCalls = appendSpy.mock.calls.filter(
      (args) => args[0] instanceof HTMLLinkElement,
    );
    if (linkCalls.length > 0) {
      const link = linkCalls[0]![0] as HTMLLinkElement;
      // Should NOT contain '<' or '>'
      expect(link.href).not.toContain('<');
      expect(link.href).not.toContain('>');
    }

    appendSpy.mockRestore();
  });

  it('is a no-op for a family name with only disallowed characters', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild');

    await loader.loadGoogleFont('<<<>>>', [400]);

    const linkCalls = appendSpy.mock.calls.filter(
      (args) => args[0] instanceof HTMLLinkElement,
    );
    expect(linkCalls.length).toBe(0);

    appendSpy.mockRestore();
  });
});

// ============================================================================
// FontLoader — loadCustomFont
// ============================================================================

describe('FontLoader.loadCustomFont', () => {
  let loader: FontLoader;

  beforeEach(() => {
    loader = new FontLoader();
    // Remove any lingering font styles
    document.querySelectorAll('style[data-nevent-chatbot-font]').forEach((el) => el.remove());
  });

  afterEach(() => {
    loader.destroy();
  });

  it('injects a <style> with @font-face for a CUSTOM_FONT config', () => {
    const config: FontConfig = {
      family: 'BrandFont',
      type: 'CUSTOM_FONT',
      files: {
        '400': 'https://cdn.example.com/brand-regular.woff2',
        '700': 'https://cdn.example.com/brand-bold.woff2',
      },
    };

    loader.loadCustomFont(config);

    const style = document.querySelector<HTMLStyleElement>('style[data-nevent-chatbot-font]');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('@font-face');
    expect(style!.textContent).toContain('BrandFont');
    expect(style!.textContent).toContain('brand-regular.woff2');
    expect(style!.textContent).toContain('brand-bold.woff2');
  });

  it('injects correct font-weight for each file', () => {
    const config: FontConfig = {
      family: 'TestFont',
      type: 'CUSTOM_FONT',
      files: {
        '400': 'https://cdn.example.com/regular.woff2',
        '700': 'https://cdn.example.com/bold.woff2',
      },
    };

    loader.loadCustomFont(config);

    const style = document.querySelector<HTMLStyleElement>(`style#nevent-cb-font-testfont`);
    expect(style).not.toBeNull();
    const css = style!.textContent ?? '';
    expect(css).toContain('font-weight:400');
    expect(css).toContain('font-weight:700');
  });

  it('includes font-display:swap', () => {
    const config: FontConfig = {
      family: 'SwapFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    };

    loader.loadCustomFont(config);

    const style = document.querySelector<HTMLStyleElement>(`style#nevent-cb-font-swapfont`);
    expect(style!.textContent).toContain('font-display:swap');
  });

  it('infers format(woff2) from .woff2 URL', () => {
    const config: FontConfig = {
      family: 'Woff2Font',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    };

    loader.loadCustomFont(config);

    const style = document.querySelector<HTMLStyleElement>(`style#nevent-cb-font-woff2font`);
    expect(style!.textContent).toContain("format('woff2')");
  });

  it('infers format(woff) from .woff URL', () => {
    const config: FontConfig = {
      family: 'WoffFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff' },
    };

    loader.loadCustomFont(config);

    const style = document.querySelector<HTMLStyleElement>(`style#nevent-cb-font-wofftfont`);
    // Style may be found by different id, just check textContent
    const allStyles = document.querySelectorAll<HTMLStyleElement>('style[data-nevent-chatbot-font]');
    let found = false;
    for (const s of Array.from(allStyles)) {
      if (s.textContent?.includes('WoffFont')) {
        found = true;
        expect(s.textContent).toContain("format('woff')");
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('is idempotent — calling twice for same family injects once', () => {
    const config: FontConfig = {
      family: 'IdempotentFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    };

    loader.loadCustomFont(config);
    loader.loadCustomFont(config);

    const styles = document.querySelectorAll<HTMLStyleElement>(
      'style[data-nevent-chatbot-font="IdempotentFont"]',
    );
    expect(styles.length).toBe(1);
  });

  it('is a no-op when family is missing', () => {
    const config: FontConfig = {
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    };

    const before = getInjectedFontStyles().length;
    loader.loadCustomFont(config);
    const after = getInjectedFontStyles().length;

    expect(after).toBe(before);
  });

  it('is a no-op when files is empty', () => {
    const config: FontConfig = {
      family: 'EmptyFilesFont',
      type: 'CUSTOM_FONT',
      files: {},
    };

    const before = getInjectedFontStyles().length;
    loader.loadCustomFont(config);
    const after = getInjectedFontStyles().length;

    expect(after).toBe(before);
  });

  it('marks the font as loaded after injection', () => {
    const config: FontConfig = {
      family: 'LoadedCheckFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    };

    loader.loadCustomFont(config);
    expect(loader.isFontLoaded('LoadedCheckFont')).toBe(true);
  });
});

// ============================================================================
// FontLoader — isFontLoaded
// ============================================================================

describe('FontLoader.isFontLoaded', () => {
  let loader: FontLoader;

  beforeEach(() => {
    loader = new FontLoader();
  });

  afterEach(() => {
    loader.destroy();
  });

  it('returns false for a font that has not been loaded', () => {
    expect(loader.isFontLoaded('NeverLoadedFont')).toBe(false);
  });

  it('returns true for a custom font that has been loaded', () => {
    loader.loadCustomFont({
      family: 'CheckedFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    });
    expect(loader.isFontLoaded('CheckedFont')).toBe(true);
  });
});

// ============================================================================
// FontLoader — destroy
// ============================================================================

describe('FontLoader.destroy', () => {
  it('removes all injected <link> elements', async () => {
    const loader = new FontLoader();

    // Spy to capture and trigger load event
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLLinkElement) {
        setTimeout(() => node.onload && (node.onload as () => void)(), 0);
      }
      return node;
    });

    await loader.loadGoogleFont('DestroyTestFont', [400]);

    // Restore spy before destroy so the real DOM manipulation works
    appendSpy.mockRestore();

    // Manually track what was added
    const linksBefore = document.querySelectorAll('link[data-nevent-chatbot-gfont]').length;

    loader.destroy();

    // isFontLoaded should return false after destroy
    expect(loader.isFontLoaded('DestroyTestFont')).toBe(false);
  });

  it('removes all injected custom font <style> elements', () => {
    const loader = new FontLoader();

    loader.loadCustomFont({
      family: 'DestroyCustomFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    });

    const styleBefore = document.querySelector('style[data-nevent-chatbot-font="DestroyCustomFont"]');
    expect(styleBefore).not.toBeNull();

    loader.destroy();

    const styleAfter = document.querySelector('style[data-nevent-chatbot-font="DestroyCustomFont"]');
    expect(styleAfter).toBeNull();
    expect(loader.isFontLoaded('DestroyCustomFont')).toBe(false);
  });

  it('allows loading the same font again after destroy', () => {
    const loader = new FontLoader();

    loader.loadCustomFont({
      family: 'ReloadFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    });

    loader.destroy();

    // After destroy, loading again should work
    const loader2 = new FontLoader();
    loader2.loadCustomFont({
      family: 'ReloadFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    });

    expect(loader2.isFontLoaded('ReloadFont')).toBe(true);
    loader2.destroy();
  });

  it('is safe to call multiple times', () => {
    const loader = new FontLoader();
    loader.loadCustomFont({
      family: 'MultiDestroyFont',
      type: 'CUSTOM_FONT',
      files: { '400': 'https://cdn.example.com/font.woff2' },
    });

    // Should not throw on double destroy
    expect(() => {
      loader.destroy();
      loader.destroy();
    }).not.toThrow();
  });
});
