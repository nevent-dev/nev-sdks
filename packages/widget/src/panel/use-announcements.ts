import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoredMessage } from '../store/message-store'

// Región aria-live separada de la lista visible (Task 8, MessageList): un
// delta de streaming por token saturaría al lector de pantalla. Resuelve tres
// problemas: (a) baseline silenciosa — el primer paso del efecto (montaje o
// REMONTAJE, ya que MessageList se desmonta con el panel cerrado, D7) solo
// marca como visto lo que YA está ahí, sin anunciar nada; (b) ráfaga — todos
// los mensajes nuevos completos de un mismo pase se acumulan en UN solo
// setState (unidos con ". "), nunca N llamadas sucesivas que se pisarían
// entre sí; (c) texto repetido (Important #9, ronda 2) — si el nuevo anuncio
// es un string IDÉNTICO al anterior, un setState con el mismo valor no muta
// el DOM (Preact hace bail-out por igualdad referencial de primitivos) y el
// lector de pantalla NO vuelve a anunciarlo. Se alterna un espacio de ancho
// cero (U+200B, invisible y silencioso) al final del string para garantizar
// que SIEMPRE cambia, incluso ante texto visualmente repetido.
// Carácter invisible vía código, nunca pegado literal en el archivo — un
// U+200B tecleado directamente en el código fuente es indistinguible a
// simple vista y se puede perder/corromper en un copy-paste sin que nadie lo
// note (exactamente el tipo de fragilidad a evitar en un paso ejecutable).
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

export function useAnnouncement(messages: readonly StoredMessage[]): string {
  const [announcement, setAnnouncement] = useState('')
  const announcedIds = useRef<Set<string> | null>(null)
  const toggleRef = useRef(false)

  useEffect(() => {
    const isCompleteReply = (m: StoredMessage): boolean =>
      (m.role === 'bot' || m.role === 'agent') && !m.streaming && m.text !== ''

    if (announcedIds.current === null) {
      announcedIds.current = new Set(messages.filter(isCompleteReply).map((m) => m.id))
      return
    }
    const fresh: string[] = []
    for (const m of messages) {
      if (isCompleteReply(m) && !announcedIds.current.has(m.id)) {
        announcedIds.current.add(m.id)
        fresh.push(m.text)
      }
    }
    if (fresh.length > 0) {
      toggleRef.current = !toggleRef.current
      setAnnouncement(fresh.join('. ') + (toggleRef.current ? ZERO_WIDTH_SPACE : ''))
    }
  }, [messages])

  return announcement
}
