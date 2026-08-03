import type { ComponentChildren } from 'preact'

/**
 * Subconjunto seguro de markdown para mensajes del bot/agente: negrita, cursiva,
 * código inline, enlaces http(s), listas, encabezados (como línea en negrita) y
 * saltos de línea. Construye EXCLUSIVAMENTE nodos vía JSX — nunca innerHTML —
 * así que el HTML embebido en el texto sigue siendo texto literal (misma
 * garantía anti-XSS que el nodo de texto plano al que sustituye). Los enlaces
 * solo se materializan con esquema http(s); cualquier otro queda como texto.
 *
 * El parser es puro y re-procesa el texto completo en cada frame de streaming:
 * un token a medio llegar (p.ej. `**negri`) no matchea y se muestra literal
 * hasta que se cierra — sin estado entre frames que pueda corromperse.
 */

const SAFE_LINK = /^https?:\/\//i
const UL_ITEM = /^\s*[-*•]\s+(.*)$/
const OL_ITEM = /^\s*\d{1,3}[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const INLINE_TOKEN =
  /(`([^`]+)`)|(\[([^\]]+)\]\(([^\s)]+)\))|(\*\*([^*]+?)\*\*)|(\*([^*\s][^*]*?)\*)/

function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = []
  let rest = text
  while (rest.length > 0) {
    const m = INLINE_TOKEN.exec(rest)
    if (!m) {
      out.push(rest)
      break
    }
    if (m.index > 0) out.push(rest.slice(0, m.index))
    if (m[1] !== undefined) {
      out.push(<code>{m[2]}</code>)
    } else if (m[3] !== undefined) {
      if (SAFE_LINK.test(m[5]!)) {
        out.push(
          <a href={m[5]} target="_blank" rel="noopener noreferrer">
            {renderInline(m[4]!)}
          </a>,
        )
      } else {
        out.push(m[3])
      }
    } else if (m[6] !== undefined) {
      out.push(<strong>{renderInline(m[7]!)}</strong>)
    } else {
      out.push(<em>{renderInline(m[9]!)}</em>)
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

export function renderMarkdown(text: string): ComponentChildren {
  const lines = text.split('\n')
  const out: ComponentChildren[] = []
  // Los <br> solo separan líneas de texto corrido: las listas son elementos de
  // bloque y ya rompen línea por sí solas — un <br> adyacente doblaría el hueco.
  let prevWasBlock = false
  let i = 0
  while (i < lines.length) {
    const ordered = OL_ITEM.test(lines[i]!)
    if (ordered || UL_ITEM.test(lines[i]!)) {
      const itemRe = ordered ? OL_ITEM : UL_ITEM
      const items: ComponentChildren[] = []
      while (i < lines.length) {
        const item = itemRe.exec(lines[i]!)
        if (!item) break
        items.push(<li>{renderInline(item[1]!)}</li>)
        i++
      }
      out.push(ordered ? <ol>{items}</ol> : <ul>{items}</ul>)
      prevWasBlock = true
      continue
    }
    if (out.length > 0 && !prevWasBlock) out.push(<br />)
    const heading = HEADING.exec(lines[i]!)
    if (heading) {
      out.push(<strong class="md-h">{renderInline(heading[1]!)}</strong>)
      prevWasBlock = true
    } else {
      out.push(...renderInline(lines[i]!))
      prevWasBlock = false
    }
    i++
  }
  return out
}
