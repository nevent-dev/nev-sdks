// The durable cursor is the eventId string `evt_v1_{conversationId}_{seq}`
// (backend §2.4). Only the trailing numeric seq is meaningful for ordering.
// eventId acepta undefined porque el wire real (@JsonInclude(NON_NULL) en el
// backend) puede omitir snapshotCursor por completo, no solo mandarlo null.
export function cursorSeq(eventId: string | null | undefined): number {
  if (eventId == null) return -1
  const i = eventId.lastIndexOf('_')
  if (i < 0 || i === eventId.length - 1) return -1
  const n = Number(eventId.slice(i + 1))
  return Number.isInteger(n) ? n : -1
}

export function isNewerCursor(candidate: string, current: string | null): boolean {
  if (current === null) return true
  return cursorSeq(candidate) > cursorSeq(current)
}

const CURSOR_PREFIX = 'evt_v1_'

// A diferencia de cursorSeq (que solo mira el ÚLTIMO tramo, sin validar
// prefijo), esto separa el conversationId — que PUEDE llevar guiones bajos —
// validando el prefijo evt_v1_ y cortando el resto por su ÚLTIMO `_`. null si
// no cuadra el formato: prefijo ausente, sin separador tras el prefijo, o
// conversationId/seq resultante vacíos.
export function cursorConversationId(eventId: string | null | undefined): string | null {
  if (eventId == null) return null
  if (!eventId.startsWith(CURSOR_PREFIX)) return null
  const rest = eventId.slice(CURSOR_PREFIX.length)
  const i = rest.lastIndexOf('_')
  if (i <= 0 || i === rest.length - 1) return null
  return rest.slice(0, i)
}
