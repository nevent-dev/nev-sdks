import { describe, it, expect, vi, afterEach } from 'vitest'
import { Welcome } from '../Welcome'
import { fixtureConfig } from '../../contract/fixtures'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Welcome', () => {
  it('pinta título, subtítulo y un chip por quick reply de la config', async () => {
    const root = await mount(<Welcome config={fixtureConfig()} onChip={vi.fn()} />)
    expect(root.querySelector('h3')?.textContent).toBe('Hola 👋 ¿en qué te ayudamos?')
    expect(root.querySelectorAll('.chip').length).toBe(4)
  })

  it('clicar un chip llama a onChip con su texto exacto', async () => {
    const onChip = vi.fn()
    const root = await mount(<Welcome config={fixtureConfig()} onChip={onChip} />)
    root.querySelectorAll<HTMLButtonElement>('.chip')[1]!.click()
    expect(onChip).toHaveBeenCalledWith('Horarios y artistas')
  })

  it('sin config.welcome: cae a copia ES genérica sin chips inventados', async () => {
    const configSinWelcome = { ...fixtureConfig() }
    delete configSinWelcome.welcome
    const root = await mount(<Welcome config={configSinWelcome} onChip={vi.fn()} />)
    expect((root.querySelector('h3')?.textContent ?? '').length).toBeGreaterThan(0)
    expect(root.querySelectorAll('.chip').length).toBe(0)
  })
})
