import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        loader: resolve(__dirname, 'src/loader/index.ts'),
        shell: resolve(__dirname, 'shell.html'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'loader' ? 'loader.js' : 'assets/[name].[hash].js'),
        format: 'es',
      },
    },
  },
})
