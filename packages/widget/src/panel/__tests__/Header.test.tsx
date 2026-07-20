import { describe, it, expect, vi, afterEach } from 'vitest'
import { Header } from '../Header'
import { computeViewState } from '../view-state'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Header', () => {
  it('estado idle: nombre/estado del assistant, sin pulse, icono de bot (no avatar de agente)', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onMinimize={vi.fn()} onClose={vi.fn()} />)
    expect(root.querySelector('.name')?.textContent).toBe('Asistente de DEMO FEST')
    expect(root.querySelector('.state')?.textContent).toBe('Respuesta al instante')
    expect(root.querySelector('.pulse')).toBeNull()
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.initials-avatar')).toBeNull()
    expect(root.querySelector('.state-ribbon')?.getAttribute('data-ribbon')).toBe('idle')
  })

  it('estado agent: avatar de iniciales del agente (nunca <img>, spec §8), punto "en línea" y nombre solo (gap #1)', async () => {
    const viewState = computeViewState({
      conversationState: 'AGENT_ACTIVE', connection: 'live', agentName: 'Laura',
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const root = await mount(<Header viewState={viewState} onMinimize={vi.fn()} onClose={vi.fn()} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
    expect(root.querySelector('.dot-live')).not.toBeNull()
    expect(root.querySelector('.pulse')).not.toBeNull()
    expect(root.querySelector('.name')?.textContent).toBe('Laura')
  })

  it('minimizar y cerrar disparan sus callbacks', async () => {
    const viewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const onMinimize = vi.fn()
    const onClose = vi.fn()
    const root = await mount(<Header viewState={viewState} onMinimize={onMinimize} onClose={onClose} />)
    root.querySelector<HTMLButtonElement>('[aria-label="Minimizar"]')!.click()
    root.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click()
    expect(onMinimize).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
