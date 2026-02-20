#!/usr/bin/env node

/**
 * SRI Hash Generator for Nevent SDK CDN Distribution
 *
 * Generates Subresource Integrity (SRI) hashes for all distributable bundles
 * across @nevent/core, @nevent/subscriptions, and @nevent/chatbot packages.
 *
 * SRI enables browsers to verify that resources they fetch (e.g. from a CDN)
 * are delivered without unexpected manipulation. See:
 * https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity
 *
 * Algorithm: SHA-384 — the W3C-recommended algorithm for SRI hashes.
 *
 * Output per package dist/:
 *   - sri-hashes.json  Machine-readable hash map with metadata
 *   - sri-hashes.txt   Human-readable HTML snippets for copy-paste integration
 *
 * Usage:
 *   node scripts/generate-sri.js
 *   npm run sri
 *
 * @module generate-sri
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * SHA algorithm to use for SRI hash generation.
 * SHA-384 is the W3C recommendation — longer than SHA-256 and supported by
 * all modern browsers, while being faster than SHA-512.
 *
 * @constant {string}
 */
const SRI_ALGORITHM = 'sha384';

/**
 * File extensions that are distributed via CDN and require SRI hashes.
 * TypeScript declaration files (.d.ts) and source maps are excluded because
 * they are not loaded by the browser as subresources.
 *
 * @constant {string[]}
 */
const DISTRIBUTABLE_EXTENSIONS = ['.js', '.cjs', '.css'];

/**
 * CDN base URL for production. Used when generating HTML snippet examples
 * in the human-readable output file.
 *
 * @constant {string}
 */
const CDN_BASE_URL = 'https://neventapps.com';

/**
 * Package configurations — maps each package to its display name and CDN path.
 * The dist directory path is resolved relative to the monorepo root.
 *
 * @constant {Array<{name: string, packageName: string, distDir: string, cdnPath: string}>}
 */
