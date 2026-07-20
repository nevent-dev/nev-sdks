import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

// Build del shell (ES module, servido dentro del iframe sandboxed vía
// <script type="module">). El loader tiene su propio build IIFE separado en
// vite.loader.config.ts: no pueden compartir esta config porque Rollup fija
// un único output.format por invocación y el loader necesita ejecutarse como
// <script> clásico con auto-arranque (ver ese archivo para el porqué).
export default defineConfig({
  plugins: [preact()],
  // base relativa: shell.html se sirve montado en distintas rutas según el
  // entorno (p.ej. examples/ lo sirve bajo /dist/shell.html, no en la raíz).
  // Con el base:'/' por defecto de Vite, el <script type="module"> emitido
  // apunta a /assets/... absoluto y 404 en cualquier despliegue que no monte
  // dist/ en la raíz del origin.
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        shell: resolve(__dirname, 'shell.html'),
      },
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        format: 'es',
      },
    },
  },
})
