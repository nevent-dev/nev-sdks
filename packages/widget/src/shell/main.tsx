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

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  const createClient = opts.createClient ?? realCreateSessionClient
  let parent: { post: (env: unknown) => void; origin: string; source: Window } | null = null
  let commandCb: ((type: string, payload: unknown) => void) | null = null

  const bus: ShellBus = {
    onCommand: (cb) => { commandCb = cb },
    emit: (type, payload = null) => parent?.post(seal(type, payload, instanceId)),
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
      parent = { post: (e) => source.postMessage(e, origin), origin, source }
      void createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin })
        .then((client) => {
          applyTheme(document.documentElement, client.getConfig().theme)
          const root = w.document.getElementById('root')
          if (root) render(<App config={client.getConfig()} bus={bus} />, root)
        })
        .catch((err: unknown) => {
          // TODO(plan de theming): reenviar al parent vía bus.emit('error', ...)
          // para que el anfitrión pueda reaccionar (p.ej. 403 por embeddingOrigin
          // no permitido). Por ahora, al menos no morir en silencio.
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
