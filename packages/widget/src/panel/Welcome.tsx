import type { WidgetConfig } from '../contract/types'

const DEFAULT_WELCOME = {
  title: 'Hola 👋 ¿en qué te ayudamos?',
  subtitle: 'Escríbenos y te respondemos al momento.',
  quickReplies: [] as string[],
}

export interface WelcomeProps {
  config: WidgetConfig
  onChip: (text: string) => void
}

export function Welcome({ config, onChip }: WelcomeProps) {
  const welcome = config.welcome ?? DEFAULT_WELCOME
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
