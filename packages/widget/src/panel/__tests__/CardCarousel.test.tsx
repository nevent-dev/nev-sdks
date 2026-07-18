import { describe, it, expect, vi, afterEach } from 'vitest'
import { CardCarousel, type CardItem } from '../CardCarousel'
import { mount, cleanupMounted } from './test-utils'

afterEach(cleanupMounted)

const items: CardItem[] = [
  { id: '1', title: 'Abono 3 días', description: 'Acceso general · vie–dom', priceLabel: '89 €', imageVariant: 'brand', action: { kind: 'send_message', label: 'Ver abono', text: 'Quiero el abono 3 días' } },
  { id: '2', title: 'Abono VIP', description: 'Front stage + zona lounge', priceLabel: '149 €', imageVariant: 'sun', action: { kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' } },
]

describe('CardCarousel', () => {
  it('renderiza una card por item, con precio y acción como <button> real (no span, a diferencia del mock)', async () => {
    const root = await mount(<CardCarousel items={items} onAction={vi.fn()} />)
    const cards = root.querySelectorAll('.card')
    expect(cards.length).toBe(2)
    expect(cards[0]?.querySelector('.price')?.textContent).toBe('89 €')
    expect(cards[0]?.querySelector('.act')?.tagName).toBe('BUTTON')
  })

  it('acción send_message: onAction recibe la acción completa', async () => {
    const onAction = vi.fn()
    const root = await mount(<CardCarousel items={items} onAction={onAction} />)
    root.querySelectorAll<HTMLButtonElement>('.act')[0]!.click()
    expect(onAction).toHaveBeenCalledWith({ kind: 'send_message', label: 'Ver abono', text: 'Quiero el abono 3 días' })
  })

  it('acción open_https_url con URL https válida: onAction se llama', async () => {
    const onAction = vi.fn()
    const root = await mount(<CardCarousel items={items} onAction={onAction} />)
    root.querySelectorAll<HTMLButtonElement>('.act')[1]!.click()
    expect(onAction).toHaveBeenCalledWith({ kind: 'open_https_url', label: 'Ver abono', url: 'https://demofest.example/vip' })
  })

  it('acción open_https_url con protocolo hostil: onAction NUNCA se llama (spec §8)', async () => {
    const onAction = vi.fn()
    const hostile: CardItem[] = [{ id: '3', title: 'x', description: 'x', priceLabel: null, imageVariant: 'brand', action: { kind: 'open_https_url', label: 'Ir', url: 'javascript:alert(1)' } }]
    const root = await mount(<CardCarousel items={hostile} onAction={onAction} />)
    root.querySelector<HTMLButtonElement>('.act')!.click()
    expect(onAction).not.toHaveBeenCalled()
  })
})
