import { describe, it, expect, afterEach } from 'vitest'
import { renderMarkdown } from '../markdown'
import { mount, cleanupMounted } from './test-utils'

const md = async (text: string) => mount(<div id="md">{renderMarkdown(text)}</div>)

afterEach(cleanupMounted)

describe('renderMarkdown', () => {
  it('negrita **x** → <strong>, cursiva *x* → <em>', async () => {
    const root = await md('Hola **mundo** y *cursiva*')
    expect(root.querySelector('strong')?.textContent).toBe('mundo')
    expect(root.querySelector('em')?.textContent).toBe('cursiva')
    expect(root.querySelector('#md')?.textContent).toBe('Hola mundo y cursiva')
  })

  it('código inline `x` → <code> con su contenido SIEMPRE literal', async () => {
    const root = await md('usa `a<b>` para comparar')
    const code = root.querySelector('code')
    expect(code?.textContent).toBe('a<b>')
    expect(code?.querySelector('b')).toBeNull()
  })

  it('enlace [label](https://…) → <a> con target _blank y rel noopener', async () => {
    const root = await md('visita [Nevent](https://nevent.ai) hoy')
    const a = root.querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://nevent.ai')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect(a?.getAttribute('rel')).toContain('noopener')
    expect(a?.textContent).toBe('Nevent')
  })

  it('esquemas no http(s) NUNCA producen enlace — quedan como texto literal', async () => {
    const root = await md('[x](javascript:alert(1)) y [y](data:text/html;base64,xx)')
    expect(root.querySelectorAll('a').length).toBe(0)
    expect(root.querySelector('#md')?.textContent).toContain('[x](javascript:alert(1))')
  })

  it('HTML embebido queda como texto literal — jamás se interpreta (XSS)', async () => {
    const hostile = 'antes <img src=x onerror="window.__pwned=true"> después'
    const root = await md(hostile)
    expect(root.querySelector('#md img')).toBeNull()
    expect(root.querySelector('#md')?.textContent).toBe(hostile)
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('líneas "- x" consecutivas → una única <ul> con sus <li>', async () => {
    const root = await md('Opciones:\n- primera\n- **segunda**\n- tercera')
    const ul = root.querySelectorAll('ul')
    expect(ul.length).toBe(1)
    const items = root.querySelectorAll('li')
    expect(items.length).toBe(3)
    expect(items[1]?.querySelector('strong')?.textContent).toBe('segunda')
  })

  it('líneas "1. x" consecutivas → <ol> con sus <li>', async () => {
    const root = await md('1. uno\n2. dos')
    expect(root.querySelectorAll('ol').length).toBe(1)
    expect(root.querySelectorAll('ol li').length).toBe(2)
  })

  it('saltos de línea entre líneas de texto → <br>; los bloques de lista no necesitan <br> adyacente', async () => {
    const root = await md('a\nb')
    expect(root.querySelectorAll('br').length).toBe(1)
    const root2 = await md('intro:\n- a\nfin')
    expect(root2.querySelector('#md')?.textContent).toContain('fin')
  })

  it('encabezados "## Título" → línea en negrita', async () => {
    const root = await md('## Horarios\ntexto')
    expect(root.querySelector('strong.md-h')?.textContent).toBe('Horarios')
  })

  it('markdown a medio llegar en streaming (token sin cerrar) queda literal, sin romper', async () => {
    const root = await md('esto es **negri')
    expect(root.querySelector('strong')).toBeNull()
    expect(root.querySelector('#md')?.textContent).toBe('esto es **negri')
  })
})
