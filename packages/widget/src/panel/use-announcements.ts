import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoredMessage } from '../store/message-store'
import { useStrings } from './strings'

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

// «…por WhatsApp:» + «WhatsApp: +34…» no debe leerse «WhatsApp:. WhatsApp…».
function joinSentences(parts: readonly string[]): string {
  return parts.reduce((acc, part) => (acc === '' ? part : /[.:!?…]\s*$/.test(acc) ? `${acc} ${part}` : `${acc}. ${part}`), '')
}

// Bloque de contacto (nevent-work#15): con bloques, la burbuja muestra
// `bodyText`, sin los valores, y los bloques suelen llegar DESPUÉS de que el
// turno en streaming ya se anunció (los trae el durable message.created). Se
// anuncian con el mismo texto que el aria del bloque («WhatsApp: +34 612 34
// 56 78»), solo los que aún no se habían anunciado para ese mensaje.
export function useAnnouncement(messages: readonly StoredMessage[]): string {
  const strings = useStrings()
  const [announcement, setAnnouncement] = useState('')
  // id → bloques de contacto ya anunciados de ese mensaje.
  const announced = useRef<Map<string, number> | null>(null)
  const toggleRef = useRef(false)

  useEffect(() => {
    const isCompleteReply = (m: StoredMessage): boolean =>
      (m.role === 'bot' || m.role === 'agent') && !m.streaming && (m.text !== '' || m.contactBlocks.length > 0)

    if (announced.current === null) {
      announced.current = new Map(messages.filter(isCompleteReply).map((m) => [m.id, m.contactBlocks.length]))
      return
    }
    const fresh: string[] = []
    for (const m of messages) {
      if (!isCompleteReply(m)) continue
      const done = announced.current.get(m.id)
      const blocks = m.contactBlocks.slice(done ?? 0).map((b) => `${strings.contactChannel[b.channel]}: ${b.display}`)
      if (done === undefined && m.text !== '') fresh.push(m.text)
      fresh.push(...blocks)
      announced.current.set(m.id, m.contactBlocks.length)
    }
    if (fresh.length > 0) {
      toggleRef.current = !toggleRef.current
      setAnnouncement(joinSentences(fresh) + (toggleRef.current ? ZERO_WIDTH_SPACE : ''))
    }
  }, [messages])

  return announcement
}
