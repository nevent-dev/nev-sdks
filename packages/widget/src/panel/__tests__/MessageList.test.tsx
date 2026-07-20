import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
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
    createdAt: '2026-07-18T10:00:00.000Z', clientId: null, turnId: null, authorName: null, authorAvatarUrl: null, ...overrides,
  }
}

// Simula un evento de scroll real: fija scrollHeight/clientHeight/scrollTop
// (jsdom no mide layout de verdad) y despacha 'scroll' dentro de act() —
// a diferencia del listener/ResizeObserver de anclaje (que solo tocan un ref
// y el DOM crudo), el hook de la píldora también hace setState, así que el
// re-render necesita el flush de act() antes de poder consultarse en el DOM.
async function fireScroll(
  container: HTMLDivElement,
  opts: { scrollHeight: number; clientHeight: number; scrollTop: number },
): Promise<void> {
  Object.defineProperty(container, 'scrollHeight', { value: opts.scrollHeight, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: opts.clientHeight, configurable: true })
  container.scrollTop = opts.scrollTop
  await act(() => { container.dispatchEvent(new Event('scroll')) })
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
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={true} />,
    )
    expect(root.querySelector('.welcome')).not.toBeNull()
    expect(root.querySelector('.day')).toBeNull()
  })

  it('Important #9 — showWelcome:false aunque no haya mensajes (p.ej. fase waiting recién escalada sin historial visible): NO muestra Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.welcome')).toBeNull()
  })

  it('con mensajes: muestra el divisor "Hoy" y una burbuja por mensaje, sin Welcome', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' }), msg({ id: 'b', role: 'user' })]}
        agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.day')?.textContent).toBe('Hoy')
    expect(root.querySelector('.welcome')).toBeNull()
    expect(root.querySelectorAll('.m').length).toBe(2)
  })

  it('agrupa como compact las burbujas consecutivas del mismo rol', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()}
        messages={[msg({ id: 'a', role: 'bot' }), msg({ id: 'b', role: 'bot' }), msg({ id: 'c', role: 'user' })]}
        agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const ms = root.querySelectorAll('.m')
    expect(ms[0]?.classList.contains('compact')).toBe(false)
    expect(ms[1]?.classList.contains('compact')).toBe(true)
    expect(ms[2]?.classList.contains('compact')).toBe(false)
  })

  // Foto del agente: MessageList es el tramo intermedio entre Panel (que lee
  // el store) y MessageBubble — debe reenviar agentAvatarUrl igual que ya
  // reenvía agentName, sin perderlo por el camino.
  it('reenvía agentAvatarUrl a las burbujas de agente', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a', role: 'agent' })]}
        agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const img = root.querySelector('.b-avatar img.agent-avatar-img')
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
  })

  it('clicar un chip de Welcome llama a onQuickReply', async () => {
    const onQuickReply = vi.fn()
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={onQuickReply} showWelcome={true} />,
    )
    root.querySelectorAll<HTMLButtonElement>('.chip')[0]!.click()
    expect(onQuickReply).toHaveBeenCalledWith('Cambiar el nombre de mi entrada')
  })

  it('trailing: se pinta tras todos los mensajes', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false}
        trailing={<div data-testid="trail">Resuelto</div>} />,
    )
    const inner = root.querySelector('.msgs-inner')!
    expect(inner.lastElementChild?.getAttribute('data-testid')).toBe('trail')
  })

  it('Important #7 — autoscroll: si estaba cerca del fondo, CUALQUIER crecimiento del contenido interior (no solo el último mensaje) mueve scrollTop al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
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
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
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

describe('MessageList — píldora "ir al fondo"', () => {
  it('(a) oculta cerca del fondo, visible al scrollear hacia arriba', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    expect(root.querySelector('.scroll-pill')).toBeNull()

    const container = root.querySelector('.msgs') as HTMLDivElement
    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 }) // lejos del fondo
    expect(root.querySelector('.scroll-pill')).not.toBeNull()

    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 480 }) // vuelta al fondo
    expect(root.querySelector('.scroll-pill')).toBeNull()
  })

  it('(b) el contador solo suma con un entrante bot/agent COMPLETO estando lejos del fondo — nunca en streaming ni con mensajes propios', async () => {
    let messages: StoredMessage[] = [msg({ id: 'a', role: 'bot' })]
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 }) // lejos del fondo
    // Lejos del fondo: la píldora ya está visible (solo chevron), pero sin contador.
    expect(root.querySelector('.scroll-pill.has-count')).toBeNull()
    expect(root.querySelector('.scroll-pill-count')).toBeNull()

    // Llega un entrante en streaming: NO debe contar todavía.
    messages = [...messages, msg({ id: 'stream-1', role: 'bot', status: 'sent', streaming: true, text: '' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    expect(root.querySelector('.scroll-pill.has-count')).toBeNull()
    expect(root.querySelector('.scroll-pill-count')).toBeNull()

    // El MISMO id termina de streamear (completo): ahora sí cuenta, una vez.
    messages = messages.map((m) => (m.id === 'stream-1' ? { ...m, streaming: false, text: 'ya está' } : m))
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    const pill = root.querySelector('.scroll-pill')
    expect(pill).not.toBeNull()
    expect(pill!.textContent).toContain('1')

    // Un mensaje propio (aunque optimista/pending) nunca debe sumar al contador.
    messages = [...messages, msg({ id: 'own-1', role: 'user', status: 'pending' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    // El propio mensaje fuerza el fondo (comportamiento (e)): la píldora entera desaparece.
    expect(root.querySelector('.scroll-pill')).toBeNull()
  })

  it('(c) click en la píldora lleva al fondo y limpia el contador', async () => {
    let messages: StoredMessage[] = [msg({ id: 'a', role: 'bot' })]
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 })

    messages = [...messages, msg({ id: 'b', role: 'bot' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    expect(root.querySelector('.scroll-pill')).not.toBeNull()

    // jsdom no implementa Element.prototype.scrollTo (verificado): el hook
    // debe caer al fallback scrollTop = scrollHeight cuando scrollTo no existe.
    Object.defineProperty(container, 'scrollHeight', { value: 900, configurable: true })
    const pill = root.querySelector('.scroll-pill') as HTMLButtonElement
    await act(() => { pill.click() })

    expect(container.scrollTop).toBe(900)
    expect(root.querySelector('.scroll-pill')).toBeNull()
  })

  it('(d) volver al fondo por scroll manual (sin tocar la píldora) también limpia el contador', async () => {
    let messages: StoredMessage[] = [msg({ id: 'a', role: 'bot' })]
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 })

    messages = [...messages, msg({ id: 'b', role: 'bot' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    expect(root.querySelector('.scroll-pill')).not.toBeNull()

    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 480 }) // el usuario scrollea manualmente hasta el fondo
    expect(root.querySelector('.scroll-pill')).toBeNull()
  })

  it('(e) un mensaje propio nuevo (optimista incluido) fuerza el scroll al fondo aunque el usuario estuviera arriba', async () => {
    let messages: StoredMessage[] = [msg({ id: 'a', role: 'bot' })]
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 }) // subió a leer historial

    messages = [...messages, msg({ id: 'own-optimistic', role: 'user', status: 'pending', clientId: 'own-optimistic' })]
    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )

    expect(container.scrollTop).toBe(560) // baja incondicionalmente
    expect(root.querySelector('.scroll-pill')).toBeNull()
  })

  it('(f) no rompe el anclaje existente: cerca del fondo, cualquier crecimiento del contenido sigue moviendo scrollTop al fondo', async () => {
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={[msg({ id: 'a' })]} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true })
    container.scrollTop = 480
    container.dispatchEvent(new Event('scroll'))

    Object.defineProperty(container, 'scrollHeight', { value: 560, configurable: true })
    FakeResizeObserver.instances[0]!.trigger()
    expect(container.scrollTop).toBe(560)
    expect(root.querySelector('.scroll-pill')).toBeNull() // seguía cerca del fondo: nunca se mostró
  })

  it('respeta prefers-reduced-motion: usa scrollTo({behavior:"smooth"}) por defecto y "auto" con motion reducido', async () => {
    let messages: StoredMessage[] = [msg({ id: 'a', role: 'bot' })]
    const root = await mount(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
    )
    const container = root.querySelector('.msgs') as HTMLDivElement
    // jsdom no trae Element.prototype.scrollTo — se añade un stub SOLO para
    // este test, para poder inspeccionar con qué `behavior` se le llama.
    const scrollToSpy = vi.fn()
    ;(container as unknown as { scrollTo: typeof scrollToSpy }).scrollTo = scrollToSpy

    await fireScroll(container, { scrollHeight: 500, clientHeight: 400, scrollTop: 0 })
    messages = [...messages, msg({ id: 'b', role: 'bot' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    let pill = root.querySelector('.scroll-pill') as HTMLButtonElement
    await act(() => { pill.click() })
    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))

    // Motion reducido: la misma acción debe pedir 'auto'.
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    } as MediaQueryList)
    await fireScroll(container, { scrollHeight: 560, clientHeight: 400, scrollTop: 0 })
    messages = [...messages, msg({ id: 'c', role: 'bot' })]
    await rerender(
      <MessageList config={fixtureConfig()} messages={messages} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} onQuickReply={vi.fn()} showWelcome={false} />,
      root,
    )
    pill = root.querySelector('.scroll-pill') as HTMLButtonElement
    await act(() => { pill.click() })
    expect(scrollToSpy).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
    matchMedia.mockRestore()
  })
})
