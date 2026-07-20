import { describe, it, expect, vi, afterEach } from 'vitest'
import { Launcher } from '../Launcher'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('Launcher', () => {
  it('sin no leídos: no pinta badge; con no leídos: pinta el número (9+ si supera 9)', async () => {
    let root = await mount(<Launcher unreadCount={0} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')).toBeNull()
    await cleanupMounted()
    root = await mount(<Launcher unreadCount={3} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')?.textContent).toBe('3')
    await cleanupMounted()
    root = await mount(<Launcher unreadCount={15} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(root.querySelector('.badge')?.textContent).toBe('9+')
  })

  it('clicar el launcher llama a onOpen; conserva data-part=launcher (contrato del shell, Plan 1 shell.test.tsx)', async () => {
    const onOpen = vi.fn()
    const root = await mount(<Launcher unreadCount={0} autofocus={false} onOpen={onOpen} onResize={vi.fn()} />)
    const btn = root.querySelector<HTMLButtonElement>('[data-part=launcher]')!
    btn.click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('autofocus:true se enfoca a sí mismo al montar (retorno de foco tras cerrar el panel en desktop, spec §6)', async () => {
    const root = await mount(<Launcher unreadCount={0} autofocus={true} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(document.activeElement).toBe(root.querySelector('[data-part=launcher]'))
  })

  it('autofocus:false (p.ej. carga inicial, o cierre en móvil) no roba el foco', async () => {
    document.body.focus()
    await mount(<Launcher unreadCount={0} autofocus={false} onOpen={vi.fn()} onResize={vi.fn()} />)
    expect(document.activeElement).not.toBe(document.querySelector('[data-part=launcher]'))
  })
})
