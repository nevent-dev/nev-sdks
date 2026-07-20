import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { App, type ShellBus } from '../app'
import * as transportModule from '../../transport'
import type { Transport, TransportOptions } from '../../transport'
import { createMessageStore, type MessageStore } from '../../store/message-store'
import { fixtureConfig, fixtureSession } from '../../contract/fixtures'
import type { SessionClient } from '../session'
import type { WidgetEvent } from '../../contract/types'
import { mount, cleanupMounted } from '../../panel/__tests__/test-utils'

function fakeClient(overrides: Partial<SessionClient> = {}): SessionClient {
  return {
    getConfig: () => fixtureConfig(),
    getSession: () => fixtureSession(),
    getCurrentResumeSecret: () => fixtureSession().resumeSecret,
    wasResumed: () => false,
    authorizedFetch: vi.fn(),
    onSessionDead: () => () => {},
    destroy: vi.fn(),
    ...overrides,
  } as unknown as SessionClient
}

// El store es real (createMessageStore) — solo el transporte se dobla, así
// applyDurableEvent produce el mismo cursor/estado/mensajes que en producción
// y App los lee vía useStoreState sin necesidad de fingir su shape.
function fakeTransport(store: MessageStore): { transport: Transport; openChannel: ReturnType<typeof vi.fn>; closeChannel: ReturnType<typeof vi.fn> } {
  const openChannel = vi.fn()
  const closeChannel = vi.fn()
  const transport: Transport = {
    store,
    send: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    cancel: vi.fn(),
    openChannel,
    closeChannel,
    destroy: vi.fn(),
  }
  return { transport, openChannel, closeChannel }
}

// Doble de ShellBus (contrato en app.tsx): captura el callback que App
// registra vía onCommand y expone `fire` para simular comandos del parent
// (open/close/toggle), envuelto en act() como hace test-utils.mount/rerender.
function fakeBus(): { bus: ShellBus; fire: (type: string, payload?: unknown) => Promise<void> } {
  let handler: ((type: string, payload: unknown) => void) | null = null
  const bus: ShellBus = {
    onCommand: (cb) => { handler = cb },
    emit: () => {},
    getLatchedViewport: () => null,
  }
  return {
    bus,
    fire: async (type, payload = null) => { await act(() => { handler?.(type, payload) }) },
  }
}

function stateChangedEvent(seq: number, state: 'BOT_ACTIVE' | 'ESCALATED_WAITING' | 'AGENT_ACTIVE' | 'RESOLVED'): WidgetEvent {
  return {
    eventId: `evt_v1_conv_test_${seq}`, schemaVersion: 1, conversationId: 'conv_test',
    occurredAt: '2026-07-19T10:00:00.000Z', type: 'conversation.state_changed', payload: { state },
  }
}

function agentMessageEvent(seq: number, messageId: string, text: string): WidgetEvent {
  return {
    eventId: `evt_v1_conv_test_${seq}`, schemaVersion: 1, conversationId: 'conv_test',
    occurredAt: '2026-07-19T10:00:00.000Z', type: 'message.created', payload: { messageId, role: 'agent', text },
  }
}

afterEach(cleanupMounted)

describe('App — D7: el canal de eventos vive mientras exista conversación activa', () => {
  it('cerrar el panel con una conversación activa NO cierra el canal', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel, closeChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    await mount(<App client={fakeClient()} bus={bus} />)

    await fire('open')
    await act(() => { store.applyDurableEvent(stateChangedEvent(1, 'AGENT_ACTIVE')) })
    openChannel.mockClear()
    closeChannel.mockClear()

    await fire('close')

    expect(closeChannel).not.toHaveBeenCalled()
    expect(openChannel).toHaveBeenCalled()
  })

  it('un mensaje de agente llegado con el panel cerrado incrementa el contador de no-leídos (badge)', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    const root = await mount(<App client={fakeClient()} bus={bus} />)

    await fire('open')
    await act(() => { store.applyDurableEvent(stateChangedEvent(1, 'AGENT_ACTIVE')) })
    await fire('close')

    await act(() => { store.applyDurableEvent(agentMessageEvent(2, 'm_agent_1', 'Hola, ¿en qué puedo ayudarte?')) })

    expect(root.querySelector('.badge')?.textContent).toBe('1')
  })

  it('abrir el panel resetea el badge de no-leídos a 0', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    const root = await mount(<App client={fakeClient()} bus={bus} />)

    await fire('open')
    await act(() => { store.applyDurableEvent(stateChangedEvent(1, 'AGENT_ACTIVE')) })
    await fire('close')
    await act(() => { store.applyDurableEvent(agentMessageEvent(2, 'm_agent_1', 'Hola')) })
    expect(root.querySelector('.badge')?.textContent).toBe('1')

    await fire('open')
    await fire('close')

    expect(root.querySelector('.badge')).toBeNull()
  })

  it('visitante nuevo sin conversación y panel cerrado: el canal nunca se abre', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus } = fakeBus()
    await mount(<App client={fakeClient()} bus={bus} />)

    expect(openChannel).not.toHaveBeenCalled()
  })
})

