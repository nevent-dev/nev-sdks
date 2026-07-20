import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, RefObject } from 'preact'
import type { StoredMessage } from '../store/message-store'
import type { WidgetConfig } from '../contract/types'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { useAnnouncement } from './use-announcements'
import { ChevronDownIcon } from './icons'

export interface MessageListProps {
  config: WidgetConfig
  messages: readonly StoredMessage[]
  agentName: string | null
  agentAvatarUrl: string | null
  onRetry: (clientId: string) => void
  onQuickReply: (text: string) => void
  trailing?: ComponentChildren
  showWelcome: boolean
}

const NEAR_BOTTOM_THRESHOLD_PX = 48

interface BottomAnchoredScroll {
  atBottom: boolean
  newBelowCount: number
  jumpToBottom: () => void
  clear: () => void
}

interface TrackedMessage {
  role: StoredMessage['role']
  complete: boolean
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Ancla el scroll observando un SENTINEL (`.msgs-inner`, el wrapper de TODO
// el contenido) con ResizeObserver: reacciona a cualquier cambio de altura
// real — mensaje nuevo, delta de streaming, dots de typing, tarjeta final —
// a diferencia de una dependencia de string basada en longitud/último
// mensaje (Important #7). La decisión de "estaba cerca del fondo" se toma
// SOLO en el listener de scroll, nunca dentro del callback de resize, para
// reflejar siempre el estado justo ANTES de la mutación. `nearBottomRef`
// sigue siendo la fuente de verdad SÍNCRONA que usa esa lógica; `atBottom`
// es una copia en estado (para poder renderizar la píldora) que se
// sincroniza en el mismo listener, nunca al revés.
//
// Además clasifica cada cambio de `messages` contra el snapshot del render
// anterior (por id, igual que useAnnouncement): un mensaje propio SIEMPRE
// fuerza el fondo (enviar = intención de ir al final, aunque estuvieras
// leyendo historial arriba); un entrante bot/agent solo suma al contador de
// "nuevos por debajo" cuando TERMINA (status sent && !streaming) estando
// lejos del fondo — nunca mientras streamea (el id de un streaming
// placeholder típicamente ni siquiera sobrevive a la finalización, pero la
// comparación por `complete` cubre también el caso de un mismo id que pasa
// de streaming a completo).
function useBottomAnchoredScroll(
  containerRef: RefObject<HTMLDivElement>,
  innerRef: RefObject<HTMLDivElement>,
  messages: readonly StoredMessage[],
): BottomAnchoredScroll {
  const nearBottomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [newBelowCount, setNewBelowCount] = useState(0)
  const trackedRef = useRef<Map<string, TrackedMessage>>(new Map())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = (): void => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX
      nearBottomRef.current = near
      setAtBottom(near)
      if (near) setNewBelowCount(0) // volver al fondo por scroll manual limpia el contador
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const inner = innerRef.current
    const el = containerRef.current
    if (!inner || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const prev = trackedRef.current
    const next = new Map<string, TrackedMessage>()
    let ownArrived = false
    let completedWhileAway = 0
    for (const m of messages) {
      const complete = m.status === 'sent' && !m.streaming
      const before = prev.get(m.id)
      if (m.role === 'user') {
        if (!before) ownArrived = true
      } else if (complete && !before?.complete && !nearBottomRef.current) {
        completedWhileAway++
      }
      next.set(m.id, { role: m.role, complete })
    }
    trackedRef.current = next

    if (ownArrived) {
      const el = containerRef.current
      if (el) el.scrollTop = el.scrollHeight
      nearBottomRef.current = true
      setAtBottom(true)
      setNewBelowCount(0)
    } else if (completedWhileAway > 0) {
      setNewBelowCount((n) => n + completedWhileAway)
    }
  }, [messages])

  const jumpToBottom = (): void => {
    const el = containerRef.current
    if (!el) return
    const top = el.scrollHeight
    // jsdom (y algún WebView antiguo) no implementa scrollTo — cae al mismo
    // salto instantáneo que ya usa el anclaje automático.
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    } else {
      el.scrollTop = top
    }
    nearBottomRef.current = true
    setAtBottom(true)
    setNewBelowCount(0)
  }

  const clear = (): void => setNewBelowCount(0)

  return { atBottom, newBelowCount, jumpToBottom, clear }
}

function pillLabel(count: number): string {
  if (count <= 0) return 'Ir al último mensaje'
  return `${count} ${count === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}, ir al último`
}

export function MessageList({ config, messages, agentName, agentAvatarUrl, onRetry, onQuickReply, trailing, showWelcome }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const { atBottom, newBelowCount, jumpToBottom } = useBottomAnchoredScroll(containerRef, innerRef, messages)
  const announcement = useAnnouncement(messages)

  return (
    <div class="msgs-wrap">
      <div class="msgs" ref={containerRef}>
        <div class="msgs-inner" ref={innerRef}>
          {showWelcome && <Welcome config={config} onChip={onQuickReply} />}
          {messages.length > 0 && <div class="day">Hoy</div>}
          {messages.map((m, i) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} agentAvatarUrl={agentAvatarUrl} onRetry={onRetry}
              compact={i > 0 && messages[i - 1]?.role === m.role} />
          ))}
          {trailing}
        </div>
        <div aria-live="polite" class="sr-only">{announcement}</div>
      </div>
      {/* Vive FUERA de .msgs (el div de arriba, con overflow-y:auto): si
          estuviera dentro se desplazaría con el propio contenido en vez de
          flotar fija — ver comentario de .msgs-wrap en panel.css. */}
      {!atBottom && (
        <button type="button" class={`scroll-pill${newBelowCount > 0 ? ' has-count' : ''}`}
          onClick={jumpToBottom} aria-label={pillLabel(newBelowCount)}>
          <ChevronDownIcon />
          {newBelowCount > 0 && (
            <span class="scroll-pill-count">
              {newBelowCount} {newBelowCount === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
