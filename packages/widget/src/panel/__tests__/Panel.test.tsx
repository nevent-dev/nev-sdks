import type { FeedbackRecord, FeedbackState } from '../../contract/feedback'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { Panel } from '../Panel'
import { createMessageStore } from '../../store/message-store'
import { fixtureConfig } from '../../contract/fixtures'
import type { Transport } from '../../transport'
import { mount, cleanupMounted } from './test-utils'

function fakeTransport(store = createMessageStore(() => '2026-07-18T14:00:00.000Z')): Transport {
  return {
    store,
    send: vi.fn(async () => {}),
    feedbackState: vi.fn(async () => ({ resolutionSurvey: null, teamSurvey: null, answers: [] })),
    promptResolution: vi.fn(async () => ({ resolutionSurvey: null, teamSurvey: null, answers: [] })),
    feedback: vi.fn(async () => { throw new Error('No feedback response configured') }),
    acceptFeedbackHandoff: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    cancel: vi.fn(),
    openChannel: vi.fn(),
    closeChannel: vi.fn(),
    destroy: vi.fn(),
  }
}

afterEach(cleanupMounted)

async function mountPanel(overrides: Partial<Parameters<typeof Panel>[0]> = {}): Promise<{ root: HTMLElement; transport: Transport }> {
  const transport = overrides.transport ?? fakeTransport()
  const root = await mount(
    <Panel config={fixtureConfig()} transport={transport} onClose={vi.fn()} onResize={vi.fn()}
      viewportKind="desktop" viewportHeight={900} {...overrides} />,
  )
  return { root, transport }
}

