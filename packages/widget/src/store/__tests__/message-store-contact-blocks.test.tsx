import { describe, it, expect, afterEach } from 'vitest'
import { createMessageStore, type MessageStore } from '../message-store'
import { MessageList } from '../../panel/MessageList'
import { fixtureConfig } from '../../contract/fixtures'
import type { WidgetEvent, MessagesSnapshot } from '../../contract/types'
import { mount, cleanupMounted } from '../../panel/__tests__/test-utils'

// Recorrido completo del bloque de contacto (nevent-work#15): JSON del wire →
// store → MessageList, con el ejemplo del contrato (_rescate/t15-mock/
// contrato.md §2). El wire se parsea con JSON.parse, como hacen
// events-channel.ts (parseDurable) y snapshot(): ningún tipo lo protege.
const text = 'Sorry to hear about your phone. MYA handles lost property on WhatsApp: +34 612 34 56 78'
const bodyText = 'Sorry to hear about your phone. MYA handles lost property on WhatsApp:'
const block = { channel: 'WHATSAPP', value: '+34612345678', display: '+34 612 34 56 78', url: 'https://wa.me/34612345678' }
const at = '2026-11-10T12:00:00.000Z'

function durable(payload: Record<string, unknown>): WidgetEvent {
  return JSON.parse(JSON.stringify({
    eventId: 'evt_v1_c_1', schemaVersion: 1, conversationId: 'c', occurredAt: at, type: 'message.created',
    payload: { messageId: 'm1', role: 'bot', text, ...payload },
  })) as WidgetEvent
}

function snapshot(message: Record<string, unknown>): MessagesSnapshot {
  return JSON.parse(JSON.stringify({
    messages: [{ messageId: 'm1', role: 'bot', text, createdAt: at, ...message }],
    state: 'BOT_ACTIVE', snapshotCursor: 'evt_v1_c_1',
  })) as MessagesSnapshot
}

async function render(store: MessageStore): Promise<HTMLElement> {
  return mount(<MessageList config={fixtureConfig()} messages={store.getState().messages} agentName={null} agentAvatarUrl={null}
    onRetry={() => {}} onQuickReply={() => {}} showWelcome={false} />)
}

function streamedTurn(store: MessageStore): void {
  // Los delta del widget transmiten bodyText (contrato §2, «Stream del turno»).
  store.beginBotTurn('t1')
  store.appendBotDelta('t1', bodyText)
  store.finishBotTurn('t1', 'm1')
}

afterEach(cleanupMounted)

describe('bloque de contacto por el wire', () => {
  it('evento sin los campos nuevos: el mensaje se pinta igual que antes, sin bloque ni enlaces', async () => {
    const store = createMessageStore(() => at)
    store.applyDurableEvent(durable({ text: 'Las puertas abren a las 23:00.' }))
    const root = await render(store)
    expect(root.querySelector('.bubble')?.textContent).toBe('Las puertas abren a las 23:00.')
    expect(root.querySelector('.cblocks')).toBeNull()
    expect(root.querySelectorAll('a').length).toBe(0)
  })

  it('message.created con contacts: burbuja bodyText y el bloque debajo', async () => {
    const store = createMessageStore(() => at)
    store.applyDurableEvent(durable({ bodyText, contacts: [block] }))
    const root = await render(store)
    expect(root.querySelector('.bubble')?.textContent).toBe(bodyText)
    expect(root.querySelector('.cblock')?.getAttribute('aria-label')).toBe('WhatsApp: +34 612 34 56 78')
    expect(root.querySelector('.cblock .v')?.textContent).toBe('+34 612 34 56 78')
    expect(root.querySelector('a.act')?.getAttribute('href')).toBe('https://wa.me/34612345678')
    // El número sale una vez: en el bloque, no también en la burbuja.
    expect(root.textContent?.split('612 34 56 78').length).toBe(2)
  })

  it('turno en streaming: la burbuja ya es la definitiva y el bloque llega con el durable', () => {
    const store = createMessageStore(() => at)
    streamedTurn(store)
    expect(store.getState().messages[0]!).toMatchObject({ text: bodyText, contactBlocks: [] })
    store.applyDurableEvent(durable({ bodyText, contacts: [block] }))
    expect(store.getState().messages).toHaveLength(1)
    expect(store.getState().messages[0]!).toMatchObject({ text: bodyText, contactBlocks: [block] })
  })

  it('al recargar, la snapshot trae el bloque', async () => {
    const store = createMessageStore(() => at)
    store.applySnapshot(snapshot({ bodyText, contacts: [block] }))
    const root = await render(store)
    expect(root.querySelector('.bubble')?.textContent).toBe(bodyText)
    expect(root.querySelector('.cblock .v')?.textContent).toBe('+34 612 34 56 78')
  })

  it('si el durable se perdió, la snapshot completa el bloque del turno ya cerrado', () => {
    const store = createMessageStore(() => at)
    streamedTurn(store)
    store.applySnapshot(snapshot({ bodyText, contacts: [block] }))
    expect(store.getState().messages[0]!).toMatchObject({ text: bodyText, contactBlocks: [block] })
  })

  it('bloque inválido: cae a text, con el número escrito, sin romper nada', async () => {
    const store = createMessageStore(() => at)
    store.applyDurableEvent(durable({ bodyText, contacts: [{ ...block, url: 'javascript:alert(1)' }] }))
    const root = await render(store)
    expect(root.querySelector('.bubble')?.textContent).toBe(text)
    expect(root.querySelector('.cblocks')).toBeNull()
  })

  it('turno en streaming + durable con bloque inválido: el número llega en text', () => {
    const store = createMessageStore(() => at)
    streamedTurn(store)
    store.applyDurableEvent(durable({ bodyText, contacts: [{ channel: 'FAX' }] }))
    expect(store.getState().messages[0]!).toMatchObject({ text, contactBlocks: [] })
  })

  it('una parte futura desconocida se ignora, como hace el widget anterior con contacts', async () => {
    const store = createMessageStore(() => at)
    store.applyDurableEvent(durable({ parts: [{ type: 'map', lat: 39.4 }] }))
    const root = await render(store)
    expect(root.querySelector('.bubble')?.textContent).toBe(text)
    expect(root.querySelectorAll('a').length).toBe(0)
  })
})
