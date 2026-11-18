import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { FeedbackAction, FeedbackRecord, FeedbackRequest, FeedbackState, FeedbackSurvey, WidgetFeedbackConfig } from '../contract/feedback'
import type { StoreState } from '../store/message-store'
import type { Transport } from '../transport'
import { FeedbackUnavailable } from '../transport/feedback'

const SURVEY_DELAY_MS = 120_000

export function useFeedback(config: WidgetFeedbackConfig | undefined, transport: Transport, state: StoreState, handoffAvailable: boolean) {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [resolutionPrompt, setResolutionPrompt] = useState<FeedbackSurvey | null>(null)
  const [nextAction, setNextAction] = useState<FeedbackAction>('NONE')
  const [actionLocale, setActionLocale] = useState<string | null>(null)
  const lastResolution = useRef<FeedbackSurvey | null>(null)
  const initialRead = useRef<Promise<void> | null>(null)
  const candidate = useRef<{ lastMessageId: string | undefined } | null>(null)
  const cancelPrompt = useRef<(() => void) | null>(null)
  const syncRequest = useRef<AbortController | null>(null)
  const activeTransport = useRef(transport)
  const answerRevision = useRef(0)
  const savedAnswers = useRef(new Map<string, { revision: number; record: FeedbackRecord }>())
  const lastMessage = state.messages.at(-1)
  const lastMessageId = lastMessage?.id
  const initialLastMessageId = useRef(lastMessageId)
  const completedBotReply = lastMessage?.role === 'bot' && lastMessage.status === 'sent' && !lastMessage.streaming
  const teamResolved = state.conversationState === 'RESOLVED'
  const botActive = state.conversationState === 'BOT_ACTIVE' || state.conversationState === null
  const teamSurvey = teamResolved && config?.teamSurvey ? feedback?.teamSurvey : undefined

  function stopWaiting(): void {
    candidate.current = null
    cancelPrompt.current?.()
  }

  async function syncFeedback(afterSend = false, hadPrompt = false): Promise<void> {
    syncRequest.current?.abort()
    const request = new AbortController()
    const startedAt = answerRevision.current
    syncRequest.current = request
    try {
      const result = await transport.feedbackState(request.signal)
      if (request.signal.aborted) return
      const answers = new Map(result.answers.map(record => [record.messageId, record]))
      for (const [messageId, saved] of savedAnswers.current) {
        if (saved.revision > startedAt) answers.set(messageId, saved.record)
      }
      setFeedback({ ...result, answers: [...answers.values()] })
      const survey = result.resolutionSurvey
      const previousSurvey = lastResolution.current
      lastResolution.current = survey
      if (survey?.status === 'ANSWERED') {
        setResolutionPrompt(previous => previous ? survey : previous)
        const newVote = previousSurvey?.status !== 'ANSWERED' || previousSurvey.expiresAt !== survey.expiresAt
        if (afterSend && newVote && survey.value === 0) {
          const legacyAction = hadPrompt ? (handoffAvailable ? 'OFFER_HANDOFF' : 'REFORMULATE') : 'NONE'
          const action = result.nextAction ?? legacyAction
          setActionLocale(survey.locale)
          setNextAction(action)
        }
      } else if (survey?.status !== 'PENDING') {
        setResolutionPrompt(previous => previous?.status === 'PENDING' ? null : previous)
      }
    } catch (error) {
      if (!request.signal.aborted && error instanceof FeedbackUnavailable) {
        setFeedback(null)
        setResolutionPrompt(null)
      }
    }
  }

  useLayoutEffect(() => {
    activeTransport.current = transport
    savedAnswers.current.clear()
    setFeedback(null)
    setResolutionPrompt(null)
    setNextAction('NONE')
    setActionLocale(null)
    lastResolution.current = null
    if (!config?.resolutionSurvey && !config?.teamSurvey && !config?.answerFeedback) return
    initialRead.current = !teamResolved || !config.teamSurvey ? syncFeedback() : Promise.resolve()
    return () => {
      initialRead.current = null
      syncRequest.current?.abort()
    }
  }, [transport, config])

  useLayoutEffect(() => {
    if (!config?.teamSurvey) return
    setFeedback(previous => previous && { ...previous, teamSurvey: null })
    if (teamResolved) {
      void syncFeedback()
      return () => syncRequest.current?.abort()
    }
  }, [teamResolved, config?.teamSurvey, transport])

  useEffect(() => {
    if (teamSurvey?.status !== 'ELIGIBLE' || !teamSurvey.availableAt) return
    const delay = Date.parse(teamSurvey.availableAt) - Date.now()
    if (!Number.isFinite(delay)) return
    const timer = setTimeout(() => {
      if (transport.store.getState().conversationState === 'RESOLVED') void syncFeedback()
    }, Math.max(1_000, delay))
    return () => clearTimeout(timer)
  }, [teamSurvey, transport])

  useEffect(() => {
    if (!botActive || state.newConversationNotice) {
      if (state.newConversationNotice) lastResolution.current = null
      stopWaiting()
      setResolutionPrompt(null)
      setNextAction('NONE')
      return
    }
    if (!config?.resolutionSurvey || !candidate.current || !completedBotReply
        || candidate.current.lastMessageId === lastMessageId) return

    candidate.current = null
    const request = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await transport.promptResolution(request.signal)
        if (!request.signal.aborted && result.resolutionSurvey?.status === 'PENDING') {
          lastResolution.current = result.resolutionSurvey
          setResolutionPrompt(result.resolutionSurvey)
        }
      } catch {
        // A prompt that could not be reserved must not be shown.
      }
    }, SURVEY_DELAY_MS)
    const cancel = (): void => {
      clearTimeout(timer)
      request.abort()
    }
    cancelPrompt.current = cancel
    return cancel
  }, [config?.resolutionSurvey, lastMessageId, completedBotReply, botActive, state.newConversationNotice, transport])

  const answerRatingsEnabled = !!config?.answerFeedback && feedback !== null

  useEffect(() => {
    if (config?.answerFeedback && !answerRatingsEnabled && lastMessage?.feedbackEligible && initialLastMessageId.current !== lastMessageId) {
      void syncFeedback()
    }
  }, [config?.answerFeedback, lastMessage?.feedbackEligible, lastMessageId])

  async function saveAnswer(request: Extract<FeedbackRequest, { kind: 'ANSWER' }>): Promise<void> {
    const result = await transport.feedback(request)
    if (activeTransport.current !== transport) return
    savedAnswers.current.set(request.messageId, { revision: ++answerRevision.current, record: result.feedback })
    setFeedback(previous => previous && {
      ...previous,
      answers: [...previous.answers.filter(record => record.messageId !== request.messageId), result.feedback],
    })
  }

  function onSend(send: () => Promise<void>): void {
    stopWaiting()
    setNextAction('NONE')
    if (config?.resolutionSurvey && botActive && !resolutionPrompt) {
      candidate.current = { lastMessageId }
    }

    const hadPrompt = resolutionPrompt?.status === 'PENDING'
    const baseline = initialRead.current
    void send().finally(async () => {
      await baseline
      if (baseline === initialRead.current && (config?.resolutionSurvey || (teamResolved && config?.teamSurvey))) {
        void syncFeedback(true, hadPrompt)
      }
    })
  }

  async function answerResolution(value: 0 | 1): Promise<void> {
    const result = await transport.feedback({ kind: 'RESOLVED', value })
    syncRequest.current?.abort()
    if (resolutionPrompt) {
      const survey = { ...resolutionPrompt, status: 'ANSWERED' as const, value: result.feedback.value }
      lastResolution.current = survey
      setResolutionPrompt(survey)
    }
    setNextAction(result.nextAction)
    setActionLocale(resolutionPrompt?.locale ?? null)
  }

  async function rateTeam(value: 1 | 2 | 3, comment?: string): Promise<void> {
    await transport.feedback({ kind: 'AGENT', value, ...(comment === undefined ? {} : { comment }) })
    syncRequest.current?.abort()
    setFeedback(previous => previous?.teamSurvey
      ? { ...previous, teamSurvey: { ...previous.teamSurvey, status: 'ANSWERED', value } }
      : previous)
  }

  async function acceptHandoff(): Promise<void> {
    await transport.acceptFeedbackHandoff()
    setNextAction('NONE')
  }

  return {
    resolutionPrompt,
    answerRatingsEnabled,
    answers: feedback?.answers,
    saveAnswer,
    teamSurvey,
    nextAction,
    actionLocale,
    stopWaiting,
    onSend,
    answerResolution,
    expireResolution: () => { setResolutionPrompt(null); setNextAction('NONE') },
    rateTeam,
    expireTeam: () => setFeedback(previous => previous && { ...previous, teamSurvey: null }),
    acceptHandoff,
    dismissHandoff: () => setNextAction('NONE'),
  }
}
