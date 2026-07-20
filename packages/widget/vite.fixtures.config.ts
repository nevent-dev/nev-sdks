import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

// Config dedicada al harness de fixtures (Task 16) — SOLO para `npm run
// fixtures` en local, nunca se ejecuta en CI ni se publica. Separada de
// vite.config.ts para que este HTML jamás acabe en dist/.
export default defineConfig({
  plugins: [preact()],
  root: resolve(__dirname, 'examples'),
  server: { port: 4311 },
})