describe('App — Task W3: resumedSession fuerza un primer snapshot', () => {
  it('resumedSession=true abre el canal en el arranque aunque el panel esté cerrado y el store aún no sepa que hay conversación', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus } = fakeBus()
    await mount(<App client={fakeClient()} bus={bus} resumedSession />)

    expect(openChannel).toHaveBeenCalled()
  })

  it('resumedSession omitido (comportamiento por defecto): el canal NO se abre solo — se mantiene la conducta previa', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus } = fakeBus()
    await mount(<App client={fakeClient()} bus={bus} />)

    expect(openChannel).not.toHaveBeenCalled()
  })

  it('resumedSession=false explícito: idéntico al caso por defecto, canal cerrado', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus } = fakeBus()
    await mount(<App client={fakeClient()} bus={bus} resumedSession={false} />)

    expect(openChannel).not.toHaveBeenCalled()
  })
})

// Task W4 — recuperación de sesión muerta a mitad de vida (Zendesk-style
// silent refresh, Chatwoot-style fresh-conversation fallback). El mock de
// createTransport de este bloque, a diferencia del de arriba, SÍ respeta
// opts.store — así una regresión que rompiera la continuidad de historial
// (App#storeRef, ver transport/index.ts Task W4) haría fallar estos tests de
// verdad, en vez de estar enmascarada por un mock que ignora sus argumentos.
describe('App — Task W4: recuperación de sesión muerta a mitad de vida', () => {
  interface RecordedCall { client: SessionClient; opts: TransportOptions | undefined; openChannel: ReturnType<typeof vi.fn>; closeChannel: ReturnType<typeof vi.fn>; store: MessageStore }

  function mockCreateTransport(): { calls: RecordedCall[] } {
    const calls: RecordedCall[] = []
    vi.spyOn(transportModule, 'createTransport').mockImplementation((client: SessionClient, opts?: TransportOptions) => {
      const store = opts?.store ?? createMessageStore(() => '2026-07-19T10:00:00.000Z')
      const { transport, openChannel, closeChannel } = fakeTransport(store)
      calls.push({ client, opts, openChannel, closeChannel, store })
      return transport
    })
    return { calls }
  }

  // deathClient: un fakeClient cuyo onSessionDead captura el callback en la
  // variable expuesta `cb` — el test lo invoca a mano para simular la señal
  // typed que emitiría shell/session.ts en real (Task W4, ver session.test.ts).
  function deathClient(overrides: Partial<SessionClient> = {}): { client: SessionClient; kill: () => void } {
    let cb: (() => void) | null = null
    const client = fakeClient({ onSessionDead: (fn) => { cb = fn; return () => { cb = null } }, ...overrides })
    return { client, kill: () => cb?.() }
  }

  it('al morir la sesión, reconstruye llamando a createSession con el resumeSecret VIGENTE (Task W3c: getCurrentResumeSecret(), no el snapshot inmutable de getSession())', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient({ getCurrentResumeSecret: () => 'resume_actual' })
    const newClient = fakeClient()
    const createSession = vi.fn(async (_secret: string | null) => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)

    kill()

    await vi.waitFor(() => expect(createSession).toHaveBeenCalledWith('resume_actual'))
    // El segundo createTransport (post-swap) se llama con el cliente NUEVO.
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.client).toBe(newClient)
  })

  it('tras reconstruir, persiste la sesión nueva vía bus.emit(session_persist) con SU resumeSecret VIGENTE (Task W3c)', async () => {
    mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ getCurrentResumeSecret: () => 'resume_reconstruido' })
    const createSession = vi.fn(async () => newClient)
    const emit = vi.fn()
    const bus: ShellBus = { onCommand: () => {}, emit, getLatchedViewport: () => null }
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)

    kill()

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith('session_persist', { resumeSecret: 'resume_reconstruido' }))
  })

  it('destruye el cliente ANTERIOR una vez completado el swap', async () => {
    mockCreateTransport()
    const destroyOld = vi.fn()
    const { client: oldClient, kill } = deathClient({ destroy: destroyOld })
    const createSession = vi.fn(async () => fakeClient())
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)

    kill()

    await vi.waitFor(() => expect(destroyOld).toHaveBeenCalledTimes(1))
  })

  it('reutiliza el MISMO store a través del swap (continuidad de historial) y abre el canal del transport NUEVO', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ wasResumed: () => true }) // resume genuino: no se toca el store
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)
    const firstStore = calls[0]!.store
    firstStore.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_1', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-19T10:00:00.000Z', type: 'message.created', payload: { messageId: 'm1', role: 'bot', text: 'hola' },
    })

    kill()

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.store).toBe(firstStore) // MISMO store, no uno nuevo vacío
    expect(calls[1]!.store.getState().messages.some((m) => m.id === 'm1')).toBe(true)
    await vi.waitFor(() => expect(calls[1]!.openChannel).toHaveBeenCalled()) // reconcilia tras el rebuild
  })

  it('resume genuino (wasResumed=true): NO se activa newConversationNotice, el store no se resetea', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ wasResumed: () => true })
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)
    calls[0]!.store.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_9', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-19T10:00:00.000Z', type: 'message.created', payload: { messageId: 'm9', role: 'bot', text: 'previo' },
    })
    const cursorBefore = calls[0]!.store.getState().cursor

    kill()

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.store.getState().newConversationNotice).toBe(false)
    expect(calls[1]!.store.getState().cursor).toBe(cursorBefore) // sin resetForNewConversation
    expect(calls[1]!.store.getState().messages.some((m) => m.id === 'm9')).toBe(true)
  })

  it('sesión fresca (wasResumed=false) CON historial previo: activa newConversationNotice (la tarjeta "Conversación nueva")', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ wasResumed: () => false })
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)
    calls[0]!.store.applyDurableEvent({
      eventId: 'evt_v1_conv_demo_01_3', schemaVersion: 1, conversationId: 'conv_demo_01',
      occurredAt: '2026-07-19T10:00:00.000Z', type: 'message.created', payload: { messageId: 'm3', role: 'user', text: 'hola' },
    })

    kill()

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.store.getState().newConversationNotice).toBe(true)
    expect(calls[1]!.store.getState().cursor).toBeNull() // se olvidó la conversación anterior
  })

  it('sesión fresca (wasResumed=false) SIN historial previo: NO activa newConversationNotice (nada que perder)', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ wasResumed: () => false })
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)
    // sin mensajes previos en calls[0].store

    kill()

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.store.getState().newConversationNotice).toBe(false)
  })

  it('single-flight: dos disparos casi simultáneos de la misma muerte solo reconstruyen una vez', async () => {
    mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const createSession = vi.fn(async () => fakeClient())
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)

    kill() // sender
    kill() // canal — mismo latch, pero por si acaso: dos triggers casi a la vez

    await vi.waitFor(() => expect(createSession).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 10))
    expect(createSession).toHaveBeenCalledTimes(1)
  })

  it('rate limit: la sesión NUEVA muriendo casi al instante no dispara un segundo rebuild automático', async () => {
    mockCreateTransport()
    const { client: oldClient, kill: killOld } = deathClient()
    const { client: newClient, kill: killNew } = deathClient()
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)

    killOld()
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1))

    killNew() // la sesión reconstruida muere de inmediato
    await new Promise((r) => setTimeout(r, 10))
    expect(createSession).toHaveBeenCalledTimes(1) // el cooldown bloqueó el segundo intento automático
  })

  it('sin createSession (prop omitida): la muerte de sesión no revienta y no intenta reconstruir nada', async () => {
    mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} />)

    expect(() => kill()).not.toThrow()
  })

  // Nit W4 review (Task W3c): hadMessages contaba CUALQUIER mensaje en el
  // store, incluido un draft 'pending' que el visitante nunca llegó a enviar
  // de verdad (p.ej. un envío que seguía en vuelo justo cuando la sesión
  // murió). Solo un mensaje 'sent' (confirmado) es "algo que perder" — un
  // draft sin confirmar no debe disparar la tarjeta "Conversación nueva".
  it('sesión fresca (wasResumed=false) con SOLO un mensaje pendiente (sin confirmar) en el store: NO activa newConversationNotice', async () => {
    const { calls } = mockCreateTransport()
    const { client: oldClient, kill } = deathClient()
    const newClient = fakeClient({ wasResumed: () => false })
    const createSession = vi.fn(async () => newClient)
    const { bus } = fakeBus()
    await mount(<App client={oldClient} bus={bus} createSession={createSession} />)
    calls[0]!.store.addOptimistic('cid_draft', 'mensaje sin confirmar')
    expect(calls[0]!.store.getState().messages[0]?.status).toBe('pending')

    kill()

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.store.getState().newConversationNotice).toBe(false)
  })
})

