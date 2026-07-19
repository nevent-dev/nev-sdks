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
import { createSessionClient as realCreateSessionClient } from './session'
import { applyTheme } from '../panel/theme'

interface ShellOptions {
  apiBase: string
  createClient?: typeof realCreateSessionClient
}

interface ViewportPayload { kind: 'mobile' | 'desktop'; height: number }

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  const createClient = opts.createClient ?? realCreateSessionClient
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
      const storedSession = payload?.['session'] as { resumeSecret?: unknown } | null | undefined
      const resumeSecret = typeof storedSession?.resumeSecret === 'string' ? storedSession.resumeSecret : null
      parent = { post: (e) => source.postMessage(e, origin), origin, source }
      void createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin, resumeSecret })
        .then((client) => {
          // Reenvía al loader lo que el backend acaba de emitir (mismo
          // resumeSecret en un resume genuino, uno nuevo en una sesión
          // fresca) para que sobreviva al próximo reload/pestaña — el loader
          // es quien puede escribirlo en el storage del anfitrión, el shell
          // (iframe) no.
          bus.emit('session_persist', { resumeSecret: client.getSession().resumeSecret })
          applyTheme(document.documentElement, client.getConfig().theme)
          const root = w.document.getElementById('root')
          if (root) render(<App client={client} bus={bus} resumedSession={client.wasResumed()} />, root)
        })
        .catch((err: unknown) => {
          console.error('[nevent-widget] fallo al arrancar la sesión', err)
        })
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
