/**
 * Vitest configuration for cross-package integration tests.
 *
 * This config resolves @nevent/* imports to package source files (not dist)
 * for easier debugging and faster feedback during development.
 */

import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@nevent/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@nevent/subscriptions/src': resolve(
        __dirname,
        'packages/subscriptions/src',
      ),
      '@nevent/subscriptions': resolve(
        __dirname,
        'packages/subscriptions/src/index.ts',
      ),
      '@nevent/chatbot/src': resolve(__dirname, 'packages/chatbot/src'),
      '@nevent/chatbot': resolve(
        __dirname,
        'packages/chatbot/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/integration/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 15000,
  },
});
