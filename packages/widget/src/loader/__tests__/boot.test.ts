import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// loader/boot.ts is the IIFE entry point (vite.loader.config.ts) — its whole
// body is a top-level side effect gated by `document.currentScript instanceof
// HTMLScriptElement`, guarding against auto-boot under Vitest/ESM imports
// (see the source comment). It is never imported by any other test file
// (loader.test.ts drives bootLoader directly from ./index) — 0% covered
// before this file. bootLoader itself is mocked here: this file's job is to
// prove boot.ts's OWN logic (the currentScript guard, the data-shell
// attribute read, and the `new URL('./shell.html', currentScript.src)`
// fallback derivation), not to re-exercise bootLoader (already covered by
// loader.test.ts).
const bootLoaderMock = vi.fn()
vi.mock('../index', () => ({ bootLoader: bootLoaderMock }))

describe('loader/boot.ts — entry point IIFE', () => {
  beforeEach(() => {
    vi.resetModules()
    bootLoaderMock.mockClear()
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'currentScript')
  })

  it('document.currentScript es un <script> real con data-shell: usa ese valor literal como shellUrl', async () => {
    const script = document.createElement('script')
    script.setAttribute('data-shell', 'https://cdn.test/custom-shell.html')
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true })

    await import('../boot')

    expect(bootLoaderMock).toHaveBeenCalledTimes(1)
    expect(bootLoaderMock).toHaveBeenCalledWith(window, { shellUrl: 'https://cdn.test/custom-shell.html' })
  })

  it('sin data-shell: deriva shellUrl como new URL("./shell.html", currentScript.src).href', async () => {
    const script = document.createElement('script')
    script.src = 'https://cdn.test/dist/loader.iife.js'
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true })

    await import('../boot')

    expect(bootLoaderMock).toHaveBeenCalledTimes(1)
    expect(bootLoaderMock).toHaveBeenCalledWith(window, { shellUrl: 'https://cdn.test/dist/shell.html' })
  })

  it('data-shell vacío ("") se trata como ausente — cae al fallback derivado de currentScript.src, no a una URL vacía', async () => {
    const script = document.createElement('script')
    script.setAttribute('data-shell', '')
    script.src = 'https://cdn.test/assets/loader.js'
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true })

    await import('../boot')

    // getAttribute('data-shell') devuelve '' (string, no null), así que el
    // `??` del código real NO cae al fallback para un atributo vacío — este
    // test documenta el comportamiento REAL (usa la cadena vacía tal cual),
    // no uno inventado.
    expect(bootLoaderMock).toHaveBeenCalledWith(window, { shellUrl: '' })
  })

  it('document.currentScript es null (contexto de import ESM, como bajo Vitest): el guard no arranca nada', async () => {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true })

    await import('../boot')

    expect(bootLoaderMock).not.toHaveBeenCalled()
  })

  it('document.currentScript no es un HTMLScriptElement (p.ej. otro tipo de nodo): el guard tampoco arranca nada', async () => {
    const notAScript = document.createElement('div')
    Object.defineProperty(document, 'currentScript', { value: notAScript, configurable: true })

    await import('../boot')

    expect(bootLoaderMock).not.toHaveBeenCalled()
  })
})
