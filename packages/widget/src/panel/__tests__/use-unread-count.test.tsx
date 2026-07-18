import { describe, it, expect, afterEach } from 'vitest'
import { useUnreadCount } from '../use-unread-count'
import { createMessageStore, type StoreState } from '../../store/message-store'
import { mount, rerender, cleanupMounted } from './test-utils'

function Probe({ state, isOpen }: { state: StoreState; isOpen: boolean }) {
  const count = useUnreadCount(state, isOpen)
  return <div data-testid="unread">{count}</div>
}

function readCount(root: HTMLElement): string {
  return root.querySelector('[data-testid=unread]')?.textContent ?? ''
}

afterEach(cleanupMounted)

describe('useUnreadCount', () => {
  it('cuenta mensajes bot/agent completos llegados con el panel cerrado, y se resetea al abrir', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'hola'); store.finishBotTurn('t1', 'msg_1')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')

    store.beginBotTurn('t2'); store.finishBotTurn('t2', 'msg_2')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('2')

    await rerender(<Probe state={store.getState()} isOpen={true} />, root)
    expect(readCount(root)).toBe('0')

    store.beginBotTurn('t3'); store.finishBotTurn('t3', 'msg_3')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('1')
  })

  it('no cuenta un turno de bot mientras sigue en streaming', async () => {
    const store = createMessageStore(() => '2026-07-18T10:00:00.000Z')
    const root = await mount(<Probe state={store.getState()} isOpen={false} />)
    store.beginBotTurn('t1'); store.appendBotDelta('t1', 'aún escribiendo')
    await rerender(<Probe state={store.getState()} isOpen={false} />, root)
    expect(readCount(root)).toBe('0')
  })
})
