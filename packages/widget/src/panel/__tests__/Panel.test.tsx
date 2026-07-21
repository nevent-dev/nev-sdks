import { describe, it, expect, vi, afterEach } from 'vitest'
import { Panel } from '../Panel'
import { createMessageStore } from '../../store/message-store'
import { fixtureConfig } from '../../contract/fixtures'
import type { Transport } from '../../transport'
import { mount, cleanupMounted } from './test-utils'

function fakeTransport(store = createMessageStore(() => '2026-07-18T14:00:00.000Z')): Transport {
  return {
    store,
    send: vi.fn(async () => {}),
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
    <Panel config={fixtureConfig()} transport={transport} onMinimize={vi.fn()} onClose={vi.fn()} onResize={vi.fn()}
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

  it('gap #5 — fase RESOLVED: ResolvedCard se pinta SIN botones de feedback (Panel no pasa onFeedback)', async () => {
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