// TOP-15 #1 (auditoría de cobertura 2026-07): 'update' y 'consent' SÍ llegan
// hasta App vía bus.onCommand — loader/index.ts#drainQueue los reenvía al
// shell tal cual open/close/toggle (sendToShell('update', args[0] ?? null) /
// sendToShell('consent', null)), y son parte del allowlist público
// LOADER_TO_SHELL (protocol/envelope.ts) alcanzable desde
// NeventWidget('update', opts) / NeventWidget('consent') en la página
// anfitriona. Pero el switch de bus.onCommand de más arriba solo reconoce
// 'open'/'close'/'toggle'/'viewport' — ningún branch coincide con 'update' ni
// 'consent', así que caen al no-op implícito del `else if` en cascada. Este
// bloque fija ese CONTRATO ACTUAL de forma explícita (nunca antes probado):
// ninguno de los dos comandos muta open/viewport/canal, y ninguno rompe el
// procesamiento de comandos posteriores. El comportamiento REAL (aplicar un
// theme update en caliente, registrar consentimiento) es trabajo pendiente —
// ver Plan 4 — y NO se ha inventado aquí ningún comportamiento nuevo.
describe("App — bus.onCommand: 'update'/'consent' (comandos públicos del host, sin handler — no-op silencioso, Plan 4 pendiente)", () => {
  it("'update' no abre/cierra el panel, no toca el viewport y no dispara el canal — no-op explícito", async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel, closeChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    const root = await mount(<App client={fakeClient()} bus={bus} />)
    openChannel.mockClear()
    closeChannel.mockClear()

    await fire('update', { theme: { primaryColor: '#ff0000' } })

    const el = root.querySelector('[data-part="root"]')
    expect(el?.getAttribute('data-mode')).toBe('launcher') // isOpen sigue false, sin cambios
    expect(el?.getAttribute('data-viewport')).toBe('desktop') // viewport intacto
    expect(openChannel).not.toHaveBeenCalled()
    expect(closeChannel).not.toHaveBeenCalled()
  })

  it("'consent' no abre/cierra el panel, no toca el viewport y no dispara el canal — no-op explícito", async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport, openChannel, closeChannel } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    const root = await mount(<App client={fakeClient()} bus={bus} />)
    openChannel.mockClear()
    closeChannel.mockClear()

    await fire('consent', null)

    const el = root.querySelector('[data-part="root"]')
    expect(el?.getAttribute('data-mode')).toBe('launcher')
    expect(el?.getAttribute('data-viewport')).toBe('desktop')
    expect(openChannel).not.toHaveBeenCalled()
    expect(closeChannel).not.toHaveBeenCalled()
  })

  it("'update'/'consent' no dejan al comando en un estado raro: un 'open' recibido justo después sigue abriendo el panel con normalidad", async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    const { transport } = fakeTransport(store)
    vi.spyOn(transportModule, 'createTransport').mockReturnValue(transport)
    const { bus, fire } = fakeBus()
    const root = await mount(<App client={fakeClient()} bus={bus} />)

    await fire('update', { foo: 1 })
    await fire('consent')
    await fire('open')

    expect(root.querySelector('[data-part="root"]')?.getAttribute('data-mode')).toBe('panel')
  })
})
