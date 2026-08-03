import type { WidgetConfig, WidgetSession } from '../contract/types'
import { normalizeWelcome } from '../contract/normalize-welcome'
import { resolveLocale } from '../contract/locale'
import { STRINGS } from '../panel/strings'

export interface SessionClient {
  getConfig(): WidgetConfig
  // Task W3: snapshot INMUTABLE tomado en el momento de crear/resumir la
  // sesión — nunca la mutable interna que refresh() reasigna (RefreshResponse
  // no trae resumeSecret; leerlo perezosamente de ahí devolvería undefined
  // tras el primer refresh).
  getSession(): WidgetSession
  // Task W3c: el resumeSecret VIGENTE — arranca igual que getSession().resumeSecret,
  // pero a diferencia de ese snapshot inmutable SÍ se actualiza si un refresh
  // posterior devuelve uno nuevo (el contrato actual de POST /sessions/refresh
  // no lo trae, pero se tolera por si un futuro despliegue lo añade). Un
  // re-bootstrap (shell/app.tsx, Task W4) o la persistencia en el dominio
  // anfitrión (session_persist) deben sourcear SIEMPRE este valor, nunca el
  // snapshot inmutable de getSession() — ese solo existe para blindar
  // token/expiresInSeconds contra la ausencia de resumeSecret en RefreshResponse.
  getCurrentResumeSecret(): string
  // true cuando el backend confirma un resume genuino — lee el campo `resumed`
  // explícito de la respuesta de POST /sessions (Task W3c) cuando está
  // presente. La rotación-con-solape del backend (W3b) hace que el
  // resumeSecret devuelto en un resume real sea SIEMPRE distinto al enviado,
  // así que comparar ambos (como hacía esta task antes de W3c) queda roto:
  // TODO resume genuino se leía como false. El echo-compare se conserva SOLO
  // como fallback para un backend aún no desplegado con el campo `resumed`
  // (ausente en la respuesta) — mid-rollout, sin romper nada.
  wasResumed(): boolean
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>
  // Task W4: se dispara UNA vez (latch) cuando authorizedFetch agota su único
  // ciclo 401→refresh→retry sin recuperar la sesión — el refresh() lanza, o el
  // reintento post-refresh vuelve a devolver 401 — la señal de que la sesión
  // server-side ya no existe / no es recuperable con ESTE cliente. Nunca un
  // string lanzado que el llamante tendría que parsear (spec del report W4).
  // Un suscriptor tardío (llama DESPUÉS de que ya ocurriera) se notifica
  // igual, una vez, para que un efecto que se re-suscribe tras un re-render
  // nunca se pierda una muerte ya latcheada.
  onSessionDead(cb: () => void): () => void
  destroy(): void
}

interface Options {
  apiBase: string
  installationId: string
  embeddingOrigin: string
  fetchFn?: typeof fetch
  // Blob persistido por el loader en el dominio anfitrión (Task W3, ver
  // loader/session-storage.ts). null/ausente = visitante nuevo o sin nada
  // recuperable — se crea sesión fresca igual que antes de esta task.
  resumeSecret?: string | null
  // Plan 4 (locale): idioma de la página anfitriona (document.documentElement.lang,
  // detectado por el loader y propagado vía ?lang= hasta shell/main.tsx#startShell)
  // — PRIORITARIO sobre config.locale a la hora de elegir el fallback
  // localizado de assistantName, misma prioridad que usa app.tsx para el
  // resto del copy (host > config.locale > 'es'). null/ausente si el host no
  // declaró lang o no es uno de los 4 soportados: cae a config.locale.
  hostLocale?: string | null
}

