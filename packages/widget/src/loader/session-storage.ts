// Persistencia de sesión en el dominio ANFITRIÓN (Task W3, patrón Chatwoot
// cw_conversation: cookie de primera parte en la página que embebe el
// widget, nunca dentro del iframe — el iframe/shell no tiene acceso directo
// al storage del host y, aunque lo tuviera, quedaría particionado (mismo
// origin que shell.html, no el del anfitrión) en navegadores con partición
// de storage por site anfitrión (CHIPS/Storage Partitioning).
//
// A diferencia de Chatwoot (que pasa cw_conversation como query param del
// src del iframe), aquí el blob viaja SOLO por postMessage (init/session_persist)
// — nunca en una URL, donde persistiría en logs de servidor, historial del
// navegador y el Referer de terceros.
//
// Solo se guarda el resumeSecret — NUNCA el bearer token de sesión (vive
// 45 min en memoria del shell, no merece persistencia; ver shell/session.ts,
// que ya tiene un test dedicado a que el token no toque ningún storage).

export interface StoredSessionBlob {
  resumeSecret: string
}

// 30 días: espeja widget.session.max-idle-days en nev-api (WidgetProperties.Session,
// valor por defecto 30) — más allá de eso el backend igualmente rechazaría el
// resume por sesión inactiva, así que una cookie más longeva no ganaría nada.
// Deliberadamente hardcodeado en el cliente: el backend no expone su TTL de
// idle vía ningún endpoint público que el loader pueda leer en boot.
export const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function cookieName(installationId: string): string {
  return `nevw_session_${installationId}`
}

// expiresAt (epoch ms) SOLO tiene sentido en el blob de localStorage — ver
// nota en writeSessionBlob. En el de cookie se omite a propósito: su propio
// max-age ya lo acota, duplicarlo no aportaría nada.
function encodeBlob(blob: StoredSessionBlob, expiresAt?: number): string {
  return btoa(JSON.stringify(expiresAt !== undefined ? { ...blob, expiresAt } : blob))
}

interface DecodedBlob extends StoredSessionBlob {
  expiresAt?: number
}

// Nunca lanza: una cookie/entrada de localStorage corrupta (edición manual,
// un formato antiguo de una versión previa del widget, truncamiento) debe
// producir un arranque limpio con sesión nueva, no un crash del shell.
function decodeBlob(raw: string): DecodedBlob | null {
  try {
    const parsed: unknown = JSON.parse(atob(raw))
    if (typeof parsed !== 'object' || parsed === null) return null
    const resumeSecret = (parsed as Record<string, unknown>)['resumeSecret']
    if (typeof resumeSecret !== 'string' || resumeSecret.length === 0) return null
    const rawExpiresAt = (parsed as Record<string, unknown>)['expiresAt']
    return typeof rawExpiresAt === 'number' ? { resumeSecret, expiresAt: rawExpiresAt } : { resumeSecret }
  } catch {
    return null
  }
}

function readCookie(doc: Document, name: string): string | null {
  // document.cookie es una única cadena "a=1; b=2; ..." — nunca lanza al
  // leerla (a diferencia de escribirla, que sí puede en documentos
  // restringidos), así que esta función no necesita try/catch propio.
  const prefix = `${name}=`
  for (const pair of doc.cookie.split('; ')) {
    if (pair.startsWith(prefix)) {
      const value = pair.slice(prefix.length)
      return value.length > 0 ? value : null
    }
  }
  return null
}

// Escribe y relee inmediatamente para verificar que la cookie realmente
// prendió — algunos navegadores (todas las cookies bloqueadas por el
// usuario, ciertos modos privados) aceptan la asignación sin lanzar pero
// simplemente no la persisten.
function writeCookie(doc: Document, win: Window, name: string, value: string): boolean {
  try {
    const isHttps = win.location?.protocol === 'https:'
    const attrs = [`path=/`, `max-age=${COOKIE_MAX_AGE_SECONDS}`, `SameSite=Lax`, ...(isHttps ? ['Secure'] : [])]
    doc.cookie = `${name}=${value}; ${attrs.join('; ')}`
    return readCookie(doc, name) === value
  } catch {
    return false
  }
}

function readLocalStorage(win: Window, name: string): string | null {
  try {
    return win.localStorage?.getItem(name) ?? null
  } catch {
    return null // storage bloqueado/inaccesible (modo privado estricto) — best-effort
  }
}

function writeLocalStorage(win: Window, name: string, value: string): void {
  try {
    win.localStorage?.setItem(name, value)
  } catch {
    // Ni cookies ni localStorage disponibles: se rinde en silencio — la
    // próxima carga simplemente arrancará una sesión nueva, el mismo
    // comportamiento que tenía el widget antes de esta persistencia.
  }
}

function removeLocalStorage(win: Window, name: string): void {
  try {
    win.localStorage?.removeItem(name)
  } catch {
    // best-effort, igual que el resto de accesos a localStorage aquí
  }
}

export function readSessionBlob(doc: Document, win: Window, installationId: string): StoredSessionBlob | null {
  const name = cookieName(installationId)
  const cookieRaw = readCookie(doc, name)
  if (cookieRaw !== null) {
    const decoded = decodeBlob(cookieRaw)
    return decoded ? { resumeSecret: decoded.resumeSecret } : null
  }
  const lsRaw = readLocalStorage(win, name)
  if (lsRaw === null) return null
  const decoded = decodeBlob(lsRaw)
  if (!decoded) return null
  // Solo el fallback de localStorage lleva expiresAt (ver writeSessionBlob) —
  // un blob de un formato previo a este fix, sin el campo, nunca se trata
  // como caducado. Vencido: limpiar la entrada, no dejarla viva para
  // siempre — localStorage no tiene un max-age nativo como la cookie.
  if (decoded.expiresAt !== undefined && decoded.expiresAt <= Date.now()) {
    removeLocalStorage(win, name)
    return null
  }
  return { resumeSecret: decoded.resumeSecret }
}

export function writeSessionBlob(doc: Document, win: Window, installationId: string, blob: StoredSessionBlob): void {
  const name = cookieName(installationId)
  if (writeCookie(doc, win, name, encodeBlob(blob))) return
  // Fallback: la cookie no prendió (cookies bloqueadas). A diferencia de la
  // cookie, localStorage no tiene TTL nativo — sin acotarlo a mano con el
  // mismo horizonte que hubiera tenido la cookie, el resumeSecret
  // persistiría indefinidamente (Important #1, review W3).
  const expiresAt = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000
  writeLocalStorage(win, name, encodeBlob(blob, expiresAt))
}
