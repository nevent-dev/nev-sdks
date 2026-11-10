import { describe, it, expect } from 'vitest'
import { resolveContactContent } from '../contact-block'

// Ejemplo del contrato (_rescate/t15-mock/contrato.md §2, MYA).
const wa = { channel: 'WHATSAPP', value: '+34612345678', display: '+34 612 34 56 78', url: 'https://wa.me/34612345678' }
const tel = { channel: 'PHONE', value: '+34963123456', display: '+34 963 12 34 56', url: 'tel:+34963123456' }
const mail = { channel: 'EMAIL', value: 'atencion@club.com', display: 'atencion@club.com', url: 'mailto:atencion@club.com' }
const text = 'Sorry to hear about your phone. MYA handles lost property on WhatsApp: +34 612 34 56 78'
const bodyText = 'Sorry to hear about your phone. MYA handles lost property on WhatsApp:'

const withBlocks = (contacts: unknown, extra: Record<string, unknown> = {}) => resolveContactContent({ text, bodyText, contacts, ...extra })
const fallback = { text, contactBlocks: [] }

describe('resolveContactContent — regla del cliente del contrato', () => {
  it('contacts no vacío + bodyText: burbuja bodyText y los bloques en orden', () => {
    expect(withBlocks([wa, tel, mail])).toEqual({ text: bodyText, contactBlocks: [wa, tel, mail] })
  })

  it('mensaje sin los campos nuevos: text tal cual, sin bloques', () => {
    expect(resolveContactContent({ text })).toEqual(fallback)
  })

  it('cualquier otro caso → text, sin bloques', () => {
    expect(withBlocks([])).toEqual(fallback)
    expect(withBlocks(null)).toEqual(fallback)
    expect(withBlocks({ ...wa })).toEqual(fallback)
    expect(resolveContactContent({ text, contacts: [wa] })).toEqual(fallback) // sin bodyText
    expect(withBlocks([wa], { bodyText: 42 })).toEqual(fallback)
  })

  it('un bloque al que le falta cualquiera de sus cuatro campos se descarta, y con él los bloques: el fan conserva el número en text', () => {
    for (const field of ['channel', 'value', 'display', 'url'] as const) {
      const broken: Record<string, unknown> = { ...wa }
      delete broken[field]
      expect(withBlocks([broken])).toEqual(fallback)
      expect(withBlocks([tel, broken])).toEqual(fallback)
    }
  })

  it('canal desconocido o en minúsculas → text', () => {
    expect(withBlocks([{ ...wa, channel: 'TELEGRAM' }])).toEqual(fallback)
    expect(withBlocks([{ ...wa, channel: 'whatsapp' }])).toEqual(fallback)
  })

  it('URL: solo la que corresponde al valor según el canal; nada de javascript: ni otros dominios', () => {
    for (const block of [
      { ...wa, url: 'javascript:alert(1)' },
      { ...wa, url: 'http://wa.me/34612345678' },
      { ...wa, url: 'https://wa.me.evil.com/34612345678' },
      { ...wa, url: 'https://api.whatsapp.com/send?phone=34612345678' },
      { ...wa, url: 'https://wa.me/34600000000' },
      { ...wa, url: 'tel:+34612345678' },
      { ...tel, url: 'tel:963123456' },
      { ...tel, url: 'https://wa.me/34963123456' },
      { ...mail, url: 'https://club.com' },
      { ...mail, url: 'mailto:otro@club.com' },
    ]) {
      expect(withBlocks([block])).toEqual(fallback)
    }
  })

  it('lo que se ve y lo que abre el botón no divergen', () => {
    expect(withBlocks([{ ...wa, display: '+34 600 00 00 00' }])).toEqual(fallback)
    expect(withBlocks([{ ...mail, display: 'otro@club.com' }])).toEqual(fallback)
  })

  it('el valor es E.164 o email en minúsculas, como lo guarda el backend', () => {
    expect(withBlocks([{ ...tel, value: '963123456', url: 'tel:963123456' }])).toEqual(fallback)
    expect(withBlocks([{ ...mail, value: 'Atencion@club.com', url: 'mailto:Atencion@club.com' }])).toEqual(fallback)
  })

  it('mailto sin inyección: ni consulta, ni varios destinatarios, ni escapes', () => {
    for (const value of ['atencion@club.com?subject=hola', 'atencion@club.com,otro@x.com', 'atencion@club.com%0Abcc:otro@x.com']) {
      expect(withBlocks([{ ...mail, value, display: value, url: `mailto:${value}` }])).toEqual(fallback)
    }
  })

  it('display vacío o con saltos de línea → text', () => {
    expect(withBlocks([{ ...wa, display: '' }])).toEqual(fallback)
    expect(withBlocks([{ ...wa, display: '+34 612 34 56 78\nLlama ya' }])).toEqual(fallback)
  })

  it('más de 10 bloques (el máximo de derivaciones) → text', () => {
    expect(withBlocks(Array.from({ length: 11 }, () => wa))).toEqual(fallback)
  })

  it('campos de más en el bloque no llegan al store', () => {
    expect(withBlocks([{ ...wa, routeName: 'Objetos perdidos' }])).toEqual({ text: bodyText, contactBlocks: [wa] })
  })
})
