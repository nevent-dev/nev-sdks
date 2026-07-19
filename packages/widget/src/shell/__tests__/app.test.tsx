import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { App, type ShellBus } from '../app'
import * as transportModule from '../../transport'
import type { Transport } from '../../transport'
import { createMessageStore, type MessageStore } from '../../store/message-store'
import { fixtureConfig } from '../../contract/fixtures'
import type { SessionClient } from '../session'
import type { WidgetEvent } from '../../contract/types'
import { mount, cleanupMounted } from '../../panel/__tests__/test-utils'

function fakeClient(): SessionClient {
  return { getConfig: () => fixtureConfig(), authorizedFetch: vi.fn(), destroy: vi.fn() } as unknown as SessionClient
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
