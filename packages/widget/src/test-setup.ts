// jsdom no implementa window.matchMedia (verificado: jsdom 25.0.1). Se define
// aquí un stub base — devuelve matches:false por defecto ("desktop") — para
// que vi.spyOn(window, 'matchMedia').mockReturnValue(...) pueda envolver una
// función real en los tests que necesitan simular el breakpoint móvil
// (Important #11, ronda 2 de la revisión). Sin este stub, CUALQUIER test que
// ejercite loader/index.ts (que ahora llama matchMedia siempre en boot(),
// no solo cuando el test lo pide) lanza "Cannot spy on undefined" — incluye
// los 7 tests preexistentes de Plan 1 que no mencionan matchMedia en absoluto.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