describe('Panel', () => {
  it('conserva data-part=panel (contrato del shell, Plan 1 shell.test.tsx)', async () => {
    const { root } = await mountPanel()
    expect(root.querySelector('[data-part=panel]')).not.toBeNull()
  })

  it('sin mensajes en fase idle: pinta Welcome dentro de MessageList', async () => {
    const { root } = await mountPanel()
    expect(root.querySelector('.welcome')).not.toBeNull()
  })

  it('config.theme.logoUrl llega hasta la cabecera (mismo canal que assistantName): pinta el logo del tenant, no el BotIcon', async () => {
    const config = { ...fixtureConfig(), theme: { ...fixtureConfig().theme, logoUrl: 'https://res.nevent.es/tenants/demo-fest/logo.png' } }
    const { root } = await mountPanel({ config })
    const img = root.querySelector('.avatar img.bot-logo-img')
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/tenants/demo-fest/logo.png')
  })

  it('Critical #1 — fase ESCALATED_WAITING: pinta WaitingCard aunque la conexión esté offline (no depende de ribbon)', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({ messages: [], state: 'ESCALATED_WAITING', snapshotCursor: 'evt_v1_c_1' })
    store.setConnection('offline')
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.syscard.waiting')).not.toBeNull()
    expect(root.querySelector('.welcome')).toBeNull() // Important #9: nunca Welcome fuera de fase idle
  })

  it('fase RESOLVED con valoraciones deshabilitadas conserva la tarjeta sin encuesta', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_c_1' })
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.syscard.resolved')).not.toBeNull()
    expect(root.querySelector('.feedback')).toBeNull()
  })

  it('gap #4 (revertido) — la presencia del agente NO se muestra como divider intercalado en el panel integrado, solo como cambio de cabecera', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({
      messages: [{ messageId: 'm1', role: 'user', text: 'hola', createdAt: '2026-07-18T14:00:00.000Z' }],
      state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_c_1',
    })
    store.applyDurableEvent({
      eventId: 'evt_v1_c_5', schemaVersion: 1, conversationId: 'c', occurredAt: '2026-07-18T14:09:00.000Z',
      type: 'agent.joined', payload: { agentName: 'Laura', agentAvatarUrl: null },
    })
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.sysline')).toBeNull() // AgentJoinedSysline NO se monta aquí (solo en el harness, Task 16)
    expect(root.querySelector('.name')?.textContent).toBe('Laura') // la presencia SÍ se ve en la cabecera
  })

  it('cerrar el panel llama a onClose; Escape también (focus trap, Task 4)', async () => {
    const onClose = vi.fn()
    const { root } = await mountPanel({ onClose })
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
    onClose.mockClear()
    root.querySelector('.panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Important #5 (ronda 2, fix del bucle 104×104) — viewportKind="desktop": el panel recibe autofocus al abrir, SIN llamar a matchMedia', async () => {
    const { root } = await mountPanel({ viewportKind: 'desktop', viewportHeight: 900 })
    expect(document.activeElement).toBe(root.querySelector('.panel'))
  })

  it('Important #5 — viewportKind="mobile": el panel NO roba el foco al abrir', async () => {
    document.body.focus()
    await mountPanel({ viewportKind: 'mobile', viewportHeight: 640 })
    expect(document.activeElement).not.toBe(document.querySelector('.panel'))
  })

  it('enviar desde el composer llama a transport.send', async () => {
    const { root, transport } = await mountPanel()
    const textarea = root.querySelector('textarea')!
    textarea.value = 'hola'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(transport.send).toHaveBeenCalledWith('hola')
  })

  // INJECTED (revisión Task-8): showWelcome debe llevar su PROPIA condición
  // messages.length === 0 en Panel — defensa en profundidad, MessageList
  // confía en quien lo llama y no debe ser la única barrera.
  it('defensa en profundidad — con mensajes existentes en fase bot-activa (idle), Welcome NO se pinta', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.applySnapshot({
      messages: [{ messageId: 'm1', role: 'bot', text: 'Hola, ¿en qué te ayudamos?', createdAt: '2026-07-18T14:00:00.000Z' }],
      state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_c_1',
    })
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.welcome')).toBeNull()
  })

  // Task W4 — recuperación de sesión muerta: newConversationNotice es un flag
  // del store (ver message-store.ts#resetForNewConversation), no una fase de
  // conversationState — Panel debe pintarlo independientemente de la fase.
  it('Task W4 — store.newConversationNotice pinta NewConversationCard', async () => {
    const store = createMessageStore(() => '2026-07-18T14:00:00.000Z')
    store.resetForNewConversation(true)
    const { root } = await mountPanel({ transport: fakeTransport(store) })
    expect(root.querySelector('.syscard.new-conversation')).not.toBeNull()
  })

  it('Task W4 — sin newConversationNotice (caso normal), NewConversationCard no se pinta', async () => {
    const { root } = await mountPanel()
    expect(root.querySelector('.syscard.new-conversation')).toBeNull()
  })
})

