export interface WidgetFeedbackConfig {
  answerFeedback: boolean
  resolutionSurvey: boolean
  teamSurvey: boolean
}

export type FeedbackReason = 'INCORRECT' | 'OUTDATED' | 'IRRELEVANT' | 'OTHER' | 'DID_NOT_KNOW' | 'REQUESTED_HUMAN'
export type FeedbackKind = 'ANSWER' | 'RESOLVED' | 'AGENT'
export type FeedbackAction = 'NONE' | 'OFFER_HANDOFF' | 'REFORMULATE'

export interface FeedbackRecord {
  id: string
  messageId: string | null
  kind: FeedbackKind
  value: number
  reasons: FeedbackReason[]
  comment: string | null
  createdAt: string
}

export interface FeedbackSurvey {
  status: 'UNAVAILABLE' | 'ELIGIBLE' | 'PENDING' | 'ANSWERED' | 'EXPIRED'
  value: number | null
  locale: string | null
  expiresAt: string | null
  availableAt?: string | null
}

export interface FeedbackState {
  resolutionSurvey: FeedbackSurvey | null
  teamSurvey: FeedbackSurvey | null
  answers: FeedbackRecord[]
  nextAction?: FeedbackAction
}

export type FeedbackRequest =
  | { kind: 'RESOLVED'; value: 0 | 1 }
  | { kind: 'AGENT'; value: 1 | 2 | 3; comment?: string }
  | { kind: 'ANSWER'; value: 0 | 1; messageId: string; reasons?: FeedbackReason[]; comment?: string }

export interface FeedbackResult {
  feedback: FeedbackRecord
  nextAction: FeedbackAction
}
