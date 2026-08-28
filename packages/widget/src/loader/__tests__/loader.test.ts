import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bootLoader } from '../index'
import { seal } from '../../protocol/envelope'
import type { ApiStub } from '../api-queue'

const SHELL_URL = 'https://widgets.test/shell.html'
const SHELL_ORIGIN = 'https://widgets.test'

function getApi(): ApiStub {
  return (window as Window & { NeventWidget?: ApiStub }).NeventWidget!
}

function fakeShellMessage(type: string, payload: unknown, instanceId: string, origin = SHELL_ORIGIN): void {
  const iframe = document.querySelector('iframe')!
  const ev = new MessageEvent('message', { data: seal(type, payload, instanceId), origin, source: iframe.contentWindow })
  window.dispatchEvent(ev)
}

function bootedInstanceId(): string {
  const iframe = document.querySelector('iframe')!
  return new URL(iframe.src).hash.slice(1)
}

beforeEach(() => {
  document.body.innerHTML = ''
  delete (window as Window & { NeventWidget?: ApiStub }).NeventWidget
})

// jsdom crea un browsing context real por cada <iframe> arrancado con boot();
// sin destroy() estas instancias se acumulan durante el archivo y confunden
// el teardown del entorno jsdom de Vitest (window[i].close is not a function).
afterEach(() => {
  ;(window as Window & { NeventWidget?: ApiStub }).NeventWidget?.('destroy')
})

// jsdom no define window.visualViewport en absoluto (a diferencia de
// matchMedia, que SÍ existe como función stub) — vi.spyOn(window,
// 'visualViewport', 'get') fallaría porque no hay ningún accessor previo que
// espiar. Se instala con Object.defineProperty, igual que ya hace este mismo
// archivo con iframe.contentWindow, y se retira con Reflect.deleteProperty.
function makeFakeVisualViewport(initial: Partial<{ offsetTop: number; offsetLeft: number; width: number; height: number }> = {}) {
  const handlers: Record<'resize' | 'scroll', Set<() => void>> = { resize: new Set(), scroll: new Set() }
  const addEventListener = vi.fn((type: string, cb: () => void) => { handlers[type as 'resize' | 'scroll']?.add(cb) })
  const removeEventListener = vi.fn((type: string, cb: () => void) => { handlers[type as 'resize' | 'scroll']?.delete(cb) })
  const vv = {
    offsetTop: initial.offsetTop ?? 0, offsetLeft: initial.offsetLeft ?? 0,
    width: initial.width ?? 400, height: initial.height ?? 800,
    addEventListener, removeEventListener,
  }
  return {
    vv: vv as unknown as VisualViewport,
    removeEventListener,
    // noUncheckedIndexedAccess (Tech Stack): handlers[type] tipa como
    // Set<...> | undefined pese a que Record garantiza la clave — el
    // optional chaining es obligatorio para compilar, no solo defensivo.
    trigger: (type: 'resize' | 'scroll') => handlers[type]?.forEach((h) => h()),
  }
}

