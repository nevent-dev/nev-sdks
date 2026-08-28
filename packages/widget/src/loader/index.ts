import { installGlobalStub, drainQueue, type ApiStub } from './api-queue'
import { seal, open as openEnvelope, isCommand, SHELL_TO_LOADER } from '../protocol/envelope'
import { readSessionBlob, writeSessionBlob, parseLastSeen } from './session-storage'
import { resolveLocale, type WidgetLocale } from '../contract/locale'

// Mapa MÍNIMO propio de títulos para iframe.title (Plan 4) — deliberadamente
// NO importa panel/strings.ts: ese módulo trae los diccionarios completos de
// las 4 traducciones y engordaría el bundle IIFE del loader (vite.loader.config.ts)
// para una única clave que el loader necesita fuera de la propia shell.
const LOADER_TITLES: Record<WidgetLocale, string> = {
  es: 'Chat de ayuda',
  en: 'Help chat',
  ca: "Xat d'ajuda",
  pt: 'Chat de ajuda',
}

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
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

// Validación PROPIA del surface que llega del shell por postMessage (frontera
// no confiable, spec §7) — mismo allowlist hex3/hex6 que panel/theme.ts
// #isSafeColor, duplicado a propósito: importar panel/ engordaría el bundle
// IIFE del loader (mismo criterio que LOADER_TITLES arriba) y cada capa
// valida su propio lado del contrato (mismo patrón que parseLastSeenPayload
// en shell/main.tsx).
const SAFE_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

// Espejo mínimo del --surface claro/oscuro de panel/tokens.css — SOLO el
// fallback del backplate antes de que llegue el primer `opened{surface}` (o
// si un shell antiguo no lo manda): el color autoritativo siempre es el que
// reporta el shell, que resuelve el tema completo (config + data-theme).
const SURFACE_FALLBACK = { light: '#ffffff', dark: '#171a21' }

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
  // --surface resuelto reportado por el shell en `opened` (ya validado por
  // SAFE_HEX) — color del backplate móvil. null: usa SURFACE_FALLBACK.
  panelSurface: string | null
  mobileQuery: MediaQueryList
  onMobileChange: () => void
  onVisualViewportChange: (() => void) | null
}

