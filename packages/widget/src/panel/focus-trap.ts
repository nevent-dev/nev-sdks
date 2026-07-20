import { useEffect, useRef } from 'preact/hooks'

export interface FocusTrapHandle {
  release(): void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Atrapa Tab/Shift+Tab dentro de `container` y delega Escape a `onEscape` —
// spec §6. El foco inicial, cuando `autofocus` es true, cae en el propio
// `container` (requiere tabindex="-1" en el JSX que lo use) en vez de "el
// primer elemento foco-able" — patrón WAI-ARIA APG para diálogos.
export function trapFocus(container: HTMLElement, opts: { onEscape: () => void; autofocus: boolean }): FocusTrapHandle {
  const focusables = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

  const onKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.preventDefault(); opts.onEscape(); return }
    if (ev.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) { ev.preventDefault(); return } // nada foco-able: no dejar escapar el foco igualmente
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    // `active === container` cubre el foco inicial del autofocus (el propio
    // <section tabindex=-1>, excluido del orden normal de Tab): sin este
    // caso, Shift+Tab desde ahí no coincidía con "first" y el navegador
    // aplicaba su comportamiento nativo, sacando el foco del panel entero —
    // fuga real corregida aquí (Important #5 de la revisión de Codex).
    if (ev.shiftKey && (active === first || active === container)) {
      ev.preventDefault(); last.focus()
    } else if (!ev.shiftKey && (active === last || active === container)) {
      ev.preventDefault(); first.focus()
    } else if (active === null || !container.contains(active)) {
      ev.preventDefault()
      ;(ev.shiftKey ? last : first).focus()
    }
  }

  // Red de seguridad para foco que se sale del panel por CUALQUIER vía, no
  // solo Tab (clic en algo no foco-able, blur programático) — Important #5:
  // "tampoco contiene el foco si cae en body o fuera del section".
  const onFocusIn = (ev: FocusEvent): void => {
    if (!container.contains(ev.target as Node)) container.focus()
  }

  container.addEventListener('keydown', onKeydown)
  document.addEventListener('focusin', onFocusIn)
  if (opts.autofocus) container.focus()

  return {
    release(): void {
      container.removeEventListener('keydown', onKeydown)
      document.removeEventListener('focusin', onFocusIn)
    },
  }
}

// `autofocus` es una decisión tomada UNA VEZ al crear el trap (no reactiva):
// si el viewport cruza el breakpoint móvil/desktop mientras el panel ya está
// abierto, no se le roba el foco al usuario a mitad de sesión. Por eso NO
// está en el array de deps — solo `active` recrea el trap.
export function useFocusTrap(active: boolean, onEscape: () => void, autofocus: boolean) {
  const containerRef = useRef<HTMLElement | null>(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active || !containerRef.current) return
    const handle = trapFocus(containerRef.current, { onEscape: () => onEscapeRef.current(), autofocus })
    return () => handle.release()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return containerRef
}
