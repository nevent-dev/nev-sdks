import { describe, it, expect, afterEach } from 'vitest'
import { ConnectionBanner } from '../ConnectionBanner'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

describe('ConnectionBanner', () => {
  it('kind null: no renderiza nada', async () => {
    const root = await mount(<ConnectionBanner kind={null} />)
    expect(root.querySelector('.conn')).toBeNull()
  })
  it('kind reconnect: banner con role=status, sin cuenta atrás inventada (gap #3)', async () => {
    const root = await mount(<ConnectionBanner kind="reconnect" />)
    const conn = root.querySelector('.conn.reconnect')
    expect(conn?.getAttribute('role')).toBe('status')
    expect(conn?.textContent).not.toMatch(/\d+\s*s/)
  })
  it('kind offline: banner distinto, sin animación de spin', async () => {
    const root = await mount(<ConnectionBanner kind="offline" />)
    expect(root.querySelector('.conn.offline')).not.toBeNull()
    expect(root.querySelector('.conn.offline .spin')).toBeNull()
  })
})
