import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readSessionBlob, writeSessionBlob, COOKIE_MAX_AGE_SECONDS } from '../session-storage'

const INSTALLATION_ID = 'inst_demo_festival_01'
const OTHER_INSTALLATION_ID = 'inst_other_tenant_02'

function clearAllCookies(doc: Document): void {
  // jsdom no expone document.cookie = '' para borrar todo; hay que expirar
  // cada nombre visto en el test explícitamente.
  for (const pair of doc.cookie.split('; ')) {
    const name = pair.split('=')[0]
    if (name) doc.cookie = `${name}=; path=/; max-age=0`
  }
}

beforeEach(() => {
  clearAllCookies(document)
  localStorage.clear()
})

afterEach(() => {
  clearAllCookies(document)
  localStorage.clear()
})

describe('session-storage', () => {
  it('sin nada guardado: readSessionBlob devuelve null', () => {
    expect(readSessionBlob(document, window, INSTALLATION_ID)).toBeNull()
  })

  it('write + read hace round-trip del resumeSecret vía cookie', () => {
    writeSessionBlob(document, window, INSTALLATION_ID, { resumeSecret: 'resume_abc123' })
    expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_abc123' })
  })

  it('la cookie escrita usa el nombre nevw_session_<installationId>, path=/, SameSite=Lax y max-age de 30 días', () => {
    const setter = vi.spyOn(document, 'cookie', 'set')
    writeSessionBlob(document, window, INSTALLATION_ID, { resumeSecret: 'resume_abc123' })
    expect(setter).toHaveBeenCalledTimes(1)
    const written = setter.mock.calls[0]![0]
    expect(written.startsWith(`nevw_session_${INSTALLATION_ID}=`)).toBe(true)
    expect(written).toContain('path=/')
    expect(written).toContain('SameSite=Lax')
    expect(written).toContain(`max-age=${COOKIE_MAX_AGE_SECONDS}`)
    expect(COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60) // 30 días, alineado con widget.session.max-idle-days en nev-api
    setter.mockRestore()
  })

  it('en https añade el atributo Secure; en http (o sin protocolo https) no lo añade', () => {
    const setter = vi.spyOn(document, 'cookie', 'set')
    const httpsWindow = { location: { protocol: 'https:' }, localStorage } as unknown as Window
    writeSessionBlob(document, httpsWindow, INSTALLATION_ID, { resumeSecret: 'resume_abc123' })
    expect(setter.mock.calls[0]![0]).toContain('Secure')
    setter.mockClear()

    clearAllCookies(document)
    const httpWindow = { location: { protocol: 'http:' }, localStorage } as unknown as Window
    writeSessionBlob(document, httpWindow, INSTALLATION_ID, { resumeSecret: 'resume_abc123' })
    expect(setter.mock.calls[0]![0]).not.toContain('Secure')
    setter.mockRestore()
  })

  it('cookies aisladas por installationId: la de otra instalación no se lee', () => {
    writeSessionBlob(document, window, INSTALLATION_ID, { resumeSecret: 'resume_abc123' })
    expect(readSessionBlob(document, window, OTHER_INSTALLATION_ID)).toBeNull()
  })

  it('blob corrupto (base64/JSON inválido) en la cookie: readSessionBlob devuelve null, no lanza', () => {
    document.cookie = `nevw_session_${INSTALLATION_ID}=%%%no-es-base64%%%; path=/`
    expect(() => readSessionBlob(document, window, INSTALLATION_ID)).not.toThrow()
    expect(readSessionBlob(document, window, INSTALLATION_ID)).toBeNull()
  })

  it('JSON válido pero sin resumeSecret utilizable: readSessionBlob devuelve null', () => {
    document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({ foo: 'bar' }))}; path=/`
    expect(readSessionBlob(document, window, INSTALLATION_ID)).toBeNull()
  })

  it('si escribir la cookie no persiste (cookies deshabilitadas), cae a localStorage', () => {
    const fakeDoc = {
      get cookie() { return '' }, // simula que el navegador ignora cualquier set (todas las cookies bloqueadas)
      set cookie(_v: string) { /* no-op: nunca se guarda de verdad */ },
    } as unknown as Document
    writeSessionBlob(fakeDoc, window, INSTALLATION_ID, { resumeSecret: 'resume_fallback' })
    expect(readSessionBlob(fakeDoc, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_fallback' })
    expect(localStorage.getItem(`nevw_session_${INSTALLATION_ID}`)).not.toBeNull()
  })

  it('lectura: si no hay cookie pero sí localStorage, lee de localStorage', () => {
    localStorage.setItem(`nevw_session_${INSTALLATION_ID}`, btoa(JSON.stringify({ resumeSecret: 'resume_ls_only' })))
    expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_ls_only' })
  })

  it('nunca lanza cuando NI cookies NI localStorage funcionan (modo privado estricto): best-effort, se rinde en silencio', () => {
    const fakeDoc = {
      get cookie() { return '' },
      set cookie(_v: string) { /* no-op: cookies bloqueadas */ },
    } as unknown as Document
    const brokenWindow = {
      location: { protocol: 'https:' },
      get localStorage(): Storage { throw new Error('SecurityError') },
    } as unknown as Window
    expect(() => writeSessionBlob(fakeDoc, brokenWindow, INSTALLATION_ID, { resumeSecret: 'x' })).not.toThrow()
    expect(() => readSessionBlob(fakeDoc, brokenWindow, INSTALLATION_ID)).not.toThrow()
    expect(readSessionBlob(fakeDoc, brokenWindow, INSTALLATION_ID)).toBeNull()
  })

  // Important #1 (review W3): a diferencia de la cookie (acotada por su
  // propio max-age, el navegador la borra solo), localStorage no tiene TTL
  // nativo — sin un expiresAt guardado a mano en el blob, un resumeSecret
  // caído al fallback viviría para siempre.
  describe('TTL del fallback de localStorage', () => {
    const KEY = `nevw_session_${INSTALLATION_ID}`

    it('blob de localStorage con expiresAt en el pasado: readSessionBlob devuelve null y LIMPIA la entrada', () => {
      const past = Date.now() - 1000
      localStorage.setItem(KEY, btoa(JSON.stringify({ resumeSecret: 'resume_caducado', expiresAt: past })))
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('blob de localStorage con expiresAt en el futuro: se lee con normalidad, sin exponer expiresAt en el resultado', () => {
      const future = Date.now() + 60_000
      localStorage.setItem(KEY, btoa(JSON.stringify({ resumeSecret: 'resume_vigente', expiresAt: future })))
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_vigente' })
    })

    it('un blob de localStorage SIN expiresAt (formato previo a este fix) no se trata como caducado', () => {
      localStorage.setItem(KEY, btoa(JSON.stringify({ resumeSecret: 'resume_formato_viejo' })))
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_formato_viejo' })
    })

    it('al caer a localStorage (cookies bloqueadas), el blob escrito lleva expiresAt ~= ahora + 30 días', () => {
      const fakeDoc = {
        get cookie() { return '' },
        set cookie(_v: string) { /* no-op */ },
      } as unknown as Document
      const before = Date.now()
      writeSessionBlob(fakeDoc, window, INSTALLATION_ID, { resumeSecret: 'resume_fallback_ttl' })
      const after = Date.now()
      const raw = localStorage.getItem(KEY)
      expect(raw).not.toBeNull()
      const decoded = JSON.parse(atob(raw!)) as { resumeSecret: string; expiresAt: number }
      expect(decoded.resumeSecret).toBe('resume_fallback_ttl')
      expect(decoded.expiresAt).toBeGreaterThanOrEqual(before + COOKIE_MAX_AGE_SECONDS * 1000)
      expect(decoded.expiresAt).toBeLessThanOrEqual(after + COOKIE_MAX_AGE_SECONDS * 1000)
    })

    it('la cookie SIGUE sin llevar expiresAt en el blob (su max-age ya la acota; no hace falta duplicarlo)', () => {
      writeSessionBlob(document, window, INSTALLATION_ID, { resumeSecret: 'resume_cookie_normal' })
      const raw = readCookieRaw(document, INSTALLATION_ID)
      const decoded = JSON.parse(atob(raw!)) as Record<string, unknown>
      expect(decoded).toEqual({ resumeSecret: 'resume_cookie_normal' })
      expect(decoded['expiresAt']).toBeUndefined()
    })
  })

  // Marca de último-visto acotada por conversación (unread watermark) — por
  // IDENTIDAD del último mensaje visto, no por seq (WidgetMessage no lleva
  // seq por mensaje). Reutiliza el mismo blob/canal que el resumeSecret.
  describe('lastSeen (watermark de no-leídos)', () => {
    it('write + read hace round-trip de resumeSecret + lastSeen', () => {
      writeSessionBlob(document, window, INSTALLATION_ID, {
        resumeSecret: 'resume_abc123',
        lastSeen: { conversationId: 'conv_demo_festival_01', messageId: 'msg_0007' },
      })
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({
        resumeSecret: 'resume_abc123',
        lastSeen: { conversationId: 'conv_demo_festival_01', messageId: 'msg_0007' },
      })
    })

    it('un blob legado (sin lastSeen) sigue siendo válido tal cual', () => {
      document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({ resumeSecret: 'resume_legado' }))}; path=/`
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_legado' })
    })

    it('lastSeen corrupto (conversationId vacío) se DESCARTA pero el resumeSecret sobrevive', () => {
      document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({
        resumeSecret: 'resume_ok', lastSeen: { conversationId: '', messageId: 'msg_1' },
      }))}; path=/`
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_ok' })
    })

    it('lastSeen corrupto (messageId vacío) se DESCARTA pero el resumeSecret sobrevive', () => {
      document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({
        resumeSecret: 'resume_ok', lastSeen: { conversationId: 'conv_demo', messageId: '' },
      }))}; path=/`
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_ok' })
    })

    it('lastSeen corrupto (messageId no-string) se DESCARTA pero el resumeSecret sobrevive', () => {
      document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({
        resumeSecret: 'resume_ok', lastSeen: { conversationId: 'conv_demo', messageId: 42 },
      }))}; path=/`
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_ok' })
    })

    it('lastSeen corrupto (shape ajeno) se DESCARTA pero el resumeSecret sobrevive', () => {
      document.cookie = `nevw_session_${INSTALLATION_ID}=${btoa(JSON.stringify({
        resumeSecret: 'resume_ok', lastSeen: 'no-es-un-objeto',
      }))}; path=/`
      expect(readSessionBlob(document, window, INSTALLATION_ID)).toEqual({ resumeSecret: 'resume_ok' })
    })

    it('round-trip de lastSeen también funciona vía el fallback de localStorage', () => {
      const fakeDoc = {
        get cookie() { return '' },
        set cookie(_v: string) { /* no-op: cookies bloqueadas */ },
      } as unknown as Document
      writeSessionBlob(fakeDoc, window, INSTALLATION_ID, {
        resumeSecret: 'resume_fallback', lastSeen: { conversationId: 'conv_demo', messageId: 'msg_0004' },
      })
      expect(readSessionBlob(fakeDoc, window, INSTALLATION_ID)).toEqual({
        resumeSecret: 'resume_fallback', lastSeen: { conversationId: 'conv_demo', messageId: 'msg_0004' },
      })
    })
  })
})

function readCookieRaw(doc: Document, installationId: string): string | null {
  const prefix = `nevw_session_${installationId}=`
  for (const pair of doc.cookie.split('; ')) {
    if (pair.startsWith(prefix)) return pair.slice(prefix.length)
  }
  return null
}
