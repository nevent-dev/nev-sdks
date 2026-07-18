import { isSafeHttpsUrl } from './theme'

export type CardAction =
  | { kind: 'send_message'; label: string; text: string }
  | { kind: 'open_https_url'; label: string; url: string }

export interface CardItem {
  id: string
  title: string
  description: string
  priceLabel: string | null
  imageVariant: 'brand' | 'sun'
  action: CardAction
}

export interface CardCarouselProps {
  items: CardItem[]
  onAction: (action: CardAction) => void
}

export function CardCarousel({ items, onAction }: CardCarouselProps) {
  const handle = (action: CardAction): void => {
    if (action.kind === 'open_https_url' && !isSafeHttpsUrl(action.url)) return
    onAction(action)
  }
  return (
    <div class="cards">
      {items.map((item) => (
        <div class="card" key={item.id}>
          <div class={`img${item.imageVariant === 'sun' ? ' sun' : ''}`}>
            {item.priceLabel !== null && <span class="price">{item.priceLabel}</span>}
          </div>
          <div class="bd">
            <div class="t">{item.title}</div>
            <div class="d">{item.description}</div>
            {/* <button>, no el <span class="act"> del mock — sin teclado
                accesible en origen (spec §6: navegable 100% por teclado). */}
            <button class="act" onClick={() => handle(item.action)}>{item.action.label}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
