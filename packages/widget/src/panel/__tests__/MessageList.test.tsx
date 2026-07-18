import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageList } from '../MessageList'
import { fixtureConfig } from '../../contract/fixtures'
import type { StoredMessage } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: () => void
  constructor(cb: () => void) { this.cb = cb; FakeResizeObserver.instances.push(this) }
  observe(): void {}
  disconnect(): void {}
  trigger(): void { this.cb() }
}

function msg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'hola', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T10:00:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

let originalRO: unknown
beforeEach(() => {
  originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  FakeResizeObserver.instances = []
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver
})
afterEach(async () => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO
  await cleanupMounted()
})

describe('MessageList', () => {
  it('showWelcome:true y sin mensajes: muestra Welcome, no el divisor "Hoy"', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={true} />,
    )
    expect(root.querySelector('.welcome')).not.toBeNull()
    expect(root.querySelector('.day')).toBeNull()
  })

  it('Important #9 — showWelcome:false aunque no haya mensajes (p.ej. fase waiting recién escalada sin historial visible): NO muestra Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.welcome')).toBeNull()
  })

  it('con mensajes: muestra el divisor "Hoy" y una burbuja por mensaje, sin Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' }), msg({ id: 'b', role: 'user' })]}
        agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.day')?.textContent).toBe('Hoy')
    expect(root.querySelector('.welcome')).toBeNull()
    expect(root.querySelectorAll('.m').length).toBe(2)
  })

  it('agrupa como compact las burbujas consecutivas del mismo rol', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()}
        messages={[msg({ id: 'a', role: 'bot' }), msg({ id: 'b', role: 'bot' }), msg({ id: 'c', role: 'user' })]}
        agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const ms = root.querySelectorAll('.m')
    expect(ms[0]?.classList.contains('compact')).toBe(false)
    expect(ms[1]?.classList.contains('compact')).toBe(true)
    expect(ms[2]?.classList.contains('compact')).toBe(false)
  })

  it('clicar un chip de Welcome llama a onQuickReply', async () => {
    const onQuickReply = vi.fn()
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} onRetry={vi.fn()} onQuickReply={onQuickReply} showWelcome={true} />,
    )
    root.querySelectorAll<HTMLButtonElement>('.chip')[0]!.click()
    expect(onQuickReply).toHaveBeenCalledWith('Cambiar el nombre de mi entrada')
  })

  it('trailing: se pinta tras todos los mensajes', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false}
        trailing={<div data-testid="trail">Resuelto</div>} />,
    )
    const inner = root.querySelector('.msgs-inner')!
    expect(inner.lastElementChild?.getAttribute('data-testid')).toBe('trail')
  })

  it('Important #7 — autoscroll: si estaba cerca del fondo, CUALQUIER crecimiento del contenido interior (no solo el último mensaje) mueve scrollTop al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
    container.scrollTop = 480 // a 20px del fondo: "cerca"
    container.dispatchEvent(new Event('scroll'))

    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    FakeResizeObserver.instances[0]!.trigger() // simula que .msgs-inner creció (p.ej. TypingDots apareció)
    expect(container.scrollTop).toBe(560)
  })

  it('autoscroll: si el usuario había subido a leer historial, el crecimiento del contenido NO le arrastra al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
    container.scrollTop = 0
    container.dispatchEvent(new Event('scroll'))

    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    FakeResizeObserver.instances[0]!.trigger()
    expect(container.scrollTop).toBe(0)
  })
})
