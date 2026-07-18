import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Build dedicado del loader: IIFE que se auto-ejecuta como <script> clásico
// en la página anfitriona (host-demo.html hace `<script async src=".../loader.js">`
// y confía en document.currentScript para el auto-arranque). No puede vivir en
// vite.config.ts porque ese archivo compila shell.html como ES module y Rollup
// solo admite un output.format por invocación de build.
//
// El entry (src/loader/boot.ts) no tiene exports a propósito: con exports,
// Rollup exige output.name para IIFE/UMD y genera `var NeventWidget = (fn)(...)`
// al final del bundle, que PISARÍA el stub de cola que el propio loader instala
// en window.NeventWidget durante su ejecución. Sin exports, Rollup emite un
// IIFE puro `(function(){ ...cuerpo... })();` sin ninguna asignación global
// propia — el loader sigue teniendo control total de window.NeventWidget.
//
// emptyOutDir:false porque este build corre después del build del shell
// (vite.config.ts) y no debe borrar dist/shell.html ni sus assets.
export default defineConfig({
  build: {
    target: 'es2022',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/loader/boot.ts'),
      output: {
        format: 'iife',
        exports: 'none',
        entryFileNames: 'loader.js',
        inlineDynamicImports: true,
      },
    },
  },
})
