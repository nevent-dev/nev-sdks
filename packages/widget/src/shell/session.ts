import type { WidgetConfig, WidgetSession } from '../contract/types'

export interface SessionClient {
  getConfig(): WidgetConfig
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>
  destroy(): void
}

interface Options {
  apiBase: string
  installationId: string
  embeddingOrigin: string
  fetchFn?: typeof fetch
}

export async function createSessionClient(opts: Options): Promise<SessionClient> {
  const fetchFn = opts.fetchFn ?? fetch
  const base = opts.apiBase.replace(/\/$/, '')
  const installationBase = `${base}/widget/v1/installations/${opts.installationId}`

  const configRes = await fetchFn(`${installationBase}/config`)
  if (!configRes.ok) throw new Error(`config_failed:${configRes.status}`)
  const config = (await configRes.json()) as WidgetConfig

  const sessionRes = await fetchFn(`${installationBase}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeddingOrigin: opts.embeddingOrigin }),
  })
  if (!sessionRes.ok) throw new Error(`session_failed:${sessionRes.status}`)
  let session = (await sessionRes.json()) as WidgetSession

  let refreshing: Promise<void> | null = null
  let destroyed = false

  const refresh = (): Promise<void> => {
    refreshing ??= (async () => {
      try {
        const res = await fetchFn(`${base}/widget/v1/sessions/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        })
        if (res.ok) session = (await res.json()) as WidgetSession
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  }

  const authorizedFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    if (destroyed) throw new Error('session_destroyed')
    const doFetch = (): Promise<Response> =>
      fetchFn(`${base}${path}`, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), Authorization: `Bearer ${session.token}` } })
    const first = await doFetch()
    if (first.status !== 401) return first
    await refresh()
    return doFetch()
  }

  return {
    getConfig: () => config,
    authorizedFetch,
    destroy: () => {
      destroyed = true
    },
  }
}
