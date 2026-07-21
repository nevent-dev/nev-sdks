import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageBubble } from '../MessageBubble'
import type { StoredMessage } from '../../store/message-store'
import { mount, cleanupMounted } from './test-utils'

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1', role: 'bot', text: 'Hola', status: 'sent', seq: 1, streaming: false,
    createdAt: '2026-07-18T14:02:00.000Z', clientId: null, turnId: null, authorName: null, authorAvatarUrl: null, ...overrides,
  }
}

afterEach(cleanupMounted)

describe('MessageBubble', () => {
  it('mensaje de usuario: alineado a la derecha, sin avatar, con hora y check de enviado', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'sent' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.m.user')).not.toBeNull()
    expect(root.querySelector('.b-avatar')).toBeNull()
    expect(root.querySelector('.meta')?.textContent).toContain('14:02')
  })

  it('renderiza el texto como nodo de texto plano — nunca interpreta HTML/markdown embebido (XSS)', async () => {
    const hostile = '<img src=x onerror="window.__pwned=true">'
    const root = await mount(<MessageBubble message={msg({ role: 'bot', text: hostile })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.bubble img')).toBeNull()
    expect(root.querySelector('.bubble')?.textContent).toBe(hostile)
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('bot en streaming CON texto: añade el cursor parpadeante marcado aria-hidden', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: 'Escribiendo' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    const caret = root.querySelector('.stream-caret')
    expect(caret).not.toBeNull()
    expect(caret?.getAttribute('aria-hidden')).toBe('true')
  })

  it('streaming sin texto aún (turno recién empezado): muestra el indicador "pensando" en vez de una burbuja vacía (spec §2)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot', streaming: true, text: '' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.thinking')).not.toBeNull()
    expect(root.querySelector('.thinking')?.textContent).toContain('Pensando')
    expect(root.querySelector('.bubble')).toBeNull()
  })

  it('mensaje fallido: muestra "No enviado" y un botón Reintentar que llama onRetry con el clientId', async () => {
    const onRetry = vi.fn()
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'failed', clientId: 'c1' })} agentName={null} agentAvatarUrl={null} onRetry={onRetry} compact={false} />)
    expect(root.querySelector('.meta .fail')?.textContent).toBe('No enviado')
    const retry = root.querySelector<HTMLButtonElement>('button.retry')
    expect(retry).not.toBeNull()
    expect(retry?.textContent?.trim()).toBe('Reintentar')
    retry!.click()
    expect(onRetry).toHaveBeenCalledWith('c1')
  })

  it('mensaje pendiente: no muestra check ni fallo', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'user', status: 'pending' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('.meta .fail')).toBeNull()
  })

  it('agente con agentName, sin agentAvatarUrl: avatar de iniciales', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName="Laura" agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  // Foto del agente: la burbuja pinta la foto real cuando el store la trae
  // (mismo criterio que la cabecera) — el mensaje no tiene authorName propio,
  // así que hereda la identidad (nombre Y foto) de la conversación.
  it('agente con agentAvatarUrl y sin authorName propio: pinta la foto real del agente actual', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent', authorName: null })} agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} compact={false} />,
    )
    const img = root.querySelector('.b-avatar img.agent-avatar-img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })

  // No hay authorAvatarUrl por mensaje en el contrato (solo authorName,
  // backend W5a) — un histórico de un agente PREVIO no tiene foto propia
  // disponible. Mostrar la foto del agente ACTUAL sobre un mensaje de OTRO
  // agente sería una identidad fabricada, así que cae a iniciales.
  it('authorName del mensaje distinto al agente actual: NUNCA pinta la foto del agente actual (identidad no fabricada)', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent', authorName: 'Ana' })} agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} compact={false} />,
    )
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('A')
  })

  // El caso de la RECARGA: tras un F5 los mensajes del agente vienen del
  // snapshot CON authorName (los vivos no lo llevan) — si el autor coincide
  // con el agente actual, la foto es SUYA y debe pintarse igual que en vivo.
  // Sin esta rama, un F5 degradaba todas sus burbujas a iniciales mientras
  // la cabecera seguía mostrando la foto.
  it('authorName del mensaje IGUAL al agente actual (rehidratado por snapshot): pinta su foto', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent', authorName: 'Laura' })} agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} compact={false} />,
    )
    const img = root.querySelector('.b-avatar img.agent-avatar-img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/laura.jpg')
  })

  // Fix W5b: un mensaje role:'agent' JAMÁS pinta el BotIcon, ni siquiera sin
  // ninguna identidad conocida todavía (edge: llegó como agent pero ni
  // authorName ni el agentName de conversación están disponibles) — cae al
  // glifo neutro de agente (AgentInitialsAvatar con nombre undefined → '?'),
  // nunca al icono del bot.
  it('agente sin ninguna identidad conocida (ni authorName ni agentName de conversación): glifo neutro de agente, nunca BotIcon', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'agent' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('svg[data-icon=bot]')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('?')
  })

  // Fix W5b: authorName por mensaje (backend W5a, solo mensajes de snapshot)
  // tiene prioridad sobre el agentName de la conversación — un histórico
  // atendido por un agente DISTINTO al actualmente asignado muestra su
  // propia inicial, no la del agente actual.
  it('authorName del mensaje tiene prioridad sobre el agentName de la conversación', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent', authorName: 'Ana' })} agentName="Laura" agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />,
    )
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('A')
  })

  it('sin authorName en el mensaje: recae en el agentName de la conversación', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent', authorName: null })} agentName="Laura" agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />,
    )
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
  })

  // Backend en paralelo: authorAvatarUrl por mensaje, resuelto en lectura al
  // snapshot — MANDA sobre el fallback por nombre. Cubre el caso renombrado /
  // multi-agente: authorName !== agentName ya no importa si el mensaje trae
  // su propia foto.
  it('mensaje con authorAvatarUrl propio: pinta ESA foto aunque authorName sea distinto del agente actual (renombrado/multi-agente)', async () => {
    const root = await mount(
      <MessageBubble
        message={msg({ role: 'agent', authorName: 'Ana', authorAvatarUrl: 'https://res.nevent.es/agents/ana-actual.jpg' })}
        agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} compact={false}
      />,
    )
    const img = root.querySelector('.b-avatar img.agent-avatar-img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/agents/ana-actual.jpg')
    expect(root.querySelector('.initials-avatar')).toBeNull()
  })

  it('mensaje sin authorAvatarUrl propio: mantiene el fallback actual por nombre (backend sin desplegar / mensaje vivo)', async () => {
    const root = await mount(
      <MessageBubble
        message={msg({ role: 'agent', authorName: 'Ana', authorAvatarUrl: null })}
        agentName="Laura" agentAvatarUrl="https://res.nevent.es/agents/laura.jpg" onRetry={vi.fn()} compact={false}
      />,
    )
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('A')
  })

  it('compact:true oculta el avatar visualmente (ghost) para agrupar burbujas consecutivas', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={true} />)
    expect(root.querySelector('.b-avatar.ghost')).not.toBeNull()
  })

  it('burbuja de bot con logoUrl: pinta el logo del tenant en vez del BotIcon', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'bot' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false}
        logoUrl="https://res.nevent.es/tenants/demo-fest/logo.png" />,
    )
    const img = root.querySelector('.b-avatar img.bot-logo-img')
    expect(img?.getAttribute('src')).toBe('https://res.nevent.es/tenants/demo-fest/logo.png')
    expect(root.querySelector('svg[data-icon=bot]')).toBeNull()
  })

  it('burbuja de bot sin logoUrl: BotIcon por defecto (protege el default)', async () => {
    const root = await mount(<MessageBubble message={msg({ role: 'bot' })} agentName={null} agentAvatarUrl={null} onRetry={vi.fn()} compact={false} />)
    expect(root.querySelector('svg[data-icon=bot]')).not.toBeNull()
    expect(root.querySelector('.b-avatar img')).toBeNull()
  })

  it('burbuja de agente con logoUrl del bot seteado: el logo no se cuela, sigue la identidad del agente (iniciales)', async () => {
    const root = await mount(
      <MessageBubble message={msg({ role: 'agent' })} agentName="Laura" agentAvatarUrl={null} onRetry={vi.fn()} compact={false}
        logoUrl="https://res.nevent.es/tenants/demo-fest/logo.png" />,
    )
    expect(root.querySelector('.initials-avatar')?.textContent).toBe('L')
    expect(root.querySelector('img.bot-logo-img')).toBeNull()
  })
})
