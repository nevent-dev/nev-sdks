/**
 * bundle-size.test.ts - Bundle artifact size and completeness checks
 *
 * Verifies that the compiled dist/ artifacts stay within the agreed size
 * budget and that all required files (bundles, maps, type declarations) exist.
 *
 * IMPORTANT: These tests require the build to have run first.
 * Run `npm run build` in the chatbot package before executing this suite:
 *   npm run build && npm run test:perf
 *
 * Size budgets (uncompressed):
 * - ESM bundle  (nevent-chatbot.js)      < 380 KB
 * - UMD bundle  (nevent-chatbot.umd.cjs) < 185 KB
 *
 * Gzip budget:
 * - ESM bundle gzipped                   < 92 KB
 *
 * Artifact completeness:
 * - nevent-chatbot.js.map (source map)
 * - index.d.ts (type declarations)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { statSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';

// ============================================================================
// Paths
// ============================================================================

/**
 * Absolute path to the dist/ directory.
 * Assumes this test file lives at:
 *   packages/chatbot/src/chatbot/__tests__/performance/bundle-size.test.ts
 * and the dist/ folder is at:
 *   packages/chatbot/dist/
 *
 * Path resolution:
 *   performance/ → __tests__/ → chatbot/ → src/ → chatbot (package root) → dist/
 */
const DIST_DIR = resolve(
  __dirname,
  '../../../../dist',
);

// ============================================================================
// Size budgets (bytes)
// ============================================================================

/** ESM bundle uncompressed size limit */
const ESM_UNCOMPRESSED_LIMIT = 380 * 1024; // 380 KB

/** UMD bundle uncompressed size limit */
const UMD_UNCOMPRESSED_LIMIT = 185 * 1024; // 185 KB

/** ESM bundle gzip-compressed size limit */
const ESM_GZIP_LIMIT = 92 * 1024; // 92 KB

// ============================================================================
// Guard: skip the suite when the build is missing
// ============================================================================

const ESM_PATH = resolve(DIST_DIR, 'nevent-chatbot.js');
const UMD_PATH = resolve(DIST_DIR, 'nevent-chatbot.umd.cjs');

/** True when the dist/ artifacts are present */
const distExists = existsSync(ESM_PATH) && existsSync(UMD_PATH);

// ============================================================================
// Suite
// ============================================================================

describe.runIf(distExists)('Bundle Size', () => {

  // --------------------------------------------------------------------------
  // Uncompressed sizes
  // --------------------------------------------------------------------------

  describe('Uncompressed bundle sizes', () => {
    it(`ESM bundle should be < ${ESM_UNCOMPRESSED_LIMIT / 1024}KB uncompressed`, () => {
      const stat = statSync(ESM_PATH);
      const sizeKB = (stat.size / 1024).toFixed(1);

      console.info(`  ESM bundle size: ${sizeKB} KB (limit: ${ESM_UNCOMPRESSED_LIMIT / 1024} KB)`);

      expect(stat.size).toBeLessThan(ESM_UNCOMPRESSED_LIMIT);
    });

    it(`UMD bundle should be < ${UMD_UNCOMPRESSED_LIMIT / 1024}KB uncompressed`, () => {
      const stat = statSync(UMD_PATH);
      const sizeKB = (stat.size / 1024).toFixed(1);

      console.info(`  UMD bundle size: ${sizeKB} KB (limit: ${UMD_UNCOMPRESSED_LIMIT / 1024} KB)`);

      expect(stat.size).toBeLessThan(UMD_UNCOMPRESSED_LIMIT);
    });
  });

  // --------------------------------------------------------------------------
  // Gzip sizes
  // --------------------------------------------------------------------------

  describe('Gzip-compressed bundle sizes', () => {
    it(`ESM bundle should be < ${ESM_GZIP_LIMIT / 1024}KB gzipped`, () => {
      const content = readFileSync(ESM_PATH);
      const compressed = gzipSync(content, { level: 9 });
      const sizeKB = (compressed.length / 1024).toFixed(1);

      console.info(
        `  ESM gzipped size: ${sizeKB} KB (limit: ${ESM_GZIP_LIMIT / 1024} KB)`,
      );

      expect(compressed.length).toBeLessThan(ESM_GZIP_LIMIT);
    });
  });

  // --------------------------------------------------------------------------
  // Artifact completeness
  // --------------------------------------------------------------------------

  describe('Artifact completeness', () => {
    it('ESM source map should exist', () => {
      const mapPath = resolve(DIST_DIR, 'nevent-chatbot.js.map');
      expect(existsSync(mapPath)).toBe(true);
    });

    it('UMD source map should exist', () => {
      const mapPath = resolve(DIST_DIR, 'nevent-chatbot.umd.cjs.map');
      expect(existsSync(mapPath)).toBe(true);
    });

    it('TypeScript type declarations (index.d.ts) should exist', () => {
      const dtsPath = resolve(DIST_DIR, 'index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
    });

    it('ChatbotWidget type declarations should exist', () => {
      const dtsPath = resolve(DIST_DIR, 'chatbot-widget.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
    });

    it('types.d.ts should exist', () => {
      const dtsPath = resolve(DIST_DIR, 'types.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
    });

    it('ESM bundle should export ChatbotWidget', () => {
      // Verify the public API is present in the bundle text
      const content = readFileSync(ESM_PATH, 'utf8');
      expect(content).toContain('ChatbotWidget');
    });

    it('ESM bundle should not contain any obvious debug or test artifacts', () => {
      const content = readFileSync(ESM_PATH, 'utf8');
      // The bundle should not include vitest or test references
      expect(content).not.toContain('__vitest__');
      expect(content).not.toContain('describe(');
    });
  });

  // --------------------------------------------------------------------------
  // Bundle content sanity checks
  // --------------------------------------------------------------------------

  describe('Bundle content sanity', () => {
    it('UMD bundle should export ChatbotWidget in the global namespace style', () => {
      const content = readFileSync(UMD_PATH, 'utf8');
      expect(content).toContain('ChatbotWidget');
    });

    it('type declarations should reference ChatbotConfig interface', () => {
      const dtsPath = resolve(DIST_DIR, 'types.d.ts');
      if (!existsSync(dtsPath)) return; // guard

      const content = readFileSync(dtsPath, 'utf8');
      expect(content).toContain('ChatbotConfig');
    });
  });
});

// ============================================================================
// Informational: skip message when dist is absent
// ============================================================================

describe.skipIf(distExists)('Bundle Size (skipped — dist not built)', () => {
  it('skipped: run `npm run build` in the chatbot package first', () => {
    console.warn(
      '[bundle-size] dist/ artifacts not found. Run `npm run build` before running this suite.',
    );
    // This test intentionally passes — it is just informational.
    expect(true).toBe(true);
  });
});
