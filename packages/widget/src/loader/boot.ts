import { bootLoader } from './index'

// Punto de entrada del build IIFE (vite.loader.config.ts). Sin exports a
// propósito: un entry sin exports no obliga a Rollup a asignar un global de
// retorno en el wrapper IIFE/UMD, que pisaría el stub de cola que este mismo
// arranque instala en window.NeventWidget. Ver vite.loader.config.ts.
//
// Autoarranque cuando se carga como script clásico en una página host.
// document.currentScript solo está definido durante la ejecución síncrona de
// un <script> clásico; en un import ESM (p.ej. bajo Vitest) es null, así que
// esta guarda basta para no auto-arrancar en tests sin depender de globals
// inyectadas por el bundler. Además, ningún test importa este archivo (usan
// bootLoader directamente desde ./index), así que el guard nunca se ejercita
// fuera de un navegador real.
if (typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement) {
  const currentScript = document.currentScript
  const shellUrl = currentScript.getAttribute('data-shell') ?? new URL('./shell.html', currentScript.src).href
  bootLoader(window, { shellUrl })
}
