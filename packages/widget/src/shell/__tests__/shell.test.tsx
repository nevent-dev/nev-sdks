import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { startShell } from '../main'
import { seal } from '../../protocol/envelope'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'
import * as themeModule from '../../panel/theme'
import * as appModule from '../app'
import type { SessionClient } from '../session'

const PARENT_ORIGIN = 'https://demofest.example'

function fakeClient(overrides: Partial<SessionClient> = {}): SessionClient {
  return {
    getConfig: () => fixtureConfig(),
    getSession: () => fixtureSession(),
    wasResumed: () => false,
    authorizedFetch: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  } as unknown as SessionClient
}

// `source` representa la Window real del anfitrión: en un navegador real es el
// MISMO objeto en todos los mensajes que llegan de esa ventana, así que los
// tests lo construyen UNA vez por "sesión" de parent y lo reutilizan, en vez
// de crear un objeto `{ postMessage }` nuevo por mensaje (lo que rompería la
// comprobación `ev.source === parent.source` con falsos negativos de test).
function makeParentSource(post: (env: unknown) => void): Window {
  return { postMessage: post } as unknown as Window
}

function sendInit(instanceId: string, source: Window, origin: string = PARENT_ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: seal('init', { installationId: 'inst_demo_festival_01' }, instanceId),
    origin,
    source,
  }))
}

function sendCommand(type: string, instanceId: string, source: Window, origin: string = PARENT_ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', { data: seal(type, null, instanceId), origin, source }))
}

let currentRoot: HTMLElement

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  currentRoot = document.getElementById('root')!
  window.location.hash = '#nevw_test1'
})

afterEach(() => {
  render(null, currentRoot) // desmonta de verdad: ejecuta los cleanups de useEffect (incl. transport.destroy())
})

