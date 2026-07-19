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

function encodeBlob(blob: StoredSessionBlob): string {
  return btoa(JSON.stringify(blob))
}

// Nunca lanza: una cookie/entrada de localStorage corrupta (edición manual,
// un formato antiguo de una versión previa del widget, truncamiento) debe
// producir un arranque limpio con sesión nueva, no un crash del shell.
function decodeBlob(raw: string): StoredSessionBlob | null {
  try {
    const parsed: unknown = JSON.parse(atob(raw))
    if (typeof parsed !== 'object' || parsed === null) return null
    const resumeSecret = (parsed as Record<string, unknown>)['resumeSecret']
    if (typeof resumeSecret !== 'string' || resumeSecret.length === 0) return null
    return { resumeSecret }
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

export function readSessionBlob(doc: Document, win: Window, installationId: string): StoredSessionBlob | null {
  const name = cookieName(installationId)
  const raw = readCookie(doc, name) ?? readLocalStorage(win, name)
  return raw ? decodeBlob(raw) : null
}

export function writeSessionBlob(doc: Document, win: Window, installationId: string, blob: StoredSessionBlob): void {
  const name = cookieName(installationId)
  const encoded = encodeBlob(blob)
  if (writeCookie(doc, win, name, encoded)) return
  writeLocalStorage(win, name, encoded) // fallback: la cookie no prendió
}
