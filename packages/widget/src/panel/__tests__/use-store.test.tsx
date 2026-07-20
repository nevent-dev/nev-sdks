import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'preact/test-utils'
import { useStoreState } from '../use-store'
import { createMessageStore } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

function Probe({ store }: { store: ReturnType<typeof createMessageStore> }) {
  const state = useStoreState(store)
  return <div data-testid="count">{state.messages.length}</div>
}

afterEach(cleanupMounted)

describe('useStoreState', () => {
  it('lee el snapshot inicial y se re-renderiza cuando el store notifica', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe store={store} />)
    expect(root.querySelector('[data-testid=count]')?.textContent).toBe('0')
    await act(() => { store.addOptimistic('c1', 'hola') })
    expect(root.querySelector('[data-testid=count]')?.textContent).toBe('1')
  })
})
