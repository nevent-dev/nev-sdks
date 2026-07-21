import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from 'preact'
import { startShell, isRetriableBootError } from '../main'
import { seal } from '../../protocol/envelope'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'
import * as themeModule from '../../panel/theme'
import * as appModule from '../app'
import type { SessionClient } from '../session'
import { createBackoff } from '../../transport/backoff'
import type { Scheduler } from '../../transport/events-channel'

const PARENT_ORIGIN = 'https://demofest.example'

function fakeClient(overrides: Partial<SessionClient> = {}): SessionClient {
  return {
    getConfig: () => fixtureConfig(),
    getSession: () => fixtureSession(),
    getCurrentResumeSecret: () => fixtureSession().resumeSecret,
    wasResumed: () => false,
    authorizedFetch: vi.fn(),
    onSessionDead: () => () => {},
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
    // El DOM refleja isOpen=true de forma síncrona con el commit (render), pero
    // el useEffect que emite 'opened'/'closed' al bus ([isOpen, bus]) se
    // dispara en un ciclo posterior — un vi.waitFor que solo espera el DOM
    // puede resolver ANTES de que ese efecto corra, dejando 'opened' fuera de
    // parentPost.mock.calls en el instante exacto de la comprobación (carrera
    // de la misma familia que Task W4, ver deathClient arriba). Esperar la
    // condición real (el mensaje ya enviado), no el DOM, mismo idiom que el
    // resto del fichero usa para session_persist.
    await vi.waitFor(() => {
      const sent = parentPost.mock.calls.map((c) => (c[0] as { type: string }).type)
      expect(sent).toContain('opened')
    })
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

    it('tras crear la sesión, el shell emite session_persist al parent con el resumeSecret VIGENTE que devolvió el backend (Task W3c: getCurrentResumeSecret())', async () => {
      const createClient = vi.fn(async () => fakeClient({ getCurrentResumeSecret: () => 'resume_emitido' }))
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
      // Important #2 (review W3): session_persist es el mensaje que de verdad
      // lleva el resumeSecret — debe ir SIEMPRE al origin exacto del parent
      // vinculado en init, nunca a '*' (spec §4.1, mismo criterio que el resto
      // de mensajes shell→loader). Una regresión a '*' filtraría el secreto a
      // cualquier documento que compartiera la misma window (p.ej. un iframe
      // de un tercero co-residente en la página del anfitrión).
      expect(persistCall[1]).toBe(PARENT_ORIGIN)
    })

    describe('lastSeen (watermark de no-leídos)', () => {
      it('un init con session.lastSeen lo pasa a App como prop initialLastSeen', async () => {
        const createClient = vi.fn(async () => fakeClient())
        const actualApp = await vi.importActual<typeof import('../app')>('../app')
        const appSpy = vi.spyOn(appModule, 'App').mockImplementation((...args) => actualApp.App(...args))
        try {
          const parentSource = makeParentSource(vi.fn())
          startShell(window, { apiBase: 'https://api.test', createClient })
          window.dispatchEvent(new MessageEvent('message', {
            data: seal('init', {
              installationId: 'inst_demo_festival_01',
              session: { resumeSecret: 'resume_del_loader', lastSeen: { conversationId: 'conv_demo_01', messageId: 'msg_0007' } },
            }, 'nevw_test1'),
            origin: PARENT_ORIGIN,
            source: parentSource,
          }))
          await vi.waitFor(() => expect(appSpy).toHaveBeenCalled())
          expect(appSpy.mock.calls[0]![0]).toMatchObject({ initialLastSeen: { conversationId: 'conv_demo_01', messageId: 'msg_0007' } })
        } finally {
          appSpy.mockRestore()
        }
      })

      it('el session_persist INICIAL reenvía el MISMO lastSeen que traía el init, junto al resumeSecret vigente', async () => {
        const createClient = vi.fn(async () => fakeClient({ getCurrentResumeSecret: () => 'resume_emitido' }))
        const parentPost = vi.fn()
        startShell(window, { apiBase: 'https://api.test', createClient })
        window.dispatchEvent(new MessageEvent('message', {
          data: seal('init', {
            installationId: 'inst_demo_festival_01',
            session: { resumeSecret: 'resume_del_loader', lastSeen: { conversationId: 'conv_demo_01', messageId: 'msg_0007' } },
          }, 'nevw_test1'),
          origin: PARENT_ORIGIN,
          source: makeParentSource(parentPost),
        }))
        await vi.waitFor(() => {
          const persistCall = parentPost.mock.calls.find((c) => (c[0] as { type: string }).type === 'session_persist')
          expect(persistCall).toBeDefined()
        })
        const persistCall = parentPost.mock.calls.find((c) => (c[0] as { type: string }).type === 'session_persist')!
        expect((persistCall[0] as { payload: unknown }).payload).toEqual({
          resumeSecret: 'resume_emitido', lastSeen: { conversationId: 'conv_demo_01', messageId: 'msg_0007' },
        })
      })

      it('init con session.lastSeen corrupto (conversationId vacío) lo ignora — el resumeSecret viaja con normalidad, sin lastSeen', async () => {
        const createClient = vi.fn(async () => fakeClient({ getCurrentResumeSecret: () => 'resume_emitido' }))
        const parentPost = vi.fn()
        startShell(window, { apiBase: 'https://api.test', createClient })
        window.dispatchEvent(new MessageEvent('message', {
          data: seal('init', {
            installationId: 'inst_demo_festival_01',
            session: { resumeSecret: 'resume_del_loader', lastSeen: { conversationId: '', messageId: 'msg_0007' } },
          }, 'nevw_test1'),
          origin: PARENT_ORIGIN,
          source: makeParentSource(parentPost),
        }))
        await vi.waitFor(() => {
          const persistCall = parentPost.mock.calls.find((c) => (c[0] as { type: string }).type === 'session_persist')
          expect(persistCall).toBeDefined()
        })
        const persistCall = parentPost.mock.calls.find((c) => (c[0] as { type: string }).type === 'session_persist')!
        expect((persistCall[0] as { payload: unknown }).payload).toEqual({ resumeSecret: 'resume_emitido' })
      })

      it('session:null (visitante nuevo): App recibe initialLastSeen null/ausente, sin lanzar', async () => {
        const createClient = vi.fn(async () => fakeClient())
        const actualApp = await vi.importActual<typeof import('../app')>('../app')
        const appSpy = vi.spyOn(appModule, 'App').mockImplementation((...args) => actualApp.App(...args))
        try {
          const parentSource = makeParentSource(vi.fn())
          startShell(window, { apiBase: 'https://api.test', createClient })
          window.dispatchEvent(new MessageEvent('message', {
            data: seal('init', { installationId: 'inst_demo_festival_01', session: null }, 'nevw_test1'),
            origin: PARENT_ORIGIN,
            source: parentSource,
          }))
          await vi.waitFor(() => expect(appSpy).toHaveBeenCalled())
          expect(appSpy.mock.calls[0]![0]).toMatchObject({ initialLastSeen: null })
        } finally {
          appSpy.mockRestore()
        }
      })
    })
  })

  // Task W4 — recuperación de sesión muerta a mitad de vida: el shell debe
  // reutilizar el MISMO camino de arranque (createClient) para reconstruir
  // la sesión, parametrizado por el resumeSecret VIGENTE en ese momento —
  // ver main.tsx#buildClient. La orquestación fina (single-flight, rate
  // limit, tarjeta de conversación nueva) ya tiene su propia cobertura
  // exhaustiva en app.test.tsx; aquí solo se prueba el CABLEADO real
  // main.tsx→App→createClient de punta a punta.
  // Doble cuyo onSessionDead captura el callback en una variable devuelta —
  // mismo patrón que app.test.tsx#deathClient (probado allí: TS necesita el
  // callback envuelto en una función, no un `let` reasignado inline, para
  // que la narrowing de tipos no lo estreche a `never` en el punto de uso).
  // Set, no una única variable: en real, MÁS DE UN suscriptor puede coexistir
  // brevemente (el canal de eventos se suscribe dentro de
  // createTransport()/createEventsChannel() en cuanto App monta, y App se
  // suscribe por su cuenta vía useEffect poco después) — un fake de un solo
  // listener sobreescribiría el del canal con el de App y kill() dispararía
  // sobre el listener EQUIVOCADO. En este escenario concreto (sesión fresca,
  // panel cerrado, sin conversación) el efecto D7 cierra el canal casi al
  // instante — y, desde Task W3c (nit W4 review: close() ahora se
  // desuscribe de onSessionDead, ver events-channel.ts), esa desuscripción
  // deja SOLO el listener de App vivo en régimen estable.
  function deathClient(overrides: Partial<SessionClient> = {}): { client: SessionClient; kill: () => void; listenerCount: () => number; sawDip: () => boolean } {
    const listeners = new Set<() => void>()
    // El canal (createTransport(), suscrito síncronamente en el render/useMemo
    // de App) sube el conteo a 1 ANTES de que D7 lo cierre y lo desuscriba —
    // esa desuscripción es la ÚNICA forma de que el conteo pase por 0 antes de
    // que App suba su propio listener a 1 (su efecto está declarado DESPUÉS
    // de D7, así que el orden channel→0→App es fijo aunque el tiempo real que
    // tarde en asentarse no lo sea). `sawZero` deja constancia de ese tránsito
    // para poder esperar la CONDICIÓN real (ver más abajo) en vez de un
    // retraso de reloj fijo que una máquina cargada puede no respetar.
    let sawZero = false
    const client = fakeClient({
      onSessionDead: (fn) => {
        listeners.add(fn)
        return () => { listeners.delete(fn); if (listeners.size === 0) sawZero = true }
      },
      ...overrides,
    })
    return { client, kill: () => { for (const l of listeners) l() }, listenerCount: () => listeners.size, sawDip: () => sawZero }
  }

  describe('recuperación de sesión muerta (Task W4)', () => {
    it('al morir la sesión, reconstruye vía la MISMA fábrica createClient, con el resumeSecret vigente, y emite un session_persist nuevo', async () => {
      const { client: oldClient, kill, listenerCount, sawDip } = deathClient({
        getCurrentResumeSecret: () => 'resume_vigente',
      })
      const newClient = fakeClient({
        getCurrentResumeSecret: () => 'resume_tras_rebuild',
        // El re-bootstrap fuerza un openChannel() en el transport nuevo (ver
        // app.tsx) — un fetch que nunca resuelve mantiene esa reconciliación
        // real en silencio, sin backoff/timers reales de fondo que este test
        // no necesita ejercitar (ya cubierto en app.test.tsx).
        authorizedFetch: vi.fn(() => new Promise<Response>(() => {})),
      })
      const createClient = vi.fn().mockResolvedValueOnce(oldClient).mockResolvedValueOnce(newClient)
      const parentPost = vi.fn()
      startShell(window, { apiBase: 'https://api.test', createClient })
      sendInit('nevw_test1', makeParentSource(parentPost))
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
      // Espera a que App haya montado Y a que su efecto de suscripción a
      // onSessionDead (Task W4) haya corrido — render() de preact confirma
      // el commit del DOM síncronamente, pero useEffect se dispara en un
      // ciclo posterior; sin esto, kill() dispararía sobre un `cb` aún null.
      await vi.waitFor(() => expect(document.querySelector('[data-part=root]')).not.toBeNull())
      // Entre el commit y que TODOS los efectos posteriores terminen de
      // asentarse hay un hueco transitorio en el que el canal de eventos
      // (createTransport, subscrito al crearse) YA está suscrito pero D7 (que
      // lo cierra al no haber conversación ni panel abierto) todavía no ha
      // corrido — un simple listenerCount()===1 es AMBIGUO: es cierto tanto
      // en ese hueco transitorio (el listener del canal, a punto de
      // desuscribirse) como en el régimen estable (el de App). Un retraso de
      // reloj fijo (p.ej. 20ms) es una carrera real bajo carga (CI, suite
      // completa con muchos ficheros/threads): si el efecto de App aún no ha
      // corrido cuando expira el retraso, kill() dispara SOLO el listener del
      // canal (un no-op de limpieza) y createClient nunca se vuelve a llamar.
      // sawDip() (ver deathClient) elimina la ambigüedad esperando la
      // TRANSICIÓN real 1→0→1 en vez de una cantidad de tiempo: el conteo
      // solo pasa por 0 cuando D7 desuscribe al canal (Task W3c), y ese 0 solo
      // puede ir seguido por el listener de App (su efecto está declarado
      // DESPUÉS de D7) — así que "sawDip() && listenerCount()===1" identifica
      // el régimen estable sin importar cuánto tarde en asentarse de verdad.
      await vi.waitFor(() => {
        expect(sawDip()).toBe(true)
        expect(listenerCount()).toBe(1)
      })

      kill()

      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(2))
      expect(createClient.mock.calls[1]![0]).toMatchObject({
        apiBase: 'https://api.test', installationId: 'inst_demo_festival_01',
        embeddingOrigin: PARENT_ORIGIN, resumeSecret: 'resume_vigente',
      })

      await vi.waitFor(() => {
        const persistTypes = parentPost.mock.calls.filter((c) => (c[0] as { type: string }).type === 'session_persist')
        expect(persistTypes).toHaveLength(2) // uno del arranque inicial, otro del rebuild
      })
      const secondPersist = parentPost.mock.calls.filter((c) => (c[0] as { type: string }).type === 'session_persist')[1]!
      expect((secondPersist[0] as { payload: { resumeSecret: string } }).payload).toEqual({ resumeSecret: 'resume_tras_rebuild' })
      expect(secondPersist[1]).toBe(PARENT_ORIGIN) // mismo guard de targetOrigin que el arranque (Important #2, W3)
    })
  })

  // Bug real: un visitante que hace ~10 hard-reloads rápidos agota el rate
  // limit del backend (10 POST /sessions por IP/60s) → 429 en el arranque.
  // Antes de este fix, el .catch() del bootstrap solo logueaba y el shell
  // quedaba MUERTO en silencio (sin launcher) hasta una recarga manual
  // posterior a la ventana.
  describe('isRetriableBootError — clasificador de fallos de arranque', () => {
    it('TRANSITORIOS: 429 (config o sesión), cualquier 5xx, y errores de red (TypeError)', () => {
      expect(isRetriableBootError(new Error('session_failed:429'))).toBe(true)
      expect(isRetriableBootError(new Error('config_failed:429'))).toBe(true)
      expect(isRetriableBootError(new Error('session_failed:500'))).toBe(true)
      expect(isRetriableBootError(new Error('session_failed:503'))).toBe(true)
      expect(isRetriableBootError(new Error('config_failed:599'))).toBe(true)
      expect(isRetriableBootError(new TypeError('Failed to fetch'))).toBe(true)
    })
    it('DELIBERADOS: 401, 403 (origen no permitido), 404 (instalación apagada/inexistente)', () => {
      expect(isRetriableBootError(new Error('session_failed:401'))).toBe(false)
      expect(isRetriableBootError(new Error('session_failed:403'))).toBe(false)
      expect(isRetriableBootError(new Error('config_failed:404'))).toBe(false)
    })
    it('DELIBERADOS por defecto: status no listado, formato irreconocible, o valor no-Error — nunca asumir transitorio', () => {
      expect(isRetriableBootError(new Error('session_failed:418'))).toBe(false) // otro 4xx no listado
      expect(isRetriableBootError(new Error('algo_raro_sin_status'))).toBe(false)
      expect(isRetriableBootError('un string cualquiera')).toBe(false)
      expect(isRetriableBootError(null)).toBe(false)
      expect(isRetriableBootError(undefined)).toBe(false)
    })
  })

  describe('reintento de arranque en fallos transitorios', () => {
    // Scheduler real (0ms), no vi.useFakeTimers: mismo patrón `immediate()`
    // que transport/__tests__/events-channel.test.ts — un timer real de 0ms
    // sigue cediendo al motor de timers (a diferencia de una microtask), así
    // vi.waitFor puede intercalarse en vez de girar hasta OOM.
    const immediateScheduler = (): Scheduler => ({
      setTimeout: (fn) => setTimeout(fn, 0) as unknown as number,
      clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    })
    const fastBackoff = () => createBackoff({ baseMs: 1, maxMs: 1, jitter: 0 })

    it('429 en la sesión: reintenta con backoff y al 3er intento monta la App y el widget funciona', async () => {
      let attempts = 0
      const createClient = vi.fn(async () => {
        attempts += 1
        if (attempts < 3) throw new Error('session_failed:429')
        return fakeClient()
      })
      startShell(window, { apiBase: 'https://api.test', createClient, scheduler: immediateScheduler(), backoff: fastBackoff() })
      sendInit('nevw_test1', makeParentSource(vi.fn()))
      await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
      expect(createClient).toHaveBeenCalledTimes(3)
    })

    it('5xx (session_failed:503) y error de red (TypeError) también reintentan hasta montar', async () => {
      let attempts = 0
      const createClient = vi.fn(async () => {
        attempts += 1
        if (attempts === 1) throw new Error('session_failed:503')
        if (attempts === 2) throw new TypeError('Failed to fetch')
        return fakeClient()
      })
      startShell(window, { apiBase: 'https://api.test', createClient, scheduler: immediateScheduler(), backoff: fastBackoff() })
      sendInit('nevw_test1', makeParentSource(vi.fn()))
      await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
      expect(createClient).toHaveBeenCalledTimes(3)
    })

    it('403 (origen no permitido) NO reintenta: un solo intento, console.error, sin timers pendientes', async () => {
      const createClient = vi.fn(async () => { throw new Error('session_failed:403') })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const schedulerSetTimeout = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number)
      const scheduler: Scheduler = { setTimeout: schedulerSetTimeout, clearTimeout: vi.fn() }
      try {
        startShell(window, { apiBase: 'https://api.test', createClient, scheduler, backoff: fastBackoff() })
        sendInit('nevw_test1', makeParentSource(vi.fn()))
        await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
        await new Promise((r) => setTimeout(r, 20)) // margen: si reintentase igualmente, aquí ya se vería
        expect(createClient).toHaveBeenCalledTimes(1)
        expect(schedulerSetTimeout).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalledWith('[nevent-widget] fallo al arrancar la sesión', expect.any(Error))
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('404 (instalación apagada/inexistente) tampoco reintenta', async () => {
      const createClient = vi.fn(async () => { throw new Error('config_failed:404') })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const schedulerSetTimeout = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number)
      const scheduler: Scheduler = { setTimeout: schedulerSetTimeout, clearTimeout: vi.fn() }
      try {
        startShell(window, { apiBase: 'https://api.test', createClient, scheduler, backoff: fastBackoff() })
        sendInit('nevw_test1', makeParentSource(vi.fn()))
        await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
        await new Promise((r) => setTimeout(r, 20))
        expect(createClient).toHaveBeenCalledTimes(1)
        expect(schedulerSetTimeout).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalled()
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('el reintento no duplica el manejo del init: un solo mount, un solo session_persist inicial', async () => {
      let attempts = 0
      const createClient = vi.fn(async () => {
        attempts += 1
        if (attempts < 3) throw new Error('session_failed:429')
        return fakeClient({ getCurrentResumeSecret: () => 'resume_tras_reintento' })
      })
      const parentPost = vi.fn()
      startShell(window, { apiBase: 'https://api.test', createClient, scheduler: immediateScheduler(), backoff: fastBackoff() })
      sendInit('nevw_test1', makeParentSource(parentPost))
      await vi.waitFor(() => expect(document.querySelector('[data-part=root]')).not.toBeNull())
      // Deja pasar un tick por si un reintento tardío mutase el DOM de nuevo.
      await new Promise((r) => setTimeout(r, 20))
      expect(document.querySelectorAll('[data-part=root]')).toHaveLength(1)
      const persistCalls = parentPost.mock.calls.filter((c) => (c[0] as { type: string }).type === 'session_persist')
      expect(persistCalls).toHaveLength(1)
      expect((persistCalls[0]![0] as { payload: { resumeSecret: string } }).payload).toEqual({ resumeSecret: 'resume_tras_reintento' })
    })

    it('el backoff crece con cada reintento y satura en el tope configurado', async () => {
      const delays: number[] = []
      const scheduler: Scheduler = {
        setTimeout: (fn, ms) => { delays.push(ms); return setTimeout(fn, 0) as unknown as number },
        clearTimeout: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
      }
      const backoff = createBackoff({ baseMs: 10, factor: 2, maxMs: 40, jitter: 0 })
      let attempts = 0
      const createClient = vi.fn(async () => {
        attempts += 1
        if (attempts < 5) throw new Error('session_failed:429')
        return fakeClient()
      })
      startShell(window, { apiBase: 'https://api.test', createClient, scheduler, backoff })
      sendInit('nevw_test1', makeParentSource(vi.fn()))
      await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(5))
      expect(delays).toEqual([10, 20, 40, 40])
    })
  })
})
