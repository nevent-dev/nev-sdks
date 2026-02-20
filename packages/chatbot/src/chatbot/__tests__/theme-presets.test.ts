/**
 * Tests for theme-presets.ts
 *
 * Covers:
 * - THEME_PRESETS registry — presence and shape of built-in presets
 * - registerThemePreset — registering custom presets
 * - getThemePreset — lookup by name
 * - listThemePresets — enumeration of all presets
 * - parseHexColor — hex parsing for various formats
 * - rgbToHsl / hslToHex — round-trip colour conversions
 * - generateThemeFromColor — full token generation from a brand colour
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  THEME_PRESETS,
  registerThemePreset,
  getThemePreset,
  listThemePresets,
  parseHexColor,
  rgbToHsl,
  hslToHex,
  generateThemeFromColor,
  type ThemePreset,
} from '../theme-presets';

// ============================================================================
// Helpers
// ============================================================================

/** Built-in preset names that must always be present */
const BUILT_IN_PRESETS = ['light', 'dark', 'midnight', 'ocean', 'sunset', 'forest', 'rose'];

/** Minimum set of tokens every preset must define */
const REQUIRED_TOKENS = [
  '--nev-cb-color-primary',
  '--nev-cb-color-bg',
  '--nev-cb-color-text',
  '--nev-cb-bubble-bg',
  '--nev-cb-header-bg',
  '--nev-cb-msg-user-bg',
  '--nev-cb-msg-bot-bg',
  '--nev-cb-input-bg',
  '--nev-cb-send-btn-bg',
];

// ============================================================================
// THEME_PRESETS registry
// ============================================================================

describe('THEME_PRESETS', () => {
  it('contains all expected built-in presets', () => {
    for (const name of BUILT_IN_PRESETS) {
      expect(THEME_PRESETS).toHaveProperty(name);
    }
  });

  it.each(BUILT_IN_PRESETS)('%s preset has a name string', (presetName) => {
    const preset = THEME_PRESETS[presetName]!;
    expect(typeof preset.name).toBe('string');
    expect(preset.name.length).toBeGreaterThan(0);
  });

  it.each(BUILT_IN_PRESETS)('%s preset contains all required tokens', (presetName) => {
    const preset = THEME_PRESETS[presetName]!;
    for (const token of REQUIRED_TOKENS) {
      expect(preset.tokens).toHaveProperty(token);
      expect(typeof preset.tokens[token]).toBe('string');
      expect((preset.tokens[token] ?? '').length).toBeGreaterThan(0);
    }
  });

  it.each(BUILT_IN_PRESETS)('%s token keys all start with --nev-cb-', (presetName) => {
    const preset = THEME_PRESETS[presetName]!;
    for (const key of Object.keys(preset.tokens)) {
      expect(key.startsWith('--nev-cb-')).toBe(true);
    }
  });
});

// ============================================================================
// registerThemePreset / getThemePreset / listThemePresets
// ============================================================================

describe('registerThemePreset / getThemePreset / listThemePresets', () => {
  const CUSTOM_PRESET_NAME = '__test_custom_preset__';

  afterEach(() => {
    // Clean up custom preset if registered
    // (no unregister API — we accept the test preset remains in registry)
  });

  it('getThemePreset returns undefined for unknown names', () => {
    expect(getThemePreset('does-not-exist-xyz')).toBeUndefined();
  });

  it('getThemePreset returns built-in preset by name', () => {
    const preset = getThemePreset('midnight');
    expect(preset).toBeDefined();
    expect(preset!.name).toBe('Midnight');
  });

  it('registerThemePreset makes preset available via getThemePreset', () => {
    const customPreset: ThemePreset = {
      name: 'Test Custom',
      tokens: {
        '--nev-cb-color-primary': '#ABCDEF',
        '--nev-cb-color-bg': '#FFFFFF',
      },
    };

    registerThemePreset(CUSTOM_PRESET_NAME, customPreset);

    const retrieved = getThemePreset(CUSTOM_PRESET_NAME);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Test Custom');
    expect(retrieved!.tokens['--nev-cb-color-primary']).toBe('#ABCDEF');
  });

  it('registerThemePreset overwrites existing preset with same name', () => {
    const v1: ThemePreset = {
      name: 'V1',
      tokens: { '--nev-cb-color-primary': '#111111' },
    };
    const v2: ThemePreset = {
      name: 'V2',
      tokens: { '--nev-cb-color-primary': '#222222' },
    };

    registerThemePreset(CUSTOM_PRESET_NAME, v1);
    registerThemePreset(CUSTOM_PRESET_NAME, v2);

    const retrieved = getThemePreset(CUSTOM_PRESET_NAME);
    expect(retrieved!.name).toBe('V2');
  });

  it('listThemePresets includes all built-in preset names', () => {
    const names = listThemePresets();
    for (const name of BUILT_IN_PRESETS) {
      expect(names).toContain(name);
    }
  });

  it('listThemePresets includes newly registered preset', () => {
    registerThemePreset(CUSTOM_PRESET_NAME, {
      name: 'Test',
      tokens: {},
    });
    expect(listThemePresets()).toContain(CUSTOM_PRESET_NAME);
  });
});

