import { useEffect, useRef } from 'preact/hooks'
import type { ComponentChildren, RefObject } from 'preact'
import type { StoredMessage } from '../store/message-store'
import type { WidgetConfig } from '../contract/types'
import { MessageBubble } from './MessageBubble'
import { Welcome } from './Welcome'
import { useAnnouncement } from './use-announcements'

export interface MessageListProps {
  config: WidgetConfig
  messages: readonly StoredMessage[]
  agentName: string | null
  onRetry: (clientId: string) => void
  onQuickReply: (text: string) => void
  trailing?: ComponentChildren
  showWelcome: boolean
}

const NEAR_BOTTOM_THRESHOLD_PX = 48

// Ancla el scroll observando un SENTINEL (`.msgs-inner`, el wrapper de TODO
// el contenido) con ResizeObserver: reacciona a cualquier cambio de altura
// real — mensaje nuevo, delta de streaming, dots de typing, tarjeta final —
// a diferencia de una dependencia de string basada en longitud/último
// mensaje (Important #7). La decisión de "estaba cerca del fondo" se toma
// SOLO en el listener de scroll, nunca dentro del callback de resize, para
// reflejar siempre el estado justo ANTES de la mutación.
function useBottomAnchoredScroll(containerRef: RefObject<HTMLDivElement>, innerRef: RefObject<HTMLDivElement>): void {
  const nearBottomRef = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = (): void => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX
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
}

export function MessageList({ config, messages, agentName, onRetry, onQuickReply, trailing, showWelcome }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  useBottomAnchoredScroll(containerRef, innerRef)
  const announcement = useAnnouncement(messages)

  return (
    <div class="msgs" ref={containerRef}>
      <div class="msgs-inner" ref={innerRef}>
        {showWelcome && <Welcome config={config} onChip={onQuickReply} />}
        {messages.length > 0 && <div class="day">Hoy</div>}
        {messages.map((m, i) => (
          <MessageBubble key={m.id} message={m} agentName={agentName} onRetry={onRetry}
            compact={i > 0 && messages[i - 1]?.role === m.role} />
        ))}
        {trailing}
      </div>
      <div aria-live="polite" class="sr-only">{announcement}</div>
    </div>
  )
}
