import { describe, it, expect } from 'vitest'
import '../tokens.css'

// jsdom 25.0.1 no calcula custom properties CSS declaradas en hojas de
// estilo dentro de getComputedStyle() (limitación conocida y aún abierta de
// jsdom: jsdom/jsdom#1895 — `color` u otras propiedades estándar sí se
// computan, pero `getComputedStyle(el).getPropertyValue('--x')` devuelve
// siempre '' para cualquier custom property venida de un <style>, aunque el
// custom property sí exista en el CSSOM parseado). Verificado directamente
// contra jsdom: propiedades custom fijadas inline vía `el.style.setProperty`
// SÍ se computan bien (relevante para Task 2, que fija --brand-ink así en
// runtime) — el hueco es solo para valores estáticos declarados en
// tokens.css. Se lee el valor declarado directamente del CSSOM
// (`document.styleSheets`), que sí soporta parsing de reglas y propiedades
// custom, en vez de depender del cascade que jsdom no calcula.
function declaredValue(selector: string, prop: string): string {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
        const value = rule.style.getPropertyValue(prop).trim()
        if (value !== '') return value
      }
    }
  }
  return ''
}

describe('tokens.css', () => {
  it('define --ink claro por defecto en :root', () => {
    expect(declaredValue(':root', '--ink')).toBe('#101319')
  })

  it('sobrescribe --ink en modo oscuro vía [data-theme="dark"]', () => {
    expect(declaredValue('[data-theme="dark"]', '--ink')).toBe('#f2f4f8')
  })

  it('expone --font-display (Poppins) y --font-body (Inter)', () => {
    expect(declaredValue(':root', '--font-display')).toContain('Poppins')
    expect(declaredValue(':root', '--font-body')).toContain('Inter')
  })

  it('--brand-ink tiene un valor por defecto (blanco) antes de que theme.ts lo recalcule', () => {
    expect(declaredValue(':root', '--brand-ink')).toBe('#ffffff')
  })

  it('expone --accent-sun-a/--accent-sun-b tokenizados (ya no hex hardcodeado en CardCarousel)', () => {
    expect(declaredValue(':root', '--accent-sun-a')).toBe('#f59e0b')
    expect(declaredValue(':root', '--accent-sun-b')).toBe('#ef4444')
  })
})
