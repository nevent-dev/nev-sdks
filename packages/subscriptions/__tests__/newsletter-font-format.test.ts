/**
 * Tests for the font format detection helpers used by `injectCustomFont`.
 * Repro for NEV-1607 (B3): browsers reject `@font-face` sources whose
 * declared format does not match the file content, so an SDK that emits
 * `format('truetype')` for a `.woff` upload silently breaks the customer's
 * widget. These helpers ensure the SDK emits the right hint per file or
 * omits it when unknown.
 */
import { describe, it, expect } from 'vitest';
import {
  detectFontFormat,
  buildFontSources,
  cssEscapeStringLiteral,
} from '../src/newsletter/font-format';

describe('detectFontFormat (NEV-1607 B3)', () => {
  it('maps known extensions to the matching CSS format hint', () => {
    expect(detectFontFormat('https://x/y/z.woff2')).toBe('woff2');
    expect(detectFontFormat('https://x/y/z.woff')).toBe('woff');
    expect(detectFontFormat('https://x/y/z.ttf')).toBe('truetype');
    expect(detectFontFormat('https://x/y/z.otf')).toBe('opentype');
    expect(detectFontFormat('https://x/y/z.eot')).toBe('embedded-opentype');
    expect(detectFontFormat('https://x/y/z.svg')).toBe('svg');
  });

  it('strips query strings (e.g. signed S3 URLs)', () => {
    expect(
      detectFontFormat('https://s3.amazonaws.com/x.woff?X-Amz-Signature=abc')
    ).toBe('woff');
  });

  it('strips fragments', () => {
    expect(detectFontFormat('https://x/y/z.woff#metadata')).toBe('woff');
  });

  it('is case-insensitive on extensions', () => {
    expect(detectFontFormat('https://x/y/z.WOFF2')).toBe('woff2');
    expect(detectFontFormat('https://x/y/z.TtF')).toBe('truetype');
  });

  it('returns null for unknown or missing extensions (caller should omit format hint)', () => {
    expect(detectFontFormat('https://x/y/font')).toBeNull();
    expect(detectFontFormat('https://x/y/font.unknownext')).toBeNull();
    expect(detectFontFormat('')).toBeNull();
    expect(detectFontFormat(null)).toBeNull();
    expect(detectFontFormat(undefined)).toBeNull();
  });
});

describe('buildFontSources (NEV-1607 B3)', () => {
  it('repro BIGSOUND: a single .woff file produces format("woff"), not "truetype"', () => {
    const sources = buildFontSources({
      regular:
        'https://prd-nevent-public.s3.eu-west-1.amazonaws.com/fonts/68383f4e/2026/04/hostgrotesk-regular-20260424.woff',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.format).toBe('woff');
  });

  it('orders by browser preference: woff2 → woff → ttf', () => {
    const sources = buildFontSources({
      truetype: 'https://x/font.ttf',
      woff: 'https://x/font.woff',
      woff2: 'https://x/font.woff2',
    });
    expect(sources.map((s) => s.format)).toEqual(['woff2', 'woff', 'truetype']);
  });

  it('places sources without detectable format at the end', () => {
    const sources = buildFontSources({
      good: 'https://x/font.woff',
      mystery: 'https://x/font',
    });
    expect(sources.map((s) => s.format)).toEqual(['woff', null]);
  });

  it('deduplicates identical URLs even when they appear under multiple variant keys', () => {
    const url = 'https://x/font.woff';
    const sources = buildFontSources({ regular: url, latin: url });
    expect(sources).toHaveLength(1);
  });

  it('returns [] for null/undefined/empty', () => {
    expect(buildFontSources(null)).toEqual([]);
    expect(buildFontSources(undefined)).toEqual([]);
    expect(buildFontSources({})).toEqual([]);
  });

  it('skips empty URLs in the files map', () => {
    const sources = buildFontSources({
      regular: 'https://x/font.woff',
      bold: '',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe('https://x/font.woff');
  });
});

describe('cssEscapeStringLiteral (NEV-1607 B3)', () => {
  it('does not html-escape & or other entity-relevant chars (the previous bug)', () => {
    expect(cssEscapeStringLiteral('Roboto & Co')).toBe('Roboto & Co');
  });

  it('escapes single quotes for use inside a single-quoted CSS string', () => {
    expect(cssEscapeStringLiteral("O'Hara")).toBe("O\\'Hara");
  });

  it('escapes backslashes', () => {
    expect(cssEscapeStringLiteral('a\\b')).toBe('a\\\\b');
  });

  it('does not touch characters that are safe in a CSS single-quoted string', () => {
    expect(cssEscapeStringLiteral('Inter-Bold_v1 (regular)')).toBe(
      'Inter-Bold_v1 (regular)'
    );
  });
});
