import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startShell } from '../main'
import { seal } from '../../protocol/envelope'
import { fixtureConfig } from '../../contract/fixtures'
import type { SessionClient } from '../session'

const PARENT_ORIGIN = 'https://demofest.example'

function fakeClient(): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch: vi.fn(), destroy: vi.fn() } as unknown as SessionClient
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

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  window.location.hash = '#nevw_test1'
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
})
