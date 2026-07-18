import { installGlobalStub, drainQueue, type ApiStub } from './api-queue'
import { seal, open as openEnvelope, isCommand, SHELL_TO_LOADER } from '../protocol/envelope'

interface LoaderOptions { shellUrl: string }

// Valores INICIALES por defecto, antes de la primera medición real — nunca
// constantes inmutables (fix ronda 4: rev.3 fijaba LAUNCHER_SIZE para
// siempre, lo que dejaba el launcher desalineado en móviles con
// safe-area-inset-bottom, cuya caja real supera 104px). DEFAULT_PANEL_SIZE
// evita el salto visible a 104×104 al abrir el panel antes de que llegue el
// primer resize real (Critical ronda 3, "opened"/"resize" dependiente del
// orden de llegada) — 430×688 es el tamaño desktop típico del propio panel
// (panel.css, Task 13).
const LAUNCHER_SIZE = { width: 104, height: 104 }
const DEFAULT_PANEL_SIZE = { width: 430, height: 688 }
const MOBILE_QUERY = '(max-width: 480px)'

interface Instance {
  instanceId: string
  installationId: string
  opts: unknown
  container: HTMLElement
  iframe: HTMLIFrameElement
  shellOrigin: string
  listeners: Map<string, Set<(payload: unknown) => void>>
  onMessage: (ev: MessageEvent) => void
  mode: 'launcher' | 'panel'
  isMobile: boolean
  position: 'left' | 'right'
  desktopPanelSize: { width: number; height: number } | null
  launcherSize: { width: number; height: number } | null
  mobileQuery: MediaQueryList
  onMobileChange: () => void
  onVisualViewportChange: (() => void) | null
}

const RESET_STYLE: Record<string, string> = {
  position: '', zIndex: '', inset: '', top: '', right: '', bottom: '', left: '', width: '', height: '',
}

// Asigna geometría PROPIEDAD A PROPIEDAD — nunca `cssText`. Un host con CSP
// `style-src-attr 'none'` bloquea `element.style.cssText = "..."` (se trata
// como fijar el atributo `style` completo desde una cadena) pero SÍ permite
// la asignación de propiedades CSSOM individuales (`el.style.position = ...`),
// igual que `CSSStyleDeclaration.setProperty` en theme.ts (spec §7). Ver
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr
// Siempre se resetea primero para no dejar una propiedad de un modo anterior
// (p.ej. `inset:0` de pantalla completa) a medio pisar tras un cambio de modo.
function setBoxStyle(el: HTMLElement, style: Record<string, string>): void {
  for (const [prop, value] of Object.entries(RESET_STYLE)) (el.style as unknown as Record<string, string>)[prop] = value
  for (const [prop, value] of Object.entries(style)) (el.style as unknown as Record<string, string>)[prop] = value
}

