import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    css: { include: [/\/panel\//] },
    setupFiles: ['./src/test-setup.ts'],
    // MessageBubble.test.tsx fixea timestamps ISO en UTC y compara la hora
    // formateada por wall-clock (toLocaleTimeString) contra un valor literal
    // — sin pinar TZ el resultado depende de la zona horaria de quien corre
    // el test (falla en CEST/UTC+2, pasa en CI si esta corre en UTC).
    env: { TZ: 'UTC' },
  },
})
