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
  it("'fr' (no soportado) → null — nunca se inventa un idioma soportado más cercano", () => {
    expect(resolveLocale('fr')).toBeNull()
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