export function bootLoader(w: Window, opts: LoaderOptions): void {
  const stub = installGlobalStub(w as Window & { NeventWidget?: ApiStub })
  let instance: Instance | null = null

  const sendToShell = (type: string, payload: unknown): void => {
    if (!instance) return
    instance.iframe.contentWindow?.postMessage(seal(type, payload, instance.instanceId), instance.shellOrigin)
  }

  // Pantalla completa SOLO con mode==='panel' && isMobile — el launcher
  // cerrado en móvil NUNCA ocupa toda la página (bug "104×104 en bucle" de
  // la ronda 2, cerrado moviendo la detección de móvil aquí, al host, en vez
  // de dentro del iframe — ver sendViewport). El contenedor sigue la caja
  // REAL de w.visualViewport (offsetTop/offsetLeft/width/height) — NUNCA un
  // inset:0 fijo al viewport de LAYOUT completo: en iOS el teclado puede
  // reducir Y desplazar lo visible sin mover el viewport de layout, y un
  // inset:0 dejaría el panel tapado por el teclado o fuera de la zona
  // visible (Critical, ronda 3 — WebKit documenta actualizaciones tardías de
  // estos valores durante la animación del teclado:
  // https://bugs.webkit.org/show_bug.cgi?id=265578). Sin VisualViewport
  // (navegador sin soporte), el viewport de layout es la mejor aproximación
  // disponible. En cualquier otro caso, ancla por `position` con el
  // `launcherSize`/`desktopPanelSize` reportado EN CADA MODO — nunca uno
  // contaminado por el otro.
  const applySizing = (): void => {
    if (!instance) return
    if (instance.mode === 'panel' && instance.isMobile) {
      const vv = w.visualViewport
      if (vv) {
        setBoxStyle(instance.container, {
          position: 'fixed', zIndex: '2147483647',
          top: `${Math.round(vv.offsetTop)}px`, left: `${Math.round(vv.offsetLeft)}px`,
          width: `${Math.round(vv.width)}px`, height: `${Math.round(vv.height)}px`,
        })
      } else {
        setBoxStyle(instance.container, { position: 'fixed', zIndex: '2147483647', inset: '0px', width: '100vw', height: '100dvh' })
      }
      setBoxStyle(instance.iframe, { border: '0', width: '100%', height: '100%' })
      return
    }
    const size = instance.mode === 'panel' ? (instance.desktopPanelSize ?? DEFAULT_PANEL_SIZE) : (instance.launcherSize ?? LAUNCHER_SIZE)
    setBoxStyle(instance.container, {
      position: 'fixed', zIndex: '2147483647', bottom: '0', width: `${size.width}px`, height: `${size.height}px`,
      ...(instance.position === 'left' ? { left: '0' } : { right: '0' }),
    })
    setBoxStyle(instance.iframe, { border: '0', width: '100%', height: '100%' })
  }

  // Detección de móvil ENTERAMENTE del lado del host (fix del bug "104×104 en
  // bucle": el shell, dentro del iframe, no puede distinguir de forma fiable
  // "soy 104px porque soy el launcher" de "soy 104px porque el host es un
  // móvil estrecho" — ambos casos satisfacen la misma media query de ancho).
  // Se envía tras el `init`, en cada cambio de `matchMedia`, y en cada
  // resize/scroll del propio VisualViewport del host (para --viewport-h en
  // Task 14) — el payload sigue siendo solo {kind, height}: offsetTop se
  // consume enteramente en applySizing(), nunca cruza al shell (ver nota de
  // diseño al principio de esta tarea).
  const sendViewport = (): void => {
    if (!instance) return
    const height = w.visualViewport?.height ?? w.innerHeight
    sendToShell('viewport', { kind: instance.isMobile ? 'mobile' : 'desktop', height })
  }

  const boot = (installationId: string, bootOpts?: unknown): void => {
    if (instance) return
    const instanceId = `nevw_${Math.random().toString(36).slice(2, 10)}`
    const container = w.document.createElement('div')
    const iframe = w.document.createElement('iframe')
    iframe.title = 'Chat de ayuda'
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    iframe.src = `${opts.shellUrl}#${instanceId}`
    container.appendChild(iframe)
    // Fallback a documentElement: un <script> clásico en <head> puede ejecutarse
    // antes de que exista document.body.
    ;(w.document.body ?? w.document.documentElement).appendChild(container)
    const shellOrigin = new URL(opts.shellUrl, w.location.href).origin

    const mobileQuery = w.matchMedia(MOBILE_QUERY)
    const onMobileChange = (): void => {
      if (!instance) return
      instance.isMobile = mobileQuery.matches
      applySizing()
      sendViewport()
    }
    mobileQuery.addEventListener('change', onMobileChange)

    // Un mismo handler para 'resize' Y 'scroll': el teclado en iOS puede
    // reducir el visual viewport (resize) o solo desplazarlo (scroll) sin
    // cambiar su tamaño — ambos casos exigen recalcular la geometría del
    // contenedor fullscreen móvil (Critical, ronda 3).
    const onVisualViewportChange = (): void => { applySizing(); sendViewport() }
    w.visualViewport?.addEventListener('resize', onVisualViewportChange)
    w.visualViewport?.addEventListener('scroll', onVisualViewportChange)

    const onMessage = (ev: MessageEvent): void => {
      if (!instance) return
      if (ev.origin !== instance.shellOrigin || ev.source !== instance.iframe.contentWindow) return
      const env = openEnvelope(ev.data, { instanceId: instance.instanceId })
      if (!env || !isCommand(env.type, SHELL_TO_LOADER)) return
      if (env.type === 'ready') {
        sendToShell('init', { installationId: instance.installationId, opts: instance.opts })
        sendViewport()
        return
      }
      if (env.type === 'opened') {
        instance.mode = 'panel'
        applySizing()
      } else if (env.type === 'closed') {
        instance.mode = 'launcher'
        applySizing()
      } else if (env.type === 'resize') {
        const payload = env.payload as { width?: unknown; height?: unknown; position?: unknown; viewportKind?: unknown } | null | undefined
        const width = typeof payload?.width === 'number' ? payload.width : null
        const height = typeof payload?.height === 'number' ? payload.height : null
        if (payload?.position === 'left' || payload?.position === 'right') instance.position = payload.position
        // Filtrado por el MODO PROPIO del loader (nunca solo por
        // viewportKind, que el shell podría reportar mal): un resize solo se
        // promociona a desktopPanelSize si el loader está EN modo panel Y el
        // shell dice que su propio viewport es desktop — así un resize del
        // panel fullscreen móvil (Panel también llama a useResizeReport,
        // Task 13) nunca contamina el tamaño desktop guardado (fix "lastSize"
        // de la ronda 2, ahora también a prueba de cruces desktop↔móvil,
        // Critical ronda 3). En modo launcher, CUALQUIER resize se guarda
        // como launcherSize — el Launcher (Task 13) es lo único que puede
        // estar reportando su tamaño en ese modo.
        if (width !== null && height !== null) {
          if (instance.mode === 'panel' && payload?.viewportKind === 'desktop') instance.desktopPanelSize = { width, height }
          else if (instance.mode === 'launcher') instance.launcherSize = { width, height }
        }
        applySizing()
      }
      // El forward genérico sigue: un anfitrión suscrito a on('resize'/'opened'/'closed', cb)
      // (API pública, spec §3.2) lo recibe igual, además del efecto interno de arriba.
      instance.listeners.get(env.type)?.forEach((cb) => cb(env.payload))
    }
    w.addEventListener('message', onMessage)
    instance = {
      instanceId, installationId, opts: bootOpts, container, iframe, shellOrigin, listeners: new Map(), onMessage,
      mode: 'launcher', isMobile: mobileQuery.matches, position: 'right', desktopPanelSize: null, launcherSize: null,
      mobileQuery, onMobileChange, onVisualViewportChange: w.visualViewport ? onVisualViewportChange : null,
    }
    applySizing()
  }

  const destroy = (): void => {
    if (!instance) return
    w.removeEventListener('message', instance.onMessage)
    instance.mobileQuery.removeEventListener('change', instance.onMobileChange)
    if (instance.onVisualViewportChange) {
      w.visualViewport?.removeEventListener('resize', instance.onVisualViewportChange)
      w.visualViewport?.removeEventListener('scroll', instance.onVisualViewportChange)
    }
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
