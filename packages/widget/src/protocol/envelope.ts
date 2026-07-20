export const PROTOCOL_NS = 'nevw' as const
export const PROTOCOL_VERSION = 1

export interface Envelope<T = unknown> {
  ns: typeof PROTOCOL_NS
  v: number
  instanceId: string
  type: string
  payload: T
}

export const LOADER_TO_SHELL = ['init', 'open', 'close', 'toggle', 'update', 'destroy', 'consent', 'viewport'] as const
// session_persist (Task W3): el shell le pide al loader que guarde el blob de
// sesión en el dominio anfitrión (cookie/localStorage) tras crear/resumir
// sesión — el loader es quien tiene acceso de primera parte al storage del
// host, el shell (iframe) no.
export const SHELL_TO_LOADER = ['ready', 'opened', 'closed', 'unread_changed', 'error', 'resize', 'session_persist'] as const

export function seal<T>(type: string, payload: T, instanceId: string): Envelope<T> {
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, instanceId, type, payload }
}

export function open(raw: unknown, expected: { instanceId?: string }): Envelope | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Record<string, unknown>
  if (e['ns'] !== PROTOCOL_NS || e['v'] !== PROTOCOL_VERSION) return null
  if (typeof e['instanceId'] !== 'string' || typeof e['type'] !== 'string') return null
  if (expected.instanceId !== undefined && e['instanceId'] !== expected.instanceId) return null
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, instanceId: e['instanceId'], type: e['type'], payload: e['payload'] }
}

export function isCommand(type: string, allow: readonly string[]): boolean {
  return allow.includes(type)
}