describe('loader', () => {
  it('boot crea un único iframe sandboxed aunque se llame dos veces', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('boot', 'inst_demo_festival_01')
    const iframes = document.querySelectorAll('iframe')
    expect(iframes).toHaveLength(1)
    expect(iframes[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox')
    expect(iframes[0]!.src.startsWith(SHELL_URL)).toBe(true)
  })
  it('responde al ready del shell con init{installationId} hacia el origin exacto', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    // 2 llamadas desde rev.4: init seguido de viewport{kind,height} (ver
    // Step 3 "el nuevo protocolo — envía viewport{kind,height} justo tras
    // el init") — este test solo valida la forma del mensaje init, primero
    // en llegar.
    expect(post).toHaveBeenCalledTimes(2)
    const [env, target] = post.mock.calls[0]!
    expect(target).toBe(SHELL_ORIGIN)
    expect(env).toMatchObject({ ns: 'nevw', type: 'init', payload: { installationId: 'inst_demo_festival_01' } })
  })
  it('ignora mensajes de un origin no esperado', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId(), 'https://evil.example')
    expect(post).not.toHaveBeenCalled()
  })
  it('reemite opened a los listeners de on() y destroy limpia el DOM', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    const cb = vi.fn()
    getApi()('on', 'opened', cb)
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(cb).toHaveBeenCalledTimes(1)
    getApi()('destroy')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
  it('identify y reset son no-op con warning (reservados v1.1)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('identify', 'token-firmado')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('identify'))
    warn.mockRestore()
  })
  it('boot(installationId, opts) reenvía opts al shell en el init', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01', { foo: 1 })
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    // 2 llamadas desde rev.4: init seguido de viewport{kind,height} (ver
    // Step 3 "el nuevo protocolo — envía viewport{kind,height} justo tras
    // el init") — este test solo valida que opts viaja en el init, primero
    // en llegar.
    expect(post).toHaveBeenCalledTimes(2)
    const [env] = post.mock.calls[0]!
    expect(env).toMatchObject({
      ns: 'nevw',
      type: 'init',
      payload: { installationId: 'inst_demo_festival_01', opts: { foo: 1 } },
    })
  })
  it('on() sin callback no registra nada ni lanza al recibir el evento', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    expect(() => getApi()('on', 'opened')).not.toThrow()
    expect(() => fakeShellMessage('opened', null, bootedInstanceId())).not.toThrow()
  })

  it("'off' quita un listener ya registrado — un evento posterior YA NO lo invoca (guarda contra fuga de listener)", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    const cb = vi.fn()
    getApi()('on', 'opened', cb)
    getApi()('off', 'opened', cb)
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(cb).not.toHaveBeenCalled()
  })

  it("'off' no afecta a OTRO callback registrado en el mismo evento — solo se quita el suyo", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    const cbA = vi.fn()
    const cbB = vi.fn()
    getApi()('on', 'opened', cbA)
    getApi()('on', 'opened', cbB)
    getApi()('off', 'opened', cbA)
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(cbA).not.toHaveBeenCalled()
    expect(cbB).toHaveBeenCalledTimes(1)
  })

  it("'off' de un callback nunca registrado (o antes de boot()) no lanza — no-op seguro", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    expect(() => getApi()('off', 'opened', vi.fn())).not.toThrow() // sin instance (antes de boot)
    getApi()('boot', 'inst_demo_festival_01')
    expect(() => getApi()('off', 'opened', vi.fn())).not.toThrow() // callback nunca registrado
  })

  it("'update' reenvía args[0] al shell vía sendToShell('update', ...)", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    getApi()('update', { theme: { primaryColor: '#112233' } })
    expect(post).toHaveBeenCalledTimes(1)
    const [env, target] = post.mock.calls[0]!
    expect(target).toBe(SHELL_ORIGIN)
    expect(env).toMatchObject({ ns: 'nevw', type: 'update', payload: { theme: { primaryColor: '#112233' } } })
  })

  it("'update' sin payload reenvía null (args[0] ?? null), no undefined", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    getApi()('update')
    expect(post).toHaveBeenCalledTimes(1)
    const [env] = post.mock.calls[0]!
    expect(env).toMatchObject({ type: 'update', payload: null })
  })

  it("'consent' reenvía al shell con payload null — igual que open/close/toggle", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    getApi()('consent')
    expect(post).toHaveBeenCalledTimes(1)
    const [env, target] = post.mock.calls[0]!
    expect(target).toBe(SHELL_ORIGIN)
    expect(env).toMatchObject({ ns: 'nevw', type: 'consent', payload: null })
  })

  it("'update'/'consent' antes de boot() no lanzan — sin instance, sendToShell es un no-op silencioso", () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    expect(() => getApi()('update', { foo: 1 })).not.toThrow()
    expect(() => getApi()('consent')).not.toThrow()
  })

  it('boot: arranca en modo launcher, anclado a la derecha, con el tamaño INICIAL por defecto del launcher (antes de cualquier medición real)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const container = document.querySelector('iframe')!.parentElement as HTMLElement
    expect(container.style.right).toBe('0px')
    expect(container.style.left).toBe('')
    expect(container.style.width).toBe('104px') // 56px launcher + 24px de aire por lado — solo el valor INICIAL, ver launcherSize más abajo
  })

  it('Critical (DEFAULT_PANEL_SIZE) — opened SIN ningún resize previo aplica el tamaño desktop por defecto (430×688), nunca 104×104 (cierra el salto visible de la ronda 3)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
  })

  it('Critical (desktopPanelSize, orden opened→resize) — un resize del shell (desktop) tras opened redimensiona el CONTENEDOR y el iframe juntos, con números realistas incl. el padding (430×688, no 382×640)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId()) // el panel está abierto: modo panel
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
    expect(iframe.style.width).toBe('100%') // el iframe SIEMPRE rellena al contenedor, nunca lleva su propio px
    expect(iframe.style.height).toBe('100%')
  })

  it('resize incluye position: ancla el contenedor a la izquierda si el theme lo pide', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('resize', { width: 104, height: 104, position: 'left' }, bootedInstanceId())
    expect(container.style.left).toBe('0px')
    expect(container.style.right).toBe('')
  })

  it('Critical (desktopPanelSize) — cerrar el panel (closed) vuelve SIEMPRE al tamaño del launcher, nunca al desktopPanelSize', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())
    expect(container.style.width).toBe('104px')
    expect(container.style.height).toBe('104px')
  })

  it('Critical (orden resize→opened) — un resize recibido EN MODO LAUNCHER nunca se promociona a desktopPanelSize; opened aplica DEFAULT_PANEL_SIZE, no el resize que quedó atrás', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    // resize ANTES de 'opened' (p.ej. el efecto hijo de Panel corre antes que
    // el padre de App, ronda 3): el modo sigue siendo launcher, así que se
    // guarda como launcherSize (ver test dedicado más abajo) y se aplica de
    // inmediato al contenedor.
    fakeShellMessage('resize', { width: 96, height: 96, position: 'right' }, bootedInstanceId())
    expect(container.style.width).toBe('96px')
    fakeShellMessage('opened', null, bootedInstanceId())
    // Sin un resize NUEVO recibido YA en modo panel, desktopPanelSize sigue
    // null: el bug de la ronda 3 aplicaba aquí 104×104 (un salto visible);
    // ahora aplica el tamaño desktop por defecto, nunca el resize de launcher
    // que quedó atrás.
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')
  })

  it('Critical (cruce desktop↔móvil con el panel abierto) — un resize con viewportKind:"mobile" NUNCA contamina desktopPanelSize; al volver a desktop se recupera el tamaño original', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    expect(container.style.width).toBe('430px') // desktopPanelSize fijado

    // Cruce a móvil A MITAD DE SESIÓN, con el panel TODAVÍA abierto: el
    // propio Panel (Task 13) reporta su tamaño fullscreen vía resize; ese
    // resize NUNCA debe sobrescribir desktopPanelSize (bug "lastSize" de la
    // ronda 2, ahora a prueba de cruces, Critical ronda 3).
    mql.matches = true
    changeHandler!()
    expect(container.style.inset).toBe('0px') // fullscreen móvil (sin VisualViewport mockeado aquí — ver el test dedicado de geometría real más abajo)
    fakeShellMessage('resize', { width: 400, height: 780, position: 'right', viewportKind: 'mobile' }, bootedInstanceId())

    // Vuelta a desktop: el panel sigue abierto, sin ningún resize desktop
    // nuevo — debe recuperar el desktopPanelSize ORIGINAL (430×688), no los
    // 400×780 móviles.
    mql.matches = false
    changeHandler!()
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')

    matchMedia.mockRestore()
  })

  it('Critical (reapertura desktop tras sesión móvil) — cerrar tras una sesión fullscreen en móvil y reabrir ya en desktop aplica DEFAULT_PANEL_SIZE, nunca la geometría fullscreen residual', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: true, media: '(max-width: 480px)', // arranca en móvil
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId()) // fullscreen móvil, desktopPanelSize nunca se fija
    fakeShellMessage('resize', { width: 400, height: 780, position: 'right', viewportKind: 'mobile' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())

    mql.matches = false
    changeHandler!() // el host cambia a desktop con el panel YA cerrado
    fakeShellMessage('opened', null, bootedInstanceId()) // reapertura en desktop

    // desktopPanelSize nunca se fijó (la única sesión previa fue móvil): debe
    // aplicar DEFAULT_PANEL_SIZE, no los 400×780 móviles (filtrados por
    // viewportKind, nunca llegaron a guardarse ahí) ni un 104×104 residual.
    expect(container.style.width).toBe('430px')
    expect(container.style.height).toBe('688px')

    matchMedia.mockRestore()
  })

  it('Critical (mobile) — en viewport móvil, boot arranca en modo launcher SIN pantalla completa (el launcher cerrado nunca secuestra la página anfitriona)', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const container = document.querySelector('iframe')!.parentElement as HTMLElement
    expect(container.style.width).toBe('104px')
    expect(container.style.inset).not.toBe('0px')
    matchMedia.mockRestore()
  })

  it('Critical (VisualViewport real) — con el panel abierto, el CONTENEDOR cubre el layout viewport completo (backplate) y el IFRAME sigue la caja REAL del VisualViewport (offsetTop/offsetLeft/width/height)', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    // Simula el teclado abierto: el visual viewport es más bajo y está
    // desplazado hacia abajo respecto al viewport de layout.
    const { vv } = makeFakeVisualViewport({ offsetTop: 40, offsetLeft: 0, width: 390, height: 500 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('opened', null, bootedInstanceId())
    // El contenedor es el backplate: cubre el layout viewport ENTERO, incluida
    // la franja que queda detrás del teclado translúcido de iOS 26 — el visual
    // viewport siempre es un sub-rectángulo del layout viewport, así que el
    // backplate tapa todo lo visible sin necesidad de conocer el teclado.
    expect(container.style.inset).toBe('0px')
    // El iframe es la superficie interactiva: sigue la caja REAL del
    // VisualViewport para quedar siempre por encima del teclado.
    expect(iframe.style.position).toBe('absolute')
    expect(iframe.style.top).toBe('40px')
    expect(iframe.style.left).toBe('0px')
    expect(iframe.style.width).toBe('390px')
    expect(iframe.style.height).toBe('500px')

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('Critical (VisualViewport "scroll") — un evento scroll (sin cambiar height) reposiciona el contenedor mobile fullscreen, no solo "resize"', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { vv, trigger } = makeFakeVisualViewport({ offsetTop: 0, width: 390, height: 700 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(iframe.style.top).toBe('0px')
    expect(container.style.inset).toBe('0px') // el backplate no se mueve: cubre el layout viewport pase lo que pase

    // El teclado desplaza lo visible SIN disparar 'resize' (el layout
    // viewport no cambia, solo el scroll interno) — WebKit lo reporta vía
    // 'scroll' (https://bugs.webkit.org/show_bug.cgi?id=265578 documenta
    // además actualizaciones tardías durante la animación).
    // offsetTop es readonly en el tipo VisualViewport de lib.dom — el objeto
    // real de este test es una fake mutable (makeFakeVisualViewport); cast
    // local mínimo, sin debilitar tsconfig.
    ;(vv as unknown as { offsetTop: number }).offsetTop = 120
    trigger('scroll')
    expect(iframe.style.top).toBe('120px')
    expect(container.style.inset).toBe('0px')

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('Critical (mobile) — matchMedia es un listener real: un cambio de breakpoint DESPUÉS de arrancar en desktop reacciona (no una detección de una sola vez)', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(container.style.inset).not.toBe('0px') // arrancó en desktop: tamaño real, no fullscreen

    mql.matches = true
    expect(changeHandler).not.toBeNull()
    changeHandler!()
    expect(container.style.inset).toBe('0px') // el listener reaccionó a mitad de sesión

    matchMedia.mockRestore()
  })

  it('destroy() limpia los listeners de matchMedia Y de visualViewport (resize + scroll)', () => {
    const removeMatchMediaListener = vi.fn()
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false, media: '(max-width: 480px)', addEventListener: vi.fn(), removeEventListener: removeMatchMediaListener,
      addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { vv, removeEventListener: removeVvListener } = makeFakeVisualViewport()
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })

    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('destroy')

    expect(removeMatchMediaListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(removeVvListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeVvListener).toHaveBeenCalledWith('scroll', expect.any(Function))

    matchMedia.mockRestore()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('el nuevo protocolo — envía viewport{kind,height} justo tras el init, en respuesta a ready', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toEqual(['init', 'viewport'])
    const viewportCall = post.mock.calls[1]![0] as { payload: { kind: string; height: number } }
    expect(viewportCall.payload.kind).toBe('desktop')
    expect(typeof viewportCall.payload.height).toBe('number')
  })

  it('el nuevo protocolo — reenvía viewport{kind:"mobile"} cuando matchMedia cambia a mitad de sesión', () => {
    let changeHandler: (() => void) | null = null
    const mql = {
      matches: false, media: '(max-width: 480px)',
      addEventListener: (type: string, cb: () => void) => { if (type === 'change') changeHandler = cb },
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
    }
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList)
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    post.mockClear()

    mql.matches = true
    changeHandler!()
    const types = post.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toContain('viewport')
    const last = post.mock.calls.find((c) => (c[0] as { type: string }).type === 'viewport')![0] as { payload: { kind: string } }
    expect(last.payload.kind).toBe('mobile')

    matchMedia.mockRestore()
  })

  it('Critical (launcherSize) — el launcher trackea su tamaño REAL reportado por resize en modo launcher, no un 104px fijo eterno (p.ej. 56px + margen + safe-area en móvil)', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    expect(container.style.width).toBe('104px') // valor inicial por defecto, antes de cualquier medición real

    fakeShellMessage('resize', { width: 88, height: 120, position: 'right' }, bootedInstanceId())
    expect(container.style.width).toBe('88px')
    expect(container.style.height).toBe('120px')
  })

  it('Critical (launcherSize aislado) — un resize de modo panel (desktop) nunca sobrescribe launcherSize; cerrar el panel conserva el ÚLTIMO launcherSize medido, no el valor inicial de 104px', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const container = iframe.parentElement as HTMLElement
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })

    fakeShellMessage('resize', { width: 88, height: 120, position: 'right' }, bootedInstanceId()) // launcherSize medido
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())

    expect(container.style.width).toBe('88px') // launcherSize sobrevive, no 104px inicial ni 430px del panel
    expect(container.style.height).toBe('120px')
  })

  it('Critical (cssText) — NUNCA asigna CSSStyleDeclaration.cssText; toda la geometría se fija por propiedad individual', () => {
    // Ronda 3: espiar Object.getOwnPropertyDescriptor(...).set espía el
    // setter de una COPIA del descriptor — nunca el que de verdad está
    // instalado en el prototipo, así que el test pasaba incluso si el
    // código volviera a usar cssText (falso positivo). La forma correcta de
    // espiar un accessor de un prototipo es la forma de 3 argumentos de
    // vi.spyOn (objeto, nombre de propiedad, 'get'|'set').
    const cssTextSetter = vi.spyOn(CSSStyleDeclaration.prototype, 'cssText', 'set')
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    fakeShellMessage('opened', null, bootedInstanceId())
    fakeShellMessage('resize', { width: 430, height: 688, position: 'right', viewportKind: 'desktop' }, bootedInstanceId())
    fakeShellMessage('closed', null, bootedInstanceId())
    expect(cssTextSetter).not.toHaveBeenCalled()
    cssTextSetter.mockRestore()
  })

  describe('backplate opaco (panel móvil) — el teclado translúcido de iOS 26 nunca deja ver la página anfitriona', () => {
    // matchMedia por QUERY: el loader consulta tanto el breakpoint móvil como
    // '(prefers-color-scheme: dark)' (fallback del color del backplate) — un
    // mockReturnValue único contaminaría una consulta con la otra.
    function mockMatchMediaByQuery(opts: { mobile: boolean; dark: boolean }) {
      return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('max-width') ? opts.mobile : opts.dark,
        media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
        addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList))
    }

    function bootMobilePanel(): { iframe: HTMLIFrameElement; container: HTMLElement } {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const container = iframe.parentElement as HTMLElement
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      fakeShellMessage('opened', null, bootedInstanceId())
      return { iframe, container }
    }

    afterEach(() => {
      Reflect.deleteProperty(window, 'visualViewport')
    })

    it('sin surface del shell y esquema claro: el backplate cae a blanco (#ffffff, el --surface claro del token set)', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      const { container } = bootMobilePanel()
      expect(container.style.backgroundColor).toBe('rgb(255, 255, 255)')
      matchMedia.mockRestore()
    })

    it('sin surface del shell y esquema oscuro: el backplate cae al --surface oscuro del token set (#171a21)', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: true })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      const { container } = bootMobilePanel()
      expect(container.style.backgroundColor).toBe('rgb(23, 26, 33)')
      matchMedia.mockRestore()
    })

    it('opened{surface} válido del shell: el backplate usa EXACTAMENTE ese color, no el fallback', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const container = iframe.parentElement as HTMLElement
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      fakeShellMessage('opened', { surface: '#101319' }, bootedInstanceId())
      expect(container.style.backgroundColor).toBe('rgb(16, 19, 25)')
      matchMedia.mockRestore()
    })

    it('opened{surface} INVÁLIDO (no hex — frontera postMessage no confiable): se ignora y se usa el fallback', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const container = iframe.parentElement as HTMLElement
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      fakeShellMessage('opened', { surface: 'url(https://evil.example/x.png)' }, bootedInstanceId())
      expect(container.style.backgroundColor).toBe('rgb(255, 255, 255)')
      matchMedia.mockRestore()
    })

    it('closed tras una sesión móvil: el fondo del backplate se LIMPIA — el launcher nunca hereda un cuadrado opaco', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      const { container } = bootMobilePanel()
      expect(container.style.backgroundColor).not.toBe('')
      fakeShellMessage('closed', null, bootedInstanceId())
      expect(container.style.backgroundColor).toBe('')
      expect(container.style.width).toBe('104px')
      matchMedia.mockRestore()
    })

    it('panel DESKTOP: sin backplate — el contenedor conserva su caja anclada sin fondo propio', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: false, dark: false })
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const container = iframe.parentElement as HTMLElement
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      fakeShellMessage('opened', { surface: '#101319' }, bootedInstanceId())
      expect(container.style.backgroundColor).toBe('')
      expect(container.style.inset).toBe('')
      matchMedia.mockRestore()
    })

    it("un 'opened' repetido con el panel YA abierto (re-emisión de surface por cambio de esquema) actualiza el backplate pero NO se reenvía a los listeners públicos de on('opened') — el panel nunca se reabrió", () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { vv } = makeFakeVisualViewport({ width: 390, height: 500 })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const container = iframe.parentElement as HTMLElement
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      const cb = vi.fn()
      getApi()('on', 'opened', cb)

      fakeShellMessage('opened', { surface: '#ffffff' }, bootedInstanceId())
      expect(cb).toHaveBeenCalledTimes(1) // apertura real: el host se entera

      // El SO cambia a oscuro con el panel abierto: el shell re-emite opened
      // con el surface nuevo SOLO para el backplate.
      fakeShellMessage('opened', { surface: '#171a21' }, bootedInstanceId())
      expect(container.style.backgroundColor).toBe('rgb(23, 26, 33)') // el backplate SÍ se repinta
      expect(cb).toHaveBeenCalledTimes(1) // el host NO recibe un opened duplicado

      // Cerrar y reabrir: eso SÍ es una apertura nueva para el host.
      fakeShellMessage('closed', null, bootedInstanceId())
      fakeShellMessage('opened', { surface: '#ffffff' }, bootedInstanceId())
      expect(cb).toHaveBeenCalledTimes(2)
      matchMedia.mockRestore()
    })

    it('sin VisualViewport (navegador sin soporte): backplate inset:0 y el iframe rellena el contenedor al 100%', () => {
      const matchMedia = mockMatchMediaByQuery({ mobile: true, dark: false })
      const { iframe, container } = bootMobilePanel()
      expect(container.style.inset).toBe('0px')
      expect(container.style.backgroundColor).toBe('rgb(255, 255, 255)')
      expect(iframe.style.width).toBe('100%')
      expect(iframe.style.height).toBe('100%')
      matchMedia.mockRestore()
    })
  })

  describe('locale (Plan 4) — lang de la página anfitriona propagado al shell', () => {
    afterEach(() => {
      document.documentElement.lang = ''
    })

    it("document.documentElement.lang='en': el iframe.src lleva ?lang=en (conserva el #instanceId) y el title se localiza a 'Help chat'", () => {
      document.documentElement.lang = 'en'
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const url = new URL(iframe.src)
      expect(url.searchParams.get('lang')).toBe('en')
      expect(url.hash).toBe(`#${bootedInstanceId()}`)
      expect(iframe.title).toBe('Help chat')
    })

    it("document.documentElement.lang='en-US' (con región): normaliza igual a ?lang=en", () => {
      document.documentElement.lang = 'en-US'
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      expect(new URL(iframe.src).searchParams.get('lang')).toBe('en')
    })

    it('sin lang en el host: el iframe.src NO lleva parámetro lang y el title cae a "Chat de ayuda"', () => {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      expect(new URL(iframe.src).searchParams.has('lang')).toBe(false)
      expect(iframe.title).toBe('Chat de ayuda')
    })

    it('lang del host no soportado (p.ej. "fr"): igual que sin lang — nunca se inventa un idioma soportado más cercano', () => {
      document.documentElement.lang = 'fr'
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      expect(new URL(iframe.src).searchParams.has('lang')).toBe(false)
      expect(iframe.title).toBe('Chat de ayuda')
    })
  })

  describe('persistencia de sesión (Task W3)', () => {
    function clearSessionCookie(installationId: string): void {
      document.cookie = `nevw_session_${installationId}=; path=/; max-age=0`
    }

    afterEach(() => {
      clearSessionCookie('inst_demo_festival_01')
      localStorage.clear()
    })

    it('sin sesión guardada previa: el init lleva session:null', () => {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const post = vi.fn()
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
      fakeShellMessage('ready', null, bootedInstanceId())
      const [env] = post.mock.calls[0]!
      expect(env).toMatchObject({ type: 'init', payload: { session: null } })
    })

    it('con una cookie de sesión previa: el init reenvía {resumeSecret} en session', () => {
      document.cookie = `nevw_session_inst_demo_festival_01=${btoa(JSON.stringify({ resumeSecret: 'resume_previo' }))}; path=/`
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      const post = vi.fn()
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
      fakeShellMessage('ready', null, bootedInstanceId())
      const [env] = post.mock.calls[0]!
      expect(env).toMatchObject({ type: 'init', payload: { session: { resumeSecret: 'resume_previo' } } })
    })

    it('session_persist del shell guarda el resumeSecret en la cookie de la instalación', () => {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      fakeShellMessage('session_persist', { resumeSecret: 'resume_nuevo' }, bootedInstanceId())

      // Un boot NUEVO (simulando un reload) debe recoger lo que se acaba de guardar.
      getApi()('destroy')
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe2 = document.querySelector('iframe')!
      const post2 = vi.fn()
      Object.defineProperty(iframe2, 'contentWindow', { value: { postMessage: post2 } })
      fakeShellMessage('ready', null, bootedInstanceId())
      const [env] = post2.mock.calls[0]!
      expect(env).toMatchObject({ type: 'init', payload: { session: { resumeSecret: 'resume_nuevo' } } })
    })

    it('session_persist es interno: no se reenvía a los listeners públicos registrados con on()', () => {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      const cb = vi.fn()
      getApi()('on', 'session_persist', cb)
      fakeShellMessage('session_persist', { resumeSecret: 'resume_nuevo' }, bootedInstanceId())
      expect(cb).not.toHaveBeenCalled()
    })

    it('session_persist con payload inválido (sin resumeSecret string) no escribe nada ni lanza', () => {
      bootLoader(window, { shellUrl: SHELL_URL })
      getApi()('boot', 'inst_demo_festival_01')
      const iframe = document.querySelector('iframe')!
      Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
      expect(() => fakeShellMessage('session_persist', { resumeSecret: 123 }, bootedInstanceId())).not.toThrow()
      expect(document.cookie).not.toContain('nevw_session_inst_demo_festival_01')
    })

    describe('lastSeen (watermark de no-leídos)', () => {
      it('session_persist con lastSeen escribe el blob COMPLETO (resumeSecret + lastSeen)', () => {
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe = document.querySelector('iframe')!
        Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
        fakeShellMessage('session_persist', {
          resumeSecret: 'resume_nuevo',
          lastSeen: { conversationId: 'conv_demo_festival_01', messageId: 'msg_0005' },
        }, bootedInstanceId())

        getApi()('destroy')
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe2 = document.querySelector('iframe')!
        const post2 = vi.fn()
        Object.defineProperty(iframe2, 'contentWindow', { value: { postMessage: post2 } })
        fakeShellMessage('ready', null, bootedInstanceId())
        const [env] = post2.mock.calls[0]!
        expect(env).toMatchObject({
          type: 'init',
          payload: { session: { resumeSecret: 'resume_nuevo', lastSeen: { conversationId: 'conv_demo_festival_01', messageId: 'msg_0005' } } },
        })
      })

      it('session_persist SIN lastSeen (visitante que aún no abrió el panel) no escribe watermark — solo resumeSecret', () => {
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe = document.querySelector('iframe')!
        Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
        fakeShellMessage('session_persist', { resumeSecret: 'resume_sin_watermark' }, bootedInstanceId())

        getApi()('destroy')
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe2 = document.querySelector('iframe')!
        const post2 = vi.fn()
        Object.defineProperty(iframe2, 'contentWindow', { value: { postMessage: post2 } })
        fakeShellMessage('ready', null, bootedInstanceId())
        const [env] = post2.mock.calls[0]!
        expect(env).toMatchObject({ type: 'init', payload: { session: { resumeSecret: 'resume_sin_watermark' } } })
        expect((env as { payload: { session: Record<string, unknown> } }).payload.session['lastSeen']).toBeUndefined()
      })

      it('session_persist con lastSeen corrupto (conversationId vacío) descarta SOLO el watermark — el resumeSecret se guarda igual', () => {
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe = document.querySelector('iframe')!
        Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
        expect(() => fakeShellMessage('session_persist', {
          resumeSecret: 'resume_ok', lastSeen: { conversationId: '', messageId: 'msg_0003' },
        }, bootedInstanceId())).not.toThrow()

        getApi()('destroy')
        bootLoader(window, { shellUrl: SHELL_URL })
        getApi()('boot', 'inst_demo_festival_01')
        const iframe2 = document.querySelector('iframe')!
        const post2 = vi.fn()
        Object.defineProperty(iframe2, 'contentWindow', { value: { postMessage: post2 } })
        fakeShellMessage('ready', null, bootedInstanceId())
        const [env] = post2.mock.calls[0]!
        expect(env).toMatchObject({ type: 'init', payload: { session: { resumeSecret: 'resume_ok' } } })
        expect((env as { payload: { session: Record<string, unknown> } }).payload.session['lastSeen']).toBeUndefined()
      })
    })
  })
})
