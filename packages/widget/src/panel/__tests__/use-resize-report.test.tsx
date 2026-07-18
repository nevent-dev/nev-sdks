import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useResizeReport } from '../use-resize-report'
import { mount, cleanupMounted } from './test-utils'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: () => void
  constructor(cb: () => void) { this.cb = cb; FakeResizeObserver.instances.push(this) }
  observe(): void {}
  disconnect(): void {}
  trigger(): void { this.cb() }
}

function Probe({ onResize }: { onResize: (w: number, h: number) => void }) {
  useResizeReport(onResize)
  return null
}

describe('useResizeReport', () => {
  let originalRO: unknown
  let rootEl: HTMLElement

  beforeEach(() => {
    originalRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    FakeResizeObserver.instances = []
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver
    rootEl = document.createElement('div')
    rootEl.setAttribute('data-part', 'root')
    document.body.appendChild(rootEl)
    vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({ width: 430, height: 688 } as DOMRect)
  })
  afterEach(async () => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalRO
    rootEl.remove()
    await cleanupMounted()
  })

  it('Critical #2 — mide [data-part="root"] (nunca document.body) al montar, con números realistas (430×688, no 382×640)', async () => {
    const onResize = vi.fn()
    await mount(<Probe onResize={onResize} />)
    expect(onResize).toHaveBeenCalledWith(430, 688)
  })

  it('vuelve a reportar cuando ResizeObserver dispara (p.ej. el panel cambia de tamaño)', async () => {
    const onResize = vi.fn()
    await mount(<Probe onResize={onResize} />)
    onResize.mockClear()
    vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({ width: 104, height: 104 } as DOMRect)
    FakeResizeObserver.instances[0]!.trigger()
    expect(onResize).toHaveBeenCalledWith(104, 104)
  })
})
