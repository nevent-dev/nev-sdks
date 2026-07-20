import { useState } from 'preact/hooks'
import { AgentAvatar } from './icons'

// Sin props: ni cifra de ETA (gap #2) ni nombre de tenant (gap #1) — el
// contrato actual no trae ninguno de los dos y nunca se fabrican.
export function WaitingCard() {
  return (
    <div class="syscard waiting" role="status">
      <div class="ttl">Te pasamos con el equipo</div>
      <div class="dsc">El equipo te atenderá en breve. Puedes seguir escribiendo mientras tanto.</div>
    </div>
  )
}

export interface AgentJoinedSyslineProps {
  agentName: string
  agentAvatarUrl: string | null
}

export function AgentJoinedSysline({ agentName, agentAvatarUrl }: AgentJoinedSyslineProps) {
  return (
    <div class="sysline">
      <span class="who">
        <AgentAvatar name={agentName} avatarUrl={agentAvatarUrl} />
        <span><b>{agentName}</b> se ha unido</span>
      </span>
    </div>
  )
}

export function TypingDots() {
  return (
    <div class="dots" role="status" aria-label="El agente está escribiendo">
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
    </div>
  )
}

export interface ResolvedCardProps {
  agentName: string | null
  // Opcional A PROPÓSITO (gap #5): el panel INTEGRADO (Task 13) no lo pasa —
  // sin transport.feedback() real, mostrar botones que "funcionan" sería
  // fingir un éxito que no persiste en ningún sitio. Solo el harness de
  // fixtures (Task 16) lo pasa, para demostrar la interacción visual.
  onFeedback?: (value: 'up' | 'down') => void
}

export function ResolvedCard({ agentName, onFeedback }: ResolvedCardProps) {
  const [selected, setSelected] = useState<'up' | 'down' | null>(null)
  const handle = (value: 'up' | 'down'): void => {
    if (!onFeedback) return
    setSelected(value)
    onFeedback(value)
  }
  return (
    <div class="syscard resolved" role="status">
      <div class="ttl">Conversación resuelta</div>
      <div class="dsc">
        {agentName !== null ? `${agentName} resolvió tu consulta.` : 'Tu consulta ha sido resuelta.'} Si necesitas algo más, escribe y volvemos al momento.
      </div>
      {onFeedback && (
        <div class="feedback">
          <button type="button" aria-label="Valorar positivamente" aria-pressed={selected === 'up'} onClick={() => handle('up')}>👍</button>
          <button type="button" aria-label="Valorar negativamente" aria-pressed={selected === 'down'} onClick={() => handle('down')}>👎</button>
        </div>
      )}
    </div>
  )
}

// Task W4: se muestra tras un re-bootstrap silencioso (sesión muerta a mitad
// de vida) cuyo cliente nuevo NO resumió la conversación anterior — ver
// shell/app.tsx y message-store.ts#resetForNewConversation. Sin props, igual
// que WaitingCard: nada que el contrato no traiga se inventa aquí.
export function NewConversationCard() {
  return (
    <div class="syscard new-conversation" role="status">
      <div class="ttl">Conversación nueva</div>
      <div class="dsc">La conversación anterior expiró. Cuéntanos en qué te ayudamos.</div>
    </div>
  )
}
