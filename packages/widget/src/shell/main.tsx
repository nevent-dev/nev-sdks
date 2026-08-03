import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../panel/tokens.css'
import '../panel/panel.css'
import { render } from 'preact'
import { App, type ShellBus } from './app'
import { open as openEnvelope, seal, isCommand, LOADER_TO_SHELL } from '../protocol/envelope'
import { createSessionClient as realCreateSessionClient, type SessionClient } from './session'
import { applyTheme } from '../panel/theme'
import type { LastSeen } from '../panel/use-unread-count'
import { createBackoff, type Backoff } from '../transport/backoff'
import type { Scheduler } from '../transport/events-channel'

interface ShellOptions {
  apiBase: string
  createClient?: typeof realCreateSessionClient
  scheduler?: Scheduler
  backoff?: Backoff
}

// Clasifica un fallo de arranque (config o sesión) en TRANSITORIO
// (reintentable: la ventana de rate limit se libera sola, un despliegue en
// curso se resuelve solo) o DELIBERADO (morir cerrado sin reintentar —
// reintentar no cambiaría el resultado y solo martillearía al backend).
// session.ts lanza `config_failed:<status>` / `session_failed:<status>` (ver
// session.ts); un fallo de red (el fetch nunca llega al servidor: offline,
// DNS, conexión reseteada) lanza un TypeError nativo, nunca uno de esos dos
// formatos — de ahí el chequeo aparte. Por defecto (formato irreconocible,
// o cualquier status no listado como transitorio) se considera DELIBERADO:
// nunca asumir que un error desconocido es seguro de reintentar.
export function isRetriableBootError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (!(err instanceof Error)) return false
  const match = /^(?:config_failed|session_failed):(\d+)$/.exec(err.message)
  if (!match) return false
  const status = Number(match[1])
  return status === 429 || (status >= 500 && status < 600)
}

interface ViewportPayload { kind: 'mobile' | 'desktop'; height: number }

