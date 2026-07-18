// Icono de "spark" del bot, reutilizado por Header, Launcher y MessageBubble.
export function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="bot">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" fill="currentColor" />
    </svg>
  )
}

// Avatar de iniciales generado localmente — spec §8: v1 no renderiza ninguna
// imagen de avatar de terceros sin proxy propio. Sustituye por completo a
// cualquier <img src={agentAvatarUrl}> del mock/rev.1 (Critical #4 de la
// revisión). `agentAvatarUrl` se sigue recibiendo y guardando en el store
// (Plan 2) para cuando exista un proxy propio, pero ningún componente de
// este plan lo pinta como <img>.
export function AgentInitialsAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return <span class="initials-avatar" aria-hidden="true">{initial}</span>
}
