import type { WidgetConfig } from '../contract/types'
import type { Transport } from '../transport'
import { useStoreState } from './use-store'
import { useFocusTrap } from './focus-trap'
import { useResizeReport } from './use-resize-report'
import { useViewportHeight } from './use-viewport-height'
import { computeViewState } from './view-state'
import { STRINGS, StringsContext, useStrings } from './strings'
import { resolveLocale } from '../contract/locale'
import { ResolutionCard, TeamSurvey } from './FeedbackCards'
import { useFeedback } from './use-feedback'
import { Header } from './Header'
import { ConnectionBanner } from './ConnectionBanner'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { WaitingCard, TypingDots, ResolvedCard, NewConversationCard } from './handoff'

export interface PanelProps {
  config: WidgetConfig
  transport: Transport
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

export function Panel({ config, transport, onClose, onResize, viewportKind, viewportHeight }: PanelProps) {
  const strings = useStrings()
  const state = useStoreState(transport.store)
  const feedback = useFeedback(config.feedback, transport, state, config.features.handoff)
  const resolutionLocale = resolveLocale(feedback.resolutionPrompt?.locale ?? feedback.actionLocale)
  const teamLocale = resolveLocale(feedback.teamSurvey?.locale ?? undefined)
  const resolutionStrings = resolutionLocale ? STRINGS[resolutionLocale] : null
  let surveyAnnouncement = ''
  if (feedback.nextAction === 'OFFER_HANDOFF' && resolutionStrings) {
    surveyAnnouncement = resolutionStrings.offerHandoff
  } else if (feedback.nextAction === 'REFORMULATE' && resolutionStrings) {
    surveyAnnouncement = resolutionStrings.reformulate
  } else if (feedback.resolutionPrompt?.status === 'PENDING' && resolutionStrings) {
    surveyAnnouncement = resolutionStrings.resolutionQuestion
  } else if (feedback.teamSurvey?.status === 'PENDING' && teamLocale) {
    surveyAnnouncement = STRINGS[teamLocale].teamQuestion
  }
  const close = (): void => { feedback.stopWaiting(); onClose() }
  const isStreaming = state.messages.some((m) => m.streaming)
  // session.ts ya normaliza assistantName con fallback locale-aware
  // (STRINGS[locale].assistantFallback, Plan 4) en la frontera de red — este
  // `?? ` es el guard de TIPOS que exige el propio contrato
  // (WidgetConfig.assistantName es opcional, Task 17), no una segunda
  // normalización de datos. Usa strings.assistantFallback (no un literal) por
  // coherencia con ESE mismo locale, no porque se espere que dispare en la práctica.
  const assistantName = config.assistantName ?? strings.assistantFallback
  const viewState = computeViewState({
    conversationState: state.conversationState,
    connection: state.connection,
    agentName: state.agentName,
    agentAvatarUrl: state.agentAvatarUrl,
    assistantName,
    isStreaming,
    logoUrl: config.theme.logoUrl ?? null,
    strings,
  })

  // Foco inicial SOLO en desktop (Important #5 / Global Constraints) — el
  // trap en sí (Tab/Shift+Tab/Escape) sigue activo en ambos, decidido en
  // Task 4; aquí solo se decide si el AUTOFOCUS inicial se dispara, y se
  // decide con la señal del HOST (viewportKind), nunca con matchMedia local.
  const containerRef = useFocusTrap(true, close, viewportKind === 'desktop')
  useResizeReport(onResize)
  useViewportHeight(viewportKind === 'mobile' ? viewportHeight : null)

  const trailing = (
    <>
      {viewState.conversationPhase === 'waiting' && <WaitingCard />}
      {state.agentTyping && viewState.conversationPhase === 'agent' && <TypingDots />}
      {(feedback.resolutionPrompt || feedback.nextAction !== 'NONE') && resolutionLocale && (
        <StringsContext.Provider value={STRINGS[resolutionLocale]}>
          <div lang={resolutionLocale}>
            <ResolutionCard survey={feedback.resolutionPrompt} nextAction={feedback.nextAction}
              onAnswer={feedback.answerResolution} onHandoff={feedback.acceptHandoff}
              onDismissHandoff={feedback.dismissHandoff} onUnavailable={feedback.expireResolution} />
          </div>
        </StringsContext.Provider>
      )}
      {viewState.conversationPhase === 'resolved' && (
        <ResolvedCard agentName={state.agentName} feedbackEnabled={config.feedback !== undefined}>
          {teamLocale && (feedback.teamSurvey?.status === 'PENDING' || feedback.teamSurvey?.status === 'ANSWERED') && (
            <StringsContext.Provider value={STRINGS[teamLocale]}>
              <div lang={teamLocale}>
                <TeamSurvey survey={feedback.teamSurvey} onRate={feedback.rateTeam} onUnavailable={feedback.expireTeam} />
              </div>
            </StringsContext.Provider>
          )}
        </ResolvedCard>
      )}
      {/* Task W4: newConversationNotice es un flag del STORE (reset tras un
          re-bootstrap silencioso), no una fase de conversationState — se
          pinta independientemente de la fase, igual que un aviso de sistema
          puntual en vez de un estado en curso. */}
      {state.newConversationNotice && <NewConversationCard />}
    </>
  )

  return (
    <section class="panel" data-part="panel" role="dialog" aria-label={assistantName} tabIndex={-1} ref={containerRef}>
      <Header viewState={viewState} onClose={close} />
      <ConnectionBanner kind={viewState.connectionBanner} />
      <MessageList
        config={config}
        messages={state.messages}
        agentName={state.agentName}
        agentAvatarUrl={state.agentAvatarUrl}
        onRetry={(clientId) => feedback.onSend(() => transport.retry(clientId))}
        onQuickReply={(text) => feedback.onSend(() => transport.send(text))}
        trailing={trailing}
        // Defensa en profundidad (revisión Task-8): MessageList confía en
        // quien lo llama, así que Panel añade su PROPIA condición
        // messages.length === 0 en vez de depender solo de conversationPhase
        // === 'idle' — nunca pintar Welcome si ya hay historial, aunque el
        // cálculo de fase cambiara de criterio en el futuro.
        showWelcome={viewState.conversationPhase === 'idle' && state.messages.length === 0}
      />
      <div class="sr-only" role="status" lang={resolutionLocale ?? teamLocale ?? undefined}>{surveyAnnouncement}</div>
      <Composer viewState={viewState} onSend={(text) => feedback.onSend(() => transport.send(text))}
        onStop={() => { feedback.stopWaiting(); transport.cancel() }}
        onType={feedback.stopWaiting} uploadEnabled={config.features.upload} />
    </section>
  )
}
