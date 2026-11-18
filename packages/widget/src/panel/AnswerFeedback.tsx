import { useId, useState } from 'preact/hooks'
import type { FeedbackReason, FeedbackRecord, FeedbackRequest } from '../contract/feedback'
import { FeedbackComment, FeedbackError, useSubmission } from './FeedbackCards'
import { useStrings } from './strings'

export type SubmitAnswerFeedback = (request: Extract<FeedbackRequest, { kind: 'ANSWER' }>) => Promise<void>

interface AnswerFeedbackProps {
  messageId: string
  rating: FeedbackRecord | undefined
  submitRating: SubmitAnswerFeedback
}

function Thumb({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={down
        ? 'M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3zm0 0-4 7a2.5 2.5 0 0 1-2.5-2.5V15H5.3a2 2 0 0 1-2-2.3l1.2-7.5a2 2 0 0 1 2-1.7H17'
        : 'M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 4-7a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7.5a2 2 0 0 1-2 1.7H7'} />
    </svg>
  )
}

export function AnswerFeedback({ messageId, rating, submitRating }: AnswerFeedbackProps) {
  const strings = useStrings()
  const [open, setOpen] = useState(false)
  const [thanked, setThanked] = useState(false)
  const [comment, setComment] = useState('')
  const [available, setAvailable] = useState(true)
  const { busy, retry, submit } = useSubmission(() => setAvailable(false))
  const reasonGroup = useId()
  const labels: [FeedbackReason, string][] = [
    ['INCORRECT', strings.answerIncorrect],
    ['OUTDATED', strings.answerOutdated],
    ['IRRELEVANT', strings.answerIrrelevant],
    ['OTHER', strings.answerOther],
  ]
  const selectedReason = rating?.reasons[0]

  function vote(value: 0 | 1): void {
    setThanked(false)
    if (value === 0) {
      setComment(rating?.comment ?? '')
      setOpen(true)
    } else {
      setOpen(false)
    }
    if (rating?.value !== value) void submit(() => submitRating({ kind: 'ANSWER', messageId, value }))
  }

  function sendComment(): void {
    if (!comment.trim()) return
    void submit(async () => {
      await submitRating({ kind: 'ANSWER', messageId, value: 0, comment: comment.trim() })
      setOpen(false)
      setThanked(true)
    })
  }

  if (!available) return null
  return (
    <div class="answer-feedback">
      <div class="answer-votes">
        <button type="button" aria-label={strings.rateUp} aria-pressed={rating?.value === 1} disabled={busy} onClick={() => vote(1)}><Thumb /></button>
        <button type="button" aria-label={strings.rateDown} aria-pressed={rating?.value === 0} disabled={busy} onClick={() => vote(0)}><Thumb down /></button>
      </div>
      {open && rating?.value === 0 && (
        <div class="answer-reasons">
          <div class="answer-reasons-head">
            <div id={reasonGroup}>{strings.answerQuestion}</div>
            <button type="button" aria-label={strings.headerClose} onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div class="feedback" role="group" aria-labelledby={reasonGroup}>
            {labels.map(([reason, label]) => (
              <button type="button" key={reason} disabled={busy} aria-pressed={selectedReason === reason}
                onClick={() => void submit(() => submitRating({ kind: 'ANSWER', messageId, value: 0, reasons: [reason] }))}>
                {label}
              </button>
            ))}
          </div>
          {selectedReason && <FeedbackComment label={strings.answerComment} value={comment} onChange={setComment} onSend={sendComment} busy={busy} />}
        </div>
      )}
      {thanked && <p class="answer-thanks" role="status">{strings.feedbackThanks}</p>}
      <FeedbackError retry={retry} />
    </div>
  )
}
