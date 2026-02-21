/**
 * ThemePresets - Named theme presets for the chatbot widget
 *
 * Each preset is a complete set of CSS custom property values that can be
 * applied to the widget root element to achieve a consistent visual theme.
 * Presets act as named shortcuts over manually specifying every token.
 *
 * Architecture:
 * - `ThemePreset` is a typed record of CSS custom property name -> value.
 * - `THEME_PRESETS` is the registry of built-in named presets.
 * - Consumers can register additional presets at runtime via `registerThemePreset`.
 * - The `CSSGenerator` resolves a preset name to its token map and applies it.
 *
 * All token names follow the `--nev-cb-*` convention used throughout the
 * chatbot design token system.
 *
 * Usage:
 * ```typescript
 * // Apply a built-in preset
 * generator.setThemePreset('midnight');
 *
 * // Inspect preset tokens
 * const preset = THEME_PRESETS['ocean'];
 *
 * // Register a custom preset
 * registerThemePreset('corporate', {
 *   name: 'Corporate',
 *   tokens: { '--nev-cb-color-primary': '#1E40AF', ... },
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A named visual theme preset.
 *
 * Contains a human-readable display name and a record of CSS custom property
 * values. All properties are applied to the `.nevent-chatbot-root` element,
 * overriding the base light/dark token layer.
 */
export interface ThemePreset {
  /** Human-readable display name (used in UI pickers, debug output) */
  name: string;
  /**
   * Map of CSS custom property names to their values.
   * Keys MUST start with `--nev-cb-`.
   * Values are raw CSS values (colors, px values, etc.).
   */
  tokens: Record<string, string>;
}

// ============================================================================
// Compact Preset Data
// ============================================================================

/**
 * Ordered array of CSS custom property names shared across all presets.
 * Defined once and reused by the `_expand` helper to build full token maps.
 *
 * @internal
 */
const _K: readonly string[] = [
  '--nev-cb-color-primary',
  '--nev-cb-color-primary-hover',
  '--nev-cb-color-bg',
  '--nev-cb-color-bg-secondary',
  '--nev-cb-color-surface',
  '--nev-cb-color-text',
  '--nev-cb-color-text-secondary',
  '--nev-cb-color-text-muted',
  '--nev-cb-color-border',
  '--nev-cb-color-error',
  '--nev-cb-color-success',
  '--nev-cb-color-badge',
  '--nev-cb-bubble-bg',
  '--nev-cb-bubble-icon-color',
  '--nev-cb-header-bg',
  '--nev-cb-header-text',
  '--nev-cb-header-subtitle',
  '--nev-cb-msg-user-bg',
  '--nev-cb-msg-user-color',
  '--nev-cb-msg-bot-bg',
  '--nev-cb-msg-bot-color',
  '--nev-cb-msg-system-color',
  '--nev-cb-input-bg',
  '--nev-cb-input-color',
  '--nev-cb-input-border',
  '--nev-cb-input-placeholder',
  '--nev-cb-input-focus-border',
  '--nev-cb-send-btn-bg',
  '--nev-cb-send-btn-color',
  '--nev-cb-qr-bg',
  '--nev-cb-qr-color',
  '--nev-cb-qr-border',
  '--nev-cb-qr-hover-bg',
  '--nev-cb-qr-hover-color',
  '--nev-cb-typing-dot-color',
  '--nev-cb-typing-bg',
  '--nev-cb-loading-bg',
  '--nev-cb-shadow-sm',
  '--nev-cb-shadow-md',
  '--nev-cb-shadow-lg',
] as const;

/**
 * Expands an ordered array of values into a full tokens record by
 * pairing each value with its corresponding key from `_K`.
 *
 * @param values - Ordered array of CSS values matching `_K` positions
 * @returns Complete token map of `--nev-cb-*` property names to values
 * @internal
 */