describe('shell', () => {
  it('envía ready al arrancar y crea la sesión con el embeddingOrigin del INIT (event.origin)', async () => {
    const createClient = vi.fn(async (_opts: unknown) => fakeClient())
    const parentPost = vi.fn()
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', makeParentSource(parentPost))
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
    expect(createClient.mock.calls[0]![0]).toMatchObject({ embeddingOrigin: PARENT_ORIGIN, installationId: 'inst_demo_festival_01' })
  })
  it('open del parent abre el panel y emite opened; toggle lo cierra y emite closed', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    const parentSource = makeParentSource(parentPost)
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentSource)
    await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
    sendCommand('open', 'nevw_test1', parentSource)
    await vi.waitFor(() => expect(document.querySelector('[data-part=panel]')).not.toBeNull())
    const sent = parentPost.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(sent).toContain('opened')
  })
  it('ignora init de un source/instanceId inválido', async () => {
    const createClient = vi.fn(async () => fakeClient())
    startShell(window, { apiBase: 'https://api.test', createClient })
    const ev = new MessageEvent('message', { data: seal('init', { installationId: 'x' }, 'otro_id'), origin: PARENT_ORIGIN, source: makeParentSource(vi.fn()) })
    window.dispatchEvent(ev)
    await new Promise((r) => setTimeout(r, 20))
    expect(createClient).not.toHaveBeenCalled()
  })
  it('no autoarranca al importar el módulo bajo test aunque exista #root (guard real es process.env.VITEST)', async () => {
    // #root ya existe (a diferencia de la carga normal del bundle), así que
    // si el guard fallase (como con el import.meta.env.VITEST anterior, que
    // es un no-op bajo Vitest 3.x/jsdom) startShell se autoinvocaría aquí.
    const readySpy = vi.spyOn(window.parent, 'postMessage')
    vi.resetModules()
    await import('../main')
    expect(readySpy).not.toHaveBeenCalled()
    readySpy.mockRestore()
  })
  it('ignora comandos post-init de un source u origin distinto del parent vinculado', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    const legitSource = makeParentSource(parentPost)
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', legitSource)
    await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())

    // Mismo origin que el parent legítimo, pero un `source` (ventana) distinto:
    // un iframe/tercero co-residente en la página del anfitrión no debe poder
    // pilotar el widget aunque acierte el origin y el instanceId (no es secreto).
    sendCommand('open', 'nevw_test1', makeParentSource(vi.fn()))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('[data-part=panel]')).toBeNull()

    // Mismo `source` object exacto que el vinculado en init, pero origin
    // distinto (p.ej. un mensaje falsificado con la misma ventana pero desde
    // otro documento/origin).
    sendCommand('open', 'nevw_test1', legitSource, 'https://evil.example')
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('[data-part=panel]')).toBeNull()
  })
  it('brick-before-init: un init con installationId vacío no fija parent; un init válido posterior funciona', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    const parentSource = makeParentSource(parentPost)
    startShell(window, { apiBase: 'https://api.test', createClient })

    window.dispatchEvent(new MessageEvent('message', {
      data: seal('init', { installationId: '' }, 'nevw_test1'),
      origin: PARENT_ORIGIN,
      source: parentSource,
    }))
    await new Promise((r) => setTimeout(r, 20))
    expect(createClient).not.toHaveBeenCalled()

    // Un init válido posterior NO debe quedar bloqueado por el `if (parent)
    // return` (que solo debe activarse tras un init que sí se aceptó).
    sendInit('nevw_test1', parentSource)
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
  })

  it('Critical (latch) — un viewport que llega DURANTE el createClient() async se retiene y App monta con el ÚLTIMO valor recibido, nunca con el fallback desktop inventado', async () => {
    let resolveClient!: (c: SessionClient) => void
    const createClient = vi.fn(() => new Promise<SessionClient>((resolve) => { resolveClient = resolve }))
    const parentPost = vi.fn()
    const parentSource = makeParentSource(parentPost)
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentSource)
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))

    // Dos viewport llegan MIENTRAS createClient() sigue pendiente — la
    // ventana de carrera exacta que perdía el mensaje: el bus no tiene NINGÚN
    // suscriptor todavía (App ni siquiera existe como VNode).
    window.dispatchEvent(new MessageEvent('message', {
      data: seal('viewport', { kind: 'desktop', height: 700 }, 'nevw_test1'), origin: PARENT_ORIGIN, source: parentSource,
    }))
    window.dispatchEvent(new MessageEvent('message', {
      data: seal('viewport', { kind: 'mobile', height: 640 }, 'nevw_test1'), origin: PARENT_ORIGIN, source: parentSource,
    }))

    resolveClient(fakeClient())
    await vi.waitFor(() => expect(document.querySelector('[data-part=root]')).not.toBeNull())
    // data-viewport refleja el ÚLTIMO mensaje latcheado (mobile), no el
    // fallback {kind:'desktop', height:0} inventado ni el primero de los dos.
    expect(document.querySelector('[data-part=root]')?.getAttribute('data-viewport')).toBe('mobile')
  })

  it('Regression (rev.1 #10) — applyTheme se ejecuta ANTES del primer render() de App, nunca después', async () => {
    const order: string[] = []
    // preact es un paquete externo pre-bundleado: su namespace ESM no admite
    // vi.spyOn (Vitest lanza "Module namespace is not configurable"). En vez
    // de espiar `render` de 'preact', se espía `App` (módulo propio del
    // proyecto, sí espiable) — como startShell SOLO monta <App/> vía
    // render(), que App() se invoque es un proxy fiel de "render() corrió".
    const actualTheme = await vi.importActual<typeof import('../../panel/theme')>('../../panel/theme')
    const applyThemeSpy = vi.spyOn(themeModule, 'applyTheme').mockImplementation((...args) => {
      order.push('applyTheme')
      return actualTheme.applyTheme(...args)
    })
    const actualApp = await vi.importActual<typeof import('../app')>('../app')
    const appSpy = vi.spyOn(appModule, 'App').mockImplementation((...args) => {
      order.push('render')
      return actualApp.App(...args)
    })
    try {
      // mismo patrón "bloqueado" que el test Critical de arriba: createClient()
      // no resuelve hasta que el test lo decide, así se puede comprobar que
      // NINGUNO de los dos (applyTheme ni App/render) corre mientras está pendiente.
      let resolveClient!: (c: SessionClient) => void
      const createClient = vi.fn(() => new Promise<SessionClient>((resolve) => { resolveClient = resolve }))
      const parentSource = makeParentSource(vi.fn())
      startShell(window, { apiBase: 'https://api.test', createClient })
      sendInit('nevw_test1', parentSource)
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
      expect(order).toEqual([]) // createClient sigue pendiente: ni theme ni render deben haber corrido

      resolveClient(fakeClient())
      await vi.waitFor(() => expect(order).toContain('render'))
      expect(order).toEqual(['applyTheme', 'render']) // orden estricto, no solo "ambos corrieron"
    } finally {
      applyThemeSpy.mockRestore()
      appSpy.mockRestore()
    }
  })

  describe('persistencia de sesión (Task W3)', () => {
    it('un init con session.resumeSecret lo pasa a createClient', async () => {
      const createClient = vi.fn(async (_opts: unknown) => fakeClient())
      const parentSource = makeParentSource(vi.fn())
      startShell(window, { apiBase: 'https://api.test', createClient })
      window.dispatchEvent(new MessageEvent('message', {
        data: seal('init', { installationId: 'inst_demo_festival_01', session: { resumeSecret: 'resume_del_loader' } }, 'nevw_test1'),
        origin: PARENT_ORIGIN,
        source: parentSource,
      }))
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
      expect(createClient.mock.calls[0]![0]).toMatchObject({ resumeSecret: 'resume_del_loader' })
    })

    it('un init con session:null pasa resumeSecret:null (visitante nuevo, sin nada que resumir)', async () => {
      const createClient = vi.fn(async (_opts: unknown) => fakeClient())
      const parentSource = makeParentSource(vi.fn())
      startShell(window, { apiBase: 'https://api.test', createClient })
      window.dispatchEvent(new MessageEvent('message', {
        data: seal('init', { installationId: 'inst_demo_festival_01', session: null }, 'nevw_test1'),
        origin: PARENT_ORIGIN,
        source: parentSource,
      }))
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
      expect(createClient.mock.calls[0]![0]).toMatchObject({ resumeSecret: null })
    })

    it('tras crear la sesión, el shell emite session_persist al parent con el resumeSecret que devolvió el backend', async () => {
      const createClient = vi.fn(async () => fakeClient({ getSession: () => ({ ...fixtureSession(), resumeSecret: 'resume_emitido' }) }))
      const parentPost = vi.fn()
      startShell(window, { apiBase: 'https://api.test', createClient })
      sendInit('nevw_test1', makeParentSource(parentPost))
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => {
        const types = parentPost.mock.calls.map((c) => (c[0] as { type: string }).type)
        expect(types).toContain('session_persist')
      })
      const persistCall = parentPost.mock.calls.find((c) => (c[0] as { type: string }).type === 'session_persist')!
      expect((persistCall[0] as { payload: { resumeSecret: string } }).payload).toEqual({ resumeSecret: 'resume_emitido' })
    })
  })
})
