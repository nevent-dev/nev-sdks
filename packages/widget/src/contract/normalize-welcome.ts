export interface NormalizedWelcome {
  title: string
  subtitle: string
  quickReplies: string[]
}

const MAX_TITLE = 80
const MAX_SUBTITLE = 200
const MAX_CHIPS = 4
const MAX_CHIP = 60

// `welcome` llega de red (GET /widget/v1/installations/{id}/config) — entrada
// NO CONFIABLE (spec §7), se normaliza aquí, en la frontera, en vez de
// confiar en el cast `as WidgetConfig` que session.ts ya hacía (gap #6:
// un payload malformado podía romper `.length`/`.map` aguas abajo, en
// Welcome.tsx). Recortar en vez de rechazar: un title/subtitle largos siguen
// siendo un welcome válido, solo se acotan; un chip inválido se descarta
// SOLO ese chip, no arrastra a los demás.
export function normalizeWelcome(raw: unknown): NormalizedWelcome | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r['title'] !== 'string' || typeof r['subtitle'] !== 'string') return undefined
  const rawChips = Array.isArray(r['quickReplies']) ? r['quickReplies'] : []
  const quickReplies = rawChips
    .filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= MAX_CHIP)
    .slice(0, MAX_CHIPS)
  return {
    title: r['title'].slice(0, MAX_TITLE),
    subtitle: r['subtitle'].slice(0, MAX_SUBTITLE),
    quickReplies,
  }
}
