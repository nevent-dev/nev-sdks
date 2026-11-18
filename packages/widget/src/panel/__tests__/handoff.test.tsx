import { describe, it, expect, vi, afterEach } from 'vitest'
import type { VNode } from 'preact'
import { WaitingCard, AgentJoinedSysline, TypingDots, ResolvedCard, NewConversationCard } from '../handoff'
import { mount, cleanupMounted } from './test-utils'
import { TeamSurvey } from '../FeedbackCards'

afterEach(cleanupMounted)

describe('WaitingCard', () => {
  it('sin props (gap #1: sin nombre de tenant) — no inventa una cifra de ETA (gap #2) ni un nombre', async () => {
    const root = await mount(<WaitingCard />)
    expect(root.textContent).not.toMatch(/\d+\s*min/)
    expect(root.querySelector('.ttl')?.textContent).toBe('Te pasamos con el equipo')
  })
})

describe('AgentJoinedSysline', () => {
  it('sin agentAvatarUrl: usa el avatar de iniciales, sin <img>', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" agentAvatarUrl={null} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })
  // Foto del agente: coherencia con Header/MessageBubble aunque este
  // componente no esté montado hoy en el panel integrado (ver Panel.tsx).
  it('con agentAvatarUrl: pinta la foto real del agente', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" />)
    const img = root.querySelector('img.agent-avatar-img')
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })
  it('el texto incluye el nombre del agente', async () => {
    const root = await mount(<AgentJoinedSysline agentName="Laura" agentAvatarUrl={null} />)
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
  it('Important #8 gap#5 — sin encuesta, conserva la tarjeta de conversación resuelta', async () => {
    const root: HTMLElement = await mount(<ResolvedCard agentName="Laura" /> as VNode)
    expect(root.querySelector('.feedback')).toBeNull()
    expect(root.querySelector('.ttl')?.textContent).toBe('Conversación resuelta')
    expect(root.textContent).toContain('Laura resolvió tu consulta.')
  })
  it('renders the team rating when the survey is pending and records a rating immediately', async () => {
    const onRate = vi.fn(async () => {})
    const root = await mount(
      <ResolvedCard agentName="Laura" feedbackEnabled>
        <TeamSurvey survey={{ status: 'PENDING', value: null, locale: 'es', expiresAt: null }} onRate={onRate} onUnavailable={vi.fn()} />
      </ResolvedCard>
    )
    const choices = [...root.querySelectorAll<HTMLButtonElement>('.feedback button')]
    expect(choices.map(button => button.textContent?.trim())).toEqual(['😊 Bien', '😐 Regular', '😞 Mal'])
    choices[1]?.click()
    expect(onRate).toHaveBeenCalledWith(2)
    expect(root.textContent).toContain('Laura ha resuelto tu consulta.')
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
