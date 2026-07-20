import { describe, it, expect, vi, afterEach } from 'vitest'
import { Composer } from '../Composer'
import { computeViewState } from '../view-state'
import { mount, cleanupMounted } from './test-utils'

const idleViewState = computeViewState({
  conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
  assistantName: 'Asistente de DEMO FEST', isStreaming: false,
})

afterEach(cleanupMounted)

async function mountComposer(props: Parameters<typeof Composer>[0]): Promise<{ root: HTMLElement; textarea: HTMLTextAreaElement }> {
  const root = await mount(<Composer {...props} />)
  return { root, textarea: root.querySelector('textarea') as HTMLTextAreaElement }
}

describe('Composer', () => {
  it('usa el placeholder del viewState', async () => {
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(textarea.placeholder).toBe('Escribe tu pregunta…')
  })

  it('Enter sin Shift envía el texto recortado y limpia el textarea', async () => {
    const onSend = vi.fn()
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = '  hola  '
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onSend).toHaveBeenCalledWith('hola')
    expect(textarea.value).toBe('')
  })

  it('Shift+Enter NO envía (deja insertar el salto de línea nativo)', async () => {
    const onSend = vi.fn()
    const { textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = 'hola'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('texto vacío o solo espacios: el botón enviar está disabled y Enter no llama a onSend', async () => {
    const onSend = vi.fn()
    const { root, textarea } = await mountComposer({ viewState: idleViewState, onSend, onStop: vi.fn() })
    textarea.value = '   '
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    expect(root.querySelector<HTMLButtonElement>('.send')!.disabled).toBe(true)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('composerDisabled (offline): textarea y botón enviar quedan disabled', async () => {
    const offlineViewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'offline', agentName: null, agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: false,
    })
    const { root, textarea } = await mountComposer({ viewState: offlineViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(textarea.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.send')!.disabled).toBe(true)
  })

  it('el botón detener solo aparece cuando showStopButton es true, y llama a onStop', async () => {
    const streamingViewState = computeViewState({
      conversationState: 'BOT_ACTIVE', connection: 'live', agentName: null, agentAvatarUrl: null,
      assistantName: 'Asistente de DEMO FEST', isStreaming: true,
    })
    const onStop = vi.fn()
    const { root: withStop } = await mountComposer({ viewState: streamingViewState, onSend: vi.fn(), onStop })
    withStop.querySelector<HTMLButtonElement>('.stopbtn')!.click()
    expect(onStop).toHaveBeenCalledTimes(1)

    const { root: withoutStop } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    expect(withoutStop.querySelector('.stopbtn')).toBeNull()
  })

  it('el botón adjuntar está siempre disabled con tooltip "Próximamente" (subida real es Plan 4)', async () => {
    const { root } = await mountComposer({ viewState: idleViewState, onSend: vi.fn(), onStop: vi.fn() })
    const attach = root.querySelector<HTMLButtonElement>('[aria-label="Adjuntar archivo"]')!
    expect(attach.disabled).toBe(true)
    expect(attach.title).toBe('Próximamente')
  })
})
