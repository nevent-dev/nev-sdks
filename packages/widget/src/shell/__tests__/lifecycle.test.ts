import { describe, it, expect, vi } from 'vitest'
import { bindPageLifecycle } from '../lifecycle'

describe('bindPageLifecycle', () => {
  it('maps freeze/offline/hidden → onSuspend and resume/pageshow/online/visible → onResume', () => {
    const onSuspend = vi.fn()
    const onResume = vi.fn()
    const unbind = bindPageLifecycle(window, { onSuspend, onResume })

    window.dispatchEvent(new Event('freeze'))
    window.dispatchEvent(new Event('offline'))
    expect(onSuspend).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('resume'))
    window.dispatchEvent(new Event('pageshow'))
    window.dispatchEvent(new Event('online'))
    expect(onResume).toHaveBeenCalledTimes(3)

    unbind()
    window.dispatchEvent(new Event('freeze'))
    window.dispatchEvent(new Event('online'))
    expect(onSuspend).toHaveBeenCalledTimes(2)
    expect(onResume).toHaveBeenCalledTimes(3)
  })

  it('uses document.visibilityState for visibilitychange', () => {
    const onSuspend = vi.fn()
    const onResume = vi.fn()
    const unbind = bindPageLifecycle(window, { onSuspend, onResume })
    const spy = vi.spyOn(document, 'visibilityState', 'get')

    spy.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onSuspend).toHaveBeenCalledTimes(1)

    spy.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onResume).toHaveBeenCalledTimes(1)

    spy.mockRestore()
    unbind()
  })
})