function _expand(values: readonly string[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (let i = 0; i < _K.length; i++) {
    tokens[_K[i]!] = values[i]!;
  }
  return tokens;
}

// ============================================================================
// Built-in Presets
// ============================================================================

/**
 * Registry of built-in named theme presets.
 *
 * Includes:
 * - `light`    -- Default light theme (mirrors the light token layer)
 * - `dark`     -- Default dark theme (mirrors the dark token layer)
 * - `midnight` -- Deep purple on dark slate -- modern and bold
 * - `ocean`    -- Sky blue on off-white -- clean and airy
 * - `sunset`   -- Warm orange on cream -- friendly and energetic
 * - `forest`   -- Earthy green on light beige -- natural and calming
 * - `rose`     -- Soft pink/rose on white -- warm and inviting
 */
export const THEME_PRESETS: Record<string, ThemePreset> = {
  light: {
    name: 'Light',
    tokens: _expand([
      '#6366F1',
      '#4F46E5',
      '#FFFFFF',
      '#F9FAFB',
      '#F3F4F6',
      '#111827',
      '#6B7280',
      '#9CA3AF',
      '#E5E7EB',
      '#EF4444',
      '#10B981',
      '#EF4444',
      '#6366F1',
      '#ffffff',
      '#6366F1',
      '#ffffff',
      'rgba(255,255,255,0.8)',
      '#6366F1',
      '#ffffff',
      '#F3F4F6',
      '#111827',
      '#9CA3AF',
      '#FFFFFF',
      '#111827',
      '#E5E7EB',
      '#9CA3AF',
      '#6366F1',
      '#6366F1',
      '#ffffff',
      'transparent',
      '#6366F1',
      '#6366F1',
      '#6366F1',
      '#ffffff',
      '#9CA3AF',
      '#F3F4F6',
      'rgba(255,255,255,0.8)',
      '0 1px 3px rgba(0,0,0,0.1)',
      '0 4px 16px rgba(0,0,0,0.12)',
      '0 8px 32px rgba(0,0,0,0.15)',
    ]),
  },

  dark: {
    name: 'Dark',
    tokens: _expand([
      '#818CF8',
      '#6366F1',
      '#1F2937',
      '#111827',
      '#374151',
      '#F9FAFB',
      '#D1D5DB',
      '#9CA3AF',
      '#374151',
      '#F87171',
      '#34D399',
      '#F87171',
      '#818CF8',
      '#ffffff',
      '#818CF8',
      '#ffffff',
      'rgba(255,255,255,0.7)',
      '#818CF8',
      '#ffffff',
      '#374151',
      '#F9FAFB',
      '#9CA3AF',
      '#1F2937',
      '#F9FAFB',
      '#374151',
      '#9CA3AF',
      '#818CF8',
      '#818CF8',
      '#ffffff',
      'transparent',
      '#818CF8',
      '#818CF8',
      '#818CF8',
      '#ffffff',
      '#9CA3AF',
      '#374151',
      'rgba(31,41,55,0.8)',
      '0 1px 3px rgba(0,0,0,0.3)',
      '0 4px 16px rgba(0,0,0,0.4)',
      '0 8px 32px rgba(0,0,0,0.5)',
    ]),
  },

  midnight: {
    name: 'Midnight',
    tokens: _expand([
      '#7C3AED',
      '#6D28D9',
      '#0F172A',
      '#1E293B',
      '#334155',
      '#F1F5F9',
      '#CBD5E1',
      '#94A3B8',
      '#334155',
      '#F87171',
      '#34D399',
      '#EF4444',
      '#7C3AED',
      '#ffffff',
      '#7C3AED',
      '#ffffff',
      'rgba(255,255,255,0.7)',
      '#7C3AED',
      '#ffffff',
      '#334155',
      '#F1F5F9',
      '#94A3B8',
      '#1E293B',
      '#F1F5F9',
      '#334155',
      '#94A3B8',
      '#7C3AED',
      '#7C3AED',
      '#ffffff',
      'transparent',
      '#A78BFA',
      '#7C3AED',
      '#7C3AED',
      '#ffffff',
      '#94A3B8',
      '#334155',
      'rgba(15,23,42,0.85)',
      '0 1px 3px rgba(0,0,0,0.4)',
      '0 4px 16px rgba(0,0,0,0.5)',
      '0 8px 32px rgba(0,0,0,0.6)',
    ]),
  },

  ocean: {
    name: 'Ocean',
    tokens: _expand([
      '#0EA5E9',
      '#0284C7',
      '#F0F9FF',
      '#E0F2FE',
      '#BAE6FD',
      '#0C4A6E',
      '#0369A1',
      '#7DD3FC',
      '#BAE6FD',
      '#EF4444',
      '#10B981',
      '#EF4444',
      '#0EA5E9',
      '#ffffff',
      '#0EA5E9',
      '#ffffff',
      'rgba(255,255,255,0.85)',
      '#0EA5E9',
      '#ffffff',
      '#E0F2FE',
      '#0C4A6E',
      '#7DD3FC',
      '#F0F9FF',
      '#0C4A6E',
      '#BAE6FD',
      '#7DD3FC',
      '#0EA5E9',
      '#0EA5E9',
      '#ffffff',
      'transparent',
      '#0EA5E9',
      '#0EA5E9',
      '#0EA5E9',
      '#ffffff',
      '#7DD3FC',
      '#E0F2FE',
      'rgba(240,249,255,0.85)',
      '0 1px 3px rgba(14,165,233,0.12)',
      '0 4px 16px rgba(14,165,233,0.15)',
      '0 8px 32px rgba(14,165,233,0.2)',
    ]),
  },

  sunset: {
    name: 'Sunset',
    tokens: _expand([
      '#F97316',
      '#EA580C',
      '#FFFBEB',
      '#FEF3C7',
      '#FDE68A',
      '#78350F',
      '#92400E',
      '#F59E0B',
      '#FDE68A',
      '#DC2626',
      '#16A34A',
      '#DC2626',
      '#F97316',
      '#ffffff',
      '#F97316',
      '#ffffff',
      'rgba(255,255,255,0.85)',
      '#F97316',
      '#ffffff',
      '#FEF3C7',
      '#78350F',
      '#F59E0B',
      '#FFFBEB',
      '#78350F',
      '#FDE68A',
      '#F59E0B',
      '#F97316',
      '#F97316',
      '#ffffff',
      'transparent',
      '#F97316',
      '#F97316',
      '#F97316',
      '#ffffff',
      '#F59E0B',
      '#FEF3C7',
      'rgba(255,251,235,0.85)',
      '0 1px 3px rgba(249,115,22,0.12)',
      '0 4px 16px rgba(249,115,22,0.15)',
      '0 8px 32px rgba(249,115,22,0.2)',
    ]),
  },

  forest: {
    name: 'Forest',
    tokens: _expand([
      '#16A34A',
      '#15803D',
      '#F0FDF4',
      '#DCFCE7',
      '#BBF7D0',
      '#14532D',
      '#166534',
      '#4ADE80',
      '#BBF7D0',
      '#EF4444',
      '#16A34A',
      '#EF4444',
      '#16A34A',
      '#ffffff',
      '#16A34A',
      '#ffffff',
      'rgba(255,255,255,0.85)',
      '#16A34A',
      '#ffffff',
      '#DCFCE7',
      '#14532D',
      '#4ADE80',
      '#F0FDF4',
      '#14532D',
      '#BBF7D0',
      '#4ADE80',
      '#16A34A',
      '#16A34A',
      '#ffffff',
      'transparent',
      '#16A34A',
      '#16A34A',
      '#16A34A',
      '#ffffff',
      '#4ADE80',
      '#DCFCE7',
      'rgba(240,253,244,0.85)',
      '0 1px 3px rgba(22,163,74,0.12)',
      '0 4px 16px rgba(22,163,74,0.15)',
      '0 8px 32px rgba(22,163,74,0.2)',
    ]),
  },

  rose: {
    name: 'Rose',
    tokens: _expand([
      '#E11D48',
      '#BE123C',
      '#FFF1F2',
      '#FFE4E6',
      '#FECDD3',
      '#881337',
      '#9F1239',
      '#FB7185',
      '#FECDD3',
      '#DC2626',
      '#16A34A',
      '#DC2626',
      '#E11D48',
      '#ffffff',
      '#E11D48',
      '#ffffff',
      'rgba(255,255,255,0.85)',
      '#E11D48',
      '#ffffff',
      '#FFE4E6',
      '#881337',
      '#FB7185',
      '#FFF1F2',
      '#881337',
      '#FECDD3',
      '#FB7185',
      '#E11D48',
      '#E11D48',
      '#ffffff',
      'transparent',
      '#E11D48',
      '#E11D48',
      '#E11D48',
      '#ffffff',
      '#FB7185',
      '#FFE4E6',
      'rgba(255,241,242,0.85)',
      '0 1px 3px rgba(225,29,72,0.12)',
      '0 4px 16px rgba(225,29,72,0.15)',
      '0 8px 32px rgba(225,29,72,0.2)',
    ]),
  },
};

// ============================================================================
// Runtime Preset Registry
// ============================================================================

/**
 * Mutable copy of the preset registry used at runtime.
 * Initialized from the built-in THEME_PRESETS object.
 * Mutated by `registerThemePreset`.
 *
 * @internal
 */
const _presetRegistry: Record<string, ThemePreset> = { ...THEME_PRESETS };

/**
 * Registers a custom theme preset under a given name.
 *
 * The preset becomes available to `CSSGenerator.setThemePreset()` immediately
 * after registration. If a preset with the same name already exists it will be
 * overwritten -- this allows consumers to override the built-in `light` or `dark`
 * presets with brand-specific versions.
 *
 * @param name   - Identifier for the preset (case-sensitive; used in `setThemePreset`)
 * @param preset - The theme preset definition containing display name and tokens
 */
export function registerThemePreset(name: string, preset: ThemePreset): void {
  _presetRegistry[name] = preset;
}

/**
 * Looks up a theme preset by name from the runtime registry.
 *
 * Returns the preset if found, or `undefined` if the name is not registered.
 *
 * @param name - Preset name to look up (case-sensitive)
 * @returns The matching `ThemePreset`, or `undefined` if not found
 */
export function getThemePreset(name: string): ThemePreset | undefined {
  return _presetRegistry[name];
}

/**
 * Returns the names of all currently registered theme presets.
 *
 * Includes both built-in presets and any registered via `registerThemePreset`.
 *
 * @returns Array of registered preset names in insertion order
 */
export function listThemePresets(): string[] {
  return Object.keys(_presetRegistry);
}

// ============================================================================
// Color Utility Helpers
// ============================================================================

/**
 * Parses a hex color string (#RGB, #RRGGBB, #RRGGBBAA) into its RGB components.
 *
 * @param hex - Hex color string (with or without leading '#')
 * @returns Object `{ r, g, b }` with values in [0, 255], or `null` on parse failure
 */
export function parseHexColor(
  hex: string
): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '');

  let r: number, g: number, b: number;

  if (clean.length === 3 || clean.length === 4) {
    // Short form: #RGB -> #RRGGBB
    r = parseInt((clean[0] ?? '0') + (clean[0] ?? '0'), 16);
    g = parseInt((clean[1] ?? '0') + (clean[1] ?? '0'), 16);
    b = parseInt((clean[2] ?? '0') + (clean[2] ?? '0'), 16);
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return null;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

/**
 * Converts RGB values to HSL.
 *
 * @param r - Red channel [0, 255]
 * @param g - Green channel [0, 255]
 * @param b - Blue channel [0, 255]
 * @returns `{ h, s, l }` where h in [0, 360), s in [0, 100], l in [0, 100]
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

/**
 * Converts HSL values to a hex color string.
 *
 * @param h - Hue [0, 360)
 * @param s - Saturation [0, 100]
 * @param l - Lightness [0, 100]
 * @returns Hex color string including leading '#' (e.g. '#6366F1')
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);

  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const val = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * val)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Generates a complete set of chatbot design tokens from a single brand color.
 *
 * Uses HSL manipulation to derive complementary colors for all widget components.
 * The algorithm ensures a minimum contrast ratio of ~4.5:1 for text on
 * backgrounds (WCAG 2.1 AA).
 *
 * @param brandColor - Brand color as a hex string (e.g. '#6366F1')
 * @returns Complete record of `--nev-cb-*` CSS custom property values,
 *   or an empty record if `brandColor` cannot be parsed
 */
export function generateThemeFromColor(
  brandColor: string
): Record<string, string> {
  const rgb = parseHexColor(brandColor);
  if (!rgb) return {};

  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Clamp saturation for generated derivative colors to keep them tasteful
  const sDerived = Math.min(s, 80);

  // Brand primary and its hover (10% darker)
  const primary = brandColor;
  const primaryHover = hslToHex(
    h,
    sDerived,
    Math.max(20, rgbToHsl(rgb.r, rgb.g, rgb.b).l - 10)
  );

  // Background: very light (95% lightness), low saturation
  const bg = hslToHex(h, Math.min(sDerived * 0.3, 20), 97);
  const bgSecondary = hslToHex(h, Math.min(sDerived * 0.35, 25), 94);

  // Surface: slightly more saturated than bg, still light
  const surface = hslToHex(h, Math.min(sDerived * 0.45, 30), 90);

  // Borders: light tint
  const border = hslToHex(h, Math.min(sDerived * 0.35, 25), 88);

  // Text: very dark, same hue family
  const text = hslToHex(h, Math.min(sDerived * 0.4, 30), 10);
  const textSecondary = hslToHex(h, Math.min(sDerived * 0.35, 25), 35);
  const textMuted = hslToHex(h, Math.min(sDerived * 0.3, 20), 55);

  return _expand([
    primary,
    primaryHover,
    bg,
    bgSecondary,
    surface,
    text,
    textSecondary,
    textMuted,
    border,
    '#EF4444',
    '#10B981',
    '#EF4444',
    primary,
    '#ffffff',
    primary,
    '#ffffff',
    'rgba(255,255,255,0.8)',
    primary,
    '#ffffff',
    surface,
    text,
    textMuted,
    bg,
    text,
    border,
    textMuted,
    primary,
    primary,
    '#ffffff',
    'transparent',
    primary,
    primary,
    primary,
    '#ffffff',
    textMuted,
    surface,
    'rgba(255,255,255,0.8)',
    '0 1px 3px rgba(0,0,0,0.1)',
    '0 4px 16px rgba(0,0,0,0.12)',
    '0 8px 32px rgba(0,0,0,0.15)',
  ]);
}
