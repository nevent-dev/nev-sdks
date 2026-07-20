import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { BotIcon, AgentInitialsAvatar, AgentAvatar } from '../icons'
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

describe('AgentAvatar', () => {
  it('con avatarUrl: pinta la foto real del agente (nuestra CDN), no iniciales', async () => {
    const root = await mount(<AgentAvatar name="Laura" avatarUrl="https://res.nevent.es/agents/laura.jpg" />)
    const img = root.querySelector('img.agent-avatar-img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })

  it('la <img> lleva referrerpolicy=no-referrer y alt vacío (decorativa, el nombre lo anuncia el texto que la acompaña)', async () => {
    const root = await mount(<AgentAvatar name="Laura" avatarUrl="https://res.nevent.es/agents/laura.jpg" />)
    const img = root.querySelector('img')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('avatarUrl null: cae directamente a AgentInitialsAvatar, sin intentar pintar <img>', async () => {
    const root = await mount(<AgentAvatar name="Laura" avatarUrl={null} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('avatarUrl undefined (drift de contrato, backend sin desplegar el campo): también cae a iniciales', async () => {
    const root = await mount(<AgentAvatar name="Laura" avatarUrl={undefined} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  it('si la imagen falla al cargar (CDN caída, avatar borrado), cae a AgentInitialsAvatar en vez de dejar un hueco roto', async () => {
    const root = await mount(<AgentAvatar name="Laura" avatarUrl="https://res.nevent.es/agents/broken.jpg" />)
    const img = root.querySelector('img')!
    await act(() => { img.dispatchEvent(new Event('error')) })
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })
})
