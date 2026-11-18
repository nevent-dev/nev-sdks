import type { FeedbackRequest, FeedbackResult, FeedbackState } from '../contract/feedback'
import type { SessionClient } from '../shell/session'

const BASE = '/widget/v1/conversations/current/feedback'

export class FeedbackUnavailable extends Error {}

export function createFeedbackTransport(client: SessionClient) {
  async function request(path = '', init?: RequestInit): Promise<Response> {
    const response = await client.authorizedFetch(BASE + path, init)
    if (response.status === 404 || response.status === 409) throw new FeedbackUnavailable()
    if (!response.ok) throw new Error(`feedback_failed:${response.status}`)
    return response
  }

  return {
    feedbackState: async (signal: AbortSignal): Promise<FeedbackState> =>
      (await request('', { signal })).json(),
    promptResolution: async (signal: AbortSignal): Promise<FeedbackState> =>
      (await request('/resolution/prompt', { method: 'POST', signal })).json(),
    feedback: async (value: FeedbackRequest): Promise<FeedbackResult> =>
      (await request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })).json(),
    acceptFeedbackHandoff: async (): Promise<void> => {
      await request('/handoff', { method: 'POST' })
    },
  }
}
