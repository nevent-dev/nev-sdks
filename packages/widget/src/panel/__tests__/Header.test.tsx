import { describe, it, expect, vi, afterEach } from 'vitest'
import { Header } from '../Header'
import { computeViewState } from '../view-state'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Header', () => {
  it('estado idle: nombre/estado del assistant, sin pulse, icono de bot (no avatar de agente)', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onClose={vi.fn()} />)
    expect(root.querySelector('.name')?.textContent).toBe('Asistente de DEMO FEST')
    expect(root.querySelector('.state')?.textContent).toBe('Respuesta al instante')
    expect(root.querySelector('.pulse')).toBeNull()
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.initials-avatar')).toBeNull()
    expect(root.querySelector('.state-ribbon')?.getAttribute('data-ribbon')).toBe('idle')
  })

  it('estado agent sin avatarUrl: avatar de iniciales del agente, punto "en línea" y nombre solo (gap #1)', async () => {
    const viewState = computeViewState({
      conversationState: 'AGENT_ACTIVE', connection: 'live', agentName: 'Laura', agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onClose={vi.fn()} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
    expect(root.querySelector('.dot-live')).not.toBeNull()
    expect(root.querySelector('.pulse')).not.toBeNull()
    expect(root.querySelector('.name')?.textContent).toBe('Laura')
  })

  // Foto del agente: cuando el store trae agentAvatarUrl (nuestra CDN), la
  // cabecera pinta la foto real en vez de las iniciales.
  it('estado agent con avatarUrl: pinta la foto real del agente en la cabecera', async () => {
    const viewState = computeViewState({
      conversationState: 'AGENT_ACTIVE', connection: 'live', agentName: 'Laura', agentAvatarUrl: 'https://res.nevent.es/agents/laura.jpg',
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onClose={vi.fn()} />)
    const img = root.querySelector('.avatar img.agent-avatar-img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
    expect(root.querySelector('.initials-avatar')).toBeNull()
    expect(root.querySelector('.dot-live')).not.toBeNull()
  })

  it('sin agente humano + logoUrl: pinta el logo del tenant en vez del BotIcon', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false, logoUrl: 'https://res.nevent.es/tenants/demo-fest/logo.png',
    })
    const root = await mount(<Header viewState={viewState} onClose={vi.fn()} />)
    const img = root.querySelector('.avatar img.bot-logo-img')
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/tenants/demo-fest/logo.png')
    expect(root.querySelector('svg[data-icon=bot]')).toBeNull()
  })

  it('con agente humano + logoUrl seteado: sigue pintando AgentAvatar, el logo del bot no se cuela', async () => {
    const viewState = computeViewState({
      conversationState: 'AGENT_ACTIVE', connection: 'live', agentName: 'Laura', agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false, logoUrl: 'https://res.nevent.es/tenants/demo-fest/logo.png',
    })
    const root = await mount(<Header viewState={viewState} onClose={vi.fn()} />)
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
    expect(root.querySelector('img.bot-logo-img')).toBeNull()
  })

  it('minimizar y cerrar disparan sus callbacks', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const onClose = vi.fn()
    const root = await mount(<Header viewState={viewState} onClose={onClose} />)
    // Un único control de salida (patrón messenger): la X colapsa; minimizar ya no existe.
    expect(root.querySelector('[aria-label="Minimizar"]')).toBeNull()
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
