import { useRef, useState } from 'preact/hooks'
import type { PanelViewState } from './view-state'

export interface ComposerProps {
  viewState: PanelViewState
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({ viewState, onSend, onStop }: ComposerProps) {
  const [draft, setDraft] = useState('')
  // Se lee del DOM (no del cierre sobre `draft`) porque el `setState` del
  // `onInput` se aplica en un microtask (fuera de `act()`, Preact difiere
  // el rerender vía Promise.resolve().then) — un Enter disparado en el
  // mismo tick que el `input` (typing real o dispatch síncrono en tests)
  // vería `draft` aún vacío si dependiera del cierre.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const trySend = (): void => {
    const text = (textareaRef.current?.value ?? draft).trim()
    if (text.length === 0 || viewState.composerDisabled) return
    onSend(text)
    setDraft('')
    if (textareaRef.current) textareaRef.current.value = ''
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault()
      trySend()
    }
  }

  const sendDisabled = draft.trim().length === 0 || viewState.composerDisabled

  return (
    <div class="composer">
      {viewState.showStopButton && (
        <button type="button" class="stopbtn" onClick={onStop}>
          <i aria-hidden="true" /> Detener respuesta
        </button>
      )}
      <div class="c-row">
        {/* Sin autofocus a propósito (Global Constraints) — este textarea
            nunca recibe foco por código, solo por interacción real del
            usuario. El focus-trap del panel (Task 4) decide su propia
            política de foco inicial en Task 13, ajena a este componente. */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          placeholder={viewState.composerPlaceholder}
          aria-label="Escribe tu mensaje"
          disabled={viewState.composerDisabled}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" class="iconbtn" aria-label="Adjuntar archivo" title="Próximamente" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12.5l-8.5 8.5a6 6 0 0 1-8.5-8.5L12.5 4a4 4 0 0 1 5.7 5.7L9.7 18.2a2 2 0 0 1-2.9-2.9l8-8" />
          </svg>
        </button>
        <button type="button" class="send" aria-label="Enviar" disabled={sendDisabled} onClick={trySend}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12l16-7-4.5 14L11 13z" /><path d="M20 5L11 13" />
          </svg>
        </button>
      </div>
      <div class="powered">
        Con la tecnología de{' '}
        <a href="https://nevent.ai" target="_blank" rel="noopener noreferrer">Nevent</a>
      </div>
    </div>
  )
}