const RESET_STYLE: Record<string, string> = {
  position: '', zIndex: '', inset: '', top: '', right: '', bottom: '', left: '', width: '', height: '', background: '',
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
  // de dentro del iframe — ver sendViewport). Dos superficies con geometrías
  // DISTINTAS a propósito:
  //
  // - El CONTENEDOR es un backplate opaco fixed inset:0 que cubre el layout
  //   viewport COMPLETO. El visual viewport es por definición un
  //   sub-rectángulo del layout viewport, así que el backplate tapa todo lo
  //   visible — incluida la franja que queda detrás del teclado y las barras
  //   translúcidas de iOS 26 (Liquid Glass), que de otro modo dejan ver la
  //   página anfitriona a través. Su color es el --surface que reporta el
  //   shell en `opened` (tema ya resuelto), con fallback por
  //   prefers-color-scheme del host.
  // - El IFRAME sigue la caja REAL de w.visualViewport
  //   (offsetTop/offsetLeft/width/height) para quedar siempre encima del
  //   teclado — NUNCA inset:0: en iOS el teclado puede reducir Y desplazar
  //   lo visible sin mover el viewport de layout (Critical, ronda 3 — WebKit
  //   documenta actualizaciones tardías de estos valores durante la
  //   animación del teclado: https://bugs.webkit.org/show_bug.cgi?id=265578;
  //   con el backplate detrás, ese retardo es solo cosmético: la anfitriona
  //   nunca asoma).
  //
  // Sin VisualViewport (navegador sin soporte), el iframe rellena el
  // backplate al 100%. En cualquier otro caso, ancla por `position` con el
  // `launcherSize`/`desktopPanelSize` reportado EN CADA MODO — nunca uno
  // contaminado por el otro.
  const applySizing = (): void => {
    if (!instance) return
    if (instance.mode === 'panel' && instance.isMobile) {
      const surface = instance.panelSurface
        ?? (w.matchMedia(DARK_SCHEME_QUERY).matches ? SURFACE_FALLBACK.dark : SURFACE_FALLBACK.light)
      setBoxStyle(instance.container, { position: 'fixed', zIndex: '2147483647', inset: '0px', background: surface })
      const vv = w.visualViewport
      if (vv) {
        setBoxStyle(instance.iframe, {
          position: 'absolute', border: '0',
          top: `${Math.round(vv.offsetTop)}px`, left: `${Math.round(vv.offsetLeft)}px`,
          width: `${Math.round(vv.width)}px`, height: `${Math.round(vv.height)}px`,
        })
      } else {
        setBoxStyle(instance.iframe, { border: '0', width: '100%', height: '100%' })
      }
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
    // Idioma de la página anfitriona (document.documentElement.lang, p.ej.
    // "en" o "en-US") — se propaga a la shell vía ?lang= en la URL del
    // iframe (Plan 4) para que resuelva el locale efectivo ANTES de montar
    // App, sin depender solo de config.locale (que no llega hasta que
    // termina el fetch de red). null si el host no declaró lang o no es uno
    // de los 4 soportados: la shell cae a config.locale/'es', igual que
    // antes de esta task.
    const hostLocale = resolveLocale(w.document.documentElement.lang)
    iframe.title = LOADER_TITLES[hostLocale ?? 'es']
    // allow-popups(+escape): el powered-by y los enlaces http(s) del bot abren
    // en pestaña nueva; sin escape heredarían el sandbox y quedarían en blanco.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox')
    // El hash (#instanceId) tiene que sobrevivir intacto — es lo que el shell
    // lee para saber su propia identidad de instancia (ver shell/main.tsx).
    iframe.src = hostLocale ? `${opts.shellUrl}?lang=${hostLocale}#${instanceId}` : `${opts.shellUrl}#${instanceId}`
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
        // Task W3: el blob de sesión persistido (cookie/localStorage, ver
        // session-storage.ts) viaja en el mismo init que installationId/opts
        // — el shell lo usa para intentar un resume en vez de crear sesión
        // nueva. null si no hay nada guardado (visitante nuevo / expiró).
        const session = readSessionBlob(w.document, w, instance.installationId)
        sendToShell('init', { installationId: instance.installationId, opts: instance.opts, session })
        sendViewport()
        return
      }
      if (env.type === 'session_persist') {
        // Interno shell→loader: nunca se reenvía a los listeners públicos de
        // on() más abajo (a diferencia de opened/closed/resize).
        const payload = env.payload as { resumeSecret?: unknown; lastSeen?: unknown } | null | undefined
        const resumeSecret = payload?.resumeSecret
        if (typeof resumeSecret === 'string' && resumeSecret.length > 0) {
          // El shell manda SIEMPRE el payload completo (resumeSecret +
          // lastSeen si lo tiene) — se escribe el blob entero de una vez, sin
          // merge con lo que ya hubiera guardado (ver diseño de la task). Un
          // lastSeen corrupto se descarta EN SILENCIO (parseLastSeen), nunca
          // bloquea la persistencia del resumeSecret.
          const lastSeen = parseLastSeen(payload?.lastSeen)
          writeSessionBlob(w.document, w, instance.installationId, { resumeSecret, ...(lastSeen ? { lastSeen } : {}) })
        }
        return
      }
      if (env.type === 'opened') {
        // El shell manda su --surface resuelto para el backplate móvil (ver
        // applySizing). Validación propia en esta capa (SAFE_HEX): un valor
        // no-hex (o un shell antiguo que no lo manda) deja null → fallback.
        const payload = env.payload as { surface?: unknown } | null | undefined
        const surface = typeof payload?.surface === 'string' ? payload.surface.trim() : null
        instance.panelSurface = surface !== null && SAFE_HEX.test(surface) ? surface : null
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
      mode: 'launcher', isMobile: mobileQuery.matches, position: 'right', desktopPanelSize: null, launcherSize: null, panelSurface: null,
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
