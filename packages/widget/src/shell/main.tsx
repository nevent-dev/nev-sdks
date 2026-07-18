import { render } from 'preact'
import { App, type ShellBus } from './app'
import { open as openEnvelope, seal, isCommand, LOADER_TO_SHELL } from '../protocol/envelope'
import { createSessionClient as realCreateSessionClient } from './session'

interface ShellOptions {
  apiBase: string
  createClient?: typeof realCreateSessionClient
}

export function startShell(w: Window, opts: ShellOptions): void {
  const instanceId = w.location.hash.slice(1)
  const createClient = opts.createClient ?? realCreateSessionClient
  let parent: { post: (env: unknown) => void; origin: string } | null = null
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
      const origin = ev.origin // SIEMPRE del evento, nunca del payload (spec §4.1)
      parent = { post: (e) => source.postMessage(e, origin), origin }
      const { installationId } = env.payload as { installationId: string }
      void createClient({ apiBase: opts.apiBase, installationId, embeddingOrigin: origin }).then((client) => {
        const root = w.document.getElementById('root')
        if (root) render(<App config={client.getConfig()} bus={bus} />, root)
      })
      return
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
