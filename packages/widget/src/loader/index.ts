import { installGlobalStub, drainQueue, type ApiStub } from './api-queue'
import { seal, open as openEnvelope, isCommand, SHELL_TO_LOADER } from '../protocol/envelope'

interface LoaderOptions { shellUrl: string }

interface Instance {
  instanceId: string
  installationId: string
  opts: unknown
  container: HTMLElement
  iframe: HTMLIFrameElement
  shellOrigin: string
  listeners: Map<string, Set<(payload: unknown) => void>>
  onMessage: (ev: MessageEvent) => void
}

export function bootLoader(w: Window, opts: LoaderOptions): void {
  const stub = installGlobalStub(w as Window & { NeventWidget?: ApiStub })
  let instance: Instance | null = null

  const sendToShell = (type: string, payload: unknown): void => {
    if (!instance) return
    instance.iframe.contentWindow?.postMessage(seal(type, payload, instance.instanceId), instance.shellOrigin)
  }

  const boot = (installationId: string, bootOpts?: unknown): void => {
    if (instance) return
    const instanceId = `nevw_${Math.random().toString(36).slice(2, 10)}`
    const container = w.document.createElement('div')
    container.style.cssText = 'position:fixed;z-index:2147483647;right:0;bottom:0;width:0;height:0'
    const iframe = w.document.createElement('iframe')
    iframe.title = 'Chat de ayuda'
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.src = `${opts.shellUrl}#${instanceId}`
    iframe.style.cssText = 'border:0;width:0;height:0'
    container.appendChild(iframe)
    // Fallback a documentElement: un <script> clásico en <head> puede ejecutarse
    // antes de que exista document.body.
    ;(w.document.body ?? w.document.documentElement).appendChild(container)
    const shellOrigin = new URL(opts.shellUrl, w.location.href).origin

    const onMessage = (ev: MessageEvent): void => {
      if (!instance) return
      if (ev.origin !== instance.shellOrigin || ev.source !== instance.iframe.contentWindow) return
      const env = openEnvelope(ev.data, { instanceId: instance.instanceId })
      if (!env || !isCommand(env.type, SHELL_TO_LOADER)) return
      if (env.type === 'ready') {
        sendToShell('init', { installationId: instance.installationId, opts: instance.opts })
        return
      }
      instance.listeners.get(env.type)?.forEach((cb) => cb(env.payload))
    }
    w.addEventListener('message', onMessage)
    instance = { instanceId, installationId, opts: bootOpts, container, iframe, shellOrigin, listeners: new Map(), onMessage }
  }

  const destroy = (): void => {
    if (!instance) return
    w.removeEventListener('message', instance.onMessage)
    instance.container.remove()
    instance = null
  }

  drainQueue(stub, (method, args) => {
    switch (method) {
      case 'boot':
        boot(String(args[0]), args[1])
        break
      case 'open':
      case 'close':
      case 'toggle':
      case 'consent':
        sendToShell(method, null)
        break
      case 'update':
        sendToShell('update', args[0] ?? null)
        break
      case 'on': {
        const [event, cb] = args as [string, ((p: unknown) => void) | undefined]
        if (!instance || typeof cb !== 'function') return
        const set = instance.listeners.get(event) ?? new Set()
        set.add(cb)
        instance.listeners.set(event, set)
        break
      }
      case 'off': {
        const [event, cb] = args as [string, (p: unknown) => void]
        instance?.listeners.get(event)?.delete(cb)
        break
      }
      case 'identify':
      case 'reset':
        console.warn(`[NeventWidget] ${method}() está reservado para v1.1 y aún no hace nada`)
        break
      case 'destroy':
        destroy()
        break
      default:
        console.warn(`[NeventWidget] método desconocido: ${method}`)
    }
  })
}

// Autoarranque cuando se carga como script clásico en una página host.
// document.currentScript solo está definido durante la ejecución síncrona de
// un <script> clásico; en un import ESM (p.ej. bajo Vitest) es null, así que
// esta guarda basta para no auto-arrancar en tests sin depender de globals
// inyectadas por el bundler.
if (typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement) {
  const currentScript = document.currentScript
  const shellUrl = currentScript.getAttribute('data-shell') ?? new URL('./shell.html', currentScript.src).href
  bootLoader(window, { shellUrl })
}
