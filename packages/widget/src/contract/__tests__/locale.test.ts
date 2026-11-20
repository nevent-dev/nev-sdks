import { describe, it, expect } from 'vitest'
import { resolveLocale } from '../locale'

describe('resolveLocale — normaliza un candidato crudo (host lang, config.locale...) a WidgetLocale', () => {
  it("'en' → 'en'", () => {
    expect(resolveLocale('en')).toBe('en')
  })
  it("'en-US' (subetiqueta de idioma BCP-47 con región) → 'en'", () => {
    expect(resolveLocale('en-US')).toBe('en')
  })
  it("'CA' (mayúsculas) → 'ca'", () => {
    expect(resolveLocale('CA')).toBe('ca')
  })
  it("'pt-BR' → 'pt'", () => {
    expect(resolveLocale('pt-BR')).toBe('pt')
  })
  it.each(['fr', 'fr-CA', 'fr-BE', 'fr-CH'])('negocia %s a fr', (language) => {
    expect(resolveLocale(language)).toBe('fr')
  })
  it.each(['it', 'it-IT', 'it-CH'])('negocia %s a it', (language) => {
    expect(resolveLocale(language)).toBe('it')
  })
  it.each(['de', 'de-DE', 'de-AT', 'de-CH'])('%s → de', (locale) => {
    expect(resolveLocale(locale)).toBe('de')
  })

  it("'nl' (no soportado) → null", () => {
    expect(resolveLocale('nl')).toBeNull()
  })
  it("'' (cadena vacía) → null", () => {
    expect(resolveLocale('')).toBeNull()
  })
  it('undefined → null', () => {
    expect(resolveLocale(undefined)).toBeNull()
  })
  it('null → null', () => {
    expect(resolveLocale(null)).toBeNull()
  })
})
