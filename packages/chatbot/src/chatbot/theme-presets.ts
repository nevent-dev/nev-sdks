/**
 * ThemePresets - Named theme presets for the chatbot widget
 *
 * Each preset is a complete set of CSS custom property values that can be
 * applied to the widget root element to achieve a consistent visual theme.
 * Presets act as named shortcuts over manually specifying every token.
 *
 * Architecture:
 * - `ThemePreset` is a typed record of CSS custom property name → value.
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
 * console.log(preset.tokens['--nev-cb-color-primary']); // '#0EA5E9'
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
 *
 * @example
 * ```typescript
 * const preset: ThemePreset = {
 *   name: 'Midnight',
 *   tokens: {
 *     '--nev-cb-color-primary': '#7C3AED',
 *     '--nev-cb-color-bg': '#0F172A',
 *   },
 * };
 * ```
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
// Built-in Presets
// ============================================================================

/**
 * Registry of built-in named theme presets.
 *
 * Includes:
 * - `light`    — Default light theme (mirrors the light token layer)
 * - `dark`     — Default dark theme (mirrors the dark token layer)
 * - `midnight` — Deep purple on dark slate — modern and bold
 * - `ocean`    — Sky blue on off-white — clean and airy
 * - `sunset`   — Warm orange on cream — friendly and energetic
 * - `forest`   — Earthy green on light beige — natural and calming
 * - `rose`     — Soft pink/rose on white — warm and inviting
 *
 * @example
 * ```typescript
 * const preset = THEME_PRESETS['midnight'];
 * // preset.tokens['--nev-cb-color-primary'] === '#7C3AED'
 * ```
 */
