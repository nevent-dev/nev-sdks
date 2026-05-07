/**
 * Helpers to map web font file URLs to the CSS `format(...)` hint used in
 * `@font-face` rules. Browsers reject (or silently skip) sources whose
 * declared format does not match the file content, which is what causes
 * NEV-1607 (B3): a `.woff` served with `format('truetype')` makes the rule
 * fail on the client and the widget falls back to the system font.
 *
 * The SDK does not control the file extension a customer uploads, so we
 * detect it at runtime, sort by browser preference, and emit one
 * `url(...) format(...)` per source in a single `@font-face` rule.
 */

const EXTENSION_TO_FORMAT: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
  eot: 'embedded-opentype',
  svg: 'svg',
};

/**
 * Browser preference (modern first). When multiple sources are available
 * for the same font, the browser picks the first one whose format it can
 * decode, so we order them so woff2/woff win over ttf/otf.
 */
const FORMAT_PREFERENCE_RANK: Record<string, number> = {
  woff2: 0,
  woff: 1,
  truetype: 2,
  opentype: 3,
  'embedded-opentype': 4,
  svg: 5,
};

/**
 * Returns the CSS `format(...)` value for a font URL based on its file
 * extension. Returns `null` when the extension cannot be detected — callers
 * should omit the `format()` hint in that case rather than guessing, which
 * lets the browser fall back to content sniffing.
 *
 * Strips query strings and fragments before matching so signed S3 URLs
 * (e.g. `?X-Amz-Signature=…`) don't break detection.
 */
export function detectFontFormat(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url.split('?')[0]?.split('#')[0] ?? '';
  const match = cleaned.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1];
  return ext ? EXTENSION_TO_FORMAT[ext] ?? null : null;
}

export interface FontSource {
  url: string;
  format: string | null;
}

/**
 * Builds the ordered list of `FontSource`s to emit inside the `src:` of an
 * `@font-face` rule. Sources with detectable formats come first, ordered by
 * browser preference (woff2 → woff → ttf → …). Sources whose format we
 * cannot detect come last with `format = null` so the caller can omit the
 * hint and let the browser sniff the content.
 *
 * Deduplicates by URL so a font configured with the same file under several
 * variant keys does not emit the same `url()` twice.
 */
export function buildFontSources(
  files: Record<string, string> | null | undefined
): FontSource[] {
  if (!files) return [];
  const seen = new Set<string>();
  const sources: FontSource[] = [];
  for (const url of Object.values(files)) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, format: detectFontFormat(url) });
  }
  return sources.sort((a, b) => rank(a.format) - rank(b.format));
}

function rank(format: string | null): number {
  if (format == null) return 99; // unknowns last
  const r = FORMAT_PREFERENCE_RANK[format];
  return r == null ? 98 : r;
}

/**
 * Escapes a string for safe inclusion inside a CSS single-quoted string
 * literal. Per CSS Syntax Level 3 §4.3.5 (string token):
 *   - `\` and `'` must be backslash-escaped to keep them literal.
 *   - Newline characters (U+000A LF, U+000C FF, U+000D CR) are explicitly
 *     invalid inside a string literal and produce a bad-string token,
 *     which causes the browser to discard the entire CSS rule. They are
 *     emitted here as `\A `, `\C `, `\D ` (CSS hex escape with trailing
 *     space terminator), the canonical encoding.
 *
 * HTML escaping (`&amp;`, `&#39;`, …) is wrong here because CSS does not
 * interpret HTML entities — the literal `&amp;` would end up in the
 * rendered font-family.
 */
export function cssEscapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\A ')
    .replace(/\r/g, '\\D ')
    .replace(/\f/g, '\\C ');
}

/**
 * Wraps a font-family name in single quotes with the value properly escaped
 * for CSS, so it can be safely interpolated both in `@font-face { font-family: … }`
 * and in `font-family: …` declarations. Use this everywhere a tenant-supplied
 * family name reaches generated CSS — keeps registration and consumption in
 * lockstep so a name like `O'Hara` does not register fine in `@font-face`
 * but break the consumer rule (which would silently fall back to the system
 * stack — same symptom as B3 by another route).
 */
export function cssFontFamilyLiteral(family: string): string {
  return `'${cssEscapeStringLiteral(family)}'`;
}
