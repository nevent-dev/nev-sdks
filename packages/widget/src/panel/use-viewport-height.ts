import { useEffect } from 'preact/hooks'

// Setter puro — NO escucha window.visualViewport dentro del iframe (rev.2 lo
// hacía así). El host (loader, Task 12) ya reenvía cada cambio de SU PROPIO
// VisualViewport vía el mensaje `viewport`; escuchar aquí además sería
// redundante y, antes de que el loader dimensione el iframe a pantalla
// completa en móvil, mediría el viewport (pequeño, aún sin redimensionar)
// del propio iframe en vez del real del host.
export function useViewportHeight(heightPx: number | null): void {
  useEffect(() => {
    if (heightPx === null) {
      document.documentElement.style.removeProperty('--viewport-h')
      return
    }
    document.documentElement.style.setProperty('--viewport-h', `${heightPx}px`)
    // Unmount cleanup: without this, a Panel that unmounts while heightPx is
    // still numeric leaves --viewport-h stuck on <html> for whatever renders
    // next (e.g. the desktop launcher after the panel closes).
    return () => document.documentElement.style.removeProperty('--viewport-h')
  }, [heightPx])
}
