import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NeventSubscriptions',
      formats: ['es', 'umd'],
      fileName: (format) =>
        format === 'es'
          ? 'nevent-subscriptions.js'
          : 'nevent-subscriptions.umd.cjs',
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      // Bundle @nevent/core into the output (don't externalize)
      external: [],
      output: {
        globals: {},
        compact: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'nevent-subscriptions.css';
          }
          return assetInfo.name ?? 'asset';
        },
      },
    },
  },
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
    legalComments: 'none',
    treeShaking: true,
  },
  resolve: {
    alias: {
      '@nevent/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
