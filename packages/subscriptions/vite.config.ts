import { resolve } from 'path';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

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
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'nevent-subscriptions.css';
          }
          return assetInfo.name ?? 'asset';
        },
        // Enable mangling and tree-shaking optimizations
        manualChunks: undefined,
      },
      // Enable tree-shaking
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
      },
      plugins: [
        // Bundle analyzer - run with ANALYZE=true npm run build
        process.env.ANALYZE ? visualizer({
          filename: './dist/stats.html',
          open: true,
          gzipSize: true,
          brotliSize: true,
        }) : undefined,
      ].filter(Boolean),
    },
  },
  resolve: {
    alias: {
      '@nevent/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['libphonenumber-js'],
  },
});
