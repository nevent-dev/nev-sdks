import { describe, it, expect } from 'vitest'
import { normalizeWelcome } from '../normalize-welcome'

describe('normalizeWelcome — Important #8 gap#6: config es entrada no confiable, se normaliza en la frontera de red', () => {
  it('payload válido pasa tal cual', () => {
    const w = normalizeWelcome({ title: 'Hola', subtitle: 'Te ayudamos', quickReplies: ['Uno', 'Dos'] })
    expect(w).toEqual({ title: 'Hola', subtitle: 'Te ayudamos', quickReplies: ['Uno', 'Dos'] })
  })

  it('title > 80 chars: se recorta, no se descarta el welcome entero', () => {
    const w = normalizeWelcome({ title: 'x'.repeat(200), subtitle: 'y', quickReplies: [] })
    expect(w?.title.length).toBe(80)
  })

  it('subtitle > 200 chars: se recorta', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y'.repeat(400), quickReplies: [] })
    expect(w?.subtitle.length).toBe(200)
  })

  it('más de 4 quickReplies: se recorta a 4', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['1', '2', '3', '4', '5', '6'] })
    expect(w?.quickReplies).toEqual(['1', '2', '3', '4'])
  })

  it('un chip individual > 60 chars: se descarta ESE chip, los demás sobreviven', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['ok', 'z'.repeat(100), 'ok2'] })
    expect(w?.quickReplies).toEqual(['ok', 'ok2'])
  })

  it('quickReplies con tipos mezclados (número, objeto, null): se descartan los no-string', () => {
    const w = normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: ['ok', 42, { evil: true }, null, 'ok2'] })
    expect(w?.quickReplies).toEqual(['ok', 'ok2'])
  })

  it('falta title o subtitle: devuelve undefined (welcome completo descartado, Welcome.tsx cae a su copia genérica)', () => {
    expect(normalizeWelcome({ subtitle: 'y', quickReplies: [] })).toBeUndefined()
    expect(normalizeWelcome({ title: 'x', quickReplies: [] })).toBeUndefined()
  })

  it('quickReplies ausente o de tipo incorrecto: cae a array vacío, no lanza', () => {
    expect(normalizeWelcome({ title: 'x', subtitle: 'y' })?.quickReplies).toEqual([])
    expect(normalizeWelcome({ title: 'x', subtitle: 'y', quickReplies: 'no-es-un-array' })?.quickReplies).toEqual([])
  })

  it('payload no-objeto (null, string, número, array): undefined, nunca lanza', () => {
    expect(normalizeWelcome(null)).toBeUndefined()
    expect(normalizeWelcome('hola')).toBeUndefined()
    expect(normalizeWelcome(42)).toBeUndefined()
    expect(normalizeWelcome(undefined)).toBeUndefined()
  })
})
