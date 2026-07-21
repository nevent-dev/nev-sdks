import { useEffect, useState } from 'preact/hooks'

// Glifo de identidad del bot (burbuja de chat con cola), reutilizado por
// Header, Launcher y MessageBubble. El spark queda solo como indicador de
// estado "Pensando…" en MessageBubble — no es el logo.
export function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="bot">
      <path
        d="M12 3.3c-5.1 0-9.2 3.3-9.2 7.4 0 1.9.9 3.6 2.3 4.9-.2 1.1-.7 2.1-1.5 3-.2.2-.1.6.2.6 1.8 0 3.3-.6 4.4-1.3 1.2.4 2.4.6 3.8.6 5.1 0 9.2-3.3 9.2-7.4S17.1 3.3 12 3.3z"
        fill="currentColor"
      />
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

// Logo del tenant en el hueco de identidad del BOT (Launcher, Header sin
// agente humano, burbujas de mensaje del bot) — spec del widget-rewrite,
// theme.logoUrl en contract/types.ts. El fallo de carga es permanente PARA
// ESA URL (la misma imagen rota no se reintenta en re-renders), pero una
// URL NUEVA recupera su oportunidad: App puede reconstruir el SessionClient
// sin desmontar el árbol (rebuild de sesión) y traer un logo distinto —
// sin este reset, un fallo antiguo dejaría pegado el glifo por defecto
// aunque el logo nuevo cargue perfectamente.
export function BotLogo({ logoUrl }: { logoUrl: string | null | undefined }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [logoUrl])
  if (!logoUrl || failed) return <BotIcon />
  return <img class="bot-logo-img" src={logoUrl} referrerpolicy="no-referrer" alt="" onError={() => setFailed(true)} />
}

// Chevron para la píldora "ir al fondo" de MessageList — mismo estilo de
// trazo (stroke, sin relleno) que los iconos de Header, no el relleno de BotIcon.
export function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="chevron-down">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
