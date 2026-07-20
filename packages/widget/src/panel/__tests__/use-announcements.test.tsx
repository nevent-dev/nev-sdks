import { describe, it, expect, afterEach } from 'vitest'
import { useAnnouncement } from '../use-announcements'
import type { StoredMessage } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

function msg(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: '', status: 'sent', seq: null, streaming: false,
    createdAt: '2026-07-18T10:00:00.000Z', clientId: null, turnId: null, authorName: null, authorAvatarUrl: null, ...overrides,
  }
}

function Probe({ messages }: { messages: StoredMessage[] }) {
  const announcement = useAnnouncement(messages)
  return <div data-testid="ann">{announcement}</div>
}

function read(root: HTMLElement): string {
  return root.querySelector('[data-testid=ann]')?.textContent ?? ''
}

// El fix de Important #9 (ronda 2) alterna un espacio de ancho cero (U+200B)
// al final del string — invisible y silencioso para lectores de pantalla,
// pero garantiza que la comparación de igualdad de Preact nunca bloquee la
// mutación del DOM. Los tests que verifican el texto "hablado" lo quitan
// antes de comparar.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
function stripZeroWidth(s: string): string {
  return s.split(ZERO_WIDTH_SPACE).join('')
}

afterEach(cleanupMounted)

describe('useAnnouncement', () => {
  it('Important #6 — baseline silenciosa: historial ya presente al montar (apertura/reapertura) NO se anuncia', async () => {
    const root = await mount(<Probe messages={[msg({ id: 'h1', text: 'Hola, ¿en qué te ayudamos?' })]} />)
    expect(read(root)).toBe('')
  })

  it('no anuncia mientras el mensaje sigue en streaming (evita spam de deltas)', async () => {
    const root = await mount(<Probe messages={[msg({ id: 't1', streaming: true, text: 'Ho' })]} />)
    await rerender(<Probe messages={[msg({ id: 't1', streaming: true, text: 'Hola' })]} />, root)
    expect(read(root)).toBe('')
  })

  it('anuncia el texto completo en cuanto un mensaje NUEVO (no visto en el montaje) deja de estar en streaming', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 't1', streaming: false, text: 'Hola, ¿en qué ayudo?' })]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Hola, ¿en qué ayudo?')
  })

  it('Important #6 — ráfaga: dos mensajes completos nuevos en el mismo cambio de props se anuncian juntos, no se pierde el primero', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[
      msg({ id: 'a', text: 'Primero' }),
      msg({ id: 'b', text: 'Segundo' }),
    ]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Primero. Segundo')
  })

  it('no repite el anuncio de un mensaje ya anunciado en un cambio posterior', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 't1', text: 'Hola' })]} />, root)
    await rerender(<Probe messages={[msg({ id: 't1', text: 'Hola' }), msg({ id: 'u1', role: 'user', text: 'gracias' })]} />, root)
    expect(stripZeroWidth(read(root))).toBe('Hola')
  })

  it('Important #9 (ronda 2) — un mensaje nuevo con texto IDÉNTICO al último anunciado sigue mutando el string, para que el lector de pantalla lo re-anuncie', async () => {
    const root = await mount(<Probe messages={[]} />)
    await rerender(<Probe messages={[msg({ id: 'a', text: 'Un momento' })]} />, root)
    const first = read(root)
    expect(stripZeroWidth(first)).toBe('Un momento')

    await rerender(<Probe messages={[msg({ id: 'a', text: 'Un momento' }), msg({ id: 'b', text: 'Un momento' })]} />, root)
    const second = read(root)
    expect(stripZeroWidth(second)).toBe('Un momento') // el texto "hablado" es el mismo...
    expect(second).not.toBe(first) // ...pero el string completo mutó de verdad (el DOM cambió)
  })
})
