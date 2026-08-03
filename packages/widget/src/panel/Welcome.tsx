import type { WidgetConfig } from '../contract/types'
import { useStrings } from './strings'

export interface WelcomeProps {
  config: WidgetConfig
  onChip: (text: string) => void
}

export function Welcome({ config, onChip }: WelcomeProps) {
  const strings = useStrings()
  // Defaults localizados (Plan 4) — el welcome PERSONALIZADO de la
  // instalación (config.welcome) sigue mandando sobre estos; solo se
  // localiza la copia genérica cuando el tenant no configuró la suya.
  const welcome = config.welcome ?? { title: strings.welcomeTitle, subtitle: strings.welcomeSubtitle, quickReplies: [] as string[] }
  return (
    <div class="welcome">
      <h3>{welcome.title}</h3>
      <p>{welcome.subtitle}</p>
      {welcome.quickReplies.length > 0 && (
        <div class="chips">
          {welcome.quickReplies.map((text) => (
            <button key={text} type="button" class="chip" onClick={() => onChip(text)}>{text}</button>
          ))}
        </div>
      )}
    </div>
  )
}
