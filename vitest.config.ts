import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@nevent/core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        '**/types.ts',
        'examples/',
      ],
      thresholds: {
        lines: 5,
        functions: 40,
        branches: 70,
        statements: 5,
      },
    },
    include: ['packages/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
  },
});
