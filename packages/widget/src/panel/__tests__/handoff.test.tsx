import { describe, it, expect, vi, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { WaitingCard, AgentJoinedSysline, TypingDots, ResolvedCard, NewConversationCard } from '../handoff'
import { mount, rerender, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('WaitingCard', () => {
  it('sin props (gap #1: sin nombre de tenant) — no inventa una cifra de ETA (gap #2) ni un nombre', async () => {
    const root = await mount(<WaitingCard />)
    expect(root.textContent).not.toMatch(/\d+\s*min/)
    expect(root.querySelector('.ttl')?.textContent).toBe('Te pasamos con el equipo')
  })
})

describe('AgentJoinedSysline', () => {
  it('usa el avatar de iniciales, nunca <img> (spec §8)', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })
  it('el texto incluye el nombre del agente', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" />)
    expect(root.textContent).toContain('Laura')
    expect(root.textContent).toContain('se ha unido')
  })
})

describe('TypingDots', () => {
  it('expone una alternativa textual para lectores de pantalla (role=status)', async () => {
    const root = await mount(<TypingDots />)
    const status = root.querySelector('[role=status]')
    expect(status?.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('ResolvedCard', () => {
  it('Important #8 gap#5 — sin onFeedback (panel integrado, Task 13): NO renderiza los botones de feedback (nunca finge un éxito local)', async () => {
    const root: HTMLElement = await mount(<ResolvedCard agentName="Laura" /> as VNode)
    expect(root.querySelector('.feedback')).toBeNull()
    expect(root.querySelector('.ttl')?.textContent).toBe('Conversación resuelta')
  })
  it('con onFeedback (solo el harness de fixtures, Task 16): los botones llaman a onFeedback con up/down y marcan aria-pressed', async () => {
    const onFeedback = vi.fn()
    const root = await mount(<ResolvedCard agentName="Laura" onFeedback={onFeedback} />)
    const up = root.querySelector<HTMLButtonElement>('[aria-label="Valorar positivamente"]')!
    up.click()
    // El click dispara useState fuera de act() (evento DOM nativo, no envuelto
    // por mount()); preact difiere el commit a un microtask. rerender() (ya
    // usado en MessageList.test.tsx) fuerza el flush de esa cola pendiente
    // antes de leer el DOM — sin esto aria-pressed queda con el valor previo.
    await rerender(<ResolvedCard agentName="Laura" onFeedback={onFeedback} />, root)
    expect(onFeedback).toHaveBeenCalledWith('up')
    expect(up.getAttribute('aria-pressed')).toBe('true')
  })
  it('sin agentName (edge: resuelto sin handoff), no rompe y no muestra "undefined"', async () => {
    const root = await mount(<ResolvedCard agentName={null} />)
    expect(root.textContent).not.toContain('undefined')
  })
})

// Task W4 — recuperación de sesión muerta: se muestra tras un re-bootstrap
// silencioso cuyo cliente nuevo NO resumió la conversación anterior (ver
// message-store.ts#resetForNewConversation), únicamente cuando había algo
// que perder. Mismo patrón que ResolvedCard/WaitingCard (arriba): sin props,
// sin cifras ni datos inventados.
describe('NewConversationCard', () => {
  it('título y cuerpo exactos (sentence case)', async () => {
    const root = await mount(<NewConversationCard />)
    expect(root.querySelector('.ttl')?.textContent).toBe('Conversación nueva')
    expect(root.querySelector('.dsc')?.textContent).toBe('La conversación anterior expiró. Cuéntanos en qué te ayudamos.')
  })
  it('role=status, igual que el resto de tarjetas de sistema (se anuncia a lectores de pantalla)', async () => {
    const root = await mount(<NewConversationCard />)
    expect(root.querySelector('[role=status]')).not.toBeNull()
  })
})
