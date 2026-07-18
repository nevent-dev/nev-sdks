import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { StoredMessage } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'Hola', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:02:00.000Z', clientId: null, turnId: null, ...overrides,
  }
}

afterEach(cleanupMounted)

describe('MessageBubble', () => {
  it('mensaje de usuario: alineado a la derecha, sin avatar, con hora y check de enviado', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'sent' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.m.user')).not.toBeNull()
    expect(root.querySelector('.b-avatar')).toBeNull()
    expect(root.querySelector('.meta')?.textContent).toContain('14:02')
  })

  it('renderiza el texto como nodo de texto plano — nunca interpreta HTML/markdown embebido (XSS)', async () => {
    const hostile = '<img src=x onerror="window.__pwned=true">'
    const root = await mount(<MessageBubble message={msg({ role: 'bot', text: hostile })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.bubble img')).toBeNull()
    expect(root.querySelector('.bubble')?.textContent).toBe(hostile)
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('bot en streaming CON texto: añade el cursor parpadeante marcado aria-hidden', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: 'Escribiendo' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    const caret = root.querySelector('.stream-caret')
    expect(caret).not.toBeNull()
    expect(caret?.getAttribute('aria-hidden')).toBe('true')
  })

  it('streaming sin texto aún (turno recién empezado): muestra el indicador "pensando" en vez de una burbuja vacía (spec §2)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: '' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.thinking')).not.toBeNull()
    expect(root.querySelector('.thinking')?.textContent).toContain('Pensando')
    expect(root.querySelector('.bubble')).toBeNull()
  })

  it('mensaje fallido: muestra "No enviado" y un botón Reintentar que llama onRetry con el clientId', async () => {
    const onRetry = vi.fn()
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'failed', clientId: 'c1' })} agentName={null} onRetry={onRetry} compact={false} />)
    expect(root.querySelector('.meta .fail')?.textContent).toBe('No enviado')
    const retry = root.querySelector<HTMLButtonElement>('button.retry')
    expect(retry).not.toBeNull()
    expect(retry?.textContent?.trim()).toBe('Reintentar')
    retry!.click()
    expect(onRetry).toHaveBeenCalledWith('c1')
  })

  it('mensaje pendiente: no muestra check ni fallo', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'pending' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.meta .fail')).toBeNull()
  })

  it('agente con agentName: avatar de iniciales, nunca <img> (spec §8)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName="Laura" onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('agente sin agentName aún (edge: mensaje ya llegó como agent pero agent.joined todavía no): recae en BotIcon', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })

  it('compact:true oculta el avatar visualmente (ghost) para agrupar burbujas consecutivas', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot' })} agentName={null} onRetry={vi.fn()} compact={true} />)
    expect(root.querySelector('.b-avatar.ghost')).not.toBeNull()
  })
})