describe('Encuestas de valoración', () => {
  const config = {
    ...fixtureConfig(),
    feedback: { resolutionSurvey: true, teamSurvey: true, answerFeedback: false },
  }
  const pending = { status: 'PENDING', value: null, locale: 'es', expiresAt: null } as const
  const noFeedback = { resolutionSurvey: null, teamSurvey: null, answers: [] }

  afterEach(() => vi.useRealTimers())

  async function ask(root: HTMLElement): Promise<HTMLTextAreaElement> {
    const composer = root.querySelector<HTMLTextAreaElement>('.composer textarea')!
    await act(() => {
      composer.value = '¿A qué hora abren?'
      composer.dispatchEvent(new Event('input', { bubbles: true }))
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    return composer
  }

  async function botReply(store: Transport['store']): Promise<void> {
    await act(() => {
      store.applyDurableEvent({
        eventId: 'evt_v1_demo_1', schemaVersion: 1, conversationId: 'demo', occurredAt: '2026-07-18T14:00:02.000Z',
        type: 'message.created', payload: { messageId: 'reply', role: 'bot', text: 'A las 18:00' },
      })
    })
  }

  it('reserves the question after two minutes and sends No and handoff outside the model', async () => {
    vi.useFakeTimers()
    const transport = fakeTransport()
    vi.mocked(transport.promptResolution).mockResolvedValue({ ...noFeedback, resolutionSurvey: pending })
    vi.mocked(transport.feedback).mockResolvedValue({
      feedback: { id: 'r1', kind: 'RESOLVED', value: 0, messageId: null, comment: null, createdAt: '2026-07-18T14:02:02Z', reasons: [] },
      nextAction: 'OFFER_HANDOFF',
    })
    const { root } = await mountPanel({ config, transport })
    await ask(root)
    await botReply(transport.store)
    await act(async () => { await vi.advanceTimersByTimeAsync(119_999) })
    expect(transport.promptResolution).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(transport.promptResolution).toHaveBeenCalledTimes(1)
    const no = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'No')!
    await act(async () => { no.click(); await Promise.resolve() })
    expect(transport.feedback).toHaveBeenCalledWith({ kind: 'RESOLVED', value: 0 })
    expect(no.getAttribute('aria-pressed')).toBe('true')
    const handoff = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Sí, con una persona')!
    await act(async () => { handoff.click(); await Promise.resolve() })
    expect(transport.acceptFeedbackHandoff).toHaveBeenCalledOnce()
    expect(transport.send).toHaveBeenCalledOnce()
  })

  it('cancels the timer on typing, and opening again does not offer a historical reply', async () => {
    vi.useFakeTimers()
    const transport = fakeTransport()
    const { root } = await mountPanel({ config, transport })
    const composer = await ask(root)
    await botReply(transport.store)
    await act(() => {
      composer.value = 'Otra pregunta'
      composer.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(transport.promptResolution).not.toHaveBeenCalled()
    await cleanupMounted()
    await mountPanel({ config, transport })
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(transport.promptResolution).not.toHaveBeenCalled()
  })

  it('offers handoff after an unprompted negative reply without showing a resolution question', async () => {
    const transport = fakeTransport()
    vi.mocked(transport.feedbackState)
      .mockResolvedValueOnce(noFeedback)
      .mockResolvedValue({
        ...noFeedback,
        resolutionSurvey: { ...pending, status: 'ANSWERED', value: 0 },
        nextAction: 'OFFER_HANDOFF',
      })
    const { root } = await mountPanel({ config, transport })
    const composer = root.querySelector<HTMLTextAreaElement>('.composer textarea')!
    await act(async () => {
      composer.value = 'No era eso'
      composer.dispatchEvent(new Event('input', { bubbles: true }))
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    expect(transport.send).toHaveBeenCalledWith('No era eso')
    expect(transport.feedbackState).toHaveBeenCalledTimes(2)
    expect(root.textContent).toContain('¿Te pasamos con una persona del equipo?')
    expect(root.textContent).not.toContain('¿Hemos resuelto tu consulta?')
    expect(transport.feedback).not.toHaveBeenCalled()
    const decline = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === 'No, gracias')!
    await act(() => decline.click())
    await ask(root)
    expect(root.textContent).not.toContain('¿Te pasamos con una persona del equipo?')
  })

  it('uses the server due time and records the team rating before the optional comment', async () => {
    vi.useFakeTimers()
    const transport = fakeTransport()
    transport.store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' })
    vi.mocked(transport.feedbackState)
      .mockResolvedValueOnce({
        ...noFeedback,
        teamSurvey: { status: 'ELIGIBLE', value: null, locale: 'es', expiresAt: null, availableAt: new Date(Date.now() + 38_000).toISOString() },
      })
      .mockResolvedValue({ ...noFeedback, teamSurvey: pending })
    vi.mocked(transport.feedback).mockResolvedValue({
      feedback: { id: 'r1', kind: 'AGENT', value: 2, messageId: null, comment: null, createdAt: '2026-07-18T14:02:02Z', reasons: [] },
      nextAction: 'NONE',
    })
    const { root } = await mountPanel({ config, transport })
    await act(async () => { await vi.advanceTimersByTimeAsync(37_999) })
    expect(root.querySelector('.team-survey')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    const fair = [...root.querySelectorAll('button')].find(button => button.textContent?.includes('Regular'))!
    await act(async () => { fair.click(); await Promise.resolve() })
    expect(transport.feedback).toHaveBeenCalledWith({ kind: 'AGENT', value: 2 })
    const comment = root.querySelector<HTMLTextAreaElement>('.feedback-comment textarea')!
    expect(comment.maxLength).toBe(1000)
    await act(() => {
      comment.value = 'Me habría ayudado una respuesta más rápida.'
      comment.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = root.querySelector<HTMLButtonElement>('.feedback-comment button')!
    await act(async () => { send.click(); await Promise.resolve() })
    expect(transport.feedback).toHaveBeenLastCalledWith({
      kind: 'AGENT', value: 2, comment: 'Me habría ayudado una respuesta más rápida.',
    })
  })

  it.each([
    ['en-GB', 'Did we resolve your question?'],
    ['ar', null],
    [null, null],
  ] as const)('uses the conversation locale %s and announces the new question without moving focus', async (locale, question) => {
    vi.useFakeTimers()
    const transport = fakeTransport()
    vi.mocked(transport.promptResolution).mockResolvedValue({ ...noFeedback, resolutionSurvey: { ...pending, locale } })
    const { root } = await mountPanel({ config, transport })
    const composer = await ask(root)
    composer.focus()
    await botReply(transport.store)
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(root.querySelector('.survey .ttl')?.textContent ?? null).toBe(question)
    expect(root.querySelector('.sr-only[role=status]')?.textContent).toBe(question ?? '')
    expect(document.activeElement).toBe(composer)
  })

  it('keeps the previous team question hidden during a delayed read after a second resolution', async () => {
    const transport = fakeTransport()
    transport.store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' })
    vi.mocked(transport.feedbackState)
      .mockResolvedValueOnce({ ...noFeedback, teamSurvey: pending })
      .mockImplementationOnce(() => new Promise(resolve => {
        completeSecondRead = () => resolve(noFeedback)
      }))
    let completeSecondRead: () => void = () => {}
    const { root } = await mountPanel({ config, transport })
    expect(root.querySelector('.team-survey')).not.toBeNull()
    await act(() => {
      transport.store.applySnapshot({ messages: [], state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_demo_2' })
    })
    await act(() => {
      transport.store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_3' })
    })
    expect(root.querySelector('.team-survey')).toBeNull()
    await act(async () => { completeSecondRead(); await Promise.resolve() })
    expect(root.querySelector('.team-survey')).toBeNull()
  })

  it('polls the team survey when resolved and cancels the delayed check if it reopens', async () => {
    vi.useFakeTimers()
    const transport = fakeTransport()
    const { root } = await mountPanel({ config, transport })
    await act(() => {
      transport.store.applySnapshot({ messages: [], state: 'RESOLVED', snapshotCursor: 'evt_v1_demo_1' })
    })
    expect(root.querySelector('.team-survey')).toBeNull()
    expect(transport.feedbackState).toHaveBeenCalledTimes(2)
    await act(() => {
      transport.store.applySnapshot({ messages: [], state: 'AGENT_ACTIVE', snapshotCursor: 'evt_v1_demo_2' })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(transport.feedbackState).toHaveBeenCalledTimes(2)
  })
})

describe('Valoración de respuestas', () => {
  const config = {
    ...fixtureConfig(),
    feedback: { resolutionSurvey: false, teamSurvey: false, answerFeedback: true },
  }
  const empty = { resolutionSurvey: null, teamSurvey: null, answers: [] }
  const baseRecord: FeedbackRecord = {
    id: 'rating', messageId: 'answer', kind: 'ANSWER', value: 0, reasons: [], comment: null,
    createdAt: '2026-07-18T14:00:02.000Z',
  }

  function conversation(): Transport {
    const transport = fakeTransport()
    transport.store.applySnapshot({
      state: 'BOT_ACTIVE',
      snapshotCursor: 'evt_v1_demo_2',
      messages: [
        { messageId: 'answer', role: 'bot', text: 'El festival abre a las 17:00.', createdAt: '2026-07-18T14:00:02.000Z', feedbackEligible: true, feedbackLocale: 'es' },
        { messageId: 'notice', role: 'bot', text: 'Te pasamos con el equipo.', createdAt: '2026-07-18T14:00:03.000Z' },
        { messageId: 'no-locale', role: 'bot', text: 'Some answer', createdAt: '2026-07-18T14:00:04.000Z', feedbackEligible: true, feedbackLocale: 'ar' },
      ],
    })
    return transport
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    await act(async () => { button.click(); await Promise.resolve() })
  }

  it('shows votes only on an eligible answer, persists down and its reason immediately, then permits changing to up', async () => {
    const transport = conversation()
    let saved = baseRecord
    vi.mocked(transport.feedback).mockImplementation(async request => {
      if (request.kind !== 'ANSWER') throw new Error('Wrong feedback kind')
      saved = { ...saved, value: request.value, reasons: request.value === 1 ? [] : request.reasons ?? saved.reasons }
      return { feedback: saved, nextAction: 'NONE' }
    })
    const { root } = await mountPanel({ config, transport })
    const votes = [...root.querySelectorAll<HTMLButtonElement>('.answer-votes button')]
    expect(votes).toHaveLength(2)
    const [up, down] = votes as [HTMLButtonElement, HTMLButtonElement]

    await click(down)
    expect(transport.feedback).toHaveBeenCalledWith({ kind: 'ANSWER', messageId: 'answer', value: 0 })
    const reason = [...root.querySelectorAll<HTMLButtonElement>('.answer-reasons button')]
      .find(button => button.textContent?.trim() === 'Está desactualizada')!
    expect(root.querySelector('.feedback-comment textarea')).toBeNull()
    await click(reason)
    expect(transport.feedback).toHaveBeenCalledWith({
      kind: 'ANSWER', messageId: 'answer', value: 0, reasons: ['OUTDATED'],
    })
    expect(root.querySelector('.feedback-comment textarea')).not.toBeNull()

    await click(root.querySelector<HTMLButtonElement>('.answer-reasons-head button')!)
    expect(down.getAttribute('aria-pressed')).toBe('true')
    await click(up)
    expect(transport.feedback).toHaveBeenLastCalledWith({ kind: 'ANSWER', messageId: 'answer', value: 1 })
    expect(up.getAttribute('aria-pressed')).toBe('true')
    expect(down.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps a successful thumb while a team survey read completes', async () => {
    vi.useFakeTimers()
    try {
      const transport = conversation()
      transport.store.applyDurableEvent({
        eventId: 'evt_v1_demo_4', schemaVersion: 1, conversationId: 'demo', occurredAt: '2026-07-18T14:00:05.000Z',
        type: 'conversation.state_changed', payload: { state: 'RESOLVED' },
      })
      let finishSurveyRead: (response: FeedbackState) => void = () => {}
      vi.mocked(transport.feedbackState)
        .mockResolvedValueOnce({ ...empty,
          teamSurvey: { status: 'ELIGIBLE', value: null, locale: 'es', expiresAt: null, availableAt: new Date(Date.now() + 2000).toISOString() },
        })
        .mockImplementationOnce(() => new Promise(resolve => { finishSurveyRead = resolve }))
      vi.mocked(transport.feedback).mockResolvedValue({ feedback: { ...baseRecord, value: 1 }, nextAction: 'NONE' })
      const { root } = await mountPanel({ config: { ...config, feedback: { ...config.feedback, teamSurvey: true } }, transport })
      const up = root.querySelector<HTMLButtonElement>('[aria-label="Valorar positivamente"]')!
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(transport.feedbackState).toHaveBeenCalledTimes(2)
      await click(up)
      await act(async () => {
        finishSurveyRead({ ...empty, teamSurvey: { status: 'PENDING', value: null, locale: 'es', expiresAt: null } })
        await Promise.resolve()
      })
      expect(root.querySelector('.team-survey')).not.toBeNull()
      expect(up.getAttribute('aria-pressed')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('restores the vote on opening without writing it again', async () => {
    const transport = conversation()
    vi.mocked(transport.feedbackState).mockResolvedValue({ ...empty, answers: [baseRecord] })
    const { root } = await mountPanel({ config, transport })
    expect(root.querySelector('[aria-label="Valorar negativamente"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('.answer-reasons')).toBeNull()
    expect(transport.feedback).not.toHaveBeenCalled()
  })
})
