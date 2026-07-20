import { describe, it, expect, afterEach, vi } from 'vitest'
import { useUnreadCount, type LastSeen } from '../use-unread-count'
import { createMessageStore, type StoreState } from '../../store/message-store'
import type { WidgetEvent, MessagesSnapshot } from '../../contract/types'
import { mount, rerender, cleanupMounted } from './test-utils'

function Probe({ state, isOpen, initialLastSeen, onLastSeen }: {
  state: StoreState; isOpen: boolean
  initialLastSeen?: LastSeen | null
  onLastSeen?: (lastSeen: LastSeen) => void
}) {
  const count = useUnreadCount(state, isOpen, { initialLastSeen: initialLastSeen ?? null, ...(onLastSeen ? { onLastSeen } : {}) })
  return <div data-testid="unread">{count}</div>
}

function readCount(root: HTMLElement): string {
  return root.querySelector('[data-testid=unread]')?.textContent ?? ''
}

// Historial hidratado vía snapshot (GET /messages) — igual que el mundo real
// tras un F5 con sesión resumida: cada mensaje llega con seq: null (el
// contrato WidgetMessage no lleva seq por mensaje, solo snapshotCursor a
// nivel de snapshot; ver store/message-store.ts#mergeSnapshotMessages). Por
// eso el watermark es por IDENTIDAD+POSICIÓN (messageId), nunca por seq.
function historicalSnapshot(conversationId: string, cursorSeq: number, messages: MessagesSnapshot['messages']): MessagesSnapshot {
  return { messages, state: 'AGENT_ACTIVE', snapshotCursor: `evt_v1_${conversationId}_${cursorSeq}` }
}

// occurredAt embebe el seq como minuto — da un orden cronológico
// determinista entre varias llamadas en el mismo test, sin depender de que
// Array.prototype.sort sea estable ante empates.
function agentMessageEvent(conversationId: string, seq: number, messageId: string, text: string): WidgetEvent {
  return {
    eventId: `evt_v1_${conversationId}_${seq}`, schemaVersion: 1, conversationId,
    occurredAt: `2026-07-19T10:${String(seq).padStart(2, '0')}:00.000Z`, type: 'message.created', payload: { messageId, role: 'agent', text },
  }
}

afterEach(cleanupMounted)

describe('useUnreadCount', () => {
  it('cuenta mensajes bot/agent completos llegados con el panel cerrado, y se resetea al abrir', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'hola'); store.finishBotTurn('t1', 'msg_1')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')

    store.beginBotTurn('t2'); store.finishBotTurn('t2', 'msg_2')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('2')

    await rerender(<Probe state={store.getState()} isOpen={true} />, root)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t3'); store.finishBotTurn('t3', 'msg_3')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')
  })

  it('no cuenta un turno de bot mientras sigue en streaming', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'aún escribiendo')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('0')
  })
})

