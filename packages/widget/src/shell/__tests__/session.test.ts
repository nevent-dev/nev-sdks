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
  it('el token no se persiste en storage', async () => {
    const { fetchFn } = mockApi()
    await createSessionClient({ ...OPTS, fetchFn })
    expect(Object.keys(localStorage)).toHaveLength(0)
    expect(Object.keys(sessionStorage)).toHaveLength(0)
  })
})
