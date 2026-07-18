import { describe, it, expect, vi } from 'vitest'
import { createSessionClient } from '../session'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockApi(overrides: { onProtected?: (auth: string | null, call: number) => Response; refreshThrowsOnCall?: number } = {}) {
  let protectedCalls = 0
  let refreshCalls = 0
  const calls: string[] = []
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.endsWith('/config')) return jsonResponse(fixtureConfig())
    if (url.endsWith('/sessions')) return jsonResponse(fixtureSession())
    if (url.endsWith('/sessions/refresh')) {
      refreshCalls += 1
      if (overrides.refreshThrowsOnCall === refreshCalls) throw new Error('refresh_network_error')
      return jsonResponse({ ...fixtureSession(), token: 'sess_jwt_renovado' })
    }
    protectedCalls += 1
    const auth = new Headers(init?.headers).get('Authorization')
    return overrides.onProtected?.(auth, protectedCalls) ?? jsonResponse({ ok: true })
  })
  return { fetchFn, calls }
}

const OPTS = { apiBase: 'https://api.test', installationId: 'inst_demo_festival_01', embeddingOrigin: 'https://demofest.example' }

describe('session client', () => {
  it('bootstrap: pide config y crea sesión enviando embeddingOrigin', async () => {
    const { fetchFn, calls } = mockApi()
    const client = await createSessionClient({ ...OPTS, fetchFn })
    expect(client.getConfig().assistantName).toBe('Asistente de DEMO FEST')
    expect(calls[0]).toBe('GET https://api.test/widget/v1/installations/inst_demo_festival_01/config')
    expect(calls[1]).toBe('POST https://api.test/widget/v1/installations/inst_demo_festival_01/sessions')
    const sessionInit = fetchFn.mock.calls[1]?.[1]
    expect(JSON.parse(String(sessionInit?.body))).toEqual({ embeddingOrigin: 'https://demofest.example' })
  })
  it('authorizedFetch añade Bearer y en 401 renueva una vez y reintenta', async () => {
    const { fetchFn } = mockApi({
      onProtected: (auth, call) => (call === 1 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ ok: true, auth })),
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const res = await client.authorizedFetch('/widget/v1/conversations/current/messages')
    const body = (await res.json()) as { auth: string }
    expect(res.status).toBe(200)
    expect(body.auth).toBe('Bearer sess_jwt_renovado')
  })
  it('un segundo 401 tras renovar NO reintenta en bucle', async () => {
    const { fetchFn } = mockApi({ onProtected: () => jsonResponse({ error: 'expired' }, 401) })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const res = await client.authorizedFetch('/widget/v1/conversations/current/messages')
    expect(res.status).toBe(401)
    const protectedCalls = fetchFn.mock.calls.filter(([u]) => String(u).includes('/conversations/')).length
    expect(protectedCalls).toBe(2)
  })
  it('si el refresh lanza, un 401 posterior reintenta el refresh y se recupera', async () => {
    const { fetchFn } = mockApi({
      onProtected: (auth, call) => (call === 1 || call === 2 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ ok: true, auth })),
      refreshThrowsOnCall: 1,
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })

    await expect(client.authorizedFetch('/widget/v1/conversations/current/messages')).rejects.toThrow('refresh_network_error')

    const res = await client.authorizedFetch('/widget/v1/conversations/current/messages')
    const body = (await res.json()) as { auth: string }
    expect(res.status).toBe(200)
    expect(body.auth).toBe('Bearer sess_jwt_renovado')
  })
  it('dos authorizedFetch concurrentes que reciben 401 disparan un único POST a /sessions/refresh', async () => {
    const { fetchFn } = mockApi({
      onProtected: (auth, call) => (call <= 2 ? jsonResponse({ error: 'expired' }, 401) : jsonResponse({ ok: true, auth })),
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const [resA, resB] = await Promise.all([
      client.authorizedFetch('/widget/v1/conversations/current/messages'),
      client.authorizedFetch('/widget/v1/conversations/current/messages'),
    ])
    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
    const refreshCalls = fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/sessions/refresh')).length
    expect(refreshCalls).toBe(1)
  })
  it('el token no se persiste en storage', async () => {
    const { fetchFn } = mockApi()
    await createSessionClient({ ...OPTS, fetchFn })
    expect(Object.keys(localStorage)).toHaveLength(0)
    expect(Object.keys(sessionStorage)).toHaveLength(0)
  })

  // Fix integración (Task 17): el backend real (GET /widget/v1/installations/{id}/config)
  // puede omitir assistantName por completo — drift cazado conduciendo el
  // navegador real contra el nev-api real, no visible con las fixtures
  // (que siempre lo incluían). Se normaliza en la frontera, igual que welcome.
  it('config SIN assistantName: la config normalizada trae el fallback "Asistente"', async () => {
    const { fetchFn } = mockApi()
    fetchFn.mockImplementationOnce(async () => {
      const { assistantName: _omit, ...rest } = fixtureConfig()
      return jsonResponse(rest)
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    expect(client.getConfig().assistantName).toBe('Asistente')
  })

  it('config con theme SIN primaryColor: pasa a través sin lanzar, resto de theme intacto', async () => {
    const { fetchFn } = mockApi()
    fetchFn.mockImplementationOnce(async () => {
      const full = fixtureConfig()
      const { primaryColor: _omit, ...themeRest } = full.theme
      return jsonResponse({ ...full, theme: themeRest })
    })
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const config = client.getConfig()
    expect(config.theme.primaryColor).toBeUndefined()
    expect(config.theme.position).toBe('right')
    expect(config.theme.mode).toBe('auto')
  })

  // Boot-shaped: el JSON EXACTO devuelto por el backend real en la
  // integración E2E (Task 17) — sin assistantName, theme sin primaryColor.
  it('arranca sin lanzar con el JSON exacto del backend real (sin assistantName ni theme.primaryColor)', async () => {
    const { fetchFn } = mockApi()
    fetchFn.mockImplementationOnce(async () =>
      jsonResponse({
        schemaVersion: 1,
        installationId: 'inst_demo_festival_01',
        locale: 'es',
        theme: { position: 'right', mode: 'light' },
        features: { upload: false, handoff: true },
      }),
    )
    const client = await createSessionClient({ ...OPTS, fetchFn })
    const config = client.getConfig()
    expect(config.assistantName).toBe('Asistente')
    expect(config.theme.primaryColor).toBeUndefined()
    expect(config.theme.position).toBe('right')
    expect(config.theme.mode).toBe('light')
  })
})
