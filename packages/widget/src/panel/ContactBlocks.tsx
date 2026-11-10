import type { WidgetContactBlock } from '../contract/types'
import { ContactChannelIcon } from './icons'
import { useStrings } from './strings'

export interface ContactBlocksProps {
  blocks: readonly WidgetContactBlock[]
}

// Bloque de contacto (nevent-work#15) bajo la burbuja del bot. A la vista,
// solo icono, valor y botón: ni el nombre del canal ni el de la derivación
// (lo escribe el club en su idioma). El canal va en el aria del grupo.
// Con dos o más bloques, el aria del botón lleva también el valor, para que
// un lector de pantalla distinga dos «Llamar» seguidos.
// Cómo se abre cada botón:
// - wa.me es https: pestaña nueva, como el resto de enlaces del panel.
// - tel: y mailto: los abre el sistema. En Safari de iOS, un esquema externo
//   navegado desde el iframe de origen cruzado no llega a la app del sistema;
//   como ventana nueva (target=_blank, que el sandbox permite con allow-popups)
//   sí llega (aceptación de nevent-work#15 en el simulador, 10-11-2026). En
//   escritorio una ventana nueva para tel:/mailto: puede dejar una pestaña
//   vacía, así que ahí se quedan sin target.
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
}

export function ContactBlocks({ blocks }: ContactBlocksProps) {
  const strings = useStrings()
  if (blocks.length === 0) return null
  const several = blocks.length > 1
  const touch = isTouchDevice()
  return (
    <div class="cblocks">
      {blocks.map((b, i) => {
        const action = strings.contactAction[b.channel]
        const external = b.channel === 'WHATSAPP' || touch
        return (
          <div class="cblock" role="group" aria-label={`${strings.contactChannel[b.channel]}: ${b.display}`} key={`${b.channel}:${b.value}:${i}`}>
            <div class="v">
              <span class={`ic ic-${b.channel.toLowerCase()}`}><ContactChannelIcon channel={b.channel} /></span>
              <span class="val">{b.display}</span>
            </div>
            <a class="act" href={b.url} aria-label={several ? `${action}, ${b.display}` : undefined}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {action}
            </a>
          </div>
        )
      })}
    </div>
  )
}
