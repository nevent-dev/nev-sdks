import { describe, it, expect, vi, afterEach } from 'vitest'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import { ContactBlocks } from '../ContactBlocks'
import { MessageBubble } from '../MessageBubble'
import { STRINGS, StringsContext } from '../strings'
import type { WidgetContactBlock } from '../../contract/types'
import type { WidgetLocale } from '../../contract/locale'
import type { StoredMessage } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

expect.extend(axeMatchers)

const wa: WidgetContactBlock = { channel: 'WHATSAPP', value: '+34612345678', display: '+34 612 34 56 78', url: 'https://wa.me/34612345678' }
const tel: WidgetContactBlock = { channel: 'PHONE', value: '+34963123456', display: '+34 963 12 34 56', url: 'tel:+34963123456' }
const mail: WidgetContactBlock = { channel: 'EMAIL', value: 'atencion@tuclub.com', display: 'atencion@tuclub.com', url: 'mailto:atencion@tuclub.com' }

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'Siento lo del móvil. En MYA, los objetos perdidos se gestionan por WhatsApp:', // bodyText
    status: 'sent', seq: 1, streaming: false, createdAt: '2026-11-10T12:00:00.000Z', clientId: null, turnId: null,
    authorName: null, authorAvatarUrl: null, contactBlocks: [], ...overrides,
  }
}

function inLocale(locale: WidgetLocale, blocks: WidgetContactBlock[]) {
  return (
    <StringsContext.Provider value={STRINGS[locale]}>
      <ContactBlocks blocks={blocks} />
    </StringsContext.Provider>
  )
}

afterEach(cleanupMounted)

describe('ContactBlocks — textos del catálogo (nevent-work#15)', () => {
  const catalog: Record<WidgetLocale, { action: [string, string, string]; aria: [string, string, string] }> = {
    es: { action: ['Abrir WhatsApp', 'Llamar', 'Escribir un email'], aria: ['WhatsApp', 'Teléfono', 'Email'] },
    en: { action: ['Open WhatsApp', 'Call', 'Send an email'], aria: ['WhatsApp', 'Phone', 'Email'] },
    ca: { action: ['Obre WhatsApp', 'Truca', 'Envia un correu'], aria: ['WhatsApp', 'Telèfon', 'Correu electrònic'] },
    pt: { action: ['Abrir o WhatsApp', 'Ligar', 'Enviar email'], aria: ['WhatsApp', 'Telefone', 'Email'] },
  }

  for (const locale of ['es', 'en', 'ca', 'pt'] as const) {
    it(`${locale}: botón y aria del bloque por canal`, async () => {
      for (const [i, block] of [wa, tel, mail].entries()) {
        const root = await mount(inLocale(locale, [block]))
        const group = root.querySelector('.cblock')!
        expect(group.getAttribute('role')).toBe('group')
        expect(group.getAttribute('aria-label')).toBe(`${catalog[locale].aria[i]}: ${block.display}`)
        expect(root.querySelector('a.act')?.textContent).toBe(catalog[locale].action[i])
      }
    })
  }
})

describe('ContactBlocks — lo que se ve', () => {
  it('a la vista solo icono, display y botón: ni la palabra del canal ni el nombre de la derivación', async () => {
    const root = await mount(<ContactBlocks blocks={[tel]} />)
    const v = root.querySelector('.cblock .v')!
    expect(v.textContent).toBe('+34 963 12 34 56')
    expect(v.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('.cblock')!.textContent).toBe('+34 963 12 34 56Llamar')
    expect(root.textContent).not.toContain('Teléfono')
  })

  it('enlaces: wa.me en pestaña nueva sin opener; tel: y mailto: los abre el sistema', async () => {
    const root = await mount(<ContactBlocks blocks={[wa, tel, mail]} />)
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.act'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://wa.me/34612345678', 'tel:+34963123456', 'mailto:atencion@tuclub.com'])
    expect(links[0]!.getAttribute('target')).toBe('_blank')
    expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer')
    expect(links[1]!.hasAttribute('target')).toBe(false)
    expect(links[2]!.hasAttribute('target')).toBe(false)
  })

  it('un solo bloque: el botón se nombra por su texto, sin aria-label', async () => {
    const root = await mount(<ContactBlocks blocks={[wa]} />)
    expect(root.querySelector('a.act')!.hasAttribute('aria-label')).toBe(false)
  })

  it('dos o más bloques seguidos: el aria del botón lleva también el valor', async () => {
    const tel2: WidgetContactBlock = { channel: 'PHONE', value: '+34612000001', display: '+34 612 00 00 01', url: 'tel:+34612000001' }
    const root = await mount(<ContactBlocks blocks={[tel, tel2]} />)
    expect(Array.from(root.querySelectorAll('a.act')).map((a) => a.getAttribute('aria-label')))
      .toEqual(['Llamar, +34 963 12 34 56', 'Llamar, +34 612 00 00 01'])
  })

  it('sin bloques no pinta nada', async () => {
    const root = await mount(<ContactBlocks blocks={[]} />)
    expect(root.innerHTML).toBe('')
  })

  it('sin violaciones de axe con uno y con varios bloques', async () => {
    const one = await mount(<ContactBlocks blocks={[wa]} />)
    expect(await axe(one)).toHaveNoViolations()
    const several = await mount(<ContactBlocks blocks={[wa, tel, mail]} />)
    expect(await axe(several)).toHaveNoViolations()
  })
})

describe('MessageBubble con bloque de contacto', () => {
  it('mensaje del bot sin bloque: igual que siempre, sin .cblocks', async () => {
    const root = await mount(<MessageBubble message={msg()} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.bubble')).not.toBeNull()
    expect(root.querySelector('.cblocks')).toBeNull()
  })

  it('el bloque va bajo la burbuja y antes de la hora', async () => {
    const root = await mount(<MessageBubble message={msg({ contactBlocks: [wa] })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    const column = root.querySelector('.m > div:last-child')!
    expect(Array.from(column.children).map((c) => c.className)).toEqual(['bubble', 'cblocks', 'meta'])
  })

  it('mientras el turno sigue en streaming no se pinta el bloque', async () => {
    const root = await mount(<MessageBubble message={msg({ streaming: true, contactBlocks: [wa] })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.cblocks')).toBeNull()
  })

  it('texto vacío con bloque: no deja una burbuja vacía', async () => {
    const root = await mount(<MessageBubble message={msg({ text: '', contactBlocks: [wa] })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.bubble')).toBeNull()
    expect(root.querySelector('.cblock')).not.toBeNull()
  })

  it('un mensaje del usuario nunca pinta bloque', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', contactBlocks: [wa] })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.cblocks')).toBeNull()
  })
})