describe('useUnreadCount — watermark persistido (initialLastSeen / onLastSeen)', () => {
  it('baseline suprime el historial hasta E INCLUYENDO la marca, en la MISMA conversación — el chat ya leído tras un F5', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    store.applySnapshot(historicalSnapshot('conv_demo_01', 5, [
      { messageId: 'msg_hist_1', role: 'bot', text: 'hola', createdAt: '2026-07-18T09:00:00.000Z' },
      { messageId: 'msg_hist_2', role: 'agent', text: 'en qué te ayudo', createdAt: '2026-07-18T09:01:00.000Z' },
    ]))
    // La marca es el ÚLTIMO mensaje que el visitante vio la vez anterior —
    // ambos mensajes históricos quedan en o antes de esa posición.
    const initialLastSeen: LastSeen = { conversationId: 'conv_demo_01', messageId: 'msg_hist_2' }

    const root = await mount(<Probe state={store.getState()} isOpen={false} initialLastSeen={initialLastSeen} />)
    expect(readCount(root)).toBe('0')
  })

  it('el agente respondió con la pestaña CERRADA: las respuestas bot/agent POSTERIORES a la marca sí cuentan, aunque el historial anterior siga suprimido', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    store.applySnapshot(historicalSnapshot('conv_demo_01', 5, [
      { messageId: 'msg_hist_1', role: 'bot', text: 'hola', createdAt: '2026-07-18T09:00:00.000Z' },
      { messageId: 'msg_hist_2', role: 'agent', text: 'en qué te ayudo', createdAt: '2026-07-18T09:01:00.000Z' },
      { messageId: 'msg_hist_3', role: 'bot', text: 'sigo aquí si necesitas algo', createdAt: '2026-07-18T09:02:00.000Z' },
    ]))
    // La marca apunta al mensaje del MEDIO — msg_hist_1/2 quedan suprimidos
    // (en o antes de la marca), msg_hist_3 quedó DESPUÉS: es una respuesta
    // que el visitante nunca vio, aunque toda esta hidratación venga del
    // mismo snapshot histórico (sin seq propio, seq:null los tres).
    const initialLastSeen: LastSeen = { conversationId: 'conv_demo_01', messageId: 'msg_hist_2' }

    const root = await mount(<Probe state={store.getState()} isOpen={false} initialLastSeen={initialLastSeen} />)
    expect(readCount(root)).toBe('1')
  })

  it('baseline de OTRA conversación no aplica — un messageId de una conversación no dice nada de la posición en otra, todo cuenta', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    store.applySnapshot(historicalSnapshot('conv_demo_01', 5, [
      { messageId: 'msg_hist_1', role: 'bot', text: 'hola', createdAt: '2026-07-18T09:00:00.000Z' },
      { messageId: 'msg_hist_2', role: 'agent', text: 'en qué te ayudo', createdAt: '2026-07-18T09:01:00.000Z' },
    ]))
    const initialLastSeen: LastSeen = { conversationId: 'conv_OTRA_conversacion', messageId: 'msg_de_otra_conv' }

    const root = await mount(<Probe state={store.getState()} isOpen={false} initialLastSeen={initialLastSeen} />)
    expect(readCount(root)).toBe('2')
  })

  it('watermark FUERA de la ventana del snapshot (el messageId ya no está, cayó por el lado viejo de los 50 más nuevos) — TODO lo presente cuenta', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    store.applySnapshot(historicalSnapshot('conv_demo_01', 5, [
      { messageId: 'msg_hist_1', role: 'bot', text: 'hola', createdAt: '2026-07-18T09:00:00.000Z' },
      { messageId: 'msg_hist_2', role: 'agent', text: 'en qué te ayudo', createdAt: '2026-07-18T09:01:00.000Z' },
    ]))
    // La marca de la visita anterior apuntaba a un mensaje que ya no está en
    // los 50 más nuevos que devuelve el snapshot — no se puede localizar su
    // posición, así que todo lo presente se trata como posterior.
    const initialLastSeen: LastSeen = { conversationId: 'conv_demo_01', messageId: 'msg_ancient_fuera_de_ventana' }

    const root = await mount(<Probe state={store.getState()} isOpen={false} initialLastSeen={initialLastSeen} />)
    expect(readCount(root)).toBe('2')
  })

  it('al abrir el panel emite onLastSeen con el ÚLTIMO messageId, y NO reemite si no avanza', async () => {
    const store = createMessageStore(() => '2026-07-19T10:00:00.000Z')
    store.applyDurableEvent(agentMessageEvent('conv_demo_01', 1, 'msg_1', 'hola'))
    store.applyDurableEvent(agentMessageEvent('conv_demo_01', 2, 'msg_2', 'como estas'))
    const onLastSeen = vi.fn()

    const root = await mount(<Probe state={store.getState()} isOpen={false} onLastSeen={onLastSeen} />)
    expect(onLastSeen).not.toHaveBeenCalled() // panel cerrado: nunca emite

    await rerender(<Probe state={store.getState()} isOpen={true} onLastSeen={onLastSeen} />, root)
    expect(onLastSeen).toHaveBeenCalledTimes(1)
    expect(onLastSeen).toHaveBeenCalledWith({ conversationId: 'conv_demo_01', messageId: 'msg_2' })

    // Re-render con el panel TODAVÍA abierto y el mismo estado — no debe
    // volver a emitir (nada de spamear cada render).
    await rerender(<Probe state={store.getState()} isOpen={true} onLastSeen={onLastSeen} />, root)
    expect(onLastSeen).toHaveBeenCalledTimes(1)

    // Un mensaje nuevo SÍ avanza el watermark — re-emite con el messageId nuevo.
    store.applyDurableEvent(agentMessageEvent('conv_demo_01', 3, 'msg_3', 'algo más'))
    await rerender(<Probe state={store.getState()} isOpen={true} onLastSeen={onLastSeen} />, root)
    expect(onLastSeen).toHaveBeenCalledTimes(2)
    expect(onLastSeen).toHaveBeenLastCalledWith({ conversationId: 'conv_demo_01', messageId: 'msg_3' })
  })

  it('la emisión salta un optimista pendiente y un turno en streaming al final — usa el ÚLTIMO mensaje "sent" (sin id de servidor estable / incompleto no vale como marca)', async () => {
    // Reloj fijo POSTERIOR a los occurredAt de los eventos durables (que
    // embeben el seq como minuto, ver agentMessageEvent) — así lo añadido
    // vía addOptimistic/beginBotTurn ordena SIEMPRE detrás, sin depender de
    // que el sort sea estable ante empates.
    const store = createMessageStore(() => '2026-07-19T10:05:00.000Z')
    store.applyDurableEvent(agentMessageEvent('conv_demo_01', 1, 'msg_1', 'hola'))
    store.applyDurableEvent(agentMessageEvent('conv_demo_01', 2, 'msg_2', 'como estas'))
    store.addOptimistic('cid_draft', 'una pregunta más') // pendiente, sin id de servidor
    store.beginBotTurn('turn_1') // streaming, todavía incompleto
    const onLastSeen = vi.fn()

    await mount(<Probe state={store.getState()} isOpen={true} onLastSeen={onLastSeen} />)

    expect(onLastSeen).toHaveBeenCalledTimes(1)
    expect(onLastSeen).toHaveBeenCalledWith({ conversationId: 'conv_demo_01', messageId: 'msg_2' })
  })
})
