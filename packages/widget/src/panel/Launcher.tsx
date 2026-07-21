import { useEffect, useRef } from 'preact/hooks'
import { BotLogo } from './icons'
import { useResizeReport } from './use-resize-report'

export interface LauncherProps {
  unreadCount: number
  autofocus: boolean
  onOpen: () => void
  onResize: (width: number, height: number) => void
  // Logo del tenant (config.theme.logoUrl) — opcional: llamadores previos a
  // esta feature no lo conocen y deben seguir cayendo al BotIcon por defecto.
  logoUrl?: string | null
}

export function Launcher({ unreadCount, autofocus, onOpen, onResize, logoUrl }: LauncherProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useResizeReport(onResize)

  useEffect(() => {
    if (autofocus) ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button type="button" class="launcher" data-part="launcher" ref={ref} aria-label="Abrir chat de ayuda" onClick={onOpen}>
      <BotLogo logoUrl={logoUrl} />
      {unreadCount > 0 && <span class="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
  )
}
