import { useEffect } from 'preact/hooks'

// Mide `[data-part="root"]` — el div que App.tsx renderiza vía JSX — NUNCA
// document.body (Critical #2: body es block y llena su containing block, que
// dentro de un iframe recién arrancado en 0px de ancho colapsa a 0 SIN
// IMPORTAR el ancho real de sus hijos). [data-part="root"] es
// display:inline-flex con padding propio (panel.css, Step 6 de esta tarea):
// un elemento shrink-to-fit se dimensiona a su contenido real aunque su
// contenedor sea más estrecho — el mismo motivo por el que .panel{width:382px}
// nunca se comprime pese a vivir dentro de un iframe diminuto.
export function useResizeReport(onResize: (width: number, height: number) => void): void {
  useEffect(() => {
    const target = document.querySelector<HTMLElement>('[data-part="root"]')
    if (!target || typeof ResizeObserver === 'undefined') return
    const report = (): void => {
      const rect = target.getBoundingClientRect()
      onResize(Math.ceil(rect.width), Math.ceil(rect.height))
    }
    const ro = new ResizeObserver(report)
    ro.observe(target)
    report()
    return () => ro.disconnect()
  }, [])
}
