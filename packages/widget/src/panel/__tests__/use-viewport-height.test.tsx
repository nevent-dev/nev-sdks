import { describe, it, expect, afterEach } from 'vitest'
import { useViewportHeight } from '../use-viewport-height'
import { mount, rerender, cleanupMounted } from './test-utils'

function Probe({ heightPx }: { heightPx: number | null }) {
  useViewportHeight(heightPx)
  return null
}

afterEach(async () => {
  await cleanupMounted()
})

describe('useViewportHeight', () => {
  it('heightPx null (desktop): no fija la custom property', async () => {
    await mount(<Probe heightPx={null} />)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('')
  })

  it('heightPx numérico (móvil): fija --viewport-h en px', async () => {
    await mount(<Probe heightPx={640} />)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('640px')
  })

  it('un cambio de heightPx (p.ej. el teclado en pantalla abre) actualiza la custom property', async () => {
    const root = await mount(<Probe heightPx={640} />)
    await rerender(<Probe heightPx={420} />, root)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('420px')
  })

  it('volver a null (p.ej. cambio a desktop a mitad de sesión) quita la custom property', async () => {
    const root = await mount(<Probe heightPx={640} />)
    await rerender(<Probe heightPx={null} />, root)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('')
  })

  it('al desmontar el componente con heightPx aún numérico, el cleanup quita la custom property', async () => {
    await mount(<Probe heightPx={640} />)
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('640px')
    await cleanupMounted() // desmonta de verdad: ejecuta el cleanup del useEffect
    expect(document.documentElement.style.getPropertyValue('--viewport-h')).toBe('')
  })
})
