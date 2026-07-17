import { useEffect, useState } from 'preact/hooks'
import type { WidgetConfig } from '../contract/types'

export interface ShellBus {
  onCommand(cb: (type: string, payload: unknown) => void): void
  emit(type: string, payload?: unknown): void
}

export function App({ config, bus }: { config: WidgetConfig; bus: ShellBus }) {
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    bus.onCommand((type) => {
      if (type === 'open') setOpen(true)
      else if (type === 'close') setOpen(false)
      else if (type === 'toggle') setOpen((v) => !v)
    })
  }, [bus])

  useEffect(() => {
    bus.emit(isOpen ? 'opened' : 'closed')
  }, [isOpen, bus])

  return (
    <div data-part="root">
      {isOpen ? (
        <section data-part="panel" role="dialog" aria-label={config.assistantName}>
          <header data-part="header">{config.assistantName}</header>
          <button data-part="close" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button>
        </section>
      ) : (
        <button data-part="launcher" aria-label="Abrir chat de ayuda" onClick={() => setOpen(true)} />
      )}
    </div>
  )
}
