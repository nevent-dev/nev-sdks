// Los locales soportados por el widget (Plan 4). Vive en su propio módulo,
// SIN diccionarios (esos están en panel/strings.ts) — lo importa también el
// loader (IIFE, ver vite.loader.config.ts), que no puede permitirse cargar
// las traducciones completas solo para detectar el idioma del host.
export type WidgetLocale = 'es' | 'en' | 'ca' | 'pt' | 'fr' | 'it'

// Shared by the frame and its loader without bundling the panel strings.
export const WIDGET_TITLES: Record<WidgetLocale, string> = {
  es: 'Chat de ayuda',
  en: 'Help chat',
  ca: "Xat d'ajuda",
  pt: 'Chat de apoio',
  fr: 'Chat d’assistance',
  it: 'Chat di assistenza',
}

// Normaliza un candidato crudo (document.documentElement.lang del host,
// config.locale del backend, cualquier subetiqueta BCP-47 con o sin región)
// a un WidgetLocale soportado. 'en-US' → 'en', 'pt-BR' → 'pt', 'CA' → 'ca'.
// null para cualquier candidato vacío, ausente o no soportado — nunca se
// inventa el idioma soportado "más parecido"; decidir el fallback final
// (host > config.locale > 'es') es responsabilidad de quien llama.
export function resolveLocale(candidate: string | null | undefined): WidgetLocale | null {
  if (typeof candidate !== 'string') return null
  const base = candidate.trim().toLowerCase().split('-')[0]
  if (!base) return null
  return Object.prototype.hasOwnProperty.call(WIDGET_TITLES, base) ? (base as WidgetLocale) : null
}
