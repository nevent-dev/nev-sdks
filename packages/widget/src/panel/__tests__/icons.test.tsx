import { describe, it, expect, afterEach } from 'vitest'
import { BotIcon, AgentInitialsAvatar } from '../icons'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('BotIcon', () => {
  it('renderiza un svg decorativo marcado aria-hidden', async () => {
    const root = await mount(<BotIcon />)
    const svg = root.querySelector('svg[data-icon=bot]')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('AgentInitialsAvatar', () => {
  it('pinta la inicial en mayúscula del nombre, sin <img> (spec §8: sin avatares externos en v1)', async () => {
    const root = await mount(<AgentInitialsAvatar name="Laura" />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('nombre vacío o con solo espacios: cae a "?" en vez de una cadena vacía', async () => {
    const root = await mount(<AgentInitialsAvatar name="   " />)
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('?')
  })

  it('nombre undefined (drift de contrato, Task 17): cae a "?" en vez de lanzar en .trim()', async () => {
    const root = await mount(<AgentInitialsAvatar name={undefined} />)
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('?')
  })

  it('es decorativo para lectores de pantalla (aria-hidden): el nombre real ya lo anuncia el texto de la cabecera/sysline que lo acompaña', async () => {
    const root = await mount(<AgentInitialsAvatar name="Laura" />)
    expect(root.querySelector('.initials-avatar')?.getAttribute('aria-hidden')).toBe('true')
  })
})
