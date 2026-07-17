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
// import.meta.env.VITEST es la señal oficial de Vitest (process.env.VITEST
// también expuesto en import.meta.env) para no auto-arrancar bajo test.
// Se lee vía cast: tsconfig.build.json (types: []) no trae los tipos
// ambientales de vite/client que declaran ImportMeta.env.
const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env
if (typeof document !== 'undefined' && !viteEnv?.['VITEST'] && document.getElementById('root')) {
  startShell(window, { apiBase: (document.querySelector('meta[name="nevw-api"]') as HTMLMetaElement | null)?.content ?? 'https://api.nevent.es' })
}
