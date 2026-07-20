import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoreState } from '../store/message-store'
import { cursorConversationId } from '../transport/cursor'

// Marca de último-visto ACOTADA por conversación — persistida por
// shell/app.tsx en el dominio anfitrión (ver loader/session-storage.ts).
// Marca por IDENTIDAD+POSICIÓN (el id del último mensaje visto), no por seq:
// WidgetMessage (GET /messages) no lleva seq por mensaje — solo el snapshot
// en conjunto vía snapshotCursor — así que todo mensaje rehidratado por
// snapshot llega con seq:null SIEMPRE (ver
// store/message-store.ts#mergeSnapshotMessages). Un watermark basado en seq
// trataría cualquier mensaje sin seq propio como "ya visto" — incluida una
// respuesta del agente llegada mientras la pestaña estaba cerrada, que
// también se rehidrata sin seq — matando justo el caso Chatwoot (D7) que
// este badge existe para cubrir. messageId no tiene ese problema: identifica
// una POSICIÓN en la lista (cronológica) sin importar si el mensaje llegó
// por snapshot o en vivo.
export interface LastSeen {
  conversationId: string
  messageId: string
}

export interface UseUnreadCountOptions {
  // Watermark cargado del storage del anfitrión al arrancar el shell (null/
  // ausente: visitante nuevo, o sin nada guardado todavía). Solo suprime
  // mensajes de la MISMA conversación a la que pertenece — ver más abajo.
  initialLastSeen?: LastSeen | null
  // Se invoca al abrir el panel con el id del último mensaje 'sent' (marca
  // de posición), para que el llamante lo persista (session_persist). Nunca
  // más de una vez por avance real — ver lastEmittedRef.
  onLastSeen?: (lastSeen: LastSeen) => void
}

// Cuenta mensajes bot/agent completos (no streaming) llegados desde la
// última vez que el panel estuvo abierto — spec §3.2. No requiere tocar
// message-store.ts para esto: se deriva comparando snapshots sucesivos.
//
// initialLastSeen resuelve el bug del reload: tras F5 con sesión resumida el
// store arranca VACÍO y se rehidrata vía snapshot (GET /messages) — `seenIds`
// nace vacío en cada montaje del hook, así que sin esto TODO el historial
// bot/agent se recontaría como no-leído aunque el visitante ya lo hubiera
// leído en una visita anterior. Cuando la conversación coincide con la del
// baseline persistido, se localiza la POSICIÓN del mensaje-marca en la lista
// (cronológica: snapshot ordenado + eventos en vivo aplicados en orden) y
// solo cuenta lo que viene DESPUÉS de esa posición:
//   - marca encontrada  → respuestas completas en índice > idx cuentan.
//   - marca NO encontrada → TODO cuenta: el snapshot solo trae los 50 más
//     nuevos, así que si la marca ya no está es que cayó por el lado viejo
//     de esa ventana — todo lo presente es necesariamente posterior a ella.
//   - conversación distinta / sin baseline → sin filtro posicional, como si
//     no hubiera baseline (comportamiento previo a esta feature).
export function useUnreadCount(state: StoreState, isOpen: boolean, opts?: UseUnreadCountOptions): number {
  const [count, setCount] = useState(0)
  const seenIds = useRef<Set<string>>(new Set())
  const lastEmittedRef = useRef<LastSeen | null>(null)
  // Ref, no closure directa del efecto: opts.onLastSeen puede ser una
  // función NUEVA en cada render del llamante (p.ej. cierra sobre `client`
  // en shell/app.tsx) sin que eso deba forzar que el efecto se re-ejecute
  // solo por eso — se lee siempre la versión más reciente en el momento de
  // emitir, actualizada síncronamente en cada render (no en un efecto).
  const onLastSeenRef = useRef(opts?.onLastSeen)
  onLastSeenRef.current = opts?.onLastSeen
  const initialLastSeen = opts?.initialLastSeen ?? null

  useEffect(() => {
    if (isOpen) {
      for (const m of state.messages) seenIds.current.add(m.id)
      setCount(0)

      const conversationId = cursorConversationId(state.cursor)
      if (conversationId !== null) {
        // Marca de posición = id del ÚLTIMO mensaje 'sent' y no-streaming,
        // de CUALQUIER rol (recorre desde la cola). Un optimista pendiente
        // (sin id de servidor estable) o un turno todavía en streaming
        // (incompleto) no valen como marca — se saltan hasta encontrar uno
        // confirmado.
        let markMessageId: string | null = null
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i]!
          if (m.status === 'sent' && !m.streaming) { markMessageId = m.id; break }
        }
        if (markMessageId !== null) {
          const prev = lastEmittedRef.current
          const advanced = prev === null || prev.conversationId !== conversationId || prev.messageId !== markMessageId
          if (advanced) {
            const next: LastSeen = { conversationId, messageId: markMessageId }
            lastEmittedRef.current = next
            onLastSeenRef.current?.(next)
          }
        }
      }
      return
    }

    const baselineConversationId = initialLastSeen !== null ? cursorConversationId(state.cursor) : null
    const baselineApplies = initialLastSeen !== null && baselineConversationId === initialLastSeen.conversationId
    const baselineIdx = baselineApplies ? state.messages.findIndex((m) => m.id === initialLastSeen!.messageId) : -1

    let unseen = 0
    for (let i = 0; i < state.messages.length; i++) {
      const m = state.messages[i]!
      const isCompleteReply = (m.role === 'bot' || m.role === 'agent') && m.status === 'sent' && !m.streaming
      if (!isCompleteReply || seenIds.current.has(m.id)) continue
      // baselineIdx === -1 cubre DOS casos distintos con el mismo resultado
      // ("no suprimir"): baseline no aplica (otra conversación / ausente), o
      // sí aplica pero su messageId cayó fuera de la ventana del snapshot —
      // ver comentario de cabecera.
      if (baselineApplies && baselineIdx !== -1 && i <= baselineIdx) continue
      unseen += 1
    }
    setCount(unseen)
  }, [state.messages, isOpen, state.cursor])

  return count
}
