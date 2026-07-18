import type { WidgetConfig } from '../contract/types'
import type { Transport } from '../transport'
import { useStoreState } from './use-store'
import { useFocusTrap } from './focus-trap'
import { useResizeReport } from './use-resize-report'
import { computeViewState } from './view-state'
import { Header } from './Header'
import { ConnectionBanner } from './ConnectionBanner'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { WaitingCard, TypingDots, ResolvedCard } from './handoff'

export interface PanelProps {
  config: WidgetConfig
  transport: Transport
  onMinimize: () => void
  onClose: () => void
  onResize: (width: number, height: number) => void
  // Rellenados por App (Task 17) a partir del mensaje `viewport` del loader
  // (Task 12) — Panel NUNCA llama a matchMedia por sí mismo (Critical, ronda
  // 2: el viewport del propio iframe no distingue de forma fiable "soy
  // pequeño porque soy el launcher" de "soy pequeño porque el host es
  // estrecho", y eso producía un bucle de 104×104 en desktop).
  viewportKind: 'mobile' | 'desktop'
  viewportHeight: number
}

export function Panel({ config, transport, onMinimize, onClose, onResize, viewportKind, viewportHeight }: PanelProps) {
  const state = useStoreState(transport.store)
  const isStreaming = state.messages.some((m) => m.streaming)
  const viewState = computeViewState({
    conversationState: state.conversationState,
    connection: state.connection,
    agentName: state.agentName,
    assistantName: config.assistantName,
    isStreaming,
  })

  // Foco inicial SOLO en desktop (Important #5 / Global Constraints) — el
  // trap en sí (Tab/Shift+Tab/Escape) sigue activo en ambos, decidido en
  // Task 4; aquí solo se decide si el AUTOFOCUS inicial se dispara, y se
  // decide con la señal del HOST (viewportKind), nunca con matchMedia local.
  const containerRef = useFocusTrap(true, onClose, viewportKind === 'desktop')
  useResizeReport(onResize)
  // useViewportHeight(viewportKind === 'mobile' ? viewportHeight : null) se
  // añade en Task 14 (Responsive) — mantener el orden de tareas evita una
  // referencia a un módulo que aún no existe.

  const trailing = (
    <>
      {viewState.conversationPhase === 'waiting' && <WaitingCard />}
      {state.agentTyping && viewState.conversationPhase === 'agent' && <TypingDots />}
      {/* Sin AgentJoinedSysline (gap #4 revertido, ver Task 8) y sin
          onFeedback en ResolvedCard (gap #5): el panel integrado nunca
          finge una cronología o un éxito que no persiste en ningún sitio —
          la presencia del agente ya se ve en el cambio de cabecera. */}
      {viewState.conversationPhase === 'resolved' && <ResolvedCard agentName={state.agentName} />}
    </>
  )

  return (
    <section class="panel" data-part="panel" role="dialog" aria-label={config.assistantName} tabIndex={-1} ref={containerRef}>
      <Header viewState={viewState} onMinimize={onMinimize} onClose={onClose} />
      <ConnectionBanner kind={viewState.connectionBanner} />
      <MessageList
        config={config}
        messages={state.messages}
        agentName={state.agentName}
        onRetry={(clientId) => transport.retry(clientId)}
        onQuickReply={(text) => transport.send(text)}
        trailing={trailing}
        // Defensa en profundidad (revisión Task-8): MessageList confía en
        // quien lo llama, así que Panel añade su PROPIA condición
        // messages.length === 0 en vez de depender solo de conversationPhase
        // === 'idle' — nunca pintar Welcome si ya hay historial, aunque el
        // cálculo de fase cambiara de criterio en el futuro.
        showWelcome={viewState.conversationPhase === 'idle' && state.messages.length === 0}
      />
      <Composer viewState={viewState} onSend={(text) => transport.send(text)} onStop={() => transport.cancel()} />
    </section>
  )
}
