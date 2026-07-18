import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { WidgetConfig } from '../contract/types'
import type { SessionClient } from './session'
import { createTransport } from '../transport'
import { useStoreState } from '../panel/use-store'
import { useUnreadCount } from '../panel/use-unread-count'
import { Panel } from '../panel/Panel'
import { Launcher } from '../panel/Launcher'

interface ViewportState {
  kind: 'mobile' | 'desktop'
  height: number
}

export interface ShellBus {
  onCommand(cb: (type: string, payload: unknown) => void): void
  emit(type: string, payload?: unknown): void
  // Último mensaje `viewport` recibido, RETENIDO por main.tsx (Step 2)
  // incluso si nadie estaba escuchando todavía — nunca una promesa: App lo
  // lee de forma síncrona en su useState perezoso (Critical, ronda 3).
  getLatchedViewport(): ViewportState | null
}

export function App({ client, bus }: { client: SessionClient; bus: ShellBus }) {
  const config: WidgetConfig = client.getConfig()
  const [isOpen, setOpen] = useState(false)
  // Inicializador perezoso: se ejecuta UNA vez, síncronamente, en el primer
  // render — nunca un valor inventado si el loader ya reportó el viewport
  // real mientras createClient() seguía pendiente (Critical, ronda 3).
  const [viewport, setViewport] = useState<ViewportState>(() => bus.getLatchedViewport() ?? { kind: 'desktop', height: 0 })
  const openedBeforeRef = useRef(false)
  const transport = useMemo(() => createTransport(client), [client])
  const storeState = useStoreState(transport.store)
  const unread = useUnreadCount(storeState, isOpen)

  useEffect(() => {
    bus.onCommand((type, payload) => {
      if (type === 'open') setOpen(true)
      else if (type === 'close') setOpen(false)
      else if (type === 'toggle') setOpen((v) => !v)
      else if (type === 'viewport') {
        // Mensaje del loader (Task 12) — única fuente de "¿es móvil?": el
        // shell NUNCA llama a matchMedia contra su propio iframe (Critical
        // ronda 2: eso producía el bucle 104×104 en desktop). El latch
        // (arriba) ya cubrió el mensaje inicial recibido antes de este
        // efecto; a partir de aquí, cada `viewport` NUEVO sigue este camino.
        const p = payload as { kind?: unknown; height?: unknown } | null
        if (p?.kind === 'mobile' || p?.kind === 'desktop') {
          setViewport({ kind: p.kind, height: typeof p.height === 'number' ? p.height : 0 })
        }
      }
    })
  }, [bus])

  useEffect(() => {
    bus.emit(isOpen ? 'opened' : 'closed')
  }, [isOpen, bus])

  useEffect(() => {
    // D7 (spec, decisión #7): el canal de eventos vive solo con el panel
    // abierto — se cierra al cerrarlo, nunca queda en background.
    if (isOpen) transport.openChannel()
    else transport.closeChannel()
  }, [isOpen, transport])

  useEffect(() => () => transport.destroy(), [transport])

  const close = (): void => { openedBeforeRef.current = true; setOpen(false) }
  // position viaja en CADA resize — el loader (Task 12) lo usa para anclar
  // el contenedor a la esquina correcta. viewportKind viaja también (Critical
  // ronda 3, Task 12): el shell es quien sabe su propio viewport ya latcheado
  // — el loader lo usa para no confundir un resize del panel fullscreen móvil
  // con uno del panel real de escritorio.
  const onResize = (width: number, height: number): void =>
    bus.emit('resize', { width, height, position: config.theme.position === 'left' ? 'left' : 'right', viewportKind: viewport.kind })

  return (
    <div data-part="root" data-mode={isOpen ? 'panel' : 'launcher'} data-viewport={viewport.kind}>
      {isOpen ? (
        <Panel config={config} transport={transport} onMinimize={close} onClose={close} onResize={onResize}
          viewportKind={viewport.kind} viewportHeight={viewport.height} />
      ) : (
        <Launcher unreadCount={unread} autofocus={openedBeforeRef.current} onOpen={() => setOpen(true)} onResize={onResize} />
      )}
    </div>
  )
}
