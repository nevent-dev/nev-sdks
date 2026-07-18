import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSafeColor, isSafeHttpsUrl, deriveInkColor, applyTheme } from '../theme'
import type { WidgetConfig } from '../../contract/types'

describe('isSafeColor — v1 SOLO hex opaco de 3/6 dígitos (Important #6, ronda 2)', () => {
  it('acepta hex de 3 y 6 dígitos', () => {
    expect(isSafeColor('#fff')).toBe(true)
    expect(isSafeColor('#6d4aff')).toBe(true)
  })
  it('rechaza hex con canal alpha (#rgba, #rrggbbaa) — antes se aceptaban y rompían el cálculo de contraste', () => {
    expect(isSafeColor('#fff0')).toBe(false)
    expect(isSafeColor('#6d4affcc')).toBe(false)
    expect(isSafeColor('#ffffff00')).toBe(false)
  })
  it('rechaza rgb()/rgba()/hsl()/hsla() SIN excepciones, aunque sean sintácticamente válidos', () => {
    expect(isSafeColor('rgb(109, 74, 255)')).toBe(false)
    expect(isSafeColor('rgba(109, 74, 255, 0.5)')).toBe(false)
    expect(isSafeColor('hsl(255, 100%, 64%)')).toBe(false)
  })
  it('rechaza url(), javascript:, expression() y nombres de color CSS', () => {
    expect(isSafeColor('url(javascript:alert(1))')).toBe(false)
    expect(isSafeColor('javascript:alert(1)')).toBe(false)
    expect(isSafeColor('expression(alert(1))')).toBe(false)
    expect(isSafeColor('red')).toBe(false)
    expect(isSafeColor('var(--evil)')).toBe(false)
  })
  it('rechaza cadenas vacías o desproporcionadamente largas', () => {
    expect(isSafeColor('')).toBe(false)
    expect(isSafeColor('#' + '6'.repeat(200))).toBe(false)
  })
})

describe('isSafeHttpsUrl', () => {
  it('acepta https', () => { expect(isSafeHttpsUrl('https://cdn.nevent.es/x.png')).toBe(true) })
  it('rechaza http, javascript:, data: y URLs mal formadas', () => {
    expect(isSafeHttpsUrl('http://cdn.nevent.es/x.png')).toBe(false)
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpsUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpsUrl('no es una url')).toBe(false)
  })
})

describe('deriveInkColor — Important #6 ronda 3: 4.5:1 REAL contra el color SÓLIDO (nunca el degradado); null si ninguna tinta lo alcanza', () => {
  it('marca muy clara (#f5f5f5): elige tinta oscura — contraste con blanco 1.09:1 (pésimo) vs 17.06:1 con tinta oscura', () => {
    expect(deriveInkColor('#f5f5f5')).toBe('#101319')
  })
  it('marca de referencia del mock (#6d4aff, --brand-a por defecto): elige blanco, y AHORA pasa AA de verdad (5.15:1 real contra el color SÓLIDO, no el peor caso de un degradado)', () => {
    expect(deriveInkColor('#6d4aff')).toBe('#ffffff')
  })
  it('Important (ronda 3) — color en la "zona muerta" (#006eff): NINGUNA tinta alcanza 4.5:1 (blanco 4.49:1, tinta oscura 4.14:1) → null, nunca la mejor de dos opciones que no cumplen', () => {
    // Calculado exactamente (no una aproximación): con --ink=#101319, la
    // zona donde ni blanco ni tinta oscura llegan a 4.5:1 va de luminancia
    // relativa ~0.1833 a ~0.2041; #006eff cae justo ahí (luminancia
    // ~0.1837). Antes (ronda 2/3) esto habría devuelto '#ffffff' igualmente
    // (4.49 > 4.14) pese a no alcanzar AA — exactamente el hallazgo Important
    // de la ronda 3.
    expect(deriveInkColor('#006eff')).toBeNull()
  })
  it('formato no calculable (nunca debería llegar aquí tras isSafeColor, pero deriveInkColor no debe lanzar): null, nunca un blanco inventado', () => {
    expect(deriveInkColor('no-es-un-color')).toBeNull()
  })
  it('normaliza hex de 3 dígitos antes de calcular (#0f0 se expande a #00ff00)', () => {
    expect(deriveInkColor('#0f0')).toBe(deriveInkColor('#00ff00'))
  })
})

describe('applyTheme', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  const theme = (overrides: Partial<WidgetConfig['theme']> = {}): WidgetConfig['theme'] => ({
    primaryColor: '#6d4aff', position: 'right', mode: 'auto', ...overrides,
  })

  it('aplica un color válido vía setProperty en --brand-a (normalizado a 6 dígitos) y calcula --brand-ink', () => {
    applyTheme(root, theme({ primaryColor: '#f5f5f5' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('#f5f5f5')
    expect(root.style.getPropertyValue('--brand-ink')).toBe('#101319')
  })

  it('normaliza un hex de 3 dígitos a 6 al fijar --brand-a', () => {
    applyTheme(root, theme({ primaryColor: '#0f0' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('#00ff00')
  })

  it('ignora un color inválido (incl. rgb()/hsl()/alpha, ahora rechazados): no toca --brand-a ni --brand-ink', () => {
    applyTheme(root, theme({ primaryColor: 'javascript:alert(1)' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('')
    expect(root.style.getPropertyValue('--brand-ink')).toBe('')
    applyTheme(root, theme({ primaryColor: 'rgb(109, 74, 255)' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('')
  })

  it('Important (ronda 3) — un color sintácticamente válido que NO alcanza 4.5:1 con ninguna tinta (#006eff) se ignora igual que uno inválido, y avisa por consola', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyTheme(root, theme({ primaryColor: '#006eff' }))
    expect(root.style.getPropertyValue('--brand-a')).toBe('') // se mantiene el --brand-a por defecto del token set, nunca un texto que no cumple AA
    expect(root.style.getPropertyValue('--brand-ink')).toBe('')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('#006eff'))
    warn.mockRestore()
  })

  it('fija data-position a right/left, con fallback a right ante un valor no reconocido', () => {
    applyTheme(root, theme({ position: 'left' }))
    expect(root.dataset['position']).toBe('left')
    applyTheme(root, theme({ position: 'up' as unknown as 'left' }))
    expect(root.dataset['position']).toBe('right')
  })

  it('fija data-theme para light/dark y lo elimina para auto', () => {
    applyTheme(root, theme({ mode: 'dark' }))
    expect(root.dataset['theme']).toBe('dark')
    applyTheme(root, theme({ mode: 'light' }))
    expect(root.dataset['theme']).toBe('light')
    applyTheme(root, theme({ mode: 'auto' }))
    expect(root.dataset['theme']).toBeUndefined()
  })

  it('nunca lanza con un theme completamente hostil', () => {
    expect(() => applyTheme(root, {
      primaryColor: '</style><script>alert(1)</script>',
      position: '<img onerror=alert(1)>' as unknown as 'left',
      mode: 'ignore-me' as unknown as 'auto',
    })).not.toThrow()
  })
})
