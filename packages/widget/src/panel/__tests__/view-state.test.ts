import { describe, it, expect } from 'vitest'
import { computeViewState, type ViewStateInput } from '../view-state'

const base: ViewStateInput = {
  conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
  assistantName: 'Asistente de DEMO FEST', isStreaming: false,
}

describe('computeViewState — conversationPhase es SIEMPRE la fase dictada por el servidor (Critical #1)', () => {
  it('idle: BOT_ACTIVE sin streaming', () => {
    const v = computeViewState(base)
    expect(v.conversationPhase).toBe('idle')
    expect(v.headerName).toBe('Asistente de DEMO FEST')
    expect(v.headerStatus).toBe('Respuesta al instante')
    expect(v.ribbon).toBe('idle')
  })

  it('idle + streaming: la fase sigue idle, streaming solo afecta ribbon/botón/estado de cabecera', () => {
    const v = computeViewState({ ...base, isStreaming: true })
    expect(v.conversationPhase).toBe('idle')
    expect(v.ribbon).toBe('bot-streaming')
    expect(v.headerStatus).toBe('Escribiendo…')
    expect(v.showStopButton).toBe(true)
  })

  it('waiting: ESCALATED_WAITING → fase waiting, cabecera neutral "El equipo" (gap #1, nunca assistantName)', () => {
    const v = computeViewState({ ...base, conversationState: 'ESCALATED_WAITING' })
    expect(v.conversationPhase).toBe('waiting')
    expect(v.headerName).toBe('El equipo')
    expect(v.headerStatus).toBe('El equipo te atenderá en breve')
    expect(v.headerPulse).toBe('wait')
    expect(v.composerPlaceholder).toBe('Escribe al equipo…')
  })

  it('CRÍTICO — ESCALATED_WAITING + offline: la fase SIGUE siendo waiting (WaitingCard no desaparece), solo cambia conexión/banner', () => {
    const v = computeViewState({ ...base, conversationState: 'ESCALATED_WAITING', connection: 'offline' })
    expect(v.conversationPhase).toBe('waiting')
    expect(v.connectionState).toBe('offline')
    expect(v.connectionBanner).toBe('offline')
    expect(v.composerDisabled).toBe(true)
  })

  it('agent: AGENT_ACTIVE + agentName → cabecera = SOLO el nombre del agente (gap #1, nunca "Laura · Asistente de X")', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.headerName).toBe('Laura')
    expect(v.headerStatus).toBe('En línea ahora')
    expect(v.headerPulse).toBe('live')
    expect(v.composerPlaceholder).toBe('Escribe a Laura…')
    expect(v.showAgentAvatar).toBe(true)
  })

  it('AGENT_ACTIVE sin agentName aún (agent.joined no ha llegado): cabecera neutral, sin avatar de agente', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: null })
    expect(v.headerName).toBe('El equipo')
    expect(v.showAgentAvatar).toBe(false)
  })

  // Foto del agente: headerAvatarUrl sigue la MISMA condición que showAgentAvatar
  // (fase agent + agentName conocido) — nunca se filtra fuera de esa fase, aunque
  // el store todavía conserve un agentAvatarUrl residual de una fase anterior.
  it('agent: AGENT_ACTIVE + agentName + agentAvatarUrl → headerAvatarUrl expone la URL', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', agentAvatarUrl: 'https://res.nevent.es/agents/laura.jpg' })
    expect(v.headerAvatarUrl).toBe('https://res.nevent.es/agents/laura.jpg')
  })

  it('agent: AGENT_ACTIVE + agentName sin agentAvatarUrl (agente sin foto) → headerAvatarUrl null', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', agentAvatarUrl: null })
    expect(v.headerAvatarUrl).toBeNull()
  })

  it('fuera de fase agent, headerAvatarUrl es null aunque el store conserve un agentAvatarUrl residual', () => {
    const v = computeViewState({ ...base, conversationState: 'RESOLVED', agentName: 'Laura', agentAvatarUrl: 'https://res.nevent.es/agents/laura.jpg' })
    expect(v.headerAvatarUrl).toBeNull()
  })

  it('CRÍTICO — AGENT_ACTIVE + reconnecting: la fase SIGUE siendo agent (cabecera/avatar no desaparecen), solo se superpone el banner', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', connection: 'reconnecting' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.headerName).toBe('Laura')
    expect(v.showAgentAvatar).toBe(true)
    expect(v.connectionBanner).toBe('reconnect')
    expect(v.ribbon).toBe('reconnect') // la cinta SÍ refleja la conexión — es visual, no gobierna contenido
  })

  it('resolved: RESOLVED → cabecera neutral', () => {
    const v = computeViewState({ ...base, conversationState: 'RESOLVED' })
    expect(v.conversationPhase).toBe('resolved')
    expect(v.headerName).toBe('El equipo')
    expect(v.headerStatus).toBe('Conversación resuelta')
  })

  it('CRÍTICO — streaming nunca oculta una fase de servidor más reciente: RESOLVED + isStreaming true mantiene la fase resolved', () => {
    const v = computeViewState({ ...base, conversationState: 'RESOLVED', isStreaming: true })
    expect(v.conversationPhase).toBe('resolved')
  })

  it('polling se trata visualmente igual que reconnecting en ribbon/banner, sin tocar la fase', () => {
    const v = computeViewState({ ...base, conversationState: 'AGENT_ACTIVE', agentName: 'Laura', connection: 'polling' })
    expect(v.conversationPhase).toBe('agent')
    expect(v.ribbon).toBe('reconnect')
    expect(v.connectionBanner).toBe('reconnect')
  })

  it('offline: prioridad visual sobre streaming en el ribbon, pero el botón detener sigue disponible', () => {
    const v = computeViewState({ ...base, connection: 'offline', isStreaming: true, conversationState: 'ESCALATED_WAITING' })
    expect(v.ribbon).toBe('offline')
    expect(v.connectionBanner).toBe('offline')
    expect(v.composerDisabled).toBe(true)
    expect(v.showStopButton).toBe(true)
  })

  it('conversationState null (sesión recién creada, snapshot aún no llega): fase idle', () => {
    const v = computeViewState({ ...base, conversationState: null })
    expect(v.conversationPhase).toBe('idle')
  })
})
