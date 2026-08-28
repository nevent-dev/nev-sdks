import type { WidgetConfig } from '../contract/types'

const HEX3 = /^#[0-9a-fA-F]{3}$/
const HEX6 = /^#[0-9a-fA-F]{6}$/

// v1 SOLO acepta hex opaco (spec §7 + Important #6 ronda 2): rgb()/hsl() y
// hex con alpha se aceptaban en rev.2 como "sintácticamente válidos" pero
// deriveInkColor no podía calcular contraste real sobre ellos (devolvía
// blanco fijo, dejando pasar combinaciones casi invisibles). En vez de
// soportar parcialmente más formatos, el allowlist se restringe a lo que SÍ
// puede validarse Y calcularse con garantías.
export function isSafeColor(value: string): boolean {
  const v = value.trim()
  return HEX3.test(v) || HEX6.test(v)
}

export function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}
function contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}
function expandHex3(hex: string): string {
  return '#' + hex.slice(1).split('').map((c) => c + c).join('')
}
// Precondición: `hex` ya pasó isSafeColor (HEX3 o HEX6) — normaliza a 6 dígitos.
function normalizeHex(hex: string): string {
  return HEX3.test(hex) ? expandHex3(hex) : hex
}
function hexToRgb(hex6: string): [number, number, number] {
  const num = parseInt(hex6.slice(1), 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

const INK_HEX = '#101319' // --ink del token set
const AA_NORMAL_TEXT = 4.5 // WCAG 2.2 SC 1.4.3, texto normal — sin redondeo hacia arriba

// Devuelve la tinta (blanco o la tinta oscura del token set) que alcanza
// 4.5:1 REAL contra el color SÓLIDO pedido — nunca contra el degradado
// (Important, ronda 3: rev.3 comparaba contra el PEOR de los dos extremos de
// --brand-grad para "cubrir" avatares/botones que pintan sobre el degradado,
// pero eso hacía que el algoritmo ACEPTARA la mejor de dos opciones aunque
// NINGUNA llegara a 4.5:1 — con los tokens por defecto, blanco sobre
// --brand-b daba ~4.04:1, insuficiente, y el plan seguía llamando a esto "AA
// automático" pese a que el propio Self-Review reconocía la limitación).
//
// v1 solo garantiza AA para TEXTO real, y el texto real se pinta SIEMPRE
// sobre el color SÓLIDO --brand-a (panel.css, `.initials-avatar` — Step 5 de
// esta misma tarea corrige ese selector para que deje de heredar
// --brand-grad). Los usos del degradado que quedan (avatar-icono del bot,
// botón de enviar, ribbon de estado, fondo de imagen de card) son
// decorativos/no-texto: WCAG 2.2 SC 1.4.11 solo les exige ≥3:1, umbral que
// blanco/tinta oscura superan con margen amplio sin necesidad de perseguirlo
// aquí activamente.
//
// Devuelve `null` si NINGUNA de las dos tintas alcanza 4.5:1 real — el
// llamador (`applyTheme`) debe entonces IGNORAR el `primaryColor` pedido por
// completo, nunca aceptar un texto que no cumple AA.
export function deriveInkColor(primaryColorHex: string): string | null {
  if (!isSafeColor(primaryColorHex)) return null
  const rgb = hexToRgb(normalizeHex(primaryColorHex))
  const lum = relativeLuminance(...rgb)
  const inkLum = relativeLuminance(...hexToRgb(INK_HEX))
  const whiteContrast = contrastRatio(lum, 1)
  const inkContrast = contrastRatio(lum, inkLum)
  const best = whiteContrast >= inkContrast ? '#ffffff' : INK_HEX
  const bestContrast = Math.max(whiteContrast, inkContrast)
  return bestContrast >= AA_NORMAL_TEXT ? best : null
}

// El color REAL de la superficie del panel tal y como quedó tras resolver el
// tema completo (override de config vía data-theme + prefers-color-scheme,
// cascada de tokens.css) — el loader lo pinta en su backplate opaco para que
// no haya costura visible entre el iframe y el fondo que cubre el layout
// viewport (los teclados/barras translúcidos de iOS 26 dejan ver lo que haya
// debajo del visual viewport). Devuelve null si el valor computado no es un
// hex validable (isSafeColor) — la frontera shell→loader es postMessage y el
// loader aplica entonces su propio fallback, nunca un valor arbitrario.
export function resolveSurfaceColor(w: Window, root: HTMLElement): string | null {
  const value = w.getComputedStyle(root).getPropertyValue('--surface').trim()
  return isSafeColor(value) ? value : null
}

// Config del anfitrión/backend es entrada NO CONFIABLE (spec §7): SIEMPRE vía
// CSSStyleDeclaration.setProperty, JAMÁS interpolado en HTML/CSS. Se llama
// desde main.tsx ANTES del primer render (Task 15), no desde un efecto de
// Panel — así el launcher inicial también respeta el theme (Important #10).
//
// `theme` (y `theme.primaryColor` dentro) son OPCIONALES: el backend real
// (integración E2E, Task 17) puede omitir el objeto entero o solo
// primaryColor — es config legítima, no el caso de color inválido. Ausencia
// se ignora en silencio (se conservan los tokens de marca por defecto), sin
// el console.warn reservado para un color sintácticamente presente pero que
// no cumple 4.5:1.
export function applyTheme(root: HTMLElement, theme: WidgetConfig['theme'] | undefined): void {
  const primaryColor = theme?.primaryColor
  if (primaryColor !== undefined) {
    if (isSafeColor(primaryColor)) {
      const normalized = normalizeHex(primaryColor.trim())
      const ink = deriveInkColor(normalized)
      if (ink) {
        root.style.setProperty('--brand-a', normalized)
        root.style.setProperty('--brand-ink', ink)
      } else {
        // Ni blanco ni la tinta oscura alcanzan 4.5:1 real contra este color:
        // en vez de aceptar un texto que no cumple AA, se ignora el override
        // y se conserva el --brand-a por defecto del token set (que sí pasa —
        // blanco sobre #6d4aff da ~5.15:1, ver el test de arriba).
        console.warn(`[nevent-widget] primaryColor "${primaryColor}" no alcanza 4.5:1 de contraste con ninguna tinta disponible — se ignora, se mantiene el color de marca por defecto`)
      }
    }
  }
  root.dataset['position'] = theme?.position === 'left' ? 'left' : 'right'

  if (theme?.mode === 'light' || theme?.mode === 'dark') {
    root.dataset['theme'] = theme.mode
  } else {
    delete root.dataset['theme']
  }
}
