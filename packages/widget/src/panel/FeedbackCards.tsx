import { useRef, useState } from 'preact/hooks'
import type { FeedbackAction, FeedbackSurvey } from '../contract/feedback'
import { FeedbackUnavailable } from '../transport/feedback'
import { useStrings } from './strings'

function useSubmission(onUnavailable: () => void) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<(() => void) | null>(null)

  async function submit(action: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setRetry(null)
    try {
      await action()
    } catch (error) {
      if (error instanceof FeedbackUnavailable) onUnavailable()
      else setRetry(() => () => { void submit(action) })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { busy, retry, submit }
}

function FeedbackError({ retry }: { retry: (() => void) | null }) {
  const strings = useStrings()
  return retry ? (
    <p class="feedback-error" role="alert">
      {strings.notSent} <button type="button" onClick={retry}>{strings.retry}</button>
    </p>
  ) : null
}

interface ResolutionCardProps {
  survey: FeedbackSurvey
  nextAction: FeedbackAction
  onAnswer: (value: 0 | 1) => Promise<void>
  onHandoff: () => Promise<void>
  onDismissHandoff: () => void
  onUnavailable: () => void
}

export function ResolutionCard({ survey, nextAction, onAnswer, onHandoff, onDismissHandoff, onUnavailable }: ResolutionCardProps) {
  const strings = useStrings()
  const { busy, retry, submit } = useSubmission(onUnavailable)
  const answered = survey.status === 'ANSWERED'

  return (
    <>
      <div class="syscard survey" aria-label={strings.resolutionQuestion}>
        <div class="ttl">{strings.resolutionQuestion}</div>
        <div class="feedback">
          <button type="button" disabled={busy || answered} aria-pressed={survey.value === 1}
            onClick={() => void submit(() => onAnswer(1))}>{strings.yes}</button>
          <button type="button" disabled={busy || answered} aria-pressed={survey.value === 0}
            onClick={() => void submit(() => onAnswer(0))}>{strings.no}</button>
        </div>
        <FeedbackError retry={nextAction === 'OFFER_HANDOFF' ? null : retry} />
      </div>
      {answered && survey.value === 1 && (
        <div class="syscard resolved" role="status">
          <div class="ttl">{strings.stateResolved}</div>
          <div class="dsc">{strings.resolvedTail}</div>
        </div>
      )}
      {nextAction === 'OFFER_HANDOFF' && (
        <div class="syscard survey">
          <div class="ttl">{strings.offerHandoff}</div>
          <div class="feedback">
            <button type="button" disabled={busy} onClick={() => void submit(onHandoff)}>{strings.acceptHandoff}</button>
            <button type="button" disabled={busy} onClick={onDismissHandoff}>{strings.declineHandoff}</button>
          </div>
          <FeedbackError retry={retry} />
        </div>
      )}
      {nextAction === 'REFORMULATE' && <p class="syscard survey" role="status">{strings.reformulate}</p>}
    </>
  )
}

interface TeamSurveyProps {
  survey: FeedbackSurvey
  onRate: (value: 1 | 2 | 3, comment?: string) => Promise<void>
  onUnavailable: () => void
}

export function TeamSurvey({ survey, onRate, onUnavailable }: TeamSurveyProps) {
  const strings = useStrings()
  const { busy, retry, submit } = useSubmission(onUnavailable)
  const [allowComment, setAllowComment] = useState(false)
  const [comment, setComment] = useState('')
  const [thanked, setThanked] = useState(false)
  const answered = survey.status === 'ANSWERED'
  const choices = [
    { value: 3, face: '😊', label: strings.teamGood },
    { value: 2, face: '😐', label: strings.teamFair },
    { value: 1, face: '😞', label: strings.teamPoor },
  ] as const

  function rate(value: 1 | 2 | 3): void {
    void submit(async () => {
      await onRate(value)
      if (value === 3) setThanked(true)
      else setAllowComment(true)
    })
  }

  function submitComment(): void {
    const value = survey.value
    if ((value !== 1 && value !== 2) || !comment.trim()) return
    void submit(async () => {
      await onRate(value, comment.trim())
      setAllowComment(false)
      setThanked(true)
    })
  }

  return (
    <div class="team-survey">
      <div class="ttl">{strings.teamQuestion}</div>
      <div class="feedback">
        {choices.map(({ value, face, label }) => (
          <button key={value} type="button" disabled={busy || answered} aria-pressed={survey.value === value}
            onClick={() => rate(value)}><span aria-hidden="true">{face}</span> {label}</button>
        ))}
      </div>
      {allowComment && <FeedbackComment label={strings.teamComment} value={comment} onChange={setComment} onSend={submitComment} busy={busy} />}
      {thanked && <div class="dsc" role="status">{strings.feedbackThanks}</div>}
      <FeedbackError retry={retry} />
    </div>
  )
}

interface FeedbackCommentProps {
  label: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
  busy: boolean
}

export function FeedbackComment({ label, value, onChange, onSend, busy }: FeedbackCommentProps) {
  const strings = useStrings()
  return (
    <div class="feedback-comment">
      <textarea aria-label={label} placeholder={label} maxLength={1000}
        value={value} disabled={busy} onInput={event => onChange(event.currentTarget.value)} />
      <div class="dsc">{strings.commentPrivacy}</div>
      <div class="feedback">
        <button type="button" disabled={busy || !value.trim()} onClick={onSend}>{strings.send}</button>
      </div>
    </div>
  )
}
