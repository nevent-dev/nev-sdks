import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trapFocus, type FocusTrapHandle } from '../focus-trap'

function setUpPanel(): HTMLElement {
  const panel = document.createElement('section')
  panel.tabIndex = -1
  panel.innerHTML = `<button id="a">A</button><button id="b">B</button><button id="c">C</button>`
  document.body.appendChild(panel)
  return panel
}

describe('trapFocus', () => {
  let panel: HTMLElement
  let handle: FocusTrapHandle | null = null

  beforeEach(() => { panel = setUpPanel() })
  afterEach(() => {
    handle?.release() // idempotente — a salvo aunque el propio test ya lo haya liberado
    handle = null
    panel.remove()
  })

  it('Tab en el último foco-able vuelve al primero (wrap hacia adelante)', () => {
    panel.querySelector<HTMLElement>('#c')!.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('a')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Shift+Tab en el primero vuelve al último (wrap hacia atrás)', () => {
    panel.querySelector<HTMLElement>('#a')!.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('c')
  })

  it('Important #5 — Shift+Tab justo tras el autofocus inicial (foco en el propio contenedor, no en "a") envuelve al último, no se escapa del panel', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    expect(document.activeElement).toBe(panel) // autofocus enfoca el contenedor (tabindex=-1), no "a"
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('c')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Tab justo tras el autofocus inicial (foco en el contenedor) va al primero', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    panel.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('a')
  })

  it('Escape invoca onEscape y no mueve el foco por sí mismo', () => {
    const onEscape = vi.fn()
    handle = trapFocus(panel, { onEscape, autofocus: false })
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('autofocus:true enfoca el contenedor mismo (tabindex=-1), no un hijo', () => {
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: true })
    expect(document.activeElement).toBe(panel)
  })

  it('autofocus:false no mueve el foco al crear el trap (política móvil, Task 13)', () => {
    document.body.focus()
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    expect(document.activeElement).not.toBe(panel)
  })

  it('Important #5 — si el foco se sale del panel por cualquier vía (no solo Tab), se retrapea automáticamente', () => {
    const outside = document.createElement('button')
    outside.id = 'outside'
    document.body.appendChild(outside)
    handle = trapFocus(panel, { onEscape: vi.fn(), autofocus: false })
    outside.focus()
    expect(document.activeElement).toBe(panel)
    outside.remove()
  })

  it('release() quita los listeners de keydown y focusin', () => {
    const onEscape = vi.fn()
    handle = trapFocus(panel, { onEscape, autofocus: false })
    handle.release()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onEscape).not.toHaveBeenCalled()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside) // ya no se retrapea: el listener se liberó
    outside.remove()
  })
})