export async function createSessionClient(opts: Options): Promise<SessionClient> {
  const fetchFn = opts.fetchFn ?? fetch
  const base = opts.apiBase.replace(/\/$/, '')
  const installationBase = `${base}/widget/v1/installations/${opts.installationId}`

  const configRes = await fetchFn(`${installationBase}/config`)
  if (!configRes.ok) throw new Error(`config_failed:${configRes.status}`)
  const rawConfig = (await configRes.json()) as Record<string, unknown>
  const { welcome: _rawWelcome, ...rawConfigWithoutWelcome } = rawConfig
  const welcome = normalizeWelcome(rawConfig['welcome'])
  // assistantName es otro campo NO CONFIABLE (drift de contrato cazado en
  // integración E2E, Task 17: el backend real puede omitirlo por completo).
  // A diferencia de welcome (que puede estar legítimamente ausente), todo
  // consumidor aguas abajo (cabecera, aria-label) necesita SIEMPRE un nombre
  // — se normaliza aquí, en la frontera, con el mismo fallback que ya usa el
  // resto del shell para "sin nombre de agente todavía", ahora localizado
  // (Plan 4): misma prioridad host > config.locale > 'es' que app.tsx, para
  // que este fallback nunca quede en español cuando el resto del copy ya
  // resolvió a otro idioma.
  const rawLocale = rawConfig['locale']
  const effectiveLocale = resolveLocale(opts.hostLocale) ?? resolveLocale(typeof rawLocale === 'string' ? rawLocale : undefined) ?? 'es'
  const rawAssistantName = rawConfig['assistantName']
  const assistantName = typeof rawAssistantName === 'string' && rawAssistantName.trim().length > 0
    ? rawAssistantName
    : STRINGS[effectiveLocale].assistantFallback
  const config: WidgetConfig = { ...(rawConfigWithoutWelcome as unknown as WidgetConfig), assistantName, ...(welcome ? { welcome } : {}) }

  const sessionRes = await fetchFn(`${installationBase}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeddingOrigin: opts.embeddingOrigin, ...(opts.resumeSecret ? { resumeSecret: opts.resumeSecret } : {}) }),
  })
  if (!sessionRes.ok) throw new Error(`session_failed:${sessionRes.status}`)
  let session = (await sessionRes.json()) as WidgetSession

  // Snapshot tomado AQUÍ, antes de que refresh() pueda reasignar `session` a
  // algo sin resumeSecret — ver comentario de SessionClient#getSession arriba.
  const issuedSession: WidgetSession = { token: session.token, expiresInSeconds: session.expiresInSeconds, resumeSecret: session.resumeSecret }
  // Task W3c: `resumed` explícito manda cuando el backend lo envía; el
  // echo-compare de antes de esta task solo sobrevive como fallback — ver
  // comentario de SessionClient#wasResumed arriba.
  const resumed = typeof session.resumed === 'boolean'
    ? session.resumed
    : (opts.resumeSecret != null && opts.resumeSecret.length > 0 && opts.resumeSecret === session.resumeSecret)

  // Task W3c: resumeSecret VIGENTE — ver comentario de SessionClient#getCurrentResumeSecret.
  let currentResumeSecret = issuedSession.resumeSecret

  let refreshing: Promise<void> | null = null
  let destroyed = false

  // Task W4: latch de muerte de sesión — `dead` nunca vuelve a `false` (una
  // sesión no resucita; la recuperación real es un re-bootstrap con un
  // cliente NUEVO, no reactivar este). `deadListeners` no se vacía al
  // disparar: un suscriptor tardío debe seguir viendo `dead === true` y
  // notificarse al instante (ver onSessionDead más abajo).
  let dead = false
  const deadListeners = new Set<() => void>()
  const markDead = (): void => {
    if (dead) return
    dead = true
    for (const l of deadListeners) l()
  }

  const refresh = (): Promise<void> => {
    refreshing ??= (async () => {
      try {
        const res = await fetchFn(`${base}/widget/v1/sessions/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        })
        if (res.ok) {
          session = (await res.json()) as WidgetSession
          // Task W3c: el contrato real de RefreshResponse hoy no trae
          // resumeSecret (ver SessionClient#getSession) — esto tolera que un
          // futuro despliegue lo añada, sin romper nada si sigue ausente.
          if (typeof session.resumeSecret === 'string' && session.resumeSecret.length > 0) {
            currentResumeSecret = session.resumeSecret
          }
        }
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
    try {
      await refresh()
    } catch (err) {
      // El refresh en sí falló (red caída, sesión ya no existe server-side,
      // etc.) — este authorizedFetch concreto sigue propagando el error tal
      // cual (comportamiento preexistente: un llamante puede reintentar más
      // tarde y recuperarse si el refresh vuelve a funcionar), pero la señal
      // de "puede que esta sesión ya no sea recuperable" se dispara igual.
      markDead()
      throw err
    }
    const second = await doFetch()
    if (second.status === 401) markDead() // refresh "funcionó" pero el reintento sigue sin autorizar: sesión muerta
    return second
  }

  return {
    getConfig: () => config,
    getSession: () => issuedSession,
    getCurrentResumeSecret: () => currentResumeSecret,
    wasResumed: () => resumed,
    authorizedFetch,
    onSessionDead: (cb) => {
      deadListeners.add(cb)
      if (dead) cb()
      return () => { deadListeners.delete(cb) }
    },
    destroy: () => {
      destroyed = true
    },
  }
}
