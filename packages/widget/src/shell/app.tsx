import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { WidgetConfig } from '../contract/types'
import type { SessionClient } from './session'
import type { MessageStore } from '../store/message-store'
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

// Task W4: cota para el re-bootstrap automático — si la sesión RECONSTRUIDA
// también muriera casi al instante, no reintentar en bucle contra un backend
// genuinamente caído. 5 minutos es una espera corta frente a la duración
// típica de una visita, pero de sobra para no machacar un backend que tarda
// unos segundos/minutos en recuperarse; pasado ese margen, el banner de
// error/offline se queda tal cual y solo una reapertura manual del panel
// vuelve a intentarlo (no hay reintento automático más allá de este único
// rebuild por ventana).
const SESSION_REBUILD_COOLDOWN_MS = 5 * 60 * 1000

export interface AppProps {
  client: SessionClient
  bus: ShellBus
  resumedSession?: boolean
  // Task W4: fábrica para re-bootstrapear la sesión tras una muerte a mitad
  // de vida — el MISMO POST /sessions que el arranque inicial (ver
  // shell/main.tsx#buildClient), parametrizada por el resumeSecret vigente
  // EN ESE MOMENTO (no el del arranque: tras un rebuild previo, el vigente
  // es el que devolvió ESE rebuild). Opcional: sin ella, App se comporta
  // exactamente como antes de esta task — una sesión muerta simplemente deja
  // de reintentar (events-channel.ts) sin ningún intento de recuperación.
  createSession?: (resumeSecret: string | null) => Promise<SessionClient>
}

export function App({ client: initialClient, bus, resumedSession = false, createSession }: AppProps) {
  const [client, setClient] = useState(initialClient)
  const config: WidgetConfig = client.getConfig()
  const [isOpen, setOpen] = useState(false)
  // Inicializador perezoso: se ejecuta UNA vez, síncronamente, en el primer
  // render — nunca un valor inventado si el loader ya reportó el viewport
  // real mientras createClient() seguía pendiente (Critical, ronda 3).
  const [viewport, setViewport] = useState<ViewportState>(() => bus.getLatchedViewport() ?? { kind: 'desktop', height: 0 })
  const openedBeforeRef = useRef(false)
  // Task W4: el MISMO store sobrevive a un swap de cliente (rebuild tras
  // muerte de sesión) — sin esto, cada `client` nuevo produciría un
  // createTransport() con un store VACÍO y el historial ya mostrado en
  // pantalla desaparecería aunque la sesión nueva hubiera resumido de verdad.
  const storeRef = useRef<MessageStore | null>(null)
  const transport = useMemo(() => {
    const t = createTransport(client, storeRef.current ? { store: storeRef.current } : {})
    storeRef.current = t.store
    return t
  }, [client])
  const storeState = useStoreState(transport.store)
  const unread = useUnreadCount(storeState, isOpen)
  // Task W4: guards del re-bootstrap automático — refs (no state) porque no
  // deben disparar re-render por sí mismos, solo condicionar el siguiente
  // handleSessionDead().
  const rebuildingRef = useRef(false)          // single-flight: colapsa disparos concurrentes (sender + canal) en UN rebuild
  const lastRebuildAtRef = useRef<number | null>(null) // rate-limit: ver SESSION_REBUILD_COOLDOWN_MS
  const justRebuiltRef = useRef(false)         // consumido por el efecto de abajo para forzar un openChannel() tras el swap

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
    // D7 (spec, decisión #7): el canal de eventos vive mientras exista una
    // conversación durable (cursor no nulo) — con el panel abierto o
    // cerrado — para que useUnreadCount siga contando respuestas y el badge
    // del Launcher las refleje sin necesidad de reabrir el panel (patrón
    // Chatwoot: el visitante se entera de una respuesta aunque no esté
    // mirando el widget). Solo se cierra cuando NO hay conversación en curso
    // (visitante que nunca escribió) y el panel está cerrado — así se evitan
    // conexiones sin nada que escuchar.
    const conversationExists = storeState.cursor !== null
    if (isOpen || conversationExists) transport.openChannel()
    else transport.closeChannel()
  }, [isOpen, storeState.cursor, transport])

  useEffect(() => {
    // Task W3: una sesión RESUMIDA puede traer conversación e historial que
    // esta store recién creada aún no conoce (cursor arranca null en cada
    // arranque del shell). Fuerza un primer snapshot aunque el panel esté
    // cerrado y el store no sepa todavía que hay conversación — es la única
    // forma de que el efecto D7 de arriba (que decide seguir abierto por
    // storeState.cursor) llegue a enterarse de que existe una. Sin esto, un
    // visitante que vuelve con respuestas del agente pendientes nunca vería
    // el badge hasta abrir el panel a mano.
    if (resumedSession) transport.openChannel()
  }, [resumedSession, transport])

  useEffect(() => {
    // Sin fábrica: comportamiento previo a esta task, intacto (ver AppProps).
    if (!createSession) return
    const handleSessionDead = (): void => {
      void (async () => {
        if (rebuildingRef.current) return // single-flight
        const now = Date.now()
        if (lastRebuildAtRef.current !== null && now - lastRebuildAtRef.current < SESSION_REBUILD_COOLDOWN_MS) return // rate-limit
        rebuildingRef.current = true
        try {
          const hadMessages = transport.store.getState().messages.length > 0
          const newClient = await createSession(client.getSession().resumeSecret)
          bus.emit('session_persist', { resumeSecret: newClient.getSession().resumeSecret })
          // Task W4 gaps 3: resume genuino (misma conversación) → seamless,
          // el store sigue tal cual. Sesión fresca (conversación distinta o
          // inexistente) → olvida lo que sabía de la anterior; la tarjeta
          // "Conversación nueva" solo si había algo que perder.
          if (!newClient.wasResumed()) transport.store.resetForNewConversation(hadMessages)
          client.destroy() // el cliente ANTERIOR ya no se usa más
          justRebuiltRef.current = true
          setClient(newClient)
        } catch (err) {
          // El re-bootstrap en sí falló (red caída al crear la sesión nueva,
          // etc.) — se rinde en silencio, igual que el caso rate-limited: el
          // banner de error/offline se queda tal cual (events-channel.ts ya
          // paró su bucle al detectar la muerte) hasta una reapertura manual.
          console.error('[nevent-widget] fallo al reconstruir la sesión tras su muerte', err)
        } finally {
          rebuildingRef.current = false
          lastRebuildAtRef.current = Date.now()
        }
      })()
    }
    return client.onSessionDead(handleSessionDead)
  }, [client, createSession, transport, bus])

  useEffect(() => {
    // Tras un swap de cliente por rebuild, fuerza UN openChannel() en el
    // transport NUEVO — mismo motivo que el efecto resumedSession de arriba:
    // el store puede ya saber de una conversación (resume genuino) o haber
    // sido reseteado a "sin conversación" (sesión fresca), y en AMBOS casos
    // el efecto D7 de más arriba podría decidir closeChannel() si el panel
    // está cerrado y el store aún no refleja el estado real — este efecto
    // gana la última palabra (se declara después) y reconcilia siempre.
    if (justRebuiltRef.current) {
      justRebuiltRef.current = false
      transport.openChannel()
    }
  }, [transport])

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
