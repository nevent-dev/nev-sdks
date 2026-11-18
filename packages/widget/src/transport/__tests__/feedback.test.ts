import { describe, expect, it, vi } from 'vitest'
import type { SessionClient } from '../../shell/session'
import { createFeedbackTransport, FeedbackUnavailable } from '../feedback'

describe('widget feedback transport', () => {
  it('uses the authorized session for reads, reservation, ratings and handoff', async () => {
    const authorizedFetch = vi.fn(async () => Response.json({}))
    const transport = createFeedbackTransport({ authorizedFetch } as unknown as SessionClient)
    const signal = new AbortController().signal

    await transport.feedbackState(signal)
    await transport.promptResolution(signal)
    await transport.feedback({ kind: 'AGENT', value: 2, comment: 'Could be faster' })
    await transport.acceptFeedbackHandoff()

    expect(authorizedFetch.mock.calls).toEqual([
      ['/widget/v1/conversations/current/feedback', { signal }],
      ['/widget/v1/conversations/current/feedback/resolution/prompt', { method: 'POST', signal }],
      ['/widget/v1/conversations/current/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'AGENT', value: 2, comment: 'Could be faster' }),
      }],
      ['/widget/v1/conversations/current/feedback/handoff', { method: 'POST' }],
    ])
  })

  it.each([404, 409])('rejects an unavailable or expired submission with status %s', async status => {
    const authorizedFetch = vi.fn(async () => new Response(null, { status }))
    const transport = createFeedbackTransport({ authorizedFetch } as unknown as SessionClient)
    await expect(transport.feedback({ kind: 'RESOLVED', value: 1 })).rejects.toBeInstanceOf(FeedbackUnavailable)
  })
})