// Frontera loader→shell (postMessage, no trusted): el shell valida el
// lastSeen del init POR SU CUENTA, igual que ya hace con resumeSecret en la
// línea de abajo — nunca confía en que el otro lado del mensaje ya lo
// validó. Mismas reglas que loader/session-storage.ts#parseLastSeen
// (conversationId y messageId, ambos string no vacíos), duplicadas aquí a
// propósito: loader/ y shell/ son capas separadas (host vs. iframe) y cada
// una valida su propio lado del contrato, sin importar cross-package.
function parseLastSeenPayload(raw: unknown): LastSeen | null {
  if (typeof raw !== 'object' || raw === null) return null
  const conversationId = (raw as Record<string, unknown>)['conversationId']
  const messageId = (raw as Record<string, unknown>)['messageId']
  if (typeof conversationId !== 'string' || conversationId.length === 0) return null
  if (typeof messageId !== 'string' || messageId.length === 0) return null
  return { conversationId, messageId }
}

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  // Plan 4 (locale): lang detectado por el loader en la página anfitriona
  // (document.documentElement.lang) y propagado como ?lang=<code> en la URL
  // del propio shell (ver loader/index.ts) — se lee UNA VEZ al arrancar (no
  // cambia durante la vida de este shell) y se reenvía tanto a createClient
  // (fallback de assistantName, session.ts) como a <App> (locale efectivo de
  // toda la UI, app.tsx) para que ambos resuelvan EXACTAMENTE el mismo
  // locale, con la misma prioridad host > config.locale > 'es'.
  const hostLocale = new URLSearchParams(w.location.search).get('lang')
  const createClient = opts.createClient ?? realCreateSessionClient
  const scheduler: Scheduler = opts.scheduler ?? {
    setTimeout: (fn, ms) => w.setTimeout(fn, ms),
    clearTimeout: (id) => w.clearTimeout(id),
  }
  // Base 5s / factor 2 / tope 60s: la ventana de rate limit del backend es de
  // 60s (10 POST /sessions por IP), así que el primer reintento ya espera
  // algo razonable y el tope garantiza que, pasada esa ventana, el visitante
  // legítimo entra en el primer o segundo intento útil sin martillear al
  // backend mientras tanto.
  const backoff: Backoff = opts.backoff ?? createBackoff({ baseMs: 5000, factor: 2, maxMs: 60000 })
  let parent: { post: (env: unknown) => void; origin: string; source: Window } | null = null
  let commandCb: ((type: string, payload: unknown) => void) | null = null
  let latchedViewport: ViewportPayload | null = null

  const bus: ShellBus = {
    onCommand: (cb) => { commandCb = cb },
    emit: (type, payload = null) => parent?.post(seal(type, payload, instanceId)),
    getLatchedViewport: () => latchedViewport,
  }

  w.addEventListener('message', (ev: MessageEvent) => {
    const env = openEnvelope(ev.data, { instanceId })
    if (!env || !isCommand(env.type, LOADER_TO_SHELL)) return
    if (env.type === 'init') {
      if (parent) return
      const source = ev.source as Window | null
      if (!source) return
      const payload = env.payload as Record<string, unknown> | null | undefined
      const installationId = payload?.['installationId']
      // Validar ANTES de fijar `parent`: un init con envelope válido pero
      // payload basura no debe comprometer el guard `if (parent) return` de
      // arriba, o un init real posterior del anfitrión quedaría bloqueado
      // para siempre (brick/DoS).
      if (typeof installationId !== 'string' || installationId.length === 0) return
      const origin = ev.origin // SIEMPRE del evento, nunca del payload (spec §4.1)
      // Task W3: el loader reenvía aquí lo que tenía persistido en el
      // dominio anfitrión (ver loader/session-storage.ts) — null si es un
      // visitante nuevo o no había nada guardado.
      const storedSession = payload?.['session'] as { resumeSecret?: unknown; lastSeen?: unknown } | null | undefined
      const resumeSecret = typeof storedSession?.resumeSecret === 'string' ? storedSession.resumeSecret : null
      // Watermark de no-leídos guardado en una visita anterior (ver
      // loader/session-storage.ts) — null si es un visitante nuevo, si nunca
      // se abrió el panel, o si el payload venía corrupto.
      const initialLastSeen = parseLastSeenPayload(storedSession?.lastSeen)
      parent = { post: (e) => source.postMessage(e, origin), origin, source }
      // Task W4: misma fábrica para el arranque inicial y para un
      // re-bootstrap en caliente tras una muerte de sesión a mitad de vida
      // (App la invoca vía la prop createSession cuando SessionClient#onSessionDead
      // se dispara) — el POST /sessions real es idéntico en ambos casos,
      // solo cambia el resumeSecret que se le pasa.
      const buildClient = (secret: string | null) =>
        createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin, resumeSecret: secret, hostLocale })

      const mountFromClient = (client: SessionClient): void => {
        // Reenvía al loader lo que el backend acaba de emitir (mismo
        // resumeSecret en un resume genuino, uno nuevo en una sesión
        // fresca) para que sobreviva al próximo reload/pestaña — el loader
        // es quien puede escribirlo en el storage del anfitrión, el shell
        // (iframe) no. Task W3c: el VIGENTE (getCurrentResumeSecret()), no
        // el snapshot inmutable de getSession() — ver shell/session.ts.
        // Payload completo SIEMPRE (ver diseño de la task): si el init trajo
        // un lastSeen, se re-emite igual aquí — el loader escribe el blob
        // entero sin merge, así que omitirlo borraría el watermark que el
        // propio init acaba de traer.
        bus.emit('session_persist', { resumeSecret: client.getCurrentResumeSecret(), ...(initialLastSeen ? { lastSeen: initialLastSeen } : {}) })
        applyTheme(document.documentElement, client.getConfig().theme)
        const root = w.document.getElementById('root')
        if (root) render(<App client={client} bus={bus} resumedSession={client.wasResumed()} createSession={buildClient} initialLastSeen={initialLastSeen} hostLocale={hostLocale} />, root)
      }

      // Bug real: un visitante que hace ~10 hard-reloads rápidos agota el
      // rate limit del backend (10 POST /sessions por IP/60s) → 429 → antes
      // de este fix el catch de abajo solo logueaba y el shell quedaba
      // MUERTO en silencio (sin launcher) hasta una recarga manual posterior
      // a la ventana. attemptBootstrap reintenta el MISMO flujo completo
      // (config + sesión) desde cero ante un fallo TRANSITORIO — nunca un
      // fetch a medias — así que un éxito tardío monta la App exactamente
      // por el mismo camino que el arranque feliz (mountFromClient), sin
      // registrar nada nuevo en el bus ni volver a esperar otro init:
      // installationId/origin ya están capturados en el closure de ESTE
      // init, que es el único que se llega a aceptar (`if (parent) return`
      // de arriba bloquea cualquier init posterior).
      // Sin tope de reintentos a propósito: la ventana de rate limit se
      // libera sola en 60s y cualquier otro fallo transitorio (backend
      // reiniciándose) es cuestión de tiempo — un visitante legítimo debe
      // acabar entrando solo, sin quedar atrapado por un número mágico de
      // intentos agotados. El backoff (tope 60s) evita que ese reintento
      // indefinido martillee al backend mientras tanto.
      // then de DOS brazos a propósito: el clasificador de reintentos solo
      // ve rechazos de buildClient (red/config/sesión). Un throw DENTRO de
      // mountFromClient (render, tema, datos malformados) también sería
      // TypeError muchas veces — con .then(f).catch(g) entraría al
      // clasificador y reintentaría el bootstrap entero en bucle, creando
      // una sesión nueva por intento sin arreglar nada. El fallo de montaje
      // muere logueado, sin reintento.
      const attemptBootstrap = (): void => {
        void buildClient(resumeSecret).then(
          client => {
            try {
              mountFromClient(client)
            } catch (err) {
              console.error('[nevent-widget] fallo al montar el widget', err)
            }
          },
          (err: unknown) => {
            if (isRetriableBootError(err)) {
              scheduler.setTimeout(attemptBootstrap, backoff.nextDelay())
              return
            }
            // Fallo DELIBERADO (403 origen no permitido, 404 instalación
            // apagada/inexistente, 401, o cualquier otro no reconocido):
            // morir cerrado sin reintentar — comportamiento preexistente
            // intacto (mismo criterio fail-closed que W8).
            console.error('[nevent-widget] fallo al arrancar la sesión', err)
          },
        )
      }
      attemptBootstrap()
      return
    }
    // Comandos post-init: exigir el MISMO source y el MISMO origin que el
    // parent vinculado en init (spec §3.3), igual que hace el loader con el
    // shell. El instanceId no es secreto (va en el hash del src del iframe,
    // legible por cualquier script co-residente en la página), así que sin
    // esta comprobación cualquier tercero en la página podría pilotar el
    // widget suplantando al anfitrión real.
    if (!parent || ev.source !== parent.source || ev.origin !== parent.origin) return
    // Retener el ÚLTIMO viewport SIEMPRE, exista o no ya un App montado
    // escuchando (commandCb puede seguir siendo null: createClient() es
    // async). Sin este latch, un viewport que llega durante esa espera se
    // pierde y App monta con el fallback {kind:'desktop', height:0} inventado
    // — en móvil, sin otro cambio de breakpoint ni de VisualViewport, nunca
    // se corrige (Critical, ronda 3).
    if (env.type === 'viewport') {
      const p = env.payload as { kind?: unknown; height?: unknown } | null
      if (p?.kind === 'mobile' || p?.kind === 'desktop') {
        latchedViewport = { kind: p.kind, height: typeof p.height === 'number' ? p.height : 0 }
      }
    }
    commandCb?.(env.type, env.payload)
  })

  // anunciar disponibilidad al parent (targetOrigin '*' SOLO para el ready:
  // aún no conocemos el origin del anfitrión y el envelope no lleva secretos)
  w.parent.postMessage(seal('ready', null, instanceId), '*')
}

// Autoarranque cuando shell.html se carga dentro del iframe real.
// process.env.VITEST (no import.meta.env.VITEST) es la señal real: Vitest 3.x
// fija process.env.VITEST pero no la inyecta en import.meta.env bajo jsdom.
// declare local porque tsconfig.build.json (types: []) no trae @types/node.
declare const process: { env?: Record<string, string | undefined> } | undefined
const isVitest = typeof process !== 'undefined' && !!process.env?.['VITEST']
if (typeof document !== 'undefined' && !isVitest && document.getElementById('root')) {
  startShell(window, { apiBase: (document.querySelector('meta[name="nevw-api"]') as HTMLMetaElement | null)?.content ?? 'https://api.nevent.es' })
}
