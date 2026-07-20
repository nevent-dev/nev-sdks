import { describe, it, expect, afterEach } from 'vitest'
import { FileBubble } from '../FileBubble'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('FileBubble', () => {
  it('con progressPercent: fija --progress vía setProperty, nunca un atributo style="width:..."', async () => {
    const root = await mount(<FileBubble fileName="entrada.pdf" fileSizeLabel="184 KB · subiendo…" progressPercent={64} variant="user" />)
    expect(root.querySelector('.fn')?.textContent).toBe('entrada.pdf')
    const bar = root.querySelector<HTMLElement>('.bar i')
    expect(bar?.style.getPropertyValue('--progress')).toBe('64%')
    expect(bar?.getAttribute('style')).not.toContain('width')
  })

  it('progressPercent null (ya enviado): no muestra barra', async () => {
    const root = await mount(<FileBubble fileName="entrada.pdf" fileSizeLabel="184 KB" progressPercent={null} variant="bot" />)
    expect(root.querySelector('.bar')).toBeNull()
  })

  it('recorta un progressPercent fuera de rango a [0,100]', async () => {
    const root = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={140} variant="user" />)
    expect(root.querySelector<HTMLElement>('.bar i')?.style.getPropertyValue('--progress')).toBe('100%')
  })

  it('ningún nodo del componente lleva el atributo style (Critical #4: CSP sin style-src-attr unsafe-inline)', async () => {
    const root = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={50} variant="user" />)
    const withStyleAttr = Array.from(root.querySelectorAll('*')).filter((el) => el.hasAttribute('style') && el.getAttribute('style') !== '')
    // El único nodo con `style` es el propio `<i>` de la barra, y solo porque
    // setProperty lo escribe vía CSSOM (permitido, ver Task 2/theme.ts) —
    // nunca un `style="width:64%"` de cadena interpolada por JSX.
    expect(withStyleAttr.length).toBeLessThanOrEqual(1)
  })

  it('Important #8 (ronda 2) — variant realmente cambia la clase raíz: "user" pinta sobre el degradado de marca, "bot" no', async () => {
    const user = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={null} variant="user" />)
    expect(user.querySelector('.file')?.classList.contains('file-user')).toBe(true)
    const bot = await mount(<FileBubble fileName="a.pdf" fileSizeLabel="1 KB" progressPercent={null} variant="bot" />)
    expect(bot.querySelector('.file')?.classList.contains('file-user')).toBe(false)
  })
})
