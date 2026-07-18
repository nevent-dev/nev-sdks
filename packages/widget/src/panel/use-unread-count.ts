import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoreState } from '../store/message-store'

// Cuenta mensajes bot/agent completos (no streaming) llegados desde la
// última vez que el panel estuvo abierto — spec §3.2. No requiere tocar
// message-store.ts para esto: se deriva comparando snapshots sucesivos.
export function useUnreadCount(state: StoreState, isOpen: boolean): number {
  const [count, setCount] = useState(0)
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      for (const m of state.messages) seenIds.current.add(m.id)
      setCount(0)
      return
    }
    let unseen = 0
    for (const m of state.messages) {
      const isCompleteReply = (m.role === 'bot' || m.role === 'agent') && m.status === 'sent' && !m.streaming
      if (isCompleteReply && !seenIds.current.has(m.id)) unseen += 1
    }
    setCount(unseen)
  }, [state.messages, isOpen])

  return count
}
