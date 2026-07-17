import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bootLoader } from '../index'
import { seal } from '../../protocol/envelope'
import type { ApiStub } from '../api-queue'

const SHELL_URL = 'https://widgets.test/shell.html'
const SHELL_ORIGIN = 'https://widgets.test'

function getApi(): ApiStub {
  return (window as Window & { NeventWidget?: ApiStub }).NeventWidget!
}

function fakeShellMessage(type: string, payload: unknown, instanceId: string, origin = SHELL_ORIGIN): void {
  const iframe = document.querySelector('iframe')!
  const ev = new MessageEvent('message', { data: seal(type, payload, instanceId), origin, source: iframe.contentWindow })
  window.dispatchEvent(ev)
}

function bootedInstanceId(): string {
  const iframe = document.querySelector('iframe')!
  return new URL(iframe.src).hash.slice(1)
}

beforeEach(() => {
  document.body.innerHTML = ''
  delete (window as Window & { NeventWidget?: ApiStub }).NeventWidget
})

describe('loader', () => {
  it('boot crea un único iframe sandboxed aunque se llame dos veces', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('boot', 'inst_demo_festival_01')
    const iframes = document.querySelectorAll('iframe')
    expect(iframes).toHaveLength(1)
    expect(iframes[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframes[0]!.src.startsWith(SHELL_URL)).toBe(true)
  })
  it('responde al ready del shell con init{installationId} hacia el origin exacto', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId())
    expect(post).toHaveBeenCalledTimes(1)
    const [env, target] = post.mock.calls[0]!
    expect(target).toBe(SHELL_ORIGIN)
    expect(env).toMatchObject({ ns: 'nevw', type: 'init', payload: { installationId: 'inst_demo_festival_01' } })
  })
  it('ignora mensajes de un origin no esperado', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    const post = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } })
    fakeShellMessage('ready', null, bootedInstanceId(), 'https://evil.example')
    expect(post).not.toHaveBeenCalled()
  })
  it('reemite opened a los listeners de on() y destroy limpia el DOM', () => {
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    const iframe = document.querySelector('iframe')!
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: vi.fn() } })
    const cb = vi.fn()
    getApi()('on', 'opened', cb)
    fakeShellMessage('opened', null, bootedInstanceId())
    expect(cb).toHaveBeenCalledTimes(1)
    getApi()('destroy')
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
  it('identify y reset son no-op con warning (reservados v1.1)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bootLoader(window, { shellUrl: SHELL_URL })
    getApi()('boot', 'inst_demo_festival_01')
    getApi()('identify', 'token-firmado')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('identify'))
    warn.mockRestore()
  })
})
