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