// ============================================================================
// parseHexColor
// ============================================================================

describe('parseHexColor', () => {
  it('parses 6-digit hex with leading #', () => {
    const result = parseHexColor('#FF0000');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses 6-digit hex without leading #', () => {
    const result = parseHexColor('00FF00');
    expect(result).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('parses 3-digit shorthand hex', () => {
    const result = parseHexColor('#FFF');
    expect(result).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses 4-digit shorthand hex (ignores alpha)', () => {
    const result = parseHexColor('#FFFF');
    expect(result).not.toBeNull();
    expect(result!.r).toBe(255);
    expect(result!.g).toBe(255);
    expect(result!.b).toBe(255);
  });

  it('parses 8-digit hex (ignores alpha channel)', () => {
    const result = parseHexColor('#6366F1FF');
    expect(result).not.toBeNull();
    expect(result!.r).toBe(99);
    expect(result!.g).toBe(102);
    expect(result!.b).toBe(241);
  });

  it('parses indigo #6366F1 correctly', () => {
    const result = parseHexColor('#6366F1');
    expect(result).toEqual({ r: 99, g: 102, b: 241 });
  });

  it('parses black #000000', () => {
    expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses white #FFFFFF', () => {
    expect(parseHexColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('returns null for empty string', () => {
    expect(parseHexColor('')).toBeNull();
  });

  it('returns null for invalid length', () => {
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('#1234567')).toBeNull();
  });

  it('returns null for non-hex characters', () => {
    // After stripping #, 'GGGGGG' is 6 chars but not valid hex
    expect(parseHexColor('#GGGGGG')).toBeNull();
  });
});

// ============================================================================
// rgbToHsl
// ============================================================================

describe('rgbToHsl', () => {
  it('converts red correctly', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts green correctly', () => {
    const { h, s, l } = rgbToHsl(0, 255, 0);
    expect(h).toBeCloseTo(120, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts blue correctly', () => {
    const { h, s, l } = rgbToHsl(0, 0, 255);
    expect(h).toBeCloseTo(240, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(l).toBeCloseTo(50, 0);
  });

  it('converts white correctly (saturation 0, lightness 100)', () => {
    const { s, l } = rgbToHsl(255, 255, 255);
    expect(s).toBeCloseTo(0, 0);
    expect(l).toBeCloseTo(100, 0);
  });

  it('converts black correctly (saturation 0, lightness 0)', () => {
    const { s, l } = rgbToHsl(0, 0, 0);
    expect(s).toBeCloseTo(0, 0);
    expect(l).toBeCloseTo(0, 0);
  });

  it('converts indigo #6366F1 to approximately correct HSL', () => {
    // #6366F1 = rgb(99, 102, 241) — near 240° hue
    const { h, l } = rgbToHsl(99, 102, 241);
    expect(h).toBeGreaterThan(230);
    expect(h).toBeLessThan(250);
    expect(l).toBeGreaterThan(50);
    expect(l).toBeLessThan(75);
  });
});

// ============================================================================
// hslToHex
// ============================================================================

describe('hslToHex', () => {
  it('converts red HSL to #ff0000', () => {
    const hex = hslToHex(0, 100, 50);
    expect(hex.toLowerCase()).toBe('#ff0000');
  });

  it('converts green HSL to #00ff00', () => {
    const hex = hslToHex(120, 100, 50);
    expect(hex.toLowerCase()).toBe('#00ff00');
  });

  it('converts blue HSL to #0000ff', () => {
    const hex = hslToHex(240, 100, 50);
    expect(hex.toLowerCase()).toBe('#0000ff');
  });

  it('converts white HSL (any hue, 0% sat, 100% lightness)', () => {
    const hex = hslToHex(0, 0, 100);
    expect(hex.toLowerCase()).toBe('#ffffff');
  });

  it('converts black HSL (any hue, 0% sat, 0% lightness)', () => {
    const hex = hslToHex(0, 0, 0);
    expect(hex.toLowerCase()).toBe('#000000');
  });

  it('returns a string starting with #', () => {
    const hex = hslToHex(180, 50, 50);
    expect(hex.startsWith('#')).toBe(true);
  });

  it('returns a 7-character hex string', () => {
    const hex = hslToHex(180, 50, 50);
    expect(hex.length).toBe(7);
  });
});

// ============================================================================
// generateThemeFromColor
// ============================================================================

describe('generateThemeFromColor', () => {
  it('returns empty object for invalid color', () => {
    const tokens = generateThemeFromColor('not-a-color');
    expect(Object.keys(tokens)).toHaveLength(0);
  });

  it('returns empty object for empty string', () => {
    const tokens = generateThemeFromColor('');
    expect(Object.keys(tokens)).toHaveLength(0);
  });

  it('returns a non-empty token map for a valid hex color', () => {
    const tokens = generateThemeFromColor('#6366F1');
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
  });

  it('sets --nev-cb-color-primary to the input brand color', () => {
    const tokens = generateThemeFromColor('#6366F1');
    expect(tokens['--nev-cb-color-primary']).toBe('#6366F1');
  });

  it('includes all required token keys', () => {
    const tokens = generateThemeFromColor('#6366F1');
    for (const key of REQUIRED_TOKENS) {
      expect(tokens).toHaveProperty(key);
    }
  });

  it('all token keys start with --nev-cb-', () => {
    const tokens = generateThemeFromColor('#6366F1');
    for (const key of Object.keys(tokens)) {
      expect(key.startsWith('--nev-cb-')).toBe(true);
    }
  });

  it('all token values are non-empty strings', () => {
    const tokens = generateThemeFromColor('#6366F1');
    for (const [key, value] of Object.entries(tokens)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('generates different primary-hover color from primary', () => {
    const tokens = generateThemeFromColor('#6366F1');
    // Hover should be a darker variant — not the same as primary
    expect(tokens['--nev-cb-color-primary-hover']).not.toBe(tokens['--nev-cb-color-primary']);
  });

  it('generates a light background for indigo brand color', () => {
    const tokens = generateThemeFromColor('#6366F1');
    const bgRgb = parseHexColor(tokens['--nev-cb-color-bg'] ?? '');
    expect(bgRgb).not.toBeNull();
    // Background should be very light (high RGB values)
    expect(bgRgb!.r).toBeGreaterThan(200);
    expect(bgRgb!.g).toBeGreaterThan(200);
    expect(bgRgb!.b).toBeGreaterThan(200);
  });

  it('generates a dark text color for indigo brand color', () => {
    const tokens = generateThemeFromColor('#6366F1');
    const textRgb = parseHexColor(tokens['--nev-cb-color-text'] ?? '');
    expect(textRgb).not.toBeNull();
    // Text should be dark (low RGB values)
    const avg = ((textRgb!.r + textRgb!.g + textRgb!.b) / 3);
    expect(avg).toBeLessThan(80);
  });

  it('works with 3-digit hex shorthand', () => {
    const tokens = generateThemeFromColor('#F00');
    expect(tokens['--nev-cb-color-primary']).toBe('#F00');
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
  });

  it('produces consistent results for the same input', () => {
    const tokens1 = generateThemeFromColor('#0EA5E9');
    const tokens2 = generateThemeFromColor('#0EA5E9');
    expect(tokens1).toEqual(tokens2);
  });

  it('produces different results for different brand colors', () => {
    const indigo = generateThemeFromColor('#6366F1');
    const orange = generateThemeFromColor('#F97316');
    expect(indigo['--nev-cb-color-primary']).not.toBe(orange['--nev-cb-color-primary']);
    expect(indigo['--nev-cb-color-bg']).not.toBe(orange['--nev-cb-color-bg']);
  });
});
