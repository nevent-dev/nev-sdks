import { useEffect, useState } from 'preact/hooks'

// Icono de "spark" del bot, reutilizado por Header, Launcher y MessageBubble.
export function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="bot">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" fill="currentColor" />
    </svg>
  )
}

// Avatar de iniciales generado localmente. Spec §8 original: v1 no renderiza
// NINGUNA imagen de avatar de terceros sin proxy propio (Critical #4 de la
// revisión) — esa restricción sigue vigente para orígenes ajenos, pero se
// LEVANTA para nuestra propia CDN (ver AgentAvatar más abajo). Este
// componente queda como fallback: sin avatarUrl, o cuando la foto falla al
// cargar.
export function AgentInitialsAvatar({ name }: { name: string | undefined }) {
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '?'
  return <span class="initials-avatar" aria-hidden="true">{initial}</span>
}

// Foto real del agente — igual que el resto del sector (Chatwoot/Intercom/
// Zendesk). Se pinta como <img> porque ahora vive en NUESTRA CDN
// (res.nevent.es / res.dev.nevent.es, ver allowlist en la CSP de
// shell.html), no en un origen de terceros sin proxy: la restricción de
// spec §8 era sobre imágenes AJENAS, no sobre imágenes en general.
// `referrerpolicy="no-referrer"` evita filtrar la URL de la conversación al
// origen de la imagen (aunque hoy sea propio, es higiene por defecto).
// `alt=""` porque es decorativa: el nombre real ya lo anuncia el texto que
// siempre la acompaña (cabecera, burbuja, sysline).
export function AgentAvatar({ name, avatarUrl }: { name: string | undefined; avatarUrl: string | null | undefined }) {
  const [failed, setFailed] = useState(false)
  // Un avatarUrl nuevo (reasignación a otro agente) debe tener su propia
  // oportunidad de cargar — el fallo de la URL ANTERIOR no debe arrastrarse.
  useEffect(() => { setFailed(false) }, [avatarUrl])
  if (!avatarUrl || failed) return <AgentInitialsAvatar name={name} />
  return <img class="agent-avatar-img" src={avatarUrl} referrerpolicy="no-referrer" alt="" onError={() => setFailed(true)} />
}
