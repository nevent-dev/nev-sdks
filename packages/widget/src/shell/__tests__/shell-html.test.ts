import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('shell.html', () => {
  it('desactiva la detección de teléfonos de Safari de iOS (nevent-work#15)', () => {
    const html = readFileSync(resolve(__dirname, '../../../shell.html'), 'utf-8')
    expect(html).toMatch(/<meta name="format-detection" content="telephone=no">/)
  })
})
