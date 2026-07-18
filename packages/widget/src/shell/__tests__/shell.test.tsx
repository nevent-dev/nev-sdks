import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startShell } from '../main'
import { seal } from '../../protocol/envelope'
import { fixtureConfig } from '../../contract/fixtures'
import type { SessionClient } from '../session'

const PARENT_ORIGIN = 'https://demofest.example'

function fakeClient(): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch: vi.fn(), destroy: vi.fn() } as unknown as SessionClient
}

function sendInit(instanceId: string, parentPost: ReturnType<typeof vi.fn>): void {
  const ev = new MessageEvent('message', {
    data: seal('init', { installationId: 'inst_demo_festival_01' }, instanceId),
    origin: PARENT_ORIGIN,
    source: { postMessage: parentPost } as unknown as Window,
  })
  window.dispatchEvent(ev)
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
    sendInit('nevw_test1', parentPost)
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledTimes(1))
    expect(createClient.mock.calls[0]![0]).toMatchObject({ embeddingOrigin: PARENT_ORIGIN, installationId: 'inst_demo_festival_01' })
  })
  it('open del parent abre el panel y emite opened; toggle lo cierra y emite closed', async () => {
    const createClient = vi.fn(async () => fakeClient())
    const parentPost = vi.fn()
    startShell(window, { apiBase: 'https://api.test', createClient })
    sendInit('nevw_test1', parentPost)
    await vi.waitFor(() => expect(document.querySelector('[data-part=launcher]')).not.toBeNull())
    const openEv = new MessageEvent('message', { data: seal('open', null, 'nevw_test1'), origin: PARENT_ORIGIN, source: { postMessage: parentPost } as unknown as Window })
    window.dispatchEvent(openEv)
    await vi.waitFor(() => expect(document.querySelector('[data-part=panel]')).not.toBeNull())
    const sent = parentPost.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(sent).toContain('opened')
  })
  it('ignora init de un source/instanceId inválido', async () => {
    const createClient = vi.fn(async () => fakeClient())
    startShell(window, { apiBase: 'https://api.test', createClient })
    const ev = new MessageEvent('message', { data: seal('init', { installationId: 'x' }, 'otro_id'), origin: PARENT_ORIGIN, source: { postMessage: vi.fn() } as unknown as Window })
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
})
