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
export function ContactBlocks({ blocks }: ContactBlocksProps) {
  const strings = useStrings()
  if (blocks.length === 0) return null
  const several = blocks.length > 1
  return (
    <div class="cblocks">
      {blocks.map((b, i) => {
        const action = strings.contactAction[b.channel]
        // wa.me es https: pestaña nueva, como el resto de enlaces del panel.
        // tel: y mailto: los abre el sistema; el iframe no navega.
        const external = b.channel === 'WHATSAPP'
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