export const THEME_PRESETS: Record<string, ThemePreset> = {
  // --------------------------------------------------------------------------
  // light — Default light theme
  // Mirrors the token values declared in generateLightTokens() in CSSGenerator.
  // Useful as a reset target when switching from a custom preset back to default.
  // --------------------------------------------------------------------------
  light: {
    name: 'Light',
    tokens: {
      '--nev-cb-color-primary': '#6366F1',
      '--nev-cb-color-primary-hover': '#4F46E5',
      '--nev-cb-color-bg': '#FFFFFF',
      '--nev-cb-color-bg-secondary': '#F9FAFB',
      '--nev-cb-color-surface': '#F3F4F6',
      '--nev-cb-color-text': '#111827',
      '--nev-cb-color-text-secondary': '#6B7280',
      '--nev-cb-color-text-muted': '#9CA3AF',
      '--nev-cb-color-border': '#E5E7EB',
      '--nev-cb-color-error': '#EF4444',
      '--nev-cb-color-success': '#10B981',
      '--nev-cb-color-badge': '#EF4444',
      '--nev-cb-bubble-bg': '#6366F1',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#6366F1',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.8)',
      '--nev-cb-msg-user-bg': '#6366F1',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#F3F4F6',
      '--nev-cb-msg-bot-color': '#111827',
      '--nev-cb-msg-system-color': '#9CA3AF',
      '--nev-cb-input-bg': '#FFFFFF',
      '--nev-cb-input-color': '#111827',
      '--nev-cb-input-border': '#E5E7EB',
      '--nev-cb-input-placeholder': '#9CA3AF',
      '--nev-cb-input-focus-border': '#6366F1',
      '--nev-cb-send-btn-bg': '#6366F1',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#6366F1',
      '--nev-cb-qr-border': '#6366F1',
      '--nev-cb-qr-hover-bg': '#6366F1',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#9CA3AF',
      '--nev-cb-typing-bg': '#F3F4F6',
      '--nev-cb-loading-bg': 'rgba(255,255,255,0.8)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(0,0,0,0.1)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(0,0,0,0.12)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(0,0,0,0.15)',
    },
  },

  // --------------------------------------------------------------------------
  // dark — Default dark theme
  // Mirrors the token values declared in generateDarkTokens() in CSSGenerator.
  // --------------------------------------------------------------------------
  dark: {
    name: 'Dark',
    tokens: {
      '--nev-cb-color-primary': '#818CF8',
      '--nev-cb-color-primary-hover': '#6366F1',
      '--nev-cb-color-bg': '#1F2937',
      '--nev-cb-color-bg-secondary': '#111827',
      '--nev-cb-color-surface': '#374151',
      '--nev-cb-color-text': '#F9FAFB',
      '--nev-cb-color-text-secondary': '#D1D5DB',
      '--nev-cb-color-text-muted': '#9CA3AF',
      '--nev-cb-color-border': '#374151',
      '--nev-cb-color-error': '#F87171',
      '--nev-cb-color-success': '#34D399',
      '--nev-cb-color-badge': '#F87171',
      '--nev-cb-bubble-bg': '#818CF8',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#818CF8',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.7)',
      '--nev-cb-msg-user-bg': '#818CF8',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#374151',
      '--nev-cb-msg-bot-color': '#F9FAFB',
      '--nev-cb-msg-system-color': '#9CA3AF',
      '--nev-cb-input-bg': '#1F2937',
      '--nev-cb-input-color': '#F9FAFB',
      '--nev-cb-input-border': '#374151',
      '--nev-cb-input-placeholder': '#9CA3AF',
      '--nev-cb-input-focus-border': '#818CF8',
      '--nev-cb-send-btn-bg': '#818CF8',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#818CF8',
      '--nev-cb-qr-border': '#818CF8',
      '--nev-cb-qr-hover-bg': '#818CF8',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#9CA3AF',
      '--nev-cb-typing-bg': '#374151',
      '--nev-cb-loading-bg': 'rgba(31,41,55,0.8)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(0,0,0,0.3)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(0,0,0,0.4)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(0,0,0,0.5)',
    },
  },

  // --------------------------------------------------------------------------
  // midnight — Deep purple on dark slate
  // Bold and modern. Great for tech-forward brands or late-night vibes.
  // --------------------------------------------------------------------------
  midnight: {
    name: 'Midnight',
    tokens: {
      '--nev-cb-color-primary': '#7C3AED',
      '--nev-cb-color-primary-hover': '#6D28D9',
      '--nev-cb-color-bg': '#0F172A',
      '--nev-cb-color-bg-secondary': '#1E293B',
      '--nev-cb-color-surface': '#334155',
      '--nev-cb-color-text': '#F1F5F9',
      '--nev-cb-color-text-secondary': '#CBD5E1',
      '--nev-cb-color-text-muted': '#94A3B8',
      '--nev-cb-color-border': '#334155',
      '--nev-cb-color-error': '#F87171',
      '--nev-cb-color-success': '#34D399',
      '--nev-cb-color-badge': '#EF4444',
      '--nev-cb-bubble-bg': '#7C3AED',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#7C3AED',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.7)',
      '--nev-cb-msg-user-bg': '#7C3AED',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#334155',
      '--nev-cb-msg-bot-color': '#F1F5F9',
      '--nev-cb-msg-system-color': '#94A3B8',
      '--nev-cb-input-bg': '#1E293B',
      '--nev-cb-input-color': '#F1F5F9',
      '--nev-cb-input-border': '#334155',
      '--nev-cb-input-placeholder': '#94A3B8',
      '--nev-cb-input-focus-border': '#7C3AED',
      '--nev-cb-send-btn-bg': '#7C3AED',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#A78BFA',
      '--nev-cb-qr-border': '#7C3AED',
      '--nev-cb-qr-hover-bg': '#7C3AED',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#94A3B8',
      '--nev-cb-typing-bg': '#334155',
      '--nev-cb-loading-bg': 'rgba(15,23,42,0.85)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(0,0,0,0.4)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(0,0,0,0.5)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(0,0,0,0.6)',
    },
  },

  // --------------------------------------------------------------------------
  // ocean — Sky blue on off-white
  // Clean, airy, and professional. Suitable for travel, wellness, and SaaS.
  // --------------------------------------------------------------------------
  ocean: {
    name: 'Ocean',
    tokens: {
      '--nev-cb-color-primary': '#0EA5E9',
      '--nev-cb-color-primary-hover': '#0284C7',
      '--nev-cb-color-bg': '#F0F9FF',
      '--nev-cb-color-bg-secondary': '#E0F2FE',
      '--nev-cb-color-surface': '#BAE6FD',
      '--nev-cb-color-text': '#0C4A6E',
      '--nev-cb-color-text-secondary': '#0369A1',
      '--nev-cb-color-text-muted': '#7DD3FC',
      '--nev-cb-color-border': '#BAE6FD',
      '--nev-cb-color-error': '#EF4444',
      '--nev-cb-color-success': '#10B981',
      '--nev-cb-color-badge': '#EF4444',
      '--nev-cb-bubble-bg': '#0EA5E9',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#0EA5E9',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.85)',
      '--nev-cb-msg-user-bg': '#0EA5E9',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#E0F2FE',
      '--nev-cb-msg-bot-color': '#0C4A6E',
      '--nev-cb-msg-system-color': '#7DD3FC',
      '--nev-cb-input-bg': '#F0F9FF',
      '--nev-cb-input-color': '#0C4A6E',
      '--nev-cb-input-border': '#BAE6FD',
      '--nev-cb-input-placeholder': '#7DD3FC',
      '--nev-cb-input-focus-border': '#0EA5E9',
      '--nev-cb-send-btn-bg': '#0EA5E9',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#0EA5E9',
      '--nev-cb-qr-border': '#0EA5E9',
      '--nev-cb-qr-hover-bg': '#0EA5E9',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#7DD3FC',
      '--nev-cb-typing-bg': '#E0F2FE',
      '--nev-cb-loading-bg': 'rgba(240,249,255,0.85)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(14,165,233,0.12)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(14,165,233,0.15)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(14,165,233,0.2)',
    },
  },

  // --------------------------------------------------------------------------
  // sunset — Warm orange on cream
  // Friendly, energetic, and welcoming. Great for events and consumer brands.
  // --------------------------------------------------------------------------
  sunset: {
    name: 'Sunset',
    tokens: {
      '--nev-cb-color-primary': '#F97316',
      '--nev-cb-color-primary-hover': '#EA580C',
      '--nev-cb-color-bg': '#FFFBEB',
      '--nev-cb-color-bg-secondary': '#FEF3C7',
      '--nev-cb-color-surface': '#FDE68A',
      '--nev-cb-color-text': '#78350F',
      '--nev-cb-color-text-secondary': '#92400E',
      '--nev-cb-color-text-muted': '#F59E0B',
      '--nev-cb-color-border': '#FDE68A',
      '--nev-cb-color-error': '#DC2626',
      '--nev-cb-color-success': '#16A34A',
      '--nev-cb-color-badge': '#DC2626',
      '--nev-cb-bubble-bg': '#F97316',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#F97316',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.85)',
      '--nev-cb-msg-user-bg': '#F97316',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#FEF3C7',
      '--nev-cb-msg-bot-color': '#78350F',
      '--nev-cb-msg-system-color': '#F59E0B',
      '--nev-cb-input-bg': '#FFFBEB',
      '--nev-cb-input-color': '#78350F',
      '--nev-cb-input-border': '#FDE68A',
      '--nev-cb-input-placeholder': '#F59E0B',
      '--nev-cb-input-focus-border': '#F97316',
      '--nev-cb-send-btn-bg': '#F97316',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#F97316',
      '--nev-cb-qr-border': '#F97316',
      '--nev-cb-qr-hover-bg': '#F97316',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#F59E0B',
      '--nev-cb-typing-bg': '#FEF3C7',
      '--nev-cb-loading-bg': 'rgba(255,251,235,0.85)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(249,115,22,0.12)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(249,115,22,0.15)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(249,115,22,0.2)',
    },
  },

  // --------------------------------------------------------------------------
  // forest — Earthy green on light beige
  // Natural and calming. Ideal for wellness, sustainability, and eco brands.
  // --------------------------------------------------------------------------
  forest: {
    name: 'Forest',
    tokens: {
      '--nev-cb-color-primary': '#16A34A',
      '--nev-cb-color-primary-hover': '#15803D',
      '--nev-cb-color-bg': '#F0FDF4',
      '--nev-cb-color-bg-secondary': '#DCFCE7',
      '--nev-cb-color-surface': '#BBF7D0',
      '--nev-cb-color-text': '#14532D',
      '--nev-cb-color-text-secondary': '#166534',
      '--nev-cb-color-text-muted': '#4ADE80',
      '--nev-cb-color-border': '#BBF7D0',
      '--nev-cb-color-error': '#EF4444',
      '--nev-cb-color-success': '#16A34A',
      '--nev-cb-color-badge': '#EF4444',
      '--nev-cb-bubble-bg': '#16A34A',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#16A34A',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.85)',
      '--nev-cb-msg-user-bg': '#16A34A',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#DCFCE7',
      '--nev-cb-msg-bot-color': '#14532D',
      '--nev-cb-msg-system-color': '#4ADE80',
      '--nev-cb-input-bg': '#F0FDF4',
      '--nev-cb-input-color': '#14532D',
      '--nev-cb-input-border': '#BBF7D0',
      '--nev-cb-input-placeholder': '#4ADE80',
      '--nev-cb-input-focus-border': '#16A34A',
      '--nev-cb-send-btn-bg': '#16A34A',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#16A34A',
      '--nev-cb-qr-border': '#16A34A',
      '--nev-cb-qr-hover-bg': '#16A34A',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#4ADE80',
      '--nev-cb-typing-bg': '#DCFCE7',
      '--nev-cb-loading-bg': 'rgba(240,253,244,0.85)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(22,163,74,0.12)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(22,163,74,0.15)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(22,163,74,0.2)',
    },
  },

  // --------------------------------------------------------------------------
  // rose — Soft pink on white
  // Warm and inviting. Perfect for fashion, beauty, and hospitality brands.
  // --------------------------------------------------------------------------
  rose: {
    name: 'Rose',
    tokens: {
      '--nev-cb-color-primary': '#E11D48',
      '--nev-cb-color-primary-hover': '#BE123C',
      '--nev-cb-color-bg': '#FFF1F2',
      '--nev-cb-color-bg-secondary': '#FFE4E6',
      '--nev-cb-color-surface': '#FECDD3',
      '--nev-cb-color-text': '#881337',
      '--nev-cb-color-text-secondary': '#9F1239',
      '--nev-cb-color-text-muted': '#FB7185',
      '--nev-cb-color-border': '#FECDD3',
      '--nev-cb-color-error': '#DC2626',
      '--nev-cb-color-success': '#16A34A',
      '--nev-cb-color-badge': '#DC2626',
      '--nev-cb-bubble-bg': '#E11D48',
      '--nev-cb-bubble-icon-color': '#ffffff',
      '--nev-cb-header-bg': '#E11D48',
      '--nev-cb-header-text': '#ffffff',
      '--nev-cb-header-subtitle': 'rgba(255,255,255,0.85)',
      '--nev-cb-msg-user-bg': '#E11D48',
      '--nev-cb-msg-user-color': '#ffffff',
      '--nev-cb-msg-bot-bg': '#FFE4E6',
      '--nev-cb-msg-bot-color': '#881337',
      '--nev-cb-msg-system-color': '#FB7185',
      '--nev-cb-input-bg': '#FFF1F2',
      '--nev-cb-input-color': '#881337',
      '--nev-cb-input-border': '#FECDD3',
      '--nev-cb-input-placeholder': '#FB7185',
      '--nev-cb-input-focus-border': '#E11D48',
      '--nev-cb-send-btn-bg': '#E11D48',
      '--nev-cb-send-btn-color': '#ffffff',
      '--nev-cb-qr-bg': 'transparent',
      '--nev-cb-qr-color': '#E11D48',
      '--nev-cb-qr-border': '#E11D48',
      '--nev-cb-qr-hover-bg': '#E11D48',
      '--nev-cb-qr-hover-color': '#ffffff',
      '--nev-cb-typing-dot-color': '#FB7185',
      '--nev-cb-typing-bg': '#FFE4E6',
      '--nev-cb-loading-bg': 'rgba(255,241,242,0.85)',
      '--nev-cb-shadow-sm': '0 1px 3px rgba(225,29,72,0.12)',
      '--nev-cb-shadow-md': '0 4px 16px rgba(225,29,72,0.15)',
      '--nev-cb-shadow-lg': '0 8px 32px rgba(225,29,72,0.2)',
    },
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
 * overwritten — this allows consumers to override the built-in `light` or `dark`
 * presets with brand-specific versions.
 *
 * @param name   - Identifier for the preset (case-sensitive; used in `setThemePreset`)
 * @param preset - The theme preset definition containing display name and tokens
 *
 * @example
 * ```typescript
 * registerThemePreset('brand', {
 *   name: 'ACME Brand',
 *   tokens: {
 *     '--nev-cb-color-primary': '#FF6B35',
 *     '--nev-cb-color-bg': '#FAFAFA',
 *     // ... other tokens
 *   },
 * });
 *
 * generator.setThemePreset('brand');
 * ```
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
 *
 * @example
 * ```typescript
 * const preset = getThemePreset('midnight');
 * if (preset) {
 *   console.log(preset.tokens['--nev-cb-color-primary']); // '#7C3AED'
 * }
 * ```
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
 *
 * @example
 * ```typescript
 * const names = listThemePresets();
 * // ['light', 'dark', 'midnight', 'ocean', 'sunset', 'forest', 'rose', ...]
 * ```
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
 *
 * @example
 * ```typescript
 * parseHexColor('#6366F1'); // { r: 99, g: 102, b: 241 }
 * parseHexColor('#fff');    // { r: 255, g: 255, b: 255 }
 * ```
 */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '');

  let r: number, g: number, b: number;

  if (clean.length === 3 || clean.length === 4) {
    // Short form: #RGB → #RRGGBB
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
 * @returns `{ h, s, l }` where h ∈ [0, 360), s ∈ [0, 100], l ∈ [0, 100]
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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
    return Math.round(255 * val).toString(16).padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Generates a complete set of chatbot design tokens from a single brand color.
 *
 * Uses HSL manipulation to derive:
 * - Hover variant (slightly darker primary)
 * - Background colors (very light tint of the brand hue)
 * - Surface colors (medium-light tint)
 * - Text colors (very dark shade of the brand hue for legibility)
 * - Border colors (light tint)
 * - Component-level tokens (bubble, header, messages, input, etc.)
 *
 * The algorithm ensures a minimum contrast ratio of ~4.5:1 for text on
 * backgrounds (WCAG 2.1 AA) by driving backgrounds to high-lightness and
 * text to very low-lightness values on the same hue.
 *
 * @param brandColor - Brand color as a hex string (e.g. '#6366F1')
 * @returns Complete record of `--nev-cb-*` CSS custom property values,
 *   or an empty record if `brandColor` cannot be parsed
 *
 * @example
 * ```typescript
 * const tokens = generateThemeFromColor('#6366F1');
 * // tokens['--nev-cb-color-primary'] === '#6366F1'
 * // tokens['--nev-cb-color-bg'] is a very light hue-tinted background
 * ```
 */
export function generateThemeFromColor(brandColor: string): Record<string, string> {
  const rgb = parseHexColor(brandColor);
  if (!rgb) return {};

  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Clamp saturation for generated derivative colors to keep them tasteful
  const sDerived = Math.min(s, 80);

  // Brand primary and its hover (10% darker)
  const primary = brandColor;
  const primaryHover = hslToHex(h, sDerived, Math.max(20, rgbToHsl(rgb.r, rgb.g, rgb.b).l - 10));

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

  return {
    '--nev-cb-color-primary': primary,
    '--nev-cb-color-primary-hover': primaryHover,
    '--nev-cb-color-bg': bg,
    '--nev-cb-color-bg-secondary': bgSecondary,
    '--nev-cb-color-surface': surface,
    '--nev-cb-color-text': text,
    '--nev-cb-color-text-secondary': textSecondary,
    '--nev-cb-color-text-muted': textMuted,
    '--nev-cb-color-border': border,
    '--nev-cb-color-error': '#EF4444',
    '--nev-cb-color-success': '#10B981',
    '--nev-cb-color-badge': '#EF4444',
    '--nev-cb-bubble-bg': primary,
    '--nev-cb-bubble-icon-color': '#ffffff',
    '--nev-cb-header-bg': primary,
    '--nev-cb-header-text': '#ffffff',
    '--nev-cb-header-subtitle': 'rgba(255,255,255,0.8)',
    '--nev-cb-msg-user-bg': primary,
    '--nev-cb-msg-user-color': '#ffffff',
    '--nev-cb-msg-bot-bg': surface,
    '--nev-cb-msg-bot-color': text,
    '--nev-cb-msg-system-color': textMuted,
    '--nev-cb-input-bg': bg,
    '--nev-cb-input-color': text,
    '--nev-cb-input-border': border,
    '--nev-cb-input-placeholder': textMuted,
    '--nev-cb-input-focus-border': primary,
    '--nev-cb-send-btn-bg': primary,
    '--nev-cb-send-btn-color': '#ffffff',
    '--nev-cb-qr-bg': 'transparent',
    '--nev-cb-qr-color': primary,
    '--nev-cb-qr-border': primary,
    '--nev-cb-qr-hover-bg': primary,
    '--nev-cb-qr-hover-color': '#ffffff',
    '--nev-cb-typing-dot-color': textMuted,
    '--nev-cb-typing-bg': surface,
    '--nev-cb-loading-bg': `rgba(255,255,255,0.8)`,
    '--nev-cb-shadow-sm': '0 1px 3px rgba(0,0,0,0.1)',
    '--nev-cb-shadow-md': '0 4px 16px rgba(0,0,0,0.12)',
    '--nev-cb-shadow-lg': '0 8px 32px rgba(0,0,0,0.15)',
  };
}
