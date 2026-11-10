import type { WidgetContactBlock } from './types'

// Bloque de contacto (nevent-work#15). Contrato: _rescate/t15-mock/contrato.md
// §2, copiado de nev-api WidgetContactBlockDto / WidgetMessageDto.
//
// El backend añade al mensaje del bot `contacts` (el dato de la derivación,
// puesto por el sistema y no por el modelo) y `bodyText` (el texto sin esos
// valores). `text` siempre lleva los valores escritos: es lo que pinta un
// widget que no conoce los bloques.
//
// Regla del cliente (contrato): si `contacts` es un array no vacío y
// `bodyText` es string → burbuja `bodyText` + bloques; en cualquier otro caso
// → burbuja `text`, sin bloques. Nunca se confía en el shape tal cual llega
// de red: si un solo bloque no pasa la validación, el mensaje entero cae a
// `text`, para que el fan no pierda ese contacto (bodyText no lo lleva).

const MAX_BLOCKS = 10
const MAX_LENGTH = 254
// Sin controles, saltos de línea ni caracteres de formato (\p{Cf}: marcas de
// dirección como U+202E, que harían leer las cifras en otro orden que el
// botón, y espacios de ancho cero) en lo que se pinta.
const CONTROL_CHARS = /[\u0000-\u001f\u007f\p{Cf}]/u
const E164 = /^\+(\d{6,15})$/
// Un único buzón: sin consulta (?subject=), fragmento, separadores ni escapes.
const EMAIL = /^[^\s@?#&/\\,;:%<>"]+@[^\s@?#&/\\,;:%<>"]+\.[^\s@?#&/\\,;:%<>"]+$/

const digitsOf = (s: string): string => s.replace(/\D/g, '')

function isShowable(s: unknown): s is string {
  return typeof s === 'string' && s.trim() !== '' && s.length <= MAX_LENGTH && !CONTROL_CHARS.test(s)
}

// La URL la construye el backend y el widget no la recompone: solo comprueba
// que es exactamente la que corresponde a `value` según el canal, y que lo que
// se ve (`display`) es ese mismo contacto. Así ni se abre otro esquema
// (javascript:, otros dominios) ni el botón lleva a un número distinto del
// que se lee.
function isConsistent(channel: WidgetContactBlock['channel'], value: string, display: string, url: string): boolean {
  if (channel === 'EMAIL') {
    return EMAIL.test(value) && value === value.toLowerCase() && url === `mailto:${value}` && display.trim().toLowerCase() === value
  }
  const m = E164.exec(value)
  if (m === null || digitsOf(display) !== m[1]) return false
  return url === (channel === 'WHATSAPP' ? `https://wa.me/${m[1]}` : `tel:${value}`)
}

function normalizeOne(raw: unknown): WidgetContactBlock | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { channel, value, display, url } = raw as Record<string, unknown>
  if (channel !== 'WHATSAPP' && channel !== 'PHONE' && channel !== 'EMAIL') return null
  if (!isShowable(value) || !isShowable(display) || typeof url !== 'string') return null
  if (!isConsistent(channel, value, display, url)) return null
  return { channel, value, display: display.trim(), url }
}

export interface MessageContent {
  // Lo que pinta la burbuja: bodyText con bloques, text sin ellos.
  text: string
  contactBlocks: WidgetContactBlock[]
}

// Aplica la regla del cliente a un message.created o a un mensaje del snapshot.
// Bloques solo en mensajes del bot, y sin duplicados por `value` (contrato): un
// `value` repetido es un dato roto más y el mensaje cae a `text`.
export function resolveContactContent(message: { role: string; text: string; bodyText?: unknown; contacts?: unknown }): MessageContent {
  const { role, text, bodyText, contacts } = message
  if (role !== 'bot' || !Array.isArray(contacts) || contacts.length === 0 || contacts.length > MAX_BLOCKS || typeof bodyText !== 'string') {
    return { text, contactBlocks: [] }
  }
  const blocks = contacts.map(normalizeOne)
  if (blocks.some((b) => b === null)) return { text, contactBlocks: [] }
  const valid = blocks as WidgetContactBlock[]
  if (new Set(valid.map((b) => b.value)).size !== valid.length) return { text, contactBlocks: [] }
  return { text: bodyText, contactBlocks: valid }
}
