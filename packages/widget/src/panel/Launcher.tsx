import { useEffect, useRef } from 'preact/hooks'
import { BotIcon } from './icons'
import { useResizeReport } from './use-resize-report'

export interface LauncherProps {
  unreadCount: number
  autofocus: boolean
  onOpen: () => void
  onResize: (width: number, height: number) => void
}

export function Launcher({ unreadCount, autofocus, onOpen, onResize }: LauncherProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useResizeReport(onResize)

  useEffect(() => {
    if (autofocus) ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button type="button" class="launcher" data-part="launcher" ref={ref} aria-label="Abrir chat de ayuda" onClick={onOpen}>
      <BotIcon />
      {unreadCount > 0 && <span class="badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
  )
}