const PACKAGES = [
  {
    /** Human-readable SDK name used in output files. */
    name: '@nevent/core',
    /** npm package name, derived from package.json. */
    packageName: 'core',
    /** Absolute path to the built dist/ directory. */
    distDir: path.resolve(__dirname, '../packages/core/dist'),
    /** CDN path segment used in example HTML snippets. */
    cdnPath: 'core',
  },
  {
    name: '@nevent/subscriptions',
    packageName: 'subscriptions',
    distDir: path.resolve(__dirname, '../packages/subscriptions/dist'),
    cdnPath: 'subs',
  },
  {
    name: '@nevent/chatbot',
    packageName: 'chatbot',
    distDir: path.resolve(__dirname, '../packages/chatbot/dist'),
    cdnPath: 'chatbot',
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Recursively collects all file paths inside a directory that match the
 * distributable extensions whitelist. Traverses nested subdirectories so
 * that packages which emit sub-folder output (e.g. core/analytics/) are
 * covered.
 *
 * @param {string} dir - Absolute path to the directory to scan.
 * @param {string} [baseDir=dir] - Root directory used to compute relative
 *   paths in the output. Defaults to `dir` on the initial call.
 * @returns {string[]} Sorted array of absolute file paths.
 */
function collectDistributableFiles(dir, baseDir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const resolvedBase = baseDir || dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into sub-directories (e.g. packages/core/dist/analytics/)
      const nested = collectDistributableFiles(fullPath, resolvedBase);
      files.push(...nested);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (DISTRIBUTABLE_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

/**
 * Computes the SRI hash for a single file using the configured algorithm.
 *
 * The resulting string follows the SRI format:
 *   <algorithm>-<base64-encoded-digest>
 *
 * Example: sha384-abc123def456...
 *
 * @param {string} filePath - Absolute path to the file to hash.
 * @returns {string} The SRI hash string ready for use in an integrity attribute.
 * @throws {Error} If the file cannot be read.
 */
function computeSriHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash(SRI_ALGORITHM);
  hash.update(fileBuffer);
  const digest = hash.digest('base64');
  return `${SRI_ALGORITHM}-${digest}`;
}

/**
 * Determines the appropriate HTML tag for a given file based on its extension.
 * JavaScript files get a <script> tag, CSS files get a <link> tag.
 *
 * @param {string} filename - The filename (with extension) to inspect.
 * @param {string} cdnUrl - The full CDN URL pointing to this file.
 * @param {string} sriHash - The precomputed SRI integrity hash string.
 * @returns {string} An HTML tag string with integrity and crossorigin attributes.
 */
function buildHtmlSnippet(filename, cdnUrl, sriHash) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.css') {
    return (
      `<link rel="stylesheet" href="${cdnUrl}"\n` +
      `      integrity="${sriHash}"\n` +
      `      crossorigin="anonymous">`
    );
  }

  // .js and .cjs are loaded as scripts
  return (
    `<script src="${cdnUrl}"\n` +
    `        integrity="${sriHash}"\n` +
    `        crossorigin="anonymous"></script>`
  );
}

// ── Core Processing ───────────────────────────────────────────────────────────

/**
 * Processes a single package: discovers distributable files, computes SRI
 * hashes, writes sri-hashes.json and sri-hashes.txt into its dist/ directory.
 *
 * @param {{name: string, packageName: string, distDir: string, cdnPath: string}} pkg
 *   Package configuration object.
 * @returns {{packageName: string, fileCount: number, skipped: boolean}}
 *   Processing result summary for the caller to report.
 */
function processPackage(pkg) {
  const { name, distDir, cdnPath } = pkg;

  console.log(`\nProcessing ${name}...`);

  if (!fs.existsSync(distDir)) {
    console.warn(
      `  [WARN] dist/ not found at ${distDir} — run "npm run build" first.`
    );
    return { packageName: name, fileCount: 0, skipped: true };
  }

  const files = collectDistributableFiles(distDir);

  if (files.length === 0) {
    console.warn(
      `  [WARN] No distributable files found in ${distDir}. Skipping.`
    );
    return { packageName: name, fileCount: 0, skipped: true };
  }

  // ── Compute hashes ──────────────────────────────────────────────────────────

  /**
   * Map of relative filename → SRI hash string.
   * Keys are relative to distDir so they are portable across environments.
   *
   * @type {Record<string, string>}
   */
  const hashMap = {};

  for (const filePath of files) {
    const relativeName = path.relative(distDir, filePath);
    const sriHash = computeSriHash(filePath);
    hashMap[relativeName] = sriHash;
    console.log(`  + ${relativeName}`);
  }

  const generatedAt = new Date().toISOString();

  // ── Write sri-hashes.json ───────────────────────────────────────────────────

  /**
   * JSON output structure.
   *
   * @type {{files: Record<string, string>, generated: string}}
   */
  const jsonOutput = {
    files: hashMap,
    generated: generatedAt,
  };

  const jsonOutputPath = path.join(distDir, 'sri-hashes.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonOutput, null, 2) + '\n', 'utf8');
  console.log(`  -> Written: sri-hashes.json`);

  // ── Write sri-hashes.txt ────────────────────────────────────────────────────

  const txtLines = [
    `# SRI Hashes for ${name}`,
    `# Generated: ${generatedAt}`,
    `# Algorithm: ${SRI_ALGORITHM}`,
    `#`,
    `# Copy the snippet for the format you need and replace VERSION with the`,
    `# actual package version number (e.g. 2.1.1).`,
    `#`,
    `# IMPORTANT: Versioned CDN URLs are immutable. Always use a versioned URL`,
    `# in production (never /latest/) to guarantee SRI validation succeeds.`,
    `# The /latest/ alias is updated on every release and the SRI hash will`,
    `# change, causing integrity checks to fail for cached HTML documents.`,
    '',
  ];

  for (const [relativeName, sriHash] of Object.entries(hashMap)) {
    // Build the full CDN URL for the example snippet.
    // Using a VERSION placeholder because the script runs before the version
    // is embedded in the S3 path by the CI/CD workflow.
    const cdnUrl = `${CDN_BASE_URL}/${cdnPath}/vVERSION/${relativeName}`;

    txtLines.push(`# ${relativeName}`);
    txtLines.push(buildHtmlSnippet(relativeName, cdnUrl, sriHash));
    txtLines.push('');
  }

  const txtOutputPath = path.join(distDir, 'sri-hashes.txt');
  fs.writeFileSync(txtOutputPath, txtLines.join('\n'), 'utf8');
  console.log(`  -> Written: sri-hashes.txt`);

  return { packageName: name, fileCount: files.length, skipped: false };
}

// ── Entry Point ───────────────────────────────────────────────────────────────

/**
 * Main function — iterates over all configured packages and generates SRI
 * output files for each. Prints a summary table at the end.
 *
 * Exit codes:
 *   0 — All packages processed (even if some were skipped due to missing dist/).
 *   1 — An unexpected error occurred during processing.
 */
function main() {
  console.log('=== SRI Hash Generator for Nevent SDKs ===');
  console.log(`Algorithm : ${SRI_ALGORITHM}`);
  console.log(`Packages  : ${PACKAGES.map((p) => p.name).join(', ')}`);

  const results = [];

  for (const pkg of PACKAGES) {
    try {
      const result = processPackage(pkg);
      results.push(result);
    } catch (err) {
      console.error(`\n[ERROR] Failed to process ${pkg.name}:`, err.message);
      process.exit(1);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log('\n=== Summary ===');

  for (const result of results) {
    if (result.skipped) {
      console.log(`  ${result.packageName}: SKIPPED (no dist/ found)`);
    } else {
      console.log(
        `  ${result.packageName}: ${result.fileCount} file(s) hashed`
      );
    }
  }

  const processed = results.filter((r) => !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  console.log(`\nDone. ${processed} package(s) processed, ${skipped} skipped.`);

  if (processed === 0) {
    console.warn(
      '\n[WARN] No packages were processed. Build the packages first:\n' +
        '  npm run build\n'
    );
  }
}

main();
